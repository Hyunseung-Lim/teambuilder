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
} from "@/lib/openai";
import { processMemoryUpdate } from "@/lib/memory";

// 에이전트 상태 타입
interface AgentStateInfo {
  agentId: string;
  currentState: "idle" | "plan" | "action" | "reflecting";
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
      | "reflecting";
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
          content: `새로운 아이디어를 생성했습니다: "${generatedContent.object}"`,
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

      // 아이디어 리스트를 적절한 형태로 변환
      const ideaList = otherIdeas.map((idea, index) => ({
        ideaNumber: idea.id,
        authorName: idea.author,
        object: idea.content.object,
        function: idea.content.function,
      }));

      if (!agentProfile) {
        console.log(`⚠️ 에이전트 ${agentId} 프로필을 찾을 수 없음`);
        return;
      }

      // 2단계 평가 프로세스
      // 1단계: 어떤 아이디어를 평가할지 결정
      const agentMemory = await getAgentMemory(agentId);
      const preEvaluation = await preEvaluationAction(
        `${agentProfile.name}이 아이디어를 평가하기로 결정했습니다. 현재 상황에서 가장 적절한 아이디어를 선택하여 평가해주세요.`,
        ideaList,
        agentProfile,
        agentMemory || undefined
      );

      const selectedIdea = otherIdeas.find(
        (idea) => idea.id === preEvaluation.selectedIdea.ideaNumber
      );

      if (!selectedIdea) {
        console.log(`⚠️ ${agentProfile.name} 선택된 아이디어를 찾을 수 없음`);
        return;
      }

      // 2단계: 실제 평가 수행
      const evaluation = await executeEvaluationAction(
        {
          ...preEvaluation.selectedIdea,
          authorName: selectedIdea.author,
        },
        preEvaluation.evaluationStrategy,
        agentProfile,
        agentMemory || undefined
      );

      // 평가 API 호출
      const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;
      const response = await fetch(
        `${baseUrl}/api/teams/${teamId}/ideas/${selectedIdea.id}/evaluate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-system-internal": "true",
            "User-Agent": "TeamBuilder-Internal",
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
            comment: evaluation.comment || "요청에 따른 평가",
          }),
        }
      );

      if (response.ok) {
        // 성공 시 채팅 알림
        let ideaAuthorName = selectedIdea.author;
        if (selectedIdea.author === "나") {
          ideaAuthorName = "나";
        } else {
          const authorAgent = await getAgentById(selectedIdea.author);
          ideaAuthorName =
            authorAgent?.name || `에이전트 ${selectedIdea.author}`;
        }

        console.log(
          `📢 에이전트 ${agentId} 자율적 평가 완료 채팅 알림 전송 중...`
        );

        await addChatMessage(teamId, {
          sender: agentId,
          type: "system",
          payload: {
            content: `${ideaAuthorName}의 아이디어 "${
              selectedIdea.content.object
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

        console.log(`✅ 에이전트 ${agentId} 자율적 평가 완료`);
      } else if (response.status === 400) {
        // 중복 평가 등의 클라이언트 에러 처리
        const errorData = await response.json();
        console.log(`⚠️ 에이전트 ${agentId} 평가 불가: ${errorData.error}`);

        // 아이디어 작성자 이름 가져오기
        let ideaAuthorName = selectedIdea.author;
        if (selectedIdea.author === "나") {
          ideaAuthorName = "나";
        } else {
          const authorAgent = await getAgentById(selectedIdea.author);
          ideaAuthorName =
            authorAgent?.name || `에이전트 ${selectedIdea.author}`;
        }

        // 중복 평가 메시지 전송 (자율적 평가인 경우)
        if (errorData.error && errorData.error.includes("이미")) {
          await addChatMessage(teamId, {
            sender: agentId,
            type: "system",
            payload: {
              content: `저는 이미 ${ideaAuthorName}의 "${selectedIdea.content.object}" 아이디어에 대해 평가를 완료했습니다.`,
            },
          });
        } else {
          // 기타 400 에러의 경우
          await addChatMessage(teamId, {
            sender: agentId,
            type: "system",
            payload: {
              content: `아이디어 평가를 처리할 수 없습니다: ${errorData.error}`,
            },
          });
        }
      } else {
        console.error(
          `❌ 에이전트 ${agentId} 평가 API 호출 실패:`,
          response.status
        );

        // 기타 서버 에러에 대한 메시지 (자율적 평가인 경우)
        await addChatMessage(teamId, {
          sender: agentId,
          type: "system",
          payload: {
            content: `아이디어 평가를 처리하는 중 오류가 발생했습니다.`,
          },
        });
      }
    }

    if (plannedAction.action === "give_feedback") {
      // 피드백 제공 - 구체적인 아이디어에 대한 피드백
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

      // 다른 사람의 아이디어 중에서 랜덤하게 선택하여 피드백
      const randomIdea =
        otherIdeas[Math.floor(Math.random() * otherIdeas.length)];

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
      const agentMemory = await getAgentMemory(agentId);
      const feedbackResult = await giveFeedbackOnIdea(
        randomIdea,
        agentProfile,
        teamContextForFeedback,
        agentMemory || undefined
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
        type: "give_feedback",
        payload: {
          type: "give_feedback",
          content: `${ideaAuthorName}의 "${randomIdea.content.object}" 아이디어에 대한 피드백: ${feedbackResult.feedback}`,
          mention: ideaAuthorName,
        },
      });

      // 메모리 업데이트 - 자율적 피드백 제공
      try {
        await processMemoryUpdate({
          type: "FEEDBACK_GIVEN",
          payload: {
            teamId,
            feedbackerId: agentId,
            targetId: randomIdea.author,
            content: feedbackResult.feedback,
            targetIdeaId: randomIdea.id,
            isAutonomous: true, // 자율적 피드백
          },
        });
        console.log(
          `✅ 자율적 피드백 후 메모리 업데이트 성공: ${agentId} -> ${randomIdea.author}`
        );
      } catch (memoryError) {
        console.error("❌ 자율적 피드백 후 메모리 업데이트 실패:", memoryError);
      }

      console.log(
        `✅ ${agentProfile.name} 피드백 완료:`,
        randomIdea.content.object
      );
    }

    if (plannedAction.action === "make_request") {
      // 요청하기 - 다른 팀원에게 작업 요청
      console.log(`📨 ${agentProfile.name} 요청하기 실행`);

      // 요청 생성중 상태로 변경
      const currentState = await getAgentState(teamId, agentId);
      if (currentState) {
        currentState.currentTask = {
          type: "make_request",
          description: "요청 생성중",
          startTime: new Date().toISOString(),
          estimatedDuration: 20,
          trigger: "autonomous",
        };
        await setAgentState(teamId, agentId, currentState);
      }

      // 팀 멤버 정보 준비
      const teamMembers = await Promise.all(
        team.members.map(async (member) => ({
          name: member.isUser
            ? "나"
            : await (async () => {
                if (member.agentId) {
                  const agent = await getAgentById(member.agentId);
                  return agent?.name || `에이전트 ${member.agentId}`;
                }
                return `에이전트 ${member.agentId}`;
              })(),
          roles: member.roles.map((role) => role.toString()), // AgentRole을 string으로 변환
          isUser: member.isUser,
          agentId: member.agentId || undefined, // null을 undefined로 변환
        }))
      );

      // 현재 아이디어 정보 가져오기
      const ideas = await getIdeas(teamId);
      const currentIdeas = ideas.map((idea, index) => ({
        ideaNumber: index + 1,
        authorName: idea.author,
        object: idea.content.object,
        function: idea.content.function,
      }));

      try {
        // 에이전트 메모리 가져오기
        const agentMemory = await getAgentMemory(agentId);

        // makeRequestAction 사용하여 요청 생성
        const { analysis, message } = await makeRequestAction(
          "팀 상황을 분석한 결과 다른 팀원에게 작업을 요청하기로 결정했습니다.",
          teamMembers,
          currentIdeas,
          agentProfile,
          agentMemory || undefined
        );

        // 채팅 메시지로 요청 전송 (새로운 형식)
        await addChatMessage(teamId, {
          sender: agentId,
          type: "make_request",
          payload: {
            type: "make_request",
            content: message.message,
            mention:
              analysis.targetMember === "나"
                ? "나"
                : (() => {
                    // targetMember 이름으로 agentId 찾기
                    const targetMemberInfo = teamMembers.find(
                      (member) => member.name === analysis.targetMember
                    );
                    return targetMemberInfo?.agentId || analysis.targetMember;
                  })(),
            requestType:
              analysis.requestType === "generate_idea"
                ? "generate"
                : analysis.requestType === "evaluate_idea"
                ? "evaluate"
                : "give_feedback",
          },
        });

        // 대상이 AI 에이전트인 경우 작업 큐에 추가
        const targetMemberInfo = teamMembers.find(
          (member) => member.name === analysis.targetMember
        );

        if (
          targetMemberInfo &&
          !targetMemberInfo.isUser &&
          targetMemberInfo.agentId
        ) {
          console.log(
            `📨 AI 에이전트 ${targetMemberInfo.agentId}에게 요청 전달`
          );

          // 요청 데이터 준비
          const requestData = {
            id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type:
              analysis.requestType === "generate_idea"
                ? "generate_idea"
                : "evaluate_idea",
            requesterName: agentProfile.name,
            payload: {
              message: message.message,
            },
            timestamp: new Date().toISOString(),
            teamId: teamId,
          };

          // 에이전트 상태 API를 통해 요청 처리
          try {
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
                  agentId: targetMemberInfo.agentId,
                  action: "process_request",
                  requestData: requestData,
                }),
              }
            );

            if (response.ok) {
              const result = await response.json();
              if (result.queued) {
                console.log(
                  `⏳ 에이전트 ${targetMemberInfo.agentId} 바쁨 - 큐에 추가됨`
                );
              } else {
                console.log(
                  `🔄 에이전트 ${targetMemberInfo.agentId} 즉시 처리 시작`
                );
              }
            } else {
              console.error(
                `❌ 에이전트 ${targetMemberInfo.agentId} 요청 처리 실패:`,
                response.status
              );
            }
          } catch (error) {
            console.error(
              `❌ 에이전트 ${targetMemberInfo.agentId} 요청 전달 실패:`,
              error
            );
          }
        }

        console.log(
          `✅ ${agentProfile.name} 요청 완료: ${analysis.targetMember}에게 ${analysis.requestType} 요청`
        );

        // 메모리 업데이트를 위한 이벤트 기록
        try {
          await processMemoryUpdate({
            type: "REQUEST_MADE",
            payload: {
              teamId,
              requesterId: agentId,
              targetId: targetMemberInfo?.agentId || "나",
              requestType: analysis.requestType,
              content: message.message,
            },
          });
          console.log(`✅ ${agentProfile.name} 요청 후 메모리 업데이트 완료`);
        } catch (memoryError) {
          console.error(
            `❌ ${agentProfile.name} 요청 후 메모리 업데이트 실패:`,
            memoryError
          );
        }
      } catch (error) {
        console.error(`❌ ${agentProfile.name} 요청 생성 실패:`, error);

        // 실패 시 일반적인 메시지
        await addChatMessage(teamId, {
          sender: agentId,
          type: "system",
          payload: {
            content:
              "팀원에게 요청을 보내려고 했지만 적절한 요청을 생성하지 못했습니다.",
          },
        });
      }
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
        console.log(`🔍 에이전트 ${member.agentId} 상태 조회 시작`);

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

        console.log(`📊 에이전트 ${member.agentId} 현재 상태:`, {
          currentState: agentState.currentState,
          isProcessing: agentState.isProcessing,
          hasCurrentTask: !!agentState.currentTask,
          hasIdleTimer: !!agentState.idleTimer,
          lastStateChange: agentState.lastStateChange,
        });

        // 타이머 업데이트
        agentState = await updateAgentStateTimer(teamId, agentState);

        // 업데이트된 상태 저장 시도
        await setAgentState(teamId, member.agentId, agentState);

        teamAgentStates.push(agentState);
      }
    }

    console.log(`✅ 팀 ${teamId} 에이전트 상태 조회 완료:`, {
      totalAgents: teamAgentStates.length,
      states: teamAgentStates.map((s) => ({
        agentId: s.agentId,
        state: s.currentState,
      })),
    });

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

      if (queuedRequest) {
        // 큐에 대기 중인 요청이 있으면 즉시 처리
        console.log(`📋 에이전트 ${agentId} 큐에서 요청 발견 - 즉시 처리`);
        const requestData = JSON.parse(queuedRequest);

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
      console.log(`⚠️ 에이전트 ${agentId} 평가할 다른 사람의 아이디어가 없음`);
      return;
    }

    // 아이디어 리스트를 적절한 형태로 변환
    const ideaList = otherIdeas.map((idea) => ({
      ideaNumber: idea.id,
      authorName: idea.author,
      object: idea.content.object,
      function: idea.content.function,
    }));

    const agentProfile = await getAgentById(agentId);

    if (!agentProfile) {
      console.log(`⚠️ 에이전트 ${agentId} 프로필을 찾을 수 없음`);
      return;
    }

    // 2단계 평가 프로세스
    // 1단계: 어떤 아이디어를 평가할지 결정
    const agentMemory = await getAgentMemory(agentId);
    const preEvaluation = await preEvaluationAction(
      `${agentProfile.name}이 아이디어를 평가하기로 결정했습니다. 현재 상황에서 가장 적절한 아이디어를 선택하여 평가해주세요.`,
      ideaList,
      agentProfile,
      agentMemory || undefined
    );

    const selectedIdea = otherIdeas.find(
      (idea) => idea.id === preEvaluation.selectedIdea.ideaNumber
    );

    if (!selectedIdea) {
      console.log(`⚠️ ${agentProfile.name} 선택된 아이디어를 찾을 수 없음`);
      return;
    }

    // 2단계: 실제 평가 수행
    const evaluation = await executeEvaluationAction(
      {
        ...preEvaluation.selectedIdea,
        authorName: selectedIdea.author,
      },
      preEvaluation.evaluationStrategy,
      agentProfile,
      agentMemory || undefined
    );

    // 평가 API 호출
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;
    const response = await fetch(
      `${baseUrl}/api/teams/${teamId}/ideas/${selectedIdea.id}/evaluate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-system-internal": "true",
          "User-Agent": "TeamBuilder-Internal",
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
          comment: evaluation.comment || "요청에 따른 평가",
        }),
      }
    );

    if (response.ok) {
      // 성공 시 채팅 알림
      let ideaAuthorName = selectedIdea.author;
      if (selectedIdea.author === "나") {
        ideaAuthorName = "나";
      } else {
        const authorAgent = await getAgentById(selectedIdea.author);
        ideaAuthorName = authorAgent?.name || `에이전트 ${selectedIdea.author}`;
      }

      console.log(
        `📢 에이전트 ${agentId} 자율적 평가 완료 채팅 알림 전송 중...`
      );

      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `${ideaAuthorName}의 아이디어 "${
            selectedIdea.content.object
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

      console.log(`✅ 에이전트 ${agentId} 자율적 평가 완료`);
    } else if (response.status === 400) {
      // 중복 평가 등의 클라이언트 에러 처리
      const errorData = await response.json();
      console.log(`⚠️ 에이전트 ${agentId} 평가 불가: ${errorData.error}`);

      // 아이디어 작성자 이름 가져오기
      let ideaAuthorName = selectedIdea.author;
      if (selectedIdea.author === "나") {
        ideaAuthorName = "나";
      } else {
        const authorAgent = await getAgentById(selectedIdea.author);
        ideaAuthorName = authorAgent?.name || `에이전트 ${selectedIdea.author}`;
      }

      // 중복 평가 메시지 전송 (자율적 평가인 경우)
      if (errorData.error && errorData.error.includes("이미")) {
        await addChatMessage(teamId, {
          sender: agentId,
          type: "system",
          payload: {
            content: `저는 이미 ${ideaAuthorName}의 "${selectedIdea.content.object}" 아이디어에 대해 평가를 완료했습니다.`,
          },
        });
      } else {
        // 기타 400 에러의 경우
        await addChatMessage(teamId, {
          sender: agentId,
          type: "system",
          payload: {
            content: `아이디어 평가를 처리할 수 없습니다: ${errorData.error}`,
          },
        });
      }
    } else {
      console.error(
        `❌ 에이전트 ${agentId} 평가 API 호출 실패:`,
        response.status
      );

      // 기타 서버 에러에 대한 메시지 (자율적 평가인 경우)
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `아이디어 평가를 처리하는 중 오류가 발생했습니다.`,
        },
      });
    }
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
        content: `${requestData.requesterName}의 요청에 따라 새로운 아이디어를 생성했습니다: "${generatedContent.object}"`,
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
