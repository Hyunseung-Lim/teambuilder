import { NextRequest, NextResponse } from "next/server";
import {
  getTeamById,
  getAgentById,
  getIdeas,
  getChatHistory,
  addIdea,
  addChatMessage,
  getAgentMemory,
} from "@/lib/redis";
import { redis } from "@/lib/redis";
import {
  planNextAction,
  generateIdeaAction,
  preEvaluationAction,
  executeEvaluationAction,
  giveFeedbackOnIdea,
  makeRequestAction,
  alreadyEvaluatedResponseAction,
} from "@/lib/openai";
import { processMemoryUpdate } from "@/lib/memory";

// 에이전트 상태 타입
interface AgentStateInfo {
  agentId: string;
  currentState:
    | "idle"
    | "plan"
    | "action"
    | "reflecting"
    | "feedback_session"
    | "feedback_waiting";
  lastStateChange: string;
  isProcessing: boolean;
  currentTask?: {
    type:
      | "generate_idea"
      | "evaluate_idea"
      | "planning"
      | "thinking"
      | "give_feedback"
      | "make_request"
      | "reflecting"
      | "feedback_session"
      | "feedback_waiting";
    description: string;
    startTime: string;
    estimatedDuration: number;
    trigger?: "autonomous" | "user_request" | "ai_request";
    requestInfo?: {
      requesterName: string;
      requestMessage: string;
    };
    sessionInfo?: {
      sessionId: string;
      participants: string[];
    };
  };
  idleTimer?: {
    startTime: string;
    plannedDuration: number;
    remainingTime: number;
  };
  plannedAction?: {
    action:
      | "generate_idea"
      | "evaluate_idea"
      | "give_feedback"
      | "make_request"
      | "wait";
    reasoning: string;
    target?: string;
  };
}

// 에이전트 상태를 Redis에서 가져오기
async function getAgentState(
  teamId: string,
  agentId: string
): Promise<AgentStateInfo | null> {
  try {
    const stateKey = `agent_state:${teamId}:${agentId}`;
    const stateData = await redis.get(stateKey);

    if (!stateData) {
      // 기본 idle 상태 생성
      const defaultState: AgentStateInfo = {
        agentId,
        currentState: "idle",
        lastStateChange: new Date().toISOString(),
        isProcessing: false,
        idleTimer: {
          startTime: new Date().toISOString(),
          plannedDuration: Math.floor(Math.random() * 30) + 60, // 60-90초
          remainingTime: Math.floor(Math.random() * 30) + 60,
        },
      };

      // Redis에 저장 시도 (실패해도 기본 상태 반환)
      try {
        await redis.set(stateKey, JSON.stringify(defaultState), { ex: 3600 }); // 1시간 TTL
      } catch (saveError) {
        console.error(`에이전트 ${agentId} 기본 상태 저장 실패:`, saveError);
      }

      return defaultState;
    }

    // 문자열인 경우 파싱, 이미 객체인 경우 그대로 사용
    const parsedState =
      typeof stateData === "string" ? JSON.parse(stateData) : stateData;
    return parsedState;
  } catch (error) {
    console.error(`에이전트 ${agentId} 상태 조회 실패:`, error);

    // 에러 발생 시 기본 idle 상태 반환
    return {
      agentId,
      currentState: "idle",
      lastStateChange: new Date().toISOString(),
      isProcessing: false,
      idleTimer: {
        startTime: new Date().toISOString(),
        plannedDuration: 75, // 75초 고정
        remainingTime: 75,
      },
    };
  }
}

// 에이전트 상태를 Redis에 저장
async function setAgentState(
  teamId: string,
  agentId: string,
  state: AgentStateInfo
): Promise<void> {
  try {
    const stateKey = `agent_state:${teamId}:${agentId}`;
    await redis.set(stateKey, JSON.stringify(state), { ex: 3600 }); // 1시간 TTL
  } catch (error) {
    console.error(`에이전트 ${agentId} 상태 저장 실패:`, error);
    // 저장 실패해도 계속 진행 (상태는 메모리에서 관리)
  }
}

// 에이전트 상태 업데이트 (시간 경과 반영)
async function updateAgentStateTimer(
  teamId: string,
  state: AgentStateInfo
): Promise<AgentStateInfo> {
  const now = new Date();

  if (state.currentState === "idle" && state.idleTimer) {
    // idle 타이머 업데이트
    const elapsed = Math.floor(
      (now.getTime() - new Date(state.idleTimer.startTime).getTime()) / 1000
    );
    state.idleTimer.remainingTime = Math.max(
      0,
      state.idleTimer.plannedDuration - elapsed
    );

    // 타이머가 끝나면 planning 실행
    if (state.idleTimer.remainingTime <= 0) {
      console.log(`🧠 ${state.agentId} planning 시작`);

      try {
        // 팀 정보와 컨텍스트 수집
        const team = await getTeamById(teamId);
        const agentProfile = await getAgentById(state.agentId);
        const ideas = await getIdeas(teamId);
        const recentMessages = await getChatHistory(teamId, 5);

        // 팀의 모든 에이전트 정보 가져오기
        const agents = await Promise.all(
          (team?.members || [])
            .filter((m) => !m.isUser && m.agentId)
            .map((m) => getAgentById(m.agentId!))
        );
        const validAgents = agents.filter((agent) => agent !== null);

        if (team && agentProfile) {
          // 팀에서 이 에이전트의 역할 정보 가져오기
          const teamMember = team.members.find(
            (m) => m.agentId === state.agentId
          );
          const agentWithTeamRoles = {
            ...agentProfile,
            roles: teamMember?.roles || [], // 팀에서의 역할 정보 추가
          };

          const teamContext = {
            teamName: team.teamName,
            topic: team.topic || "Carbon Emission Reduction",
            currentIdeasCount: ideas.length,
            recentMessages: recentMessages,
            teamMembers: team.members
              .filter((m) => !m.isUser)
              .map((m) => {
                const agent = validAgents.find((a) => a.id === m.agentId);
                return agent?.name || `에이전트 ${m.agentId}`;
              }),
            existingIdeas: ideas.map((idea, index) => ({
              ideaNumber: index + 1,
              authorName:
                idea.author === "나"
                  ? "나"
                  : (() => {
                      const member = team.members.find(
                        (tm) => tm.agentId === idea.author
                      );
                      if (member && !member.isUser) {
                        const agent = validAgents.find(
                          (a) => a.id === idea.author
                        );
                        return agent?.name || `에이전트 ${idea.author}`;
                      }
                      return idea.author;
                    })(),
              object: idea.content.object,
              function: idea.content.function,
            })),
          };

          // LLM으로 다음 행동 계획 (팀 역할 정보 포함)
          const planResult = await planNextAction(
            agentWithTeamRoles,
            teamContext
          );

          console.log(`🎯 ${agentProfile.name} 계획 결과:`, planResult);

          // 계획 결과에 따라 상태 전환
          if (planResult.action === "wait") {
            // 다시 idle 상태로 (새로운 타이머)
            return {
              agentId: state.agentId,
              currentState: "idle",
              lastStateChange: now.toISOString(),
              isProcessing: false,
              idleTimer: {
                startTime: now.toISOString(),
                plannedDuration: Math.floor(Math.random() * 30) + 60, // 60-90초
                remainingTime: Math.floor(Math.random() * 30) + 60,
              },
            };
          } else {
            // plan 상태로 전환 (실제 작업 준비)
            return {
              agentId: state.agentId,
              currentState: "plan" as const,
              lastStateChange: now.toISOString(),
              isProcessing: true,
              currentTask: {
                type: "planning" as const,
                description: `${planResult.reasoning}`,
                startTime: now.toISOString(),
                estimatedDuration: 10, // 10초 계획 시간
              },
              plannedAction: planResult as {
                action:
                  | "generate_idea"
                  | "evaluate_idea"
                  | "give_feedback"
                  | "make_request"
                  | "wait";
                reasoning: string;
                target?: string;
              }, // 계획된 행동 저장
            };
          }
        }
      } catch (error) {
        console.error(`❌ ${state.agentId} planning 실패:`, error);
      }

      // 실패 시 기본 plan 상태로
      return {
        agentId: state.agentId,
        currentState: "plan",
        lastStateChange: now.toISOString(),
        isProcessing: true,
        currentTask: {
          type: "planning",
          description: "다음 행동을 계획하고 있습니다",
          startTime: now.toISOString(),
          estimatedDuration: 10,
        },
      };
    }
  } else if (state.currentState === "plan" && state.currentTask) {
    // plan 상태에서 시간 경과 확인
    const elapsed = Math.floor(
      (now.getTime() - new Date(state.currentTask.startTime).getTime()) / 1000
    );

    // 계획 시간이 끝나면 실제 action으로 전환
    if (elapsed >= state.currentTask.estimatedDuration && state.plannedAction) {
      console.log(
        `⚡ ${state.agentId} action 시작: ${state.plannedAction.action}`
      );

      // give_feedback 계획인 경우 즉시 대상 에이전트를 feedback_waiting으로 변경
      if (
        state.plannedAction.action === "give_feedback" &&
        state.plannedAction.target
      ) {
        console.log(
          `📋 ${state.agentId} 피드백 계획 완료 - 대상 ${state.plannedAction.target}을 피드백 대기 중으로 변경`
        );

        try {
          const targetAgentId = state.plannedAction.target;
          const targetAgentState = await getAgentState(teamId, targetAgentId);
          const agentProfile = await getAgentById(state.agentId);

          if (targetAgentState && agentProfile) {
            targetAgentState.currentState = "feedback_waiting";
            targetAgentState.currentTask = {
              type: "feedback_waiting",
              description: `${agentProfile.name}의 피드백을 기다리는 중`,
              startTime: now.toISOString(),
              estimatedDuration: 300, // 5분 예상
              trigger: "ai_request",
              requestInfo: {
                requesterName: agentProfile.name,
                requestMessage: "피드백 세션 요청",
              },
            };
            targetAgentState.lastStateChange = now.toISOString();
            await setAgentState(teamId, targetAgentId, targetAgentState);
            console.log(
              `✅ 대상 에이전트 ${targetAgentId}를 피드백 대기 중으로 변경 완료`
            );
          }
        } catch (error) {
          console.error(`❌ 대상 에이전트 상태 변경 실패:`, error);
        }
      }

      // plannedAction에 따라 실제 작업 상태로 전환
      const actionDescriptions = {
        generate_idea: "창의적인 아이디어를 생성하고 있습니다",
        evaluate_idea: "아이디어를 평가하고 있습니다",
        give_feedback: "팀원에게 피드백을 작성하고 있습니다",
        make_request: "다른 팀원에게 작업을 요청하기로 결정했습니다",
      };

      const actionDurations = {
        generate_idea: 60, // 60초
        evaluate_idea: 45, // 45초
        give_feedback: 30, // 30초
        make_request: 0, // 즉시 실행
      };

      if (state.plannedAction.action !== "wait") {
        return {
          agentId: state.agentId,
          currentState: "action",
          lastStateChange: now.toISOString(),
          isProcessing: true,
          currentTask: {
            type: state.plannedAction.action as
              | "generate_idea"
              | "evaluate_idea"
              | "give_feedback"
              | "make_request"
              | "thinking",
            description:
              actionDescriptions[
                state.plannedAction.action as keyof typeof actionDescriptions
              ] || "작업을 수행하고 있습니다",
            startTime: now.toISOString(),
            estimatedDuration:
              actionDurations[
                state.plannedAction.action as keyof typeof actionDurations
              ] || 45,
            trigger: "autonomous", // 자율적 계획에 의한 작업
          },
          plannedAction: state.plannedAction,
        };
      }
    }
  } else if (state.currentState === "action" && state.currentTask) {
    // action 상태에서 시간 경과 확인
    const elapsed = Math.floor(
      (now.getTime() - new Date(state.currentTask.startTime).getTime()) / 1000
    );

    // 작업 시간이 끝나면 실제 작업 실행 후 idle로 전환
    if (elapsed >= state.currentTask.estimatedDuration) {
      console.log(`✅ ${state.agentId} 작업 완료, 실제 작업 실행 중...`);

      // 실제 작업 실행 (백그라운드)
      if (state.plannedAction) {
        executeAgentAction(teamId, state.agentId, state.plannedAction).catch(
          (error) => console.error(`❌ ${state.agentId} 작업 실행 실패:`, error)
        );
      }

      return {
        agentId: state.agentId,
        currentState: "idle",
        lastStateChange: now.toISOString(),
        isProcessing: false,
        idleTimer: {
          startTime: now.toISOString(),
          plannedDuration: Math.floor(Math.random() * 30) + 60, // 60-90초
          remainingTime: Math.floor(Math.random() * 30) + 60,
        },
      };
    }
  }

  return state;
}

// 실제 에이전트 작업 실행 함수
async function executeAgentAction(
  teamId: string,
  agentId: string,
  plannedAction: {
    action:
      | "generate_idea"
      | "evaluate_idea"
      | "give_feedback"
      | "make_request"
      | "wait";
    reasoning: string;
    target?: string;
  }
) {
  try {
    const team = await getTeamById(teamId);
    const agentProfile = await getAgentById(agentId);

    if (!team || !agentProfile) {
      console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
      return;
    }

    console.log(
      `🎯 ${agentProfile.name} 자율 행동 실행: ${plannedAction.action}`
    );

    if (plannedAction.action === "generate_idea") {
      // 아이디어 생성
      const ideas = await getIdeas(teamId);
      const existingIdeas = ideas.map((idea, index) => ({
        ideaNumber: index + 1,
        authorName: idea.author,
        object: idea.content.object,
        function: idea.content.function,
      }));

      // 에이전트 메모리 가져오기
      const { getAgentMemory } = await import("@/lib/redis");
      const agentMemory = await getAgentMemory(agentId);

      const generatedContent = await generateIdeaAction(
        team.topic || "Carbon Emission Reduction",
        agentProfile,
        existingIdeas,
        agentMemory || undefined
      );

      const newIdea = await addIdea(teamId, {
        author: agentId,
        timestamp: new Date().toISOString(),
        content: {
          object: generatedContent.object || "생성된 아이디어",
          function: generatedContent.function || "기능 설명",
          behavior:
            typeof generatedContent.behavior === "object"
              ? JSON.stringify(generatedContent.behavior)
              : generatedContent.behavior || "동작 설명",
          structure:
            typeof generatedContent.structure === "object"
              ? JSON.stringify(generatedContent.structure)
              : generatedContent.structure || "구조 설명",
        },
        evaluations: [],
      });

      // 채팅 알림 (자율적 행동)
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `새로운 아이디어를 생성했습니다.`,
        },
      });

      // 메모리 업데이트 - 자율적 아이디어 생성
      try {
        await processMemoryUpdate({
          type: "IDEA_GENERATED",
          payload: {
            teamId,
            authorId: agentId,
            idea: newIdea,
            isAutonomous: true, // 자율적 생성
          },
        });
        console.log(
          `✅ 자율적 아이디어 생성 후 메모리 업데이트 성공: ${agentId} -> idea ${newIdea.id}`
        );
      } catch (memoryError) {
        console.error(
          "❌ 자율적 아이디어 생성 후 메모리 업데이트 실패:",
          memoryError
        );
      }

      console.log(
        `✅ ${agentProfile.name} 아이디어 생성 완료:`,
        generatedContent.object
      );
    }

    if (plannedAction.action === "evaluate_idea") {
      // 아이디어 평가 - 2단계 프롬프트 사용
      const ideas = await getIdeas(teamId);

      if (ideas.length === 0) {
        console.log(`⚠️ ${agentProfile.name} 평가할 아이디어가 없음`);
        return;
      }

      // 본인이 만든 아이디어 제외
      const otherIdeas = ideas.filter((idea) => idea.author !== agentId);

      if (otherIdeas.length === 0) {
        console.log(
          `⚠️ ${agentProfile.name} 평가할 다른 사람의 아이디어가 없음`
        );
        return;
      }

      // 자율적 평가 완료 메시지
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `자율적으로 아이디어를 평가했습니다.`,
        },
      });

      console.log(`✅ 에이전트 ${agentId} 자율적 평가 완료`);
    }

    if (plannedAction.action === "give_feedback") {
      // 피드백 제공 - 피드백 세션으로 진행
      console.log(`💬 ${agentProfile.name} 피드백 세션 시작 로직`);

      const ideas = await getIdeas(teamId);

      if (ideas.length === 0) {
        console.log(`⚠️ ${agentProfile.name} 피드백할 아이디어가 없음`);
        return;
      }

      // 본인이 만든 아이디어 제외
      const otherIdeas = ideas.filter((idea) => idea.author !== agentId);

      if (otherIdeas.length === 0) {
        console.log(
          `⚠️ ${agentProfile.name} 피드백할 다른 사람의 아이디어가 없음`
        );
        return;
      }

      // 팀의 모든 에이전트 정보 가져오기
      const agents = await Promise.all(
        (team?.members || [])
          .filter((m) => !m.isUser && m.agentId)
          .map((m) => getAgentById(m.agentId!))
      );
      const validAgents = agents.filter((agent) => agent !== null);

      // 피드백 가능한 다른 팀원들 찾기 (본인 제외)
      const otherMembers = team.members.filter(
        (member) => !member.isUser && member.agentId !== agentId
      );

      if (otherMembers.length === 0) {
        console.log(`⚠️ ${agentProfile.name} 피드백할 다른 팀원이 없음`);
        return;
      }

      // 랜덤하게 피드백 대상 선택
      const targetMember =
        otherMembers[Math.floor(Math.random() * otherMembers.length)];
      const targetAgent = validAgents.find(
        (a: any) => a.id === targetMember.agentId
      );

      if (!targetAgent) {
        console.log(`⚠️ ${agentProfile.name} 대상 에이전트를 찾을 수 없음`);
        return;
      }

      console.log(
        `🎯 ${agentProfile.name} → ${targetAgent.name} 피드백 세션 생성`
      );

      // 락 키 생성 (작은 ID가 먼저 오도록 정렬)
      const lockKey = `feedback_lock:${[agentId, targetAgent.id]
        .sort()
        .join(":")}`;

      // 분산 락 사용
      const lockAcquired = await redis.set(lockKey, "locked", {
        ex: 30, // 30초 TTL
        nx: true, // 키가 존재하지 않을 때만 설정
      });

      if (!lockAcquired) {
        console.log(
          `🔒 ${agentProfile.name} → ${targetAgent.name} 피드백 세션 락 실패 (이미 진행 중)`
        );
        return;
      }

      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

      try {
        // 피드백 세션 생성
        const sessionResponse = await fetch(
          `${baseUrl}/api/teams/${teamId}/feedback-sessions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "TeamBuilder-Internal",
            },
            body: JSON.stringify({
              action: "create",
              initiatorId: agentId,
              targetAgentId: targetAgent.id,
              feedbackContext: {
                category: "general",
                description: "일반적인 협업과 팀워크에 대한 피드백",
              },
            }),
          }
        );

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          console.log(
            `✅ ${agentProfile.name} → ${targetAgent.name} 피드백 세션 생성 성공: ${sessionData.sessionId}`
          );

          // 3초 후 첫 메시지 생성 트리거
          setTimeout(async () => {
            try {
              const aiProcessResponse = await fetch(
                `${baseUrl}/api/teams/${teamId}/feedback-sessions/${sessionData.sessionId}/ai-process`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "TeamBuilder-Internal",
                  },
                  body: JSON.stringify({
                    triggerAgentId: agentId,
                    action: "respond",
                  }),
                }
              );

              if (aiProcessResponse.ok) {
                console.log(
                  `✅ ${agentProfile.name} 첫 피드백 메시지 생성 트리거 성공`
                );
              } else {
                console.error(
                  `❌ ${agentProfile.name} 첫 피드백 메시지 생성 트리거 실패:`,
                  aiProcessResponse.status
                );
              }
            } catch (error) {
              console.error(
                `❌ ${agentProfile.name} 첫 피드백 메시지 생성 트리거 오류:`,
                error
              );
            }
          }, 3000);
        } else {
          const errorData = await sessionResponse.json();
          console.error(
            `❌ ${agentProfile.name} → ${targetAgent.name} 피드백 세션 생성 실패:`,
            errorData
          );
        }
      } finally {
        // 락 해제
        await redis.del(lockKey);
        console.log(`🔓 ${agentProfile.name} → ${targetAgent.name} 락 해제`);
      }
    }
  } catch (error) {
    console.error(`❌ ${agentId} 작업 실행 실패:`, error);

    // 실패 시에도 idle 상태로 전환
    setTimeout(async () => {
      try {
        console.log(
          `😴 에이전트 ${agentId} → 실패 후 Idle 상태 전환 시도 중...`
        );
        const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;
        const response = await fetch(
          `${baseUrl}/api/teams/${teamId}/agent-states`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "TeamBuilder-Internal",
            },
            body: JSON.stringify({
              agentId,
              currentState: "idle",
            }),
          }
        );

        if (response.ok) {
          console.log(`😴 에이전트 ${agentId} → 실패 후 Idle 상태 전환 완료`);
        } else {
          const errorText = await response.text();
          console.error(
            `❌ 에이전트 ${agentId} 실패 후 Idle 전환 실패:`,
            response.status,
            errorText
          );
        }
      } catch (e) {
        console.error(`❌ 에이전트 ${agentId} 실패 후 Idle 전환 실패:`, e);
      }
    }, 2000);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // 팀 정보 가져오기
    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json(
        { error: "팀을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 팀의 AI 에이전트들에 대한 상태 조회
    const teamAgentStates: AgentStateInfo[] = [];

    for (const member of team.members) {
      if (!member.isUser && member.agentId) {
        let agentState = await getAgentState(teamId, member.agentId);

        // agentState가 null인 경우 기본 상태 생성
        if (!agentState) {
          console.log(
            `⚠️ 에이전트 ${member.agentId} 상태가 null - 기본 상태 생성`
          );
          agentState = {
            agentId: member.agentId,
            currentState: "idle",
            lastStateChange: new Date().toISOString(),
            isProcessing: false,
            idleTimer: {
              startTime: new Date().toISOString(),
              plannedDuration: 75,
              remainingTime: 75,
            },
          };
        }

        // 타이머 업데이트
        agentState = await updateAgentStateTimer(teamId, agentState);

        // 업데이트된 상태 저장 시도
        await setAgentState(teamId, member.agentId, agentState);

        teamAgentStates.push(agentState);
      }
    }

    return NextResponse.json({
      teamId,
      agentStates: teamAgentStates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("에이전트 상태 조회 실패:", error);
    return NextResponse.json(
      { error: "에이전트 상태 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

// 에이전트 상태 업데이트를 위한 POST 메서드
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    const body = await request.json();
    const {
      agentId,
      currentState,
      taskType,
      taskDescription,
      estimatedDuration,
      trigger,
      requestInfo,
      action, // 새로운 필드: 요청 처리용
      requestData, // 새로운 필드: 요청 데이터
      sessionInfo, // 새로운 필드: 피드백 세션 정보
    } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId가 필요합니다." },
        { status: 400 }
      );
    }

    // 요청 처리 액션인 경우
    if (action === "process_request" && requestData) {
      console.log(`📨 에이전트 ${agentId}에게 요청 처리: ${requestData.type}`);
      console.log(`요청 상세 정보:`, JSON.stringify(requestData, null, 2));

      // 현재 에이전트 상태 확인
      const currentAgentState = await getAgentState(teamId, agentId);
      console.log(
        `현재 에이전트 상태:`,
        JSON.stringify(currentAgentState, null, 2)
      );

      if (!currentAgentState) {
        console.error(`❌ 에이전트 ${agentId} 상태를 찾을 수 없습니다.`);
        return NextResponse.json(
          { error: "에이전트 상태를 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      // 에이전트가 idle 상태인 경우 즉시 처리
      if (
        currentAgentState.currentState === "idle" &&
        !currentAgentState.isProcessing
      ) {
        console.log(`🔄 에이전트 ${agentId} Idle 상태 - 즉시 요청 처리 시작`);

        // 즉시 action 상태로 전환
        const now = new Date();
        const newState: AgentStateInfo = {
          agentId,
          currentState: "action",
          lastStateChange: now.toISOString(),
          isProcessing: true,
          currentTask: {
            type:
              requestData.type === "evaluate_idea"
                ? "evaluate_idea"
                : "thinking",
            description: `${requestData.requesterName}의 요청: ${
              requestData.payload?.message || "요청 처리"
            }`,
            startTime: now.toISOString(),
            estimatedDuration: 30, // 30초 예상
            trigger: "user_request",
            requestInfo: {
              requesterName: requestData.requesterName,
              requestMessage: requestData.payload?.message || "",
            },
          },
        };

        // 상태 저장
        await setAgentState(teamId, agentId, newState);

        // 백그라운드에서 실제 요청 처리
        processRequestInBackground(teamId, agentId, requestData);

        return NextResponse.json({
          success: true,
          message: "요청이 즉시 처리되기 시작했습니다.",
          state: newState,
        });
      } else {
        // 에이전트가 바쁜 상태인 경우 큐에 추가
        console.log(`⏳ 에이전트 ${agentId} 바쁜 상태 - 큐에 요청 추가`);

        // 큐에 요청 추가 (Redis 리스트 사용)
        const queueKey = `agent_queue:${teamId}:${agentId}`;
        await redis.lpush(queueKey, JSON.stringify(requestData));
        await redis.expire(queueKey, 3600); // 1시간 TTL

        return NextResponse.json({
          success: true,
          message: "에이전트가 현재 작업 중이므로 큐에 추가되었습니다.",
          queued: true,
        });
      }
    }

    const now = new Date();
    let newState: AgentStateInfo;

    if (currentState === "idle") {
      // idle 상태로 전환 시 큐 확인
      const queueKey = `agent_queue:${teamId}:${agentId}`;
      const queuedRequest = await redis.rpop(queueKey);

      // 디버깅을 위한 상세 로깅
      console.log(`🔍 큐 확인 결과:`, {
        agentId,
        queueKey,
        queuedRequest,
        queuedRequestType: typeof queuedRequest,
        queuedRequestIsNull: queuedRequest === null,
      });

      if (queuedRequest && queuedRequest !== null) {
        // 큐에 대기 중인 요청이 있으면 즉시 처리
        console.log(`📋 에이전트 ${agentId} 큐에서 요청 발견 - 즉시 처리`);

        // Redis에서 가져온 데이터가 이미 객체일 수 있으므로 타입 확인
        let requestData;
        try {
          if (typeof queuedRequest === "string") {
            requestData = JSON.parse(queuedRequest);
          } else if (
            typeof queuedRequest === "object" &&
            queuedRequest !== null
          ) {
            requestData = queuedRequest;
          } else {
            throw new Error(
              `예상하지 못한 큐 데이터 타입: ${typeof queuedRequest}`
            );
          }

          // requestData 유효성 검사
          if (!requestData || typeof requestData !== "object") {
            throw new Error("유효하지 않은 요청 데이터");
          }
        } catch (parseError) {
          console.error(
            `❌ 에이전트 ${agentId} 큐 데이터 파싱 실패:`,
            parseError
          );
          console.error(`큐 데이터 상세:`, {
            queuedRequest,
            type: typeof queuedRequest,
            isNull: queuedRequest === null,
            isUndefined: queuedRequest === undefined,
          });

          // 파싱 실패 시 기본 idle 상태로
          newState = {
            agentId,
            currentState: "idle",
            lastStateChange: now.toISOString(),
            isProcessing: false,
            idleTimer: {
              startTime: now.toISOString(),
              plannedDuration: Math.floor(Math.random() * 30) + 60,
              remainingTime: Math.floor(Math.random() * 30) + 60,
            },
          };
          await setAgentState(teamId, agentId, newState);
          return NextResponse.json({
            success: true,
            message: "큐 데이터 파싱 실패로 idle 상태로 전환되었습니다.",
            state: newState,
          });
        }

        newState = {
          agentId,
          currentState: "action",
          lastStateChange: now.toISOString(),
          isProcessing: true,
          currentTask: {
            type:
              requestData.type === "evaluate_idea"
                ? "evaluate_idea"
                : "thinking",
            description: `${requestData.requesterName}의 요청: ${
              requestData.payload?.message || "요청 처리"
            }`,
            startTime: now.toISOString(),
            estimatedDuration: 30,
            trigger: "user_request",
            requestInfo: {
              requesterName: requestData.requesterName,
              requestMessage: requestData.payload?.message || "",
            },
          },
        };

        // 백그라운드에서 요청 처리
        processRequestInBackground(teamId, agentId, requestData);
      } else {
        // 큐가 비어있으면 일반 idle 상태
        newState = {
          agentId,
          currentState: "idle",
          lastStateChange: now.toISOString(),
          isProcessing: false,
          idleTimer: {
            startTime: now.toISOString(),
            plannedDuration: Math.floor(Math.random() * 30) + 60, // 60-90초
            remainingTime: Math.floor(Math.random() * 30) + 60,
          },
        };
      }
    } else if (currentState === "plan" || currentState === "action") {
      // 작업 상태로 전환
      newState = {
        agentId,
        currentState,
        lastStateChange: now.toISOString(),
        isProcessing: true,
        currentTask: {
          type: taskType || "thinking",
          description: taskDescription || "작업을 수행하고 있습니다",
          startTime: now.toISOString(),
          estimatedDuration: estimatedDuration || 60,
          trigger: trigger || "autonomous",
          requestInfo: requestInfo,
        },
      };
    } else if (currentState === "feedback_session") {
      // 피드백 세션 상태로 전환
      newState = {
        agentId,
        currentState: "feedback_session",
        lastStateChange: now.toISOString(),
        isProcessing: true,
        currentTask: {
          type: "feedback_session",
          description: taskDescription || "피드백 세션 진행 중",
          startTime: now.toISOString(),
          estimatedDuration: estimatedDuration || 300, // 5분 기본값
          trigger: trigger || "user_request",
          requestInfo: requestInfo,
          sessionInfo: sessionInfo,
        },
      };
    } else if (currentState === "reflecting") {
      // 회고 상태로 전환
      newState = {
        agentId,
        currentState: "reflecting",
        lastStateChange: now.toISOString(),
        isProcessing: true,
        currentTask: {
          type: "reflecting",
          description: taskDescription || "경험을 바탕으로 자기 성찰 중",
          startTime: now.toISOString(),
          estimatedDuration: estimatedDuration || 10,
          trigger: "autonomous",
          requestInfo: requestInfo,
        },
      };
    } else {
      return NextResponse.json(
        { error: "유효하지 않은 상태입니다." },
        { status: 400 }
      );
    }

    // Redis에 상태 저장
    await setAgentState(teamId, agentId, newState);

    return NextResponse.json({
      success: true,
      message: "에이전트 상태가 업데이트되었습니다.",
      state: newState,
    });
  } catch (error) {
    console.error("에이전트 상태 업데이트 실패:", error);
    return NextResponse.json(
      { error: "상태 업데이트에 실패했습니다." },
      { status: 500 }
    );
  }
}

// 백그라운드에서 요청 처리하는 함수
async function processRequestInBackground(
  teamId: string,
  agentId: string,
  requestData: any
) {
  try {
    console.log(
      `🔧 에이전트 ${agentId} 백그라운드 요청 처리 시작: ${requestData.type}`
    );

    if (requestData.type === "evaluate_idea") {
      // 아이디어 평가 요청 처리
      await handleEvaluateIdeaRequestDirect(teamId, agentId, requestData);
    } else if (requestData.type === "generate_idea") {
      // 아이디어 생성 요청 처리
      await handleGenerateIdeaRequestDirect(teamId, agentId, requestData);
    } else if (requestData.type === "give_feedback") {
      // 피드백 요청 처리
      await handleGiveFeedbackRequestDirect(teamId, agentId, requestData);
    }

    console.log(`✅ 에이전트 ${agentId} 요청 처리 완료`);

    // 처리 완료 후 idle 상태로 전환
    setTimeout(async () => {
      try {
        console.log(`😴 에이전트 ${agentId} → Idle 상태 전환 시도 중...`);
        const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;
        const response = await fetch(
          `${baseUrl}/api/teams/${teamId}/agent-states`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "TeamBuilder-Internal",
            },
            body: JSON.stringify({
              agentId,
              currentState: "idle",
            }),
          }
        );

        if (response.ok) {
          console.log(`😴 에이전트 ${agentId} → Idle 상태 전환 완료`);
        } else {
          const errorText = await response.text();
          console.error(
            `❌ 에이전트 ${agentId} Idle 전환 실패:`,
            response.status,
            errorText
          );
        }
      } catch (error) {
        console.error(`❌ 에이전트 ${agentId} Idle 전환 실패:`, error);
      }
    }, 2000); // 2초 후 idle로 전환
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 백그라운드 요청 처리 실패:`, error);

    // 실패 시에도 idle 상태로 전환
    setTimeout(async () => {
      try {
        console.log(
          `😴 에이전트 ${agentId} → 실패 후 Idle 상태 전환 시도 중...`
        );
        const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;
        const response = await fetch(
          `${baseUrl}/api/teams/${teamId}/agent-states`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "TeamBuilder-Internal",
            },
            body: JSON.stringify({
              agentId,
              currentState: "idle",
            }),
          }
        );

        if (response.ok) {
          console.log(`😴 에이전트 ${agentId} → 실패 후 Idle 상태 전환 완료`);
        } else {
          const errorText = await response.text();
          console.error(
            `❌ 에이전트 ${agentId} 실패 후 Idle 전환 실패:`,
            response.status,
            errorText
          );
        }
      } catch (e) {
        console.error(`❌ 에이전트 ${agentId} 실패 후 Idle 전환 실패:`, e);
      }
    }, 2000);
  }
}

// 직접 아이디어 평가 요청 처리
async function handleEvaluateIdeaRequestDirect(
  teamId: string,
  agentId: string,
  requestData: any
) {
  console.log(`📊 에이전트 ${agentId} 아이디어 평가 요청 직접 처리`);

  try {
    const ideas = await getIdeas(teamId);

    if (ideas.length === 0) {
      console.log(`⚠️ 에이전트 ${agentId} 평가할 아이디어가 없음`);
      return;
    }

    // 본인이 만든 아이디어 제외
    const otherIdeas = ideas.filter((idea) => idea.author !== agentId);

    if (otherIdeas.length === 0) {
      console.log(`⚠️ ${agentId} 평가할 다른 사람의 아이디어가 없음`);
      return;
    }

    // 자율적 평가 완료 메시지
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: {
        content: `자율적으로 아이디어를 평가했습니다.`,
      },
    });

    console.log(`✅ 에이전트 ${agentId} 자율적 평가 완료`);
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 평가 요청 처리 실패:`, error);
  }
}

// 아이디어 생성 요청 처리
async function handleGenerateIdeaRequestDirect(
  teamId: string,
  agentId: string,
  requestData: any
) {
  console.log(`📊 에이전트 ${agentId} 아이디어 생성 요청 직접 처리`);

  try {
    const team = await getTeamById(teamId);
    const agentProfile = await getAgentById(agentId);

    if (!team || !agentProfile) {
      console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
      return;
    }

    const ideas = await getIdeas(teamId);
    const existingIdeas = ideas.map((idea, index) => ({
      ideaNumber: index + 1,
      authorName: idea.author,
      object: idea.content.object,
      function: idea.content.function,
    }));

    const agentMemory = await getAgentMemory(agentId);
    const generatedContent = await generateIdeaAction(
      team.topic || "Carbon Emission Reduction",
      agentProfile,
      existingIdeas,
      agentMemory || undefined
    );

    const newIdea = await addIdea(teamId, {
      author: agentId,
      timestamp: new Date().toISOString(),
      content: {
        object: generatedContent.object || "생성된 아이디어",
        function: generatedContent.function || "기능 설명",
        behavior:
          typeof generatedContent.behavior === "object"
            ? JSON.stringify(generatedContent.behavior)
            : generatedContent.behavior || "동작 설명",
        structure:
          typeof generatedContent.structure === "object"
            ? JSON.stringify(generatedContent.structure)
            : generatedContent.structure || "구조 설명",
      },
      evaluations: [],
    });

    // 채팅 알림
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: {
        content: `${requestData.requesterName}의 요청에 따라 새로운 아이디어를 생성했습니다.`,
      },
    });

    console.log(
      `✅ ${agentProfile.name} 아이디어 생성 완료:`,
      generatedContent.object
    );
  } catch (error) {
    console.error(
      `❌ 에이전트 ${agentId} 아이디어 생성 요청 처리 실패:`,
      error
    );
  }
}

// 피드백 요청 처리
async function handleGiveFeedbackRequestDirect(
  teamId: string,
  agentId: string,
  requestData: any
) {
  console.log(`📊 에이전트 ${agentId} 피드백 요청 직접 처리`);

  try {
    const team = await getTeamById(teamId);
    const agentProfile = await getAgentById(agentId);

    if (!team || !agentProfile) {
      console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
      return;
    }

    // 요청자 정보 확인
    const requesterName = requestData.requesterName;
    const requesterId = requestData.requesterId;

    // 요청자가 피드백 세션 중인지 확인
    const activeSessions = await redis.keys("feedback_session:*");
    let requesterInFeedbackSession = false;

    for (const sessionKey of activeSessions) {
      const sessionData = await redis.get(sessionKey);
      if (sessionData) {
        const session =
          typeof sessionData === "string"
            ? JSON.parse(sessionData)
            : sessionData;
        if (
          session.status === "active" &&
          session.participants.some((p: any) => p.id === requesterId)
        ) {
          requesterInFeedbackSession = true;
          break;
        }
      }
    }

    if (requesterInFeedbackSession) {
      // 요청자가 피드백 세션 중이면 요청을 큐에 추가
      console.log(
        `⏳ 요청자 ${requesterName}가 피드백 세션 중 - 요청을 큐에 추가`
      );

      // 요청 큐에 추가하는 로직 (나중에 구현)
      return;
    }

    const ideas = await getIdeas(teamId);

    if (ideas.length === 0) {
      console.log(`⚠️ 에이전트 ${agentId} 피드백할 아이디어가 없음`);
      return;
    }

    // 본인이 만든 아이디어 제외
    const otherIdeas = ideas.filter((idea) => idea.author !== agentId);

    if (otherIdeas.length === 0) {
      console.log(
        `⚠️ 에이전트 ${agentId} 피드백할 다른 사람의 아이디어가 없음`
      );
      return;
    }

    // 피드백 가능한 아이디어 중에서 사용 가능한 대상 선별
    console.log(`🔍 ${agentProfile.name} 피드백 가능한 대상 찾는 중...`);

    // 먼저 현재 활성 세션 목록 확인
    const currentActiveSessions = await redis.keys("feedback_session:*");
    const busyAgents = new Set<string>();

    for (const sessionKey of currentActiveSessions) {
      const sessionData = await redis.get(sessionKey);
      if (sessionData) {
        const session =
          typeof sessionData === "string"
            ? JSON.parse(sessionData)
            : sessionData;
        if (session.status === "active") {
          session.participants.forEach((p: any) => {
            if (p.id !== "나") {
              busyAgents.add(p.id);
            }
          });
        }
      }
    }

    // 피드백 관련 상태의 에이전트들도 확인
    const feedbackBusyAgents = new Set<string>();
    for (const idea of otherIdeas) {
      const targetAgentId = idea.author === "나" ? "user" : idea.author;
      if (targetAgentId !== "user") {
        const targetAgentState = await getAgentState(teamId, targetAgentId);
        if (
          targetAgentState &&
          (targetAgentState.currentState === "feedback_waiting" ||
            targetAgentState.currentState === "feedback_session")
        ) {
          feedbackBusyAgents.add(targetAgentId);
        }
      }
    }

    // 사용 가능한 아이디어들만 필터링
    const availableIdeas = otherIdeas.filter((idea) => {
      const targetAgentId = idea.author === "나" ? "user" : idea.author;
      const isBusy =
        busyAgents.has(targetAgentId) || feedbackBusyAgents.has(targetAgentId);

      if (isBusy) {
        console.log(
          `⏭️ ${idea.author} (${targetAgentId})는 이미 피드백 관련 작업 중 - 건너뛰기`
        );
      }

      return !isBusy;
    });

    if (availableIdeas.length === 0) {
      console.log(
        `⚠️ ${agentProfile.name} 현재 피드백 가능한 대상이 없음 (모두 피드백 관련 작업 중)`
      );
      return;
    }

    console.log(
      `✅ ${agentProfile.name} 사용 가능한 피드백 대상 ${availableIdeas.length}개 발견`
    );

    // 사용 가능한 대상들에 대해 락 시도하여 첫 번째 성공한 대상 사용
    let selectedIdea = null;
    let lockKey = null;

    for (const idea of availableIdeas) {
      const targetAgentId = idea.author === "나" ? "user" : idea.author;

      // 분산 락을 사용하여 대상 에이전트의 피드백 세션 참여 여부를 원자적으로 확인
      const currentLockKey = `feedback_lock:${targetAgentId}`;
      const lockValue = `${agentId}_${Date.now()}`;

      // 10초 동안 락 시도 (NX: 키가 없을 때만 설정, EX: 만료 시간)
      const lockAcquired = await redis.set(currentLockKey, lockValue, {
        nx: true,
        ex: 10,
      });

      if (lockAcquired) {
        console.log(
          `🔒 ${agentProfile.name}이 ${targetAgentId}에 대한 락 획득 성공`
        );

        // 락 획득 후 다시 한 번 확인 (더블 체크)
        const recentSessions = await redis.keys("feedback_session:*");
        let stillBusy = false;

        for (const sessionKey of recentSessions) {
          const sessionData = await redis.get(sessionKey);
          if (sessionData) {
            const session =
              typeof sessionData === "string"
                ? JSON.parse(sessionData)
                : sessionData;
            if (
              session.status === "active" &&
              session.participants.some((p: any) => p.id === targetAgentId)
            ) {
              stillBusy = true;
              console.log(
                `⚠️ 락 획득 후 재확인: ${idea.author} (${targetAgentId})가 세션 ${session.id}에 참여 중`
              );
              break;
            }
          }
        }

        if (!stillBusy) {
          selectedIdea = idea;
          lockKey = currentLockKey;
          console.log(
            `✅ ${targetAgentId} 최종 확인 완료 - 피드백 대상으로 선택`
          );
          break; // 첫 번째 성공한 대상 사용
        } else {
          // 다시 바쁜 상태가 되었으면 락 해제
          await redis.del(currentLockKey);
          console.log(
            `🔓 ${targetAgentId} 재확인에서 바쁜 상태 발견 - 락 해제`
          );
        }
      } else {
        console.log(
          `❌ ${agentProfile.name}이 ${targetAgentId}에 대한 락 획득 실패 (다른 에이전트가 이미 락 보유중)`
        );
      }
    }

    if (!selectedIdea || !lockKey) {
      console.log(
        `⚠️ ${agentProfile.name} 현재 피드백 가능한 대상이 없음 (모두 락 획득 실패)`
      );
      return;
    }

    // 아이디어 작성자 정보 가져오기
    const targetAuthorId =
      selectedIdea.author === "나" ? "user" : selectedIdea.author;
    const targetAuthor =
      selectedIdea.author === "나"
        ? { id: "user", name: "나", isUser: true }
        : await (async () => {
            const agent = await getAgentById(selectedIdea.author);
            return agent
              ? { id: agent.id, name: agent.name, isUser: false }
              : null;
          })();

    if (!targetAuthor) {
      console.log(`❌ ${agentProfile.name} 대상 작성자 정보를 찾을 수 없음`);
      return;
    }

    // 피드백 세션 생성
    const sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const feedbackSession = {
      id: sessionId,
      teamId,
      participants: [
        { id: agentId, name: agentProfile.name, isUser: false },
        targetAuthor,
      ],
      status: "active",
      createdAt: new Date().toISOString(),
      targetIdea: {
        ideaId: selectedIdea.id,
        ideaTitle: selectedIdea.content.object,
        authorName: targetAuthor.name,
      },
      feedbackContext: {
        category: "general",
        description: `${targetAuthor.name}의 아이디어를 평가하기로 결정했습니다. 현재 상황에서 가장 적절한 아이디어를 선택하여 평가해주세요.`,
      },
      messages: [],
      initiatorId: agentId,
    };

    // Redis에 세션 저장
    await redis.set(
      `feedback_session:${sessionId}`,
      JSON.stringify(feedbackSession)
    );

    // 팀의 활성 세션 목록에 추가
    const activeSessionsKey = `team:${teamId}:active_feedback_sessions`;
    await redis.sadd(activeSessionsKey, sessionId);

    // 대상 에이전트를 'feedback_waiting' 상태로 변경
    if (!targetAuthor.isUser) {
      const targetAgentState = await getAgentState(teamId, targetAuthor.id);
      if (targetAgentState) {
        targetAgentState.currentState = "feedback_waiting";
        targetAgentState.currentTask = {
          type: "feedback_waiting",
          description: `${agentProfile.name}의 피드백을 기다리는 중`,
          startTime: new Date().toISOString(),
          estimatedDuration: 300, // 5분 예상
          trigger: "ai_request",
          requestInfo: {
            requesterName: agentProfile.name,
            requestMessage: "피드백 세션 요청",
          },
        };
        targetAgentState.lastStateChange = new Date().toISOString();
        await setAgentState(teamId, targetAuthor.id, targetAgentState);
        console.log(`📋 ${targetAuthor.name} 상태를 피드백 대기 중으로 변경`);
      }
    }

    // 피드백 제공 에이전트를 'feedback_session' 상태로 변경
    const feedbackProviderState = await getAgentState(teamId, agentId);
    if (feedbackProviderState) {
      feedbackProviderState.currentState = "feedback_session";
      feedbackProviderState.currentTask = {
        type: "feedback_session",
        description: `${targetAuthor.name}와 피드백 세션 진행 중`,
        startTime: new Date().toISOString(),
        estimatedDuration: 300, // 5분 예상
        trigger: "autonomous",
        sessionInfo: {
          sessionId,
          participants: [agentProfile.name, targetAuthor.name],
        },
      };
      feedbackProviderState.lastStateChange = new Date().toISOString();
      await setAgentState(teamId, agentId, feedbackProviderState);
      console.log(`💬 ${agentProfile.name} 상태를 피드백 세션 중으로 변경`);
    }

    console.log(
      `✅ ${agentProfile.name} 피드백 세션 생성 완료: ${sessionId} -> ${targetAuthor.name}`
    );

    // AI 에이전트가 첫 번째 메시지 생성하도록 트리거
    try {
      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
        }/api/teams/${teamId}/feedback-sessions/${sessionId}/ai-process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            triggerAgentId: agentId,
            action: "respond",
          }),
        }
      );

      if (response.ok) {
        console.log(`✅ ${agentProfile.name} 피드백 세션 첫 메시지 생성 완료`);
      }
    } catch (error) {
      console.error(
        `❌ ${agentProfile.name} 피드백 세션 첫 메시지 생성 실패:`,
        error
      );
    }
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 피드백 요청 처리 실패:`, error);
  }
}
