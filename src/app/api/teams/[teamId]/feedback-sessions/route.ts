import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  FeedbackSession,
  FeedbackSessionParticipant,
  FeedbackSessionMessage,
  FeedbackSessionStatus,
} from "@/lib/types";
import { getTeamById, getAgentById } from "@/lib/redis";

// 피드백 세션 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const body = await request.json();
    const { action, initiatorId, targetAgentId, message, feedbackContext } =
      body;

    console.log("피드백 세션 생성 요청:", {
      teamId,
      initiatorId,
      targetAgentId,
      feedbackContext,
    });

    if (action === "create") {
      // 피드백 세션 생성
      const sessionId = `feedback_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const participants = [
        {
          id: initiatorId,
          name: initiatorId === "나" ? "나" : "AI Agent",
          isUser: initiatorId === "나",
        },
        {
          id: targetAgentId,
          name: "Target Agent", // 실제 에이전트 이름으로 교체됨
          isUser: false,
        },
      ];

      // 에이전트 이름 가져오기
      const { getAgentById } = await import("@/lib/redis");
      if (initiatorId !== "나") {
        const initiatorAgent = await getAgentById(initiatorId);
        if (initiatorAgent) {
          participants[0].name = initiatorAgent.name;
        }
      }

      const targetAgent = await getAgentById(targetAgentId);
      if (targetAgent) {
        participants[1].name = targetAgent.name;
      }

      const session: FeedbackSession = {
        id: sessionId,
        teamId,
        participants,
        messages: [],
        status: "active",
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        feedbackContext,
      };

      // Redis에 세션 저장
      await redis.set(
        `feedback_session:${sessionId}`,
        JSON.stringify(session),
        {
          ex: 3600 * 24, // 24시간 만료
        }
      );

      // 활성 세션 목록에 추가
      const activeSessionsKey = `team:${teamId}:active_feedback_sessions`;
      await redis.sadd(activeSessionsKey, sessionId);

      // 첫 번째 메시지를 시스템 메시지로 추가
      const initialMessage = {
        id: `msg_${Date.now()}_init`,
        sender: "system",
        content: "피드백 세션이 시작되었습니다.",
        timestamp: new Date().toISOString(),
        type: "system" as const,
      };

      session.messages.push(initialMessage);
      await redis.set(
        `feedback_session:${sessionId}`,
        JSON.stringify(session),
        {
          ex: 3600 * 24,
        }
      );

      console.log(`✅ 피드백 세션 생성 완료: ${sessionId}`);

      // 대상 에이전트를 즉시 'feedback_waiting' 상태로 변경
      if (targetAgentId !== "나") {
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
                agentId: targetAgentId,
                currentState: "feedback_waiting",
                taskType: "feedback_waiting",
                taskDescription: `${participants[0].name}의 피드백을 기다리는 중`,
                estimatedDuration: 300, // 5분 예상
                trigger: "user_request",
                sessionInfo: {
                  sessionId,
                  participants: participants.map((p) => p.name),
                },
              }),
            }
          );

          if (response.ok) {
            console.log(
              `✅ ${targetAgent?.name} 상태가 feedback_waiting으로 변경됨`
            );
          } else {
            console.error(
              `❌ ${targetAgent?.name} feedback_waiting 상태 변경 실패:`,
              response.status
            );
          }
        } catch (error) {
          console.error(
            `❌ ${targetAgent?.name} feedback_waiting 상태 변경 오류:`,
            error
          );
        }
      }

      // 사용자가 첫 메시지를 남기는 경우 AI 응답 트리거
      if (initiatorId === "나" && message) {
        const userMessage = {
          id: `msg_${Date.now()}_user`,
          sender: "나",
          content: message,
          timestamp: new Date().toISOString(),
          type: "message" as const,
        };

        session.messages.push(userMessage);
        await redis.set(
          `feedback_session:${sessionId}`,
          JSON.stringify(session),
          {
            ex: 3600 * 24,
          }
        );

        // AI 응답 트리거 (비동기)
        setTimeout(async () => {
          try {
            const aiResponse = await fetch(
              `${
                process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
              }/api/teams/${teamId}/feedback-sessions/${sessionId}/ai-process`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  triggerAgentId: targetAgentId,
                  action: "respond",
                }),
              }
            );

            if (aiResponse.ok) {
              console.log(`✅ ${targetAgent?.name} AI 응답 트리거 완료`);
            } else {
              console.error(
                `❌ ${targetAgent?.name} AI 응답 트리거 실패:`,
                aiResponse.status
              );
            }
          } catch (error) {
            console.error(
              `❌ ${targetAgent?.name} AI 응답 트리거 오류:`,
              error
            );
          }
        }, 2000); // 2초 후 응답
      }

      return NextResponse.json({
        success: true,
        sessionId,
        session,
      });
    }

    if (action === "join") {
      // 세션 참가 (AI 에이전트용)
      const { sessionId, participantId } = body;

      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (!sessionData) {
        return NextResponse.json(
          { error: "세션을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const session: FeedbackSession =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;

      // 이미 참가하고 있는지 확인
      const alreadyJoined = session.participants.some(
        (p) => p.id === participantId
      );
      if (!alreadyJoined) {
        const participant = await getAgentById(participantId);
        session.participants.push({
          id: participantId,
          name: participant?.name || `에이전트 ${participantId}`,
          isUser: false,
          joinedAt: new Date().toISOString(),
        });

        await redis.set(
          `feedback_session:${sessionId}`,
          JSON.stringify(session),
          { ex: 3600 * 24 }
        );
      }

      return NextResponse.json({ success: true, session });
    }

    if (action === "end") {
      // 세션 종료
      const { sessionId } = body;

      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (!sessionData) {
        return NextResponse.json(
          { error: "세션을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const session: FeedbackSession =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;
      session.status = "ended";
      session.endedAt = new Date().toISOString();

      await redis.set(
        `feedback_session:${sessionId}`,
        JSON.stringify(session),
        { ex: 3600 * 24 * 7 } // 7일간 보관
      );

      // 활성 세션 목록에서 제거
      await redis.srem(`team:${teamId}:active_feedback_sessions`, sessionId);

      // 참가자들의 에이전트 상태를 idle로 되돌리기
      for (const participant of session.participants) {
        if (!participant.isUser && participant.id !== "나") {
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
                  agentId: participant.id,
                  currentState: "idle",
                }),
              }
            );

            if (response.ok) {
              console.log(`✅ 에이전트 ${participant.id} 상태가 idle로 변경됨`);
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

      // 전체 채팅창에 피드백 세션 요약 추가
      try {
        const { generateFeedbackSessionSummary } = await import("@/lib/openai");
        const summaryResult = await generateFeedbackSessionSummary(session);

        const sessionDuration = Math.floor(
          (new Date(session.endedAt!).getTime() -
            new Date(session.createdAt).getTime()) /
            (1000 * 60)
        );

        const summaryMessage = {
          sender: "system",
          type: "feedback_session_summary",
          payload: {
            type: "feedback_session_summary",
            sessionId: session.id,
            participants: session.participants.map((p) => p.name),
            targetIdea: session.targetIdea,
            summary: summaryResult.summary,
            keyInsights: summaryResult.keyInsights,
            messageCount: session.messages.filter(
              (msg) => msg.type === "message"
            ).length,
            duration: Math.max(1, sessionDuration), // 최소 1분
            sessionMessages: session.messages, // 실제 세션 메시지들 추가
          },
        };

        const chatResponse = await fetch(
          `${
            process.env.NEXTAUTH_URL || "http://localhost:3000"
          }/api/teams/${teamId}/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(summaryMessage),
          }
        );

        if (chatResponse.ok) {
          console.log("✅ 피드백 세션 요약이 전체 채팅창에 추가됨");
        } else {
          console.error(
            "❌ 피드백 세션 요약 채팅 추가 실패:",
            chatResponse.status
          );
        }
      } catch (chatError) {
        console.error("❌ 피드백 세션 요약 채팅 추가 오류:", chatError);
      }

      console.log(`✅ 피드백 세션 종료: ${sessionId}`);

      return NextResponse.json({ success: true, session });
    }

    return NextResponse.json({ error: "잘못된 액션입니다." }, { status: 400 });
  } catch (error) {
    console.error("피드백 세션 처리 실패:", error);
    return NextResponse.json(
      { error: "피드백 세션 처리에 실패했습니다." },
      { status: 500 }
    );
  }
}

// 활성 피드백 세션 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    if (sessionId) {
      // 특정 세션 조회
      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (!sessionData) {
        return NextResponse.json(
          { error: "세션을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const session: FeedbackSession =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;
      return NextResponse.json({ session });
    } else {
      // 팀의 활성 세션 목록 조회
      const activeSessionIds = await redis.smembers(
        `team:${teamId}:active_feedback_sessions`
      );
      const sessions: FeedbackSession[] = [];

      for (const sessionId of activeSessionIds) {
        const sessionData = await redis.get(`feedback_session:${sessionId}`);
        if (sessionData) {
          const session: FeedbackSession =
            typeof sessionData === "string"
              ? JSON.parse(sessionData)
              : sessionData;
          sessions.push(session);
        }
      }

      return NextResponse.json({ sessions });
    }
  } catch (error) {
    console.error("피드백 세션 조회 실패:", error);
    return NextResponse.json(
      { error: "피드백 세션 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
