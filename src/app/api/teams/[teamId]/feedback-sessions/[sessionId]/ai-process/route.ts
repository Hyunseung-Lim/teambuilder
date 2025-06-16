import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { FeedbackSession, FeedbackSessionMessage } from "@/lib/types";
import {
  generateFeedbackSessionResponse,
  generateFeedbackSessionSummary,
} from "@/lib/openai";
import { getAgentById, getAgentMemory } from "@/lib/redis";
import { processMemoryUpdate } from "@/lib/memory";

// AI 에이전트 피드백 세션 처리
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; sessionId: string }> }
) {
  try {
    const { teamId, sessionId } = await params;
    const body = await request.json();
    const { triggerAgentId, action } = body;

    if (action === "respond") {
      // AI 에이전트가 피드백 세션에서 응답 생성
      console.log(
        `🤖 AI 피드백 세션 응답 처리 시작: ${triggerAgentId} in ${sessionId}`
      );

      // 세션 정보 가져오기
      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (!sessionData) {
        return NextResponse.json(
          { error: "세션을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const session: FeedbackSession =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;

      // 세션이 활성 상태인지 확인
      if (session.status !== "active") {
        return NextResponse.json(
          { error: "비활성 세션입니다." },
          { status: 400 }
        );
      }

      // 에이전트가 세션 참가자인지 확인
      const isParticipant = session.participants.some(
        (p) => p.id === triggerAgentId
      );
      if (!isParticipant) {
        return NextResponse.json(
          { error: "세션 참가자가 아닙니다." },
          { status: 403 }
        );
      }

      // 에이전트 정보 가져오기
      const agent = await getAgentById(triggerAgentId);
      if (!agent) {
        return NextResponse.json(
          { error: "에이전트를 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      // 상대방 찾기
      const otherParticipant = session.participants.find(
        (p) => p.id !== triggerAgentId
      );
      if (!otherParticipant) {
        return NextResponse.json(
          { error: "상대방을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      // 에이전트 메모리 가져오기
      const agentMemory = await getAgentMemory(triggerAgentId);

      // 현재 팀의 아이디어 목록 가져오기
      const { getIdeas } = await import("@/lib/redis");
      const teamIdeas = await getIdeas(teamId);

      // AI 응답 생성
      const responseResult = await generateFeedbackSessionResponse(
        agent,
        {
          sessionId,
          otherParticipant,
          messageHistory: session.messages,
          feedbackContext: session.feedbackContext,
          teamIdeas,
        },
        agentMemory
      );

      console.log(`🎯 AI 응답 생성 결과:`, {
        agent: agent.name,
        shouldEnd: responseResult.shouldEnd,
        reasoning: responseResult.reasoning,
      });

      // 응답 메시지 생성
      const responseMessage: FeedbackSessionMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sender: triggerAgentId,
        content: responseResult.response,
        timestamp: new Date().toISOString(),
        type: "message",
      };

      // 세션에 메시지 추가
      session.messages.push(responseMessage);

      // 세션 상태 업데이트
      session.lastActivityAt = new Date().toISOString();

      // 첫 번째 메시지인 경우 피드백 제공자를 feedback_session 상태로 변경
      if (session.messages.length === 1) {
        console.log(
          `💬 ${agent.name} 첫 피드백 메시지 생성 - feedback_session 상태로 변경`
        );

        try {
          const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
          const response = await fetch(
            `${baseUrl}/api/teams/${teamId}/agent-states`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "TeamBuilder-Internal",
              },
              body: JSON.stringify({
                agentId: triggerAgentId,
                currentState: "feedback_session",
                taskType: "feedback_session",
                taskDescription: `${otherParticipant.name}와 피드백 세션 진행 중`,
                estimatedDuration: 300, // 5분 예상
                trigger: "autonomous",
                sessionInfo: {
                  sessionId,
                  participants: session.participants.map((p) => p.name),
                },
              }),
            }
          );

          if (response.ok) {
            console.log(`✅ ${agent.name} 상태가 feedback_session으로 변경됨`);
          } else {
            console.error(
              `❌ ${agent.name} feedback_session 상태 변경 실패:`,
              response.status
            );
          }
        } catch (error) {
          console.error(
            `❌ ${agent.name} feedback_session 상태 변경 오류:`,
            error
          );
        }
      }

      // 세션 종료 처리
      if (responseResult.shouldEnd) {
        console.log(`🏁 피드백 세션 종료: ${sessionId}`);

        session.status = "completed";
        session.endedAt = new Date().toISOString();

        // 피드백 세션 요약 생성
        console.log(`📋 피드백 세션 요약 생성 중: ${sessionId}`);

        const summary = await generateFeedbackSessionSummary(
          session.messages,
          session.participants,
          session.feedbackContext
        );

        // 요약을 세션에 저장
        session.summary = summary;

        // 각 참가자의 메모리에 요약 저장
        for (const participant of session.participants) {
          if (!participant.isUser) {
            try {
              await processMemoryUpdate({
                type: "FEEDBACK_SESSION_COMPLETED",
                payload: {
                  teamId,
                  sessionId,
                  participantId: participant.id,
                  otherParticipant: session.participants.find(
                    (p) => p.id !== participant.id
                  ),
                  summary: summary.summary,
                  keyInsights: summary.keyInsights,
                  messageCount: session.messages.length,
                },
              });

              console.log(
                `✅ 참가자 ${participant.name}의 메모리 업데이트 완료`
              );
            } catch (memoryError) {
              console.error(
                `❌ 참가자 ${participant.name}의 메모리 업데이트 실패:`,
                memoryError
              );
            }
          }
        }

        // 팀 채팅에 피드백 세션 완료 알림 및 요약 공개
        const { addChatMessage } = await import("@/lib/redis");

        console.log(`📋 피드백 세션 메시지 전송 전 확인:`, {
          sessionMessages: session.messages,
          messageCount: session.messages.length,
        });

        await addChatMessage(teamId, {
          sender: "system",
          type: "feedback_session_summary",
          payload: {
            type: "feedback_session_summary",
            sessionId,
            participants: session.participants.map((p) => p.name),
            summary: summary.summary,
            keyInsights: summary.keyInsights,
            messageCount: session.messages.length,
            duration: session.endedAt
              ? Math.round(
                  (new Date(session.endedAt).getTime() -
                    new Date(session.createdAt).getTime()) /
                    1000 /
                    60
                )
              : 0,
            sessionMessages: session.messages,
          },
        });

        console.log(`📢 피드백 세션 요약이 팀 채팅에 공개됨: ${sessionId}`);

        // 활성 세션 목록에서 제거
        const activeSessionsKey = `team:${teamId}:active_feedback_sessions`;
        await redis.srem(activeSessionsKey, sessionId);

        // 참가자들의 에이전트 상태를 idle로 되돌리기
        for (const participant of session.participants) {
          if (!participant.isUser && participant.id !== "나") {
            try {
              const baseUrl =
                process.env.NEXTAUTH_URL || "http://localhost:3000";
              const response = await fetch(
                `${baseUrl}/api/teams/${teamId}/agent-states`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "TeamBuilder-Internal",
                  },
                  body: JSON.stringify({
                    agentId: participant.id,
                    currentState: "idle",
                  }),
                }
              );

              if (response.ok) {
                console.log(
                  `✅ 에이전트 ${participant.id} 상태가 idle로 변경됨`
                );
              } else {
                console.error(
                  `❌ 에이전트 ${participant.id} idle 상태 변경 실패:`,
                  response.status
                );
              }
            } catch (error) {
              console.error(
                `❌ 에이전트 ${participant.id} idle 상태 변경 오류:`,
                error
              );
            }
          }
        }

        return NextResponse.json({
          success: true,
          message: responseMessage,
          sessionEnded: true,
          session,
          summary: summary,
        });
      } else {
        // 세션 계속 진행 - 저장
        await redis.set(
          `feedback_session:${sessionId}`,
          JSON.stringify(session),
          { ex: 3600 * 24 }
        );

        // 메모리 업데이트 - 메시지 추가
        try {
          await processMemoryUpdate({
            type: "FEEDBACK_SESSION_MESSAGE",
            payload: {
              teamId,
              sessionId,
              participantId: triggerAgentId,
              message: responseMessage,
              otherParticipants: [otherParticipant],
            },
          });
        } catch (memoryError) {
          console.error(
            "피드백 세션 메시지 메모리 업데이트 실패:",
            memoryError
          );
        }

        console.log(`💬 AI 피드백 세션 응답 완료: ${sessionId}`);

        // AI-AI 세션인 경우 상대방도 자동으로 응답하도록 트리거
        if (!otherParticipant.isUser && otherParticipant.id !== "나") {
          console.log(
            `🔄 AI-AI 세션 - 상대방 ${otherParticipant.name} 자동 응답 트리거`
          );

          // 3초 후 상대방 응답 트리거 (비동기)
          setTimeout(async () => {
            try {
              console.log(`🤖 ${otherParticipant.name} 자동 응답 생성 시작`);

              const counterResponse = await fetch(
                `${
                  process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
                }/api/teams/${teamId}/feedback-sessions/${sessionId}/ai-process`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    triggerAgentId: otherParticipant.id,
                    action: "respond",
                  }),
                }
              );

              if (counterResponse.ok) {
                const counterData = await counterResponse.json();
                console.log(`✅ ${otherParticipant.name} 자동 응답 완료`);

                // 세션이 종료되지 않았고 메시지가 아직 적으면 계속 응답
                if (
                  !counterData.sessionEnded &&
                  counterData.session?.messages?.length < 8
                ) {
                  console.log(
                    `🔄 AI-AI 대화 계속 진행 중 (${counterData.session?.messages?.length}개 메시지)`
                  );
                }
              } else {
                console.error(
                  `❌ ${otherParticipant.name} 자동 응답 실패:`,
                  counterResponse.status
                );
              }
            } catch (error) {
              console.error(
                `❌ ${otherParticipant.name} 자동 응답 오류:`,
                error
              );
            }
          }, 3000); // 3초 후 응답
        }

        return NextResponse.json({
          success: true,
          message: responseMessage,
          sessionEnded: false,
          session,
        });
      }
    }

    return NextResponse.json({ error: "잘못된 액션입니다." }, { status: 400 });
  } catch (error) {
    console.error("AI 피드백 세션 처리 실패:", error);
    return NextResponse.json(
      { error: "AI 피드백 세션 처리에 실패했습니다." },
      { status: 500 }
    );
  }
}
