import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  FeedbackSession,
  FeedbackSessionParticipant,
  FeedbackSessionMessage,
  FeedbackSessionStatus,
} from "@/lib/types";
import { getTeamById, getAgentById } from "@/lib/redis";
import { getAgentState } from "@/lib/agent-state-utils";

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
      const { initiatorId, targetAgentId, message, feedbackContext } = body;

      // 필수 필드 검증
      if (!initiatorId || !targetAgentId || !feedbackContext) {
        console.error("❌ 필수 필드 누락:", {
          initiatorId,
          targetAgentId,
          feedbackContext,
        });
        return NextResponse.json(
          { error: "initiatorId, targetAgentId, feedbackContext is required" },
          { status: 400 }
        );
      }

      console.log("🚀 피드백 세션 생성 요청:", {
        initiatorId,
        targetAgentId,
        feedbackContext,
      });

      // 🔒 피드백 세션 중복 방지를 위한 상태 확인
      console.log("🔍 참가자들의 피드백 세션 상태 확인 중...");

      // 1. 시작자(initiator) 상태 확인
      let initiatorInSession = false;
      if (initiatorId === "나") {
        // 인간 사용자 상태 확인
        const userStateKey = `team:${teamId}:user_state`;
        const userStateData = await redis.get(userStateKey);
        if (userStateData) {
          const userState =
            typeof userStateData === "string"
              ? JSON.parse(userStateData)
              : userStateData;
          if (userState.currentState === "feedback_session") {
            initiatorInSession = true;
            console.log("❌ 시작자(인간)가 이미 피드백 세션 중");
          }
        }
      } else {
        // AI 에이전트 상태 확인
        const initiatorState = await getAgentState(teamId, initiatorId);
        if (initiatorState?.currentState === "feedback_session") {
          initiatorInSession = true;
          console.log(`❌ 시작자(${initiatorId})가 이미 피드백 세션 중`);
        }
      }

      // 2. 대상자(target) 상태 확인
      let targetInSession = false;
      if (targetAgentId === "나") {
        // 인간 사용자 상태 확인
        const userStateKey = `team:${teamId}:user_state`;
        const userStateData = await redis.get(userStateKey);
        if (userStateData) {
          const userState =
            typeof userStateData === "string"
              ? JSON.parse(userStateData)
              : userStateData;
          if (userState.currentState === "feedback_session") {
            targetInSession = true;
            console.log("❌ 대상자(인간)가 이미 피드백 세션 중");
          }
        }
      } else {
        // AI 에이전트 상태 확인
        const targetAgentState = await getAgentState(teamId, targetAgentId);
        if (targetAgentState?.currentState === "feedback_session") {
          targetInSession = true;
          console.log(`❌ 대상자(${targetAgentId})가 이미 피드백 세션 중`);
        }
      }

      // 3. 피드백 세션 중인 참가자가 있으면 생성 거부
      if (initiatorInSession) {
        return NextResponse.json(
          {
            error: "현재 다른 피드백 세션에 참여 중입니다.",
            busy: true,
            reason: "initiator_busy",
          },
          { status: 409 }
        );
      }

      if (targetInSession) {
        const targetAgentData =
          targetAgentId !== "나" ? await getAgentById(targetAgentId) : null;
        const targetName =
          targetAgentId === "나"
            ? "사용자"
            : targetAgentData?.name || targetAgentId;

        return NextResponse.json(
          {
            error: `${targetName}는 현재 다른 피드백 세션에 참여 중입니다.`,
            busy: true,
            reason: "target_busy",
          },
          { status: 409 }
        );
      }

      console.log("✅ 모든 참가자가 피드백 세션 참여 가능한 상태");

      // targetAgentId가 실제 agentId가 아니라 이름일 수 있으므로 확인
      let resolvedTargetAgentId = targetAgentId;
      let targetAgentData = null;

      if (targetAgentId !== "나") {
        // 먼저 ID로 시도
        targetAgentData = await getAgentById(targetAgentId);

        if (!targetAgentData) {
          // ID로 찾지 못한 경우, 팀 정보를 가져와서 이름으로 검색
          console.log(
            `🔍 에이전트 ${targetAgentId}를 ID로 찾을 수 없음. 이름으로 검색 중...`
          );

          const team = await getTeamById(teamId);
          if (team) {
            // 팀 멤버 중에서 해당 이름을 가진 에이전트 찾기
            for (const member of team.members) {
              if (!member.isUser && member.agentId) {
                const agent = await getAgentById(member.agentId);
                if (agent && agent.name === targetAgentId) {
                  resolvedTargetAgentId = member.agentId;
                  targetAgentData = agent;
                  console.log(
                    `✅ 이름 "${targetAgentId}"로 에이전트 "${member.agentId}" 찾음`
                  );
                  break;
                }
              }
            }
          }

          if (!targetAgentData) {
            console.error(
              `❌ 에이전트 "${targetAgentId}"를 찾을 수 없음 (ID나 이름으로도 없음)`
            );
            return NextResponse.json(
              { error: `에이전트 "${targetAgentId}"를 찾을 수 없습니다.` },
              { status: 404 }
            );
          }
        }
      }

      // 피드백 세션 생성
      const sessionId = `feedback_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const participants = [
        {
          id: initiatorId,
          name: initiatorId === "나" ? "나" : "AI Agent",
          isUser: initiatorId === "나",
          joinedAt: new Date().toISOString(),
        },
        {
          id: resolvedTargetAgentId,
          name:
            resolvedTargetAgentId === "나"
              ? "나"
              : targetAgentData?.name || "Target Agent",
          isUser: resolvedTargetAgentId === "나",
          joinedAt: new Date().toISOString(),
        },
      ];

      // 에이전트 이름 가져오기 (initiator용)
      if (initiatorId !== "나") {
        const initiatorAgent = await getAgentById(initiatorId);
        if (initiatorAgent) {
          participants[0].name = initiatorAgent.name;
        }
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
        initiatedBy: initiatorId,
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

      // 🔄 모든 참가자의 상태를 'feedback_session'으로 즉시 변경
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

      // 1. 시작자(initiator) 상태 변경 (AI든 인간이든 상관없이)
      if (initiatorId !== "나") {
        // AI 시작자인 경우 상태 변경
        try {
          const initiatorResponse = await fetch(
            `${baseUrl}/api/teams/${teamId}/agent-states`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "TeamBuilder-Internal",
              },
              body: JSON.stringify({
                agentId: initiatorId,
                currentState: "feedback_session",
                taskType: "feedback_session",
                taskDescription: `${participants[1].name}와 피드백 세션 진행 중`,
                estimatedDuration: 600, // 10분 예상
                trigger: "user_request",
                sessionInfo: {
                  sessionId,
                  participants: participants.map((p) => p.name),
                },
              }),
            }
          );

          if (initiatorResponse.ok) {
            console.log(
              `✅ 시작자 ${participants[0].name} 상태가 feedback_session으로 변경됨`
            );
          } else {
            console.error(
              `❌ 시작자 ${participants[0].name} feedback_session 상태 변경 실패:`,
              initiatorResponse.status
            );
          }
        } catch (error) {
          console.error(
            `❌ 시작자 ${participants[0].name} feedback_session 상태 변경 오류:`,
            error
          );
        }
      } else {
        // 인간 시작자인 경우 - 상태를 직접 Redis에 저장
        try {
          const userStateKey = `team:${teamId}:user_state`;
          const userState = {
            currentState: "feedback_session",
            taskType: "feedback_session",
            taskDescription: `${participants[1].name}와 피드백 세션 진행 중`,
            estimatedDuration: 600,
            trigger: "user_request",
            sessionInfo: {
              sessionId,
              participants: participants.map((p) => p.name),
            },
            startTime: new Date().toISOString(),
          };

          await redis.set(userStateKey, JSON.stringify(userState), {
            ex: 3600 * 24,
          });
          console.log(`✅ 인간 시작자 상태가 feedback_session으로 변경됨`);
        } catch (error) {
          console.error(
            `❌ 인간 시작자 feedback_session 상태 변경 오류:`,
            error
          );
        }
      }

      // 2. 대상자(target) 상태 변경
      if (resolvedTargetAgentId !== "나") {
        // AI 대상자인 경우 상태 변경
        try {
          const targetResponse = await fetch(
            `${baseUrl}/api/teams/${teamId}/agent-states`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "TeamBuilder-Internal",
              },
              body: JSON.stringify({
                agentId: resolvedTargetAgentId,
                currentState: "feedback_session",
                taskType: "feedback_session",
                taskDescription: `${participants[0].name}와 피드백 세션 진행 중`,
                estimatedDuration: 600, // 10분 예상
                trigger: "user_request",
                sessionInfo: {
                  sessionId,
                  participants: participants.map((p) => p.name),
                },
              }),
            }
          );

          if (targetResponse.ok) {
            console.log(
              `✅ 대상자 ${
                targetAgentData?.name || resolvedTargetAgentId
              } 상태가 feedback_session으로 변경됨`
            );
          } else {
            console.error(
              `❌ 대상자 ${
                targetAgentData?.name || resolvedTargetAgentId
              } feedback_session 상태 변경 실패:`,
              targetResponse.status
            );
          }
        } catch (error) {
          console.error(
            `❌ 대상자 ${
              targetAgentData?.name || resolvedTargetAgentId
            } feedback_session 상태 변경 오류:`,
            error
          );
        }
      } else {
        // 인간 대상자인 경우 - 상태를 직접 Redis에 저장
        try {
          const userStateKey = `team:${teamId}:user_state`;
          const userState = {
            currentState: "feedback_session",
            taskType: "feedback_session",
            taskDescription: `${participants[0].name}와 피드백 세션 진행 중`,
            estimatedDuration: 600,
            trigger: "ai_initiated",
            sessionInfo: {
              sessionId,
              participants: participants.map((p) => p.name),
            },
            startTime: new Date().toISOString(),
          };

          await redis.set(userStateKey, JSON.stringify(userState), {
            ex: 3600 * 24,
          });
          console.log(`✅ 인간 대상자 상태가 feedback_session으로 변경됨`);
        } catch (error) {
          console.error(
            `❌ 인간 대상자 feedback_session 상태 변경 오류:`,
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
                  triggerAgentId: resolvedTargetAgentId,
                  action: "respond",
                }),
              }
            );

            if (aiResponse.ok) {
              console.log(
                `✅ ${
                  targetAgentData?.name || resolvedTargetAgentId
                } AI 응답 트리거 완료`
              );
            } else {
              console.error(
                `❌ ${
                  targetAgentData?.name || resolvedTargetAgentId
                } AI 응답 트리거 실패:`,
                aiResponse.status
              );
            }
          } catch (error) {
            console.error(
              `❌ ${
                targetAgentData?.name || resolvedTargetAgentId
              } AI 응답 트리거 오류:`,
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
      // 피드백 세션 종료
      const { sessionId, endedBy } = body; // endedBy 파라미터 추가

      // 필수 필드 검증
      if (!sessionId) {
        console.error("❌ sessionId 필수 필드 누락:", { sessionId });
        return NextResponse.json(
          { error: "sessionId is required" },
          { status: 400 }
        );
      }

      console.log("🏁 피드백 세션 종료 요청:", { sessionId, endedBy });

      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (!sessionData) {
        return NextResponse.json(
          { error: "세션을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const session: FeedbackSession =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;

      // 이미 종료된 세션인지 확인
      if (session.status === "completed" || session.status === "ended") {
        console.log(
          `⚠️ 세션 ${sessionId}은 이미 ${session.status} 상태입니다.`
        );
        return NextResponse.json({
          success: true,
          session,
          message: "세션이 이미 종료되었습니다.",
        });
      }

      // 세션 상태 업데이트
      session.status = "completed";
      session.endedAt = new Date().toISOString();
      session.endedBy = endedBy || "user"; // 기본값을 user로 변경

      await redis.set(
        `feedback_session:${sessionId}`,
        JSON.stringify(session),
        { ex: 3600 * 24 * 7 } // 7일간 보관
      );

      // 활성 세션 목록에서 제거
      await redis.srem(`team:${teamId}:active_feedback_sessions`, sessionId);

      // 실제 대화 메시지가 있는 경우에만 요약 생성
      const actualMessages = session.messages.filter(
        (msg) => msg.type === "message"
      );
      const shouldGenerateSummary = actualMessages.length >= 1; // 최소 1개 메시지

      if (shouldGenerateSummary) {
        // 피드백 세션 요약 생성 및 메모리 저장
        try {
          const { generateFeedbackSessionSummary } = await import(
            "@/lib/openai"
          );
          const { processMemoryUpdate } = await import("@/lib/memory");

          const summaryResult = await generateFeedbackSessionSummary(
            session.messages,
            session.participants,
            session.feedbackContext
          );

          // 각 참가자의 메모리에 요약 저장 (AI 에이전트만)
          for (const participant of session.participants) {
            if (!participant.isUser && participant.id !== "나") {
              try {
                await processMemoryUpdate({
                  type: "FEEDBACK_SESSION_COMPLETED",
                  payload: {
                    teamId,
                    sessionId,
                    session: session,
                    summary: summaryResult.summary,
                    keyPoints: summaryResult.keyInsights,
                  },
                });

                console.log(
                  `✅ 참가자 ${participant.name}의 메모리 업데이트 완료 (수동 종료)`
                );
              } catch (memoryError) {
                console.error(
                  `❌ 참가자 ${participant.name}의 메모리 업데이트 실패:`,
                  memoryError
                );
              }
            }
          }

          const sessionDuration = Math.floor(
            (new Date(session.endedAt!).getTime() -
              new Date(session.createdAt).getTime()) /
              (1000 * 60)
          );

          // 중복 체크를 위해 고유한 요약 ID 생성
          const summaryId = `${sessionId}_summary`;

          // 이미 해당 세션의 요약이 팀 채팅에 있는지 확인
          const existingSummaryCheck = await redis.get(
            `summary_check:${summaryId}`
          );
          if (existingSummaryCheck) {
            console.log(`⚠️ 세션 ${sessionId}의 요약이 이미 생성되었습니다.`);
          } else {
            const summaryMessage = {
              sender: "system" as const,
              type: "feedback_session_summary" as const,
              payload: {
                type: "feedback_session_summary" as const,
                sessionId: session.id,
                participants: session.participants.map((p) => p.name),
                targetIdea: session.targetIdea,
                summary: summaryResult.summary,
                keyInsights: summaryResult.keyInsights,
                messageCount: actualMessages.length,
                duration: Math.max(1, sessionDuration), // 최소 1분
                sessionMessages: session.messages, // 실제 세션 메시지들 추가
                endedBy: session.endedBy, // 종료 주체 정보 추가
              },
            };

            // 직접 addChatMessage 함수 호출 (인증 문제 해결)
            const { addChatMessage } = await import("@/lib/redis");

            try {
              await addChatMessage(teamId, summaryMessage);
              console.log("✅ 피드백 세션 요약이 팀 채팅에 추가됨");

              // 요약 생성 완료 표시 (1시간 후 자동 삭제)
              await redis.set(`summary_check:${summaryId}`, "completed", {
                ex: 3600,
              });
            } catch (chatError) {
              console.error("❌ 피드백 세션 요약 채팅 추가 실패:", chatError);
            }
          }
        } catch (chatError) {
          console.error("❌ 피드백 세션 요약 처리 오류:", chatError);
        }
      } else {
        console.log(
          `⚠️ 세션 ${sessionId}에 충분한 메시지가 없어 요약을 생성하지 않습니다.`
        );
      }

      // 🔄 모든 참가자들의 상태를 idle로 되돌리기
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

      console.log(`🔄 ${session.participants.length}개 참가자 상태 정리 시작`);

      for (const participant of session.participants) {
        if (!participant.isUser && participant.id !== "나") {
          // AI 에이전트 상태 초기화
          console.log(
            `🔧 에이전트 ${participant.name}(${participant.id}) 상태를 idle로 변경 시도`
          );

          let retryCount = 0;
          const maxRetries = 3;
          let success = false;

          while (retryCount < maxRetries && !success) {
            try {
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
                    forceClear: true, // 강제 초기화 플래그 추가
                  }),
                }
              );

              if (response.ok) {
                console.log(
                  `✅ 에이전트 ${participant.name} 상태가 idle로 변경됨 (시도 ${
                    retryCount + 1
                  }/${maxRetries})`
                );
                success = true;
              } else {
                const responseText = await response.text();
                console.error(
                  `❌ 에이전트 ${participant.name} idle 상태 변경 실패 (시도 ${
                    retryCount + 1
                  }/${maxRetries}):`,
                  response.status,
                  responseText
                );

                if (retryCount < maxRetries - 1) {
                  console.log(`🔄 ${participant.name} 재시도 대기 중...`);
                  await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 대기
                }
              }
            } catch (error) {
              console.error(
                `❌ 에이전트 ${participant.name} idle 상태 변경 오류 (시도 ${
                  retryCount + 1
                }/${maxRetries}):`,
                error
              );

              if (retryCount < maxRetries - 1) {
                console.log(`🔄 ${participant.name} 재시도 대기 중...`);
                await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 대기
              }
            }

            retryCount++;
          }

          if (!success) {
            console.error(
              `💥 에이전트 ${participant.name} 상태 변경 최종 실패`
            );
          }
        } else if (participant.id === "나") {
          // 인간 사용자 상태 초기화
          console.log(`🔧 인간 사용자 피드백 세션 상태 제거 시도`);

          try {
            const userStateKey = `team:${teamId}:user_state`;
            const deleted = await redis.del(userStateKey);
            console.log(
              `✅ 인간 사용자 피드백 세션 상태 제거됨 (deleted: ${deleted})`
            );
          } catch (error) {
            console.error(`❌ 인간 사용자 상태 초기화 오류:`, error);
          }
        }
      }

      console.log(`✅ 피드백 세션 종료: ${sessionId}`);

      return NextResponse.json({ success: true, session });
    }

    if (action === "send_message") {
      // 메시지 전송
      const { sessionId, message, senderId } = body;

      console.log("📨 피드백 세션 메시지 전송:", {
        sessionId,
        message: message?.substring(0, 50) + "...",
        senderId,
      });

      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (!sessionData) {
        return NextResponse.json(
          { error: "세션을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const session: FeedbackSession =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;

      if (session.status !== "active") {
        return NextResponse.json(
          { error: "세션이 비활성 상태입니다." },
          { status: 400 }
        );
      }

      // 새 메시지 추가
      const newMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sender: senderId || "나",
        content: message,
        timestamp: new Date().toISOString(),
        type: "message" as const,
      };

      session.messages.push(newMessage);
      session.lastActivityAt = new Date().toISOString();

      await redis.set(
        `feedback_session:${sessionId}`,
        JSON.stringify(session),
        { ex: 3600 * 24 }
      );

      console.log(`✅ 메시지 저장 완료: ${sessionId}`);

      // 🔄 메시지 전송 후 발신자(사용자)의 피드백 세션 상태 유지 확인
      if (senderId === "나") {
        try {
          const userStateKey = `team:${teamId}:user_state`;
          const existingUserState = await redis.get(userStateKey);

          // 사용자 상태가 피드백 세션이 아니거나 없다면 다시 설정
          if (!existingUserState) {
            console.log(`🔄 사용자 피드백 세션 상태 재설정`);

            const userState = {
              currentState: "feedback_session",
              taskType: "feedback_session",
              taskDescription: `피드백 세션 진행 중`,
              estimatedDuration: 600,
              trigger: "user_request",
              sessionInfo: {
                sessionId,
                participants: session.participants.map((p) => p.name),
              },
              startTime: new Date().toISOString(),
            };

            await redis.set(userStateKey, JSON.stringify(userState), {
              ex: 3600 * 24,
            });
            console.log(`✅ 사용자 피드백 세션 상태 재설정 완료`);
          } else {
            const userStateInfo =
              typeof existingUserState === "string"
                ? JSON.parse(existingUserState)
                : existingUserState;

            if (userStateInfo.currentState !== "feedback_session") {
              console.log(`🔄 사용자 상태를 feedback_session으로 복원`);

              userStateInfo.currentState = "feedback_session";
              userStateInfo.taskType = "feedback_session";
              userStateInfo.taskDescription = `피드백 세션 진행 중`;
              userStateInfo.sessionInfo = {
                sessionId,
                participants: session.participants.map((p) => p.name),
              };

              await redis.set(userStateKey, JSON.stringify(userStateInfo), {
                ex: 3600 * 24,
              });
              console.log(`✅ 사용자 피드백 세션 상태 복원 완료`);
            }
          }
        } catch (stateError) {
          console.warn(`⚠️ 사용자 피드백 세션 상태 유지 오류:`, stateError);
        }
      }

      // AI 응답 트리거 (사용자가 메시지를 보낸 경우)
      if (senderId === "나") {
        const targetParticipant = session.participants.find(
          (p) => p.id !== "나" && !p.isUser
        );

        if (targetParticipant) {
          console.log(
            `🎯 AI 응답 트리거 예약: ${targetParticipant.name} in ${sessionId}`
          );

          setTimeout(async () => {
            try {
              const baseUrl =
                process.env.NEXTAUTH_URL || "http://localhost:3000";
              console.log(`🚀 AI 응답 트리거 실행: ${targetParticipant.name}`);

              const aiResponse = await fetch(
                `${baseUrl}/api/teams/${teamId}/feedback-sessions/${sessionId}/ai-process`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "TeamBuilder-Internal",
                  },
                  body: JSON.stringify({
                    triggerAgentId: targetParticipant.id,
                    action: "respond",
                  }),
                }
              );

              if (aiResponse.ok) {
                const result = await aiResponse.json();
                console.log(
                  `✅ ${targetParticipant.name} AI 응답 트리거 완료:`,
                  {
                    success: result.success,
                    messageId: result.message?.id,
                    sessionEnded: result.sessionEnded,
                  }
                );
              } else {
                const errorText = await aiResponse.text();
                console.error(
                  `❌ ${targetParticipant.name} AI 응답 트리거 실패:`,
                  aiResponse.status,
                  errorText
                );
              }
            } catch (error) {
              console.error(
                `❌ ${targetParticipant.name} AI 응답 트리거 오류:`,
                error
              );
            }
          }, 2000); // 2초 후 응답
        } else {
          console.warn(`⚠️ AI 참가자를 찾을 수 없음 in ${sessionId}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: newMessage,
        session,
      });
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
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    const action = searchParams.get("action");

    // 사용자 관련 피드백 세션 확인
    if (action === "check_user_sessions") {
      // redis.keys() 대신 smembers() 사용
      const activeSessionIds = await redis.smembers(
        `team:${teamId}:active_feedback_sessions`
      );
      const userSessions = [];

      for (const sessionId of activeSessionIds) {
        const sessionData = await redis.get(`feedback_session:${sessionId}`);
        if (sessionData) {
          const session =
            typeof sessionData === "string"
              ? JSON.parse(sessionData)
              : sessionData;

          if (
            session.teamId === teamId &&
            session.status === "active" &&
            session.participants.some((p: any) => p.id === "나")
          ) {
            userSessions.push(session);
          }
        } else {
          // 존재하지 않는 세션은 set에서 제거
          redis.srem(`team:${teamId}:active_feedback_sessions`, sessionId);
        }
      }

      return NextResponse.json({
        success: true,
        userSessions,
      });
    }

    // 특정 세션 조회
    if (sessionId) {
      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (!sessionData) {
        return NextResponse.json(
          { error: "세션을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const session =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;

      return NextResponse.json({ success: true, session });
    }

    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  } catch (error) {
    console.error("피드백 세션 조회 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
