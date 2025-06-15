import { NextRequest, NextResponse } from "next/server";
import {
  getTeamById,
  getAgentById,
  getIdeas,
  getChatHistory,
  addIdea,
  addChatMessage,
} from "@/lib/redis";
import { redis } from "@/lib/redis";
import {
  planNextAction,
  generateIdeaAction,
  evaluateIdeaAction,
  giveFeedbackOnIdea,
} from "@/lib/openai";

// 에이전트 상태 타입
interface AgentStateInfo {
  agentId: string;
  currentState: "idle" | "plan" | "action";
  lastStateChange: string;
  isProcessing: boolean;
  currentTask?: {
    type: "generate_idea" | "evaluate_idea" | "planning" | "thinking";
    description: string;
    startTime: string;
    estimatedDuration: number;
    trigger?: "autonomous" | "user_request" | "ai_request";
    requestInfo?: {
      requesterName: string;
      requestMessage: string;
    };
  };
  idleTimer?: {
    startTime: string;
    plannedDuration: number;
    remainingTime: number;
  };
  plannedAction?: {
    action: "generate_idea" | "evaluate_idea" | "give_feedback" | "wait";
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
        await redis.set(stateKey, JSON.stringify(defaultState), { EX: 3600 }); // 1시간 TTL
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
    await redis.set(stateKey, JSON.stringify(state), { EX: 3600 }); // 1시간 TTL
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
          team.members
            .filter((m) => !m.isUser && m.agentId)
            .map((m) => getAgentById(m.agentId!)) || []
        );
        const validAgents = agents.filter((agent) => agent !== null);

        if (team && agentProfile) {
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

          // LLM으로 다음 행동 계획
          const planResult = await planNextAction(agentProfile, teamContext);

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
              plannedAction: planResult, // 계획된 행동 저장
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

      // plannedAction에 따라 실제 작업 상태로 전환
      const actionDescriptions = {
        generate_idea: "창의적인 아이디어를 생성하고 있습니다",
        evaluate_idea: "아이디어를 평가하고 있습니다",
        give_feedback: "팀원에게 피드백을 작성하고 있습니다",
      };

      const actionDurations = {
        generate_idea: 60, // 60초
        evaluate_idea: 45, // 45초
        give_feedback: 30, // 30초
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
    action: "generate_idea" | "evaluate_idea" | "give_feedback" | "wait";
    reasoning: string;
    target?: string;
  }
) {
  try {
    const team = await getTeamById(teamId);
    const agentProfile = await getAgentById(agentId);

    if (!team || !agentProfile) {
      throw new Error("팀 또는 에이전트 정보를 찾을 수 없습니다");
    }

    console.log(
      `🚀 ${agentProfile.name} 실제 작업 시작: ${plannedAction.action}`
    );

    if (plannedAction.action === "generate_idea") {
      // 아이디어 생성 - 기존 아이디어 리스트 포함
      const ideas = await getIdeas(teamId);
      const existingIdeas = await Promise.all(
        ideas.map(async (idea, index) => ({
          ideaNumber: index + 1,
          authorName:
            idea.author === "나"
              ? "나"
              : await (async () => {
                  const member = team.members.find(
                    (tm) => tm.agentId === idea.author
                  );
                  if (member && !member.isUser) {
                    const agent = await getAgentById(idea.author);
                    return agent?.name || `에이전트 ${idea.author}`;
                  }
                  return idea.author;
                })(),
          object: idea.content.object,
          function: idea.content.function,
        }))
      );

      const generatedContent = await generateIdeaAction(
        team.topic || "Carbon Emission Reduction",
        agentProfile,
        existingIdeas
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
          content: `스스로 계획하여 새로운 아이디어를 생성했습니다: "${generatedContent.object}"`,
        },
      });

      console.log(
        `✅ ${agentProfile.name} 아이디어 생성 완료:`,
        generatedContent.object
      );
    } else if (plannedAction.action === "evaluate_idea") {
      // 아이디어 평가
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

      // 랜덤하게 아이디어 선택 (본인 제외)
      const randomIdea =
        otherIdeas[Math.floor(Math.random() * otherIdeas.length)];

      const evaluation = await evaluateIdeaAction(randomIdea, team.topic);

      // 평가 추가 (실제 평가 API 호출)
      const response = await fetch(
        `${
          process.env.NEXTAUTH_URL || "http://localhost:3000"
        }/api/teams/${teamId}/ideas/${randomIdea.id}/evaluate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            evaluator: agentId,
            scores: {
              insightful: Math.max(
                1,
                Math.min(5, evaluation.scores?.insightful || 3)
              ),
              actionable: Math.max(
                1,
                Math.min(5, evaluation.scores?.actionable || 3)
              ),
              relevance: Math.max(
                1,
                Math.min(5, evaluation.scores?.relevance || 3)
              ),
            },
            comment: evaluation.comment || "자동 평가",
          }),
        }
      );

      if (response.ok) {
        // 채팅 알림 - 구체적인 아이디어 정보 포함
        let ideaAuthorName = randomIdea.author;
        if (randomIdea.author === "나") {
          ideaAuthorName = "나";
        } else {
          const member = team.members.find(
            (tm) => tm.agentId === randomIdea.author
          );
          if (member && !member.isUser) {
            const authorAgent = await getAgentById(randomIdea.author);
            ideaAuthorName =
              authorAgent?.name || `에이전트 ${randomIdea.author}`;
          }
        }

        console.log(`📢 ${agentProfile.name} 평가 완료 채팅 알림 전송 중...`);

        await addChatMessage(teamId, {
          sender: agentId,
          type: "system",
          payload: {
            content: `${ideaAuthorName}의 아이디어 "${
              randomIdea.content.object
            }"를 평가했습니다. 평가 점수: 통찰력 ${Math.max(
              1,
              Math.min(5, evaluation.scores?.insightful || 3)
            )}/5, 실행가능성 ${Math.max(
              1,
              Math.min(5, evaluation.scores?.actionable || 3)
            )}/5, 관련성 ${Math.max(
              1,
              Math.min(5, evaluation.scores?.relevance || 3)
            )}/5`,
          },
        });

        console.log(`✅ ${agentProfile.name} 평가 완료 채팅 알림 전송 완료`);

        console.log(
          `✅ ${agentProfile.name} 아이디어 평가 완료:`,
          randomIdea.content.object
        );
      } else {
        console.error(
          `❌ ${agentProfile.name} 평가 API 호출 실패:`,
          response.status,
          await response.text()
        );
      }
    } else if (plannedAction.action === "give_feedback") {
      // 피드백 제공 - 구체적인 아이디어에 대한 피드백
      const ideas = await getIdeas(teamId);

      if (ideas.length === 0) {
        console.log(`⚠️ ${agentProfile.name} 피드백할 아이디어가 없음`);
        return;
      }

      // 랜덤하게 아이디어 선택하여 피드백
      const randomIdea = ideas[Math.floor(Math.random() * ideas.length)];

      // 팀 컨텍스트 준비
      const teamContextForFeedback = {
        topic: team.topic || "Carbon Emission Reduction",
        teamMembers: await Promise.all(
          team.members.map(async (member) => ({
            agentId: member.agentId,
            name: member.isUser
              ? "나"
              : await (async () => {
                  if (member.agentId) {
                    const agent = await getAgentById(member.agentId);
                    return agent?.name || `에이전트 ${member.agentId}`;
                  }
                  return `에이전트 ${member.agentId}`;
                })(),
          }))
        ),
      };

      // 구체적인 아이디어에 대한 피드백 생성
      const feedbackResult = await giveFeedbackOnIdea(
        randomIdea,
        agentProfile,
        teamContextForFeedback
      );

      // 아이디어 작성자 이름 가져오기
      const ideaAuthorName =
        randomIdea.author === "나"
          ? "나"
          : await (async () => {
              const member = team.members.find(
                (tm) => tm.agentId === randomIdea.author
              );
              if (member && !member.isUser) {
                const agent = await getAgentById(randomIdea.author);
                return agent?.name || `에이전트 ${randomIdea.author}`;
              }
              return randomIdea.author;
            })();

      await addChatMessage(teamId, {
        sender: agentId,
        type: "feedback",
        payload: {
          type: "feedback",
          content: `${ideaAuthorName}의 "${randomIdea.content.object}" 아이디어에 대한 피드백: ${feedbackResult.feedback}`,
          mention: ideaAuthorName,
        },
      });

      console.log(
        `✅ ${agentProfile.name} 피드백 완료:`,
        randomIdea.content.object
      );
    }
  } catch (error) {
    console.error(`❌ ${agentId} 작업 실행 실패:`, error);

    // 실패 시 에러 메시지
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: {
        content: "계획된 작업을 수행하는 중 오류가 발생했습니다",
      },
    });
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
    } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId가 필요합니다." },
        { status: 400 }
      );
    }

    const now = new Date();
    let newState: AgentStateInfo;

    if (currentState === "idle") {
      // idle 상태로 전환
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
      { error: "에이전트 상태 업데이트에 실패했습니다." },
      { status: 500 }
    );
  }
}
