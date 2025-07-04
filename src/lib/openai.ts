import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  generateIdeaPrompt,
  evaluateIdeaPrompt,
  feedbackPrompt,
  requestPrompt,
  preIdeationPrompt,
  newIdeationPrompt,
  updateIdeationPrompt,
  preEvaluationPrompt,
  executeEvaluationPrompt,
  alreadyEvaluatedResponsePrompt,
  createPlanningPrompt,
  preRequestPrompt,
  executeRequestPrompt,
  giveFeedbackOnIdeaPrompt,
  planFeedbackStrategyPrompt,
  generateFeedbackSessionResponsePrompt,
  generateFeedbackSessionSummaryPrompt,
} from "@/core/prompts";
import { AgentMemory } from "@/lib/types";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in the environment variables.");
}

const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.8,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getJsonResponse(prompt: string, agentProfile?: any) {
  const messages = [];

  // 시스템 프롬프트로 AI 에이전트 데모그래픽 정보 추가
  if (agentProfile) {
    console.log("원본 agentProfile:", JSON.stringify(agentProfile, null, 2));

    // 필드명 매핑 (professional -> occupation)
    const occupation =
      agentProfile.occupation || agentProfile.professional || "professional";

    let systemPrompt = `You are an AI agent participating in a team ideation session. Respond only with valid JSON.

## Your Profile:
- Name: ${agentProfile.name || "Agent"}
- Age: ${agentProfile.age || "30"} years old
- Occupation: ${occupation}`;

    if (agentProfile.description) {
      systemPrompt += `\n- Description: ${agentProfile.description}`;
    }

    if (agentProfile.personality) {
      const personalityText = Array.isArray(agentProfile.personality)
        ? agentProfile.personality.join(", ")
        : String(agentProfile.personality);
      systemPrompt += `\n- Personality: ${personalityText}`;
    }

    if (agentProfile.skills) {
      const skillsText = Array.isArray(agentProfile.skills)
        ? agentProfile.skills.join(", ")
        : String(agentProfile.skills);
      systemPrompt += `\n- Skills: ${skillsText}`;
    }

    systemPrompt +=
      "\n\nGenerate responses that reflect your unique background, expertise, and perspective. Always respond in Korean.";

    console.log("최종 시스템 프롬프트:", systemPrompt);
    messages.push(new SystemMessage(systemPrompt));
  }

  console.log("최종 사용자 프롬프트:", prompt);
  messages.push(new HumanMessage(prompt));

  try {
    const response = await llm.invoke(messages);
    const rawResponse = response.content;

    console.log("=== LLM 응답 로그 ===");
    console.log("원본 LLM 응답:", rawResponse);
    console.log("==================");

    if (!rawResponse) {
      throw new Error("OpenAI returned an empty response.");
    }

    // JSON 마크다운 블록 제거
    const cleanedResponse = rawResponse
      .toString()
      .replace(/```json\n?|```/g, "")
      .trim();

    const parsedResponse = JSON.parse(cleanedResponse);
    console.log("파싱된 JSON 응답:", JSON.stringify(parsedResponse, null, 2));
    return parsedResponse;
  } catch (error) {
    console.error("LLM 응답 처리 오류:", error);

    // JSON 파싱 실패 시 에이전트 상태 복구 처리
    if (agentProfile?.id) {
      console.log(
        `🚨 ${agentProfile.name} LLM 응답 파싱 실패 - 에이전트 상태 복구 시작`
      );

      try {
        // 에이전트 상태 복구를 백그라운드에서 처리
        setTimeout(async () => {
          await handleAgentStateRecovery(agentProfile.id, agentProfile.name);
        }, 0);
      } catch (recoveryError) {
        console.error(`❌ 에이전트 상태 복구 실패:`, recoveryError);
      }
    }

    // 오류를 그대로 전달하여 호출한 쪽에서 처리하도록 함
    throw error;
  }
}

// 에이전트 상태 복구 함수
async function handleAgentStateRecovery(agentId: string, agentName: string) {
  try {
    console.log(`🔧 ${agentName} 상태 복구 시작`);

    // 먼저 팀 ID 추출
    const teamId = await extractTeamIdFromContext(agentId);
    if (!teamId) {
      console.log(`⚠️ ${agentName} 팀 ID 추출 실패 - 복구 스킵`);
      return;
    }

    // 에이전트 상태 관련 함수들 임포트
    const { getAgentState, isFeedbackSessionActive } = await import(
      "@/lib/agent-state-utils"
    );

    // 현재 에이전트 상태 확인
    const currentState = await getAgentState(teamId, agentId);

    if (!currentState) {
      console.log(`⚠️ ${agentName} 상태 정보 없음 - 바로 대기 상태로 전환`);
      await transitionToIdleState(teamId, agentId, agentName);
      return;
    }

    // 피드백 세션 중인지 확인
    if (isFeedbackSessionActive(currentState)) {
      console.log(
        `🔄 ${agentName} 피드백 세션 중 - 세션 종료 후 대기 상태로 전환`
      );

      // 피드백 세션 종료 처리
      await terminateActiveFeedbackSessions(teamId, agentId, agentName);
    } else {
      console.log(`🔄 ${agentName} 일반 상태 - 바로 대기 상태로 전환`);
    }

    // 무조건 대기 상태로 전환
    await transitionToIdleState(teamId, agentId, agentName);

    console.log(`✅ ${agentName} 상태 복구 완료`);
  } catch (error) {
    console.error(`❌ ${agentName} 상태 복구 중 오류:`, error);
  }
}

// 팀 ID 추출 (Redis 키나 상태에서)
async function extractTeamIdFromContext(
  agentId: string
): Promise<string | null> {
  try {
    const { redis } = await import("@/lib/redis");

    // Redis에서 agent_state 키 패턴으로 팀 ID 찾기
    // 패턴: agent_state:teamId:agentId
    const stateKeys = await redis.keys(`agent_state:*:${agentId}`);

    if (stateKeys.length > 0) {
      // 첫 번째 키에서 팀 ID 추출
      const keyParts = stateKeys[0].split(":");
      if (keyParts.length >= 3) {
        const teamId = keyParts[1]; // agent_state:{teamId}:agentId
        console.log(`📍 ${agentId} 팀 ID 발견: ${teamId}`);
        return teamId;
      }
    }

    console.log(`⚠️ ${agentId} 팀 ID 추출 실패 - Redis 키 없음`);
    return null;
  } catch (error) {
    console.error(`❌ ${agentId} 팀 ID 추출 오류:`, error);
    return null;
  }
}

// 활성 피드백 세션 종료
async function terminateActiveFeedbackSessions(
  teamId: string,
  agentId: string,
  agentName: string
) {
  try {
    const { redis } = await import("@/lib/redis");

    // 활성 피드백 세션 찾기 - redis.keys() 대신 smembers() 사용
    const activeSessionIds = await redis.smembers(
      `team:${teamId}:active_feedback_sessions`
    );

    for (const sessionId of activeSessionIds) {
      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (sessionData) {
        const session =
          typeof sessionData === "string"
            ? JSON.parse(sessionData)
            : sessionData;

        // 에이전트가 참여 중인 활성 세션인지 확인
        if (
          session.status === "active" &&
          session.participants.some((p: any) => p.id === agentId)
        ) {
          console.log(
            `🛑 ${agentName} 활성 피드백 세션 ${session.id} 종료 처리`
          );

          // 세션 상태를 종료로 변경
          session.status = "ended";
          session.endedAt = new Date().toISOString();
          session.endedBy = "system_recovery";

          await redis.set(
            `feedback_session:${sessionId}`,
            JSON.stringify(session),
            {
              ex: 3600 * 24,
            }
          );

          // 활성 세션 set에서도 제거
          await redis.srem(
            `team:${teamId}:active_feedback_sessions`,
            sessionId
          );

          console.log(`✅ ${agentName} 피드백 세션 ${session.id} 종료 완료`);
        }
      } else {
        // 존재하지 않는 세션은 set에서 제거
        await redis.srem(`team:${teamId}:active_feedback_sessions`, sessionId);
      }
    }
  } catch (error) {
    console.error(`❌ ${agentName} 피드백 세션 종료 실패:`, error);
  }
}

// 대기 상태로 전환
async function transitionToIdleState(
  teamId: string,
  agentId: string,
  agentName: string
) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    const response = await fetch(
      `${baseUrl}/api/teams/${teamId}/agent-states`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TeamBuilder-Internal-Recovery",
        },
        body: JSON.stringify({
          agentId,
          currentState: "idle",
          forceClear: true, // 강제 초기화
        }),
      }
    );

    if (response.ok) {
      console.log(`😴 ${agentName} 대기 상태 전환 완료`);
    } else {
      console.error(`❌ ${agentName} 대기 상태 전환 실패:`, response.status);
    }
  } catch (error) {
    console.error(`❌ ${agentName} 대기 상태 전환 오류:`, error);
  }
}

// --- Action Functions ---

export async function generateIdea({
  agentId,
  topic,
  teamContext,
  trigger = "manual",
  memory,
}: {
  agentId: string;
  topic: string;
  teamContext: any;
  trigger?: string;
  memory?: AgentMemory | null;
}): Promise<{
  success: boolean;
  idea?: any;
  error?: string;
  updatedMemory?: AgentMemory;
}> {
  try {
    console.log(`🎯 에이전트 ${agentId} 아이디어 생성 시작`, {
      topic,
      trigger,
    });

    // 에이전트 프로필 정보 가져오기 (Redis에서)
    let agentProfile = null;
    try {
      const { getAgentById } = await import("@/lib/redis");
      agentProfile = await getAgentById(agentId);
      console.log(
        `📋 에이전트 프로필:`,
        agentProfile?.name,
        agentProfile?.professional
      );
    } catch (error) {
      console.warn(`⚠️ 에이전트 프로필 로딩 실패:`, error);
    }

    // 트리거에 따른 컨텍스트 조정
    let enhancedTopic = topic;
    if (trigger === "initial_startup") {
      enhancedTopic = `${topic}\n\n[Ideation Start] Team '${teamContext.teamName}' is starting ideation on the above topic. Please propose a creative and feasible first idea utilizing your expertise.`;
    }

    // 아이디어 생성 실행
    const ideaResult = await generateIdeaAction(
      enhancedTopic,
      agentProfile,
      [], // 초기에는 기존 아이디어 없음
      memory || undefined,
      teamContext
    );

    console.log(`✅ 에이전트 ${agentId} 아이디어 생성 결과:`, ideaResult);

    // 메모리 업데이트 (아이디어 생성 기록)
    let updatedMemory: AgentMemory | undefined = memory || undefined;
    if (memory) {
      try {
        // 짧은 기간 메모리 업데이트
        const newShortTermMemory = {
          ...memory.shortTerm,
          lastAction: {
            type: "generate_idea",
            timestamp: new Date().toISOString(),
            payload: {
              topic: topic,
              trigger: trigger,
              ideaGenerated: true,
            },
          },
        };

        // 긴 기간 메모리 업데이트 (자기 성찰 추가)
        const newSelfReflection =
          typeof memory.longTerm.self === "string" ? memory.longTerm.self : "";

        const updatedSelf = `${newSelfReflection}\n\n[${new Date().toISOString()}] Generated an idea on the topic '${topic}'. ${
          trigger === "initial_startup"
            ? "Proposed as the first idea for team ideation."
            : ""
        }`;

        updatedMemory = {
          ...memory,
          shortTerm: newShortTermMemory,
          longTerm: {
            ...memory.longTerm,
            self: updatedSelf.trim(),
          },
        };

        console.log(`🧠 에이전트 ${agentId} 메모리 업데이트 완료`);
      } catch (memoryError) {
        console.warn(`⚠️ 메모리 업데이트 실패:`, memoryError);
      }
    }

    return {
      success: true,
      idea: ideaResult,
      updatedMemory,
    };
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 아이디어 생성 실패:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function generateIdeaAction(
  context?: string,
  userProfile?: any,
  existingIdeas?: Array<{
    ideaNumber: number;
    authorName: string;
    object: string;
    function: string;
  }>,
  memory?: AgentMemory,
  team?: any
) {
  // 기존 아이디어가 있으면 프롬프트에 포함
  let enhancedContext = context || "Carbon Emission Reduction";

  // 공유 멘탈 모델 추가
  if (team?.sharedMentalModel) {
    enhancedContext += `\n\n**Team's Shared Mental Model:**\n${team.sharedMentalModel}\n\nBased on the above shared mental model, generate ideas that align with the team's direction and values.`;
  }

  if (existingIdeas && existingIdeas.length > 0) {
    const existingIdeasText = existingIdeas
      .map(
        (idea) =>
          `${idea.ideaNumber}. "${idea.object}" (Author: ${idea.authorName}) - ${idea.function}`
      )
      .join("\n");

    enhancedContext += `\n\nPreviously Generated Ideas:\n${existingIdeasText}\n\nGenerate a new idea with a different perspective that doesn't duplicate the above ideas.`;
  }

  // 메모리 컨텍스트 추가
  if (memory) {
    enhancedContext += `\n\n**Your Memory:**\n`;

    // Self reflection 추가 - 배열/문자열 모두 처리
    if (memory.longTerm.self) {
      let selfReflection = "";
      if (typeof memory.longTerm.self === "string") {
        selfReflection = memory.longTerm.self.trim();
      } else if (
        Array.isArray(memory.longTerm.self) &&
        (memory.longTerm.self as any[]).length > 0
      ) {
        // 배열인 경우 가장 최근 reflection 사용
        const latestReflection = (memory.longTerm.self as any[])[
          (memory.longTerm.self as any[]).length - 1
        ];
        selfReflection =
          typeof latestReflection === "string"
            ? latestReflection
            : (latestReflection as any).reflection || "";
      }
      if (selfReflection) {
        enhancedContext += `- Self-reflection: ${selfReflection}\n`;
      }
    }

    // 최근 행동 추가
    if (memory.shortTerm.lastAction) {
      enhancedContext += `- Recent action: ${memory.shortTerm.lastAction.type} (${memory.shortTerm.lastAction.timestamp})\n`;
    }

    // 주요 관계 정보 추가 (최대 3개)
    const relationEntries = Object.entries(memory.longTerm.relations).slice(
      0,
      3
    );
    if (relationEntries.length > 0) {
      enhancedContext += `- Team relationships:\n`;
      relationEntries.forEach(([_, relation]) => {
        enhancedContext += `  * ${relation.agentInfo.name}: ${relation.myOpinion}\n`;
      });
    }

    enhancedContext += `\nBased on the above memory, generate ideas that reflect your personality and experience.`;
  }

  const prompt = generateIdeaPrompt(enhancedContext, userProfile, memory, team?.sharedMentalModel);
  return getJsonResponse(prompt, userProfile);
}

export async function evaluateIdeaAction(
  idea: any,
  context?: string,
  team?: { sharedMentalModel?: string },
  agentProfile?: any,
  memory?: any
) {
  const prompt = evaluateIdeaPrompt(idea, context, agentProfile, memory, team?.sharedMentalModel);
  return getJsonResponse(prompt, agentProfile);
}

export async function feedbackAction(
  target: string, 
  context: string, 
  agentProfile?: any, 
  memory?: any, 
  sharedMentalModel?: string
) {
  const prompt = feedbackPrompt(target, context, agentProfile, memory, sharedMentalModel);
  return getJsonResponse(prompt, agentProfile);
}

// Specific idea feedback function
export async function giveFeedbackOnIdea(
  targetIdea: any,
  userProfile: any,
  teamContext: any,
  memory?: AgentMemory
) {
  const ideaAuthor =
    targetIdea.author === "나"
      ? "나"
      : (() => {
          const member = teamContext.teamMembers.find(
            (m: any) => m.agentId === targetIdea.author
          );
          return member?.name || targetIdea.author;
        })();

  const { agentContext, mainPrompt } = giveFeedbackOnIdeaPrompt(
    targetIdea,
    ideaAuthor,
    teamContext,
    userProfile,
    memory,
    teamContext.sharedMentalModel
  );

  const messages = [];
  
  // Add agent context as system message
  messages.push(new SystemMessage(`${agentContext}\n\nRespond only with valid JSON.`));
  
  // Add main prompt as user message
  messages.push(new HumanMessage(mainPrompt));

  try {
    const response = await llm.invoke(messages);
    const rawResponse = response.content;

    if (!rawResponse) {
      throw new Error("OpenAI returned an empty response.");
    }

    // JSON 마크다운 블록 제거
    const cleanedResponse = rawResponse
      .toString()
      .replace(/```json\n?|```/g, "")
      .trim();

    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error("Feedback generation error:", error);
    return {
      feedback: "피드백 생성 중 오류가 발생했습니다."
    };
  }
}

export async function requestAction(
  target: string, 
  context: string, 
  agentProfile?: any, 
  memory?: any, 
  sharedMentalModel?: string
) {
  const prompt = requestPrompt(target, context, agentProfile, memory, sharedMentalModel);
  return getJsonResponse(prompt, agentProfile);
}

// --- Planning Function ---

export async function planNextAction(
  userProfile: any,
  teamContext: {
    teamName: string;
    topic: string;
    currentIdeasCount: number;
    recentMessages: any[];
    teamMembers: string[];
    existingIdeas: Array<{
      ideaNumber: number;
      authorName: string;
      object: string;
      function: string;
    }>;
    sharedMentalModel?: string; // 공유 멘탈 모델 추가
  },
  memory?: any
): Promise<{
  action:
    | "generate_idea"
    | "evaluate_idea"
    | "give_feedback"
    | "make_request"
    | "wait";
  reasoning: string;
  target?: string;
}> {
  // 역할 확인 헬퍼 함수
  const agentRoles = userProfile.roles || [];
  const hasRole = (roleName: string) => {
    if (!agentRoles) return false;
    if (Array.isArray(agentRoles)) {
      return agentRoles.includes(roleName);
    }
    if (typeof agentRoles === "string") {
      return agentRoles.includes(roleName);
    }
    return false;
  };

  try {
    // 더 많은 메시지 컨텍스트를 위해 최근 15개 메시지 전달
    const extendedTeamContext = {
      ...teamContext,
      recentMessages: teamContext.recentMessages.slice(-15), // 더 많은 히스토리 제공
    };

    const { agentContext, mainPrompt } = createPlanningPrompt(userProfile, extendedTeamContext, memory);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI agent deciding your next action in a team ideation session. Consider the team's action balance and choose actions that help maintain equilibrium while staying within your assigned roles. Respond only with valid JSON.

${agentContext}`,
        },
        {
          role: "user",
          content: mainPrompt,
        },
      ],
      temperature: 0.8, // 약간의 창의성 허용
      max_tokens: 300, // 더 상세한 추론을 위해 토큰 증가
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      throw new Error("No response from OpenAI");
    }

    // JSON 파싱
    const cleanedResponse = response.replace(/```json\n?|```/g, "").trim();

    const planResult = JSON.parse(cleanedResponse);

    // 유효성 검사
    const validActions = [
      "generate_idea",
      "evaluate_idea",
      "give_feedback",
      "make_request",
      "wait",
    ];
    if (!validActions.includes(planResult.action)) {
      throw new Error(`Invalid action: ${planResult.action}`);
    }

    // 에이전트가 수행할 수 없는 행동인지 확인
    if (
      planResult.action === "generate_idea" &&
      !hasRole("아이디어 생성하기")
    ) {
      console.log(
        `⚠️ ${userProfile.name}은 아이디어 생성 역할이 없어서 대기로 변경`
      );
      console.log(`🔍 ${userProfile.name}의 실제 역할:`, agentRoles);
      console.log(`🔍 확인하려는 역할: "아이디어 생성하기"`);
      return {
        action: "wait",
        reasoning: `아이디어 생성 역할이 없어서 대기합니다. (원래 계획: ${planResult.reasoning})`,
      };
    }

    if (
      planResult.action === "evaluate_idea" &&
      !hasRole("아이디어 평가하기")
    ) {
      console.log(
        `⚠️ ${userProfile.name}은 아이디어 평가 역할이 없어서 대기로 변경`
      );
      console.log(`🔍 ${userProfile.name}의 실제 역할:`, agentRoles);
      console.log(`🔍 확인하려는 역할: "아이디어 평가하기"`);
      return {
        action: "wait",
        reasoning: `아이디어 평가 역할이 없어서 대기합니다. (원래 계획: ${planResult.reasoning})`,
      };
    }

    if (planResult.action === "give_feedback" && !hasRole("피드백하기")) {
      console.log(`⚠️ ${userProfile.name}은 피드백 역할이 없어서 대기로 변경`);
      console.log(`🔍 ${userProfile.name}의 실제 역할:`, agentRoles);
      console.log(`🔍 확인하려는 역할: "피드백하기"`);
      return {
        action: "wait",
        reasoning: `피드백 역할이 없어서 대기합니다. (원래 계획: ${planResult.reasoning})`,
      };
    }

    if (planResult.action === "make_request" && !hasRole("요청하기")) {
      console.log(`⚠️ ${userProfile.name}은 요청 역할이 없어서 대기로 변경`);
      console.log(`🔍 ${userProfile.name}의 실제 역할:`, agentRoles);
      console.log(`🔍 확인하려는 역할: "요청하기"`);
      return {
        action: "wait",
        reasoning: `요청 역할이 없어서 대기합니다. (원래 계획: ${planResult.reasoning})`,
      };
    }

    console.log(
      `🧠 ${userProfile.name} 계획 결과 (팀 밸런스 고려, 역할 확인 완료):`,
      planResult
    );

    return {
      action: planResult.action,
      reasoning: planResult.reasoning || "No reasoning provided",
      target: planResult.target,
    };
  } catch (error) {
    console.error("Planning 실패:", error);

    // 실패 시 기본 행동 (역할에 따라 랜덤하게 선택하여 다양성 확보)
    const availableActions = [];
    if (hasRole("아이디어 생성하기")) {
      availableActions.push("generate_idea");
    }
    if (hasRole("아이디어 평가하기") && teamContext.currentIdeasCount > 0) {
      availableActions.push("evaluate_idea");
    }
    if (hasRole("피드백하기")) {
      availableActions.push("give_feedback");
    }
    if (hasRole("요청하기")) {
      availableActions.push("make_request");
    }

    if (availableActions.length > 0) {
      // 랜덤하게 선택하여 다양성 확보
      const randomAction =
        availableActions[Math.floor(Math.random() * availableActions.length)];
      return {
        action: randomAction as any,
        reasoning: `Default random action due to planning error - ${randomAction} based on available roles`,
      };
    } else {
      return {
        action: "wait",
        reasoning: "Default action due to planning error - no available roles",
      };
    }
  }
}

// --- New 2-Stage Ideation Action Functions ---

export async function preIdeationAction(
  requestMessage: string,
  ideaList: {
    ideaNumber: number;
    authorName: string;
    object: string;
    function: string;
  }[],
  userProfile?: any,
  memory?: AgentMemory,
  sharedMentalModel?: string
) {
  const prompt = preIdeationPrompt(requestMessage, ideaList, memory, userProfile, sharedMentalModel);
  return getJsonResponse(prompt, userProfile);
}

export async function executeIdeationAction(
  decision: "New" | "Update",
  ideationStrategy: string,
  topic: string,
  referenceIdea?: any,
  userProfile?: any,
  memory?: AgentMemory,
  sharedMentalModel?: string
) {
  let prompt;
  if (decision === "New") {
    prompt = newIdeationPrompt(ideationStrategy, topic, memory, userProfile, sharedMentalModel);
  } else {
    if (!referenceIdea) {
      throw new Error("Reference idea is required for 'Update' decision.");
    }
    prompt = updateIdeationPrompt(
      referenceIdea,
      ideationStrategy,
      topic,
      memory,
      userProfile,
      sharedMentalModel
    );
  }
  return getJsonResponse(prompt, userProfile);
}

// --- New 2-Stage Evaluation Action Functions ---

export async function preEvaluationAction(
  requestMessage: string,
  ideaList: {
    ideaNumber: number;
    authorName: string;
    object: string;
    function: string;
  }[],
  userProfile?: any,
  memory?: AgentMemory,
  sharedMentalModel?: string
) {
  const prompt = preEvaluationPrompt(requestMessage, ideaList, memory, userProfile, sharedMentalModel);
  return getJsonResponse(prompt, userProfile);
}

export async function executeEvaluationAction(
  selectedIdea: any,
  evaluationStrategy: string,
  userProfile?: any,
  memory?: AgentMemory,
  sharedMentalModel?: string
) {
  const prompt = executeEvaluationPrompt(
    selectedIdea,
    evaluationStrategy,
    memory,
    userProfile,
    sharedMentalModel
  );
  return getJsonResponse(prompt, userProfile);
}

// --- Function for generating responses when already evaluated ---

export async function generateAlreadyEvaluatedResponse(
  requesterName: string,
  selectedIdea: any,
  previousEvaluation: any,
  relationshipType: string | null,
  userProfile?: any
) {
  const prompt = alreadyEvaluatedResponsePrompt(
    requesterName,
    selectedIdea,
    previousEvaluation,
    relationshipType,
    userProfile
  );
  return getJsonResponse(prompt, userProfile);
}

// Alias for consistency
export const alreadyEvaluatedResponseAction = generateAlreadyEvaluatedResponse;

// New request-related functions

export async function preRequestAction(
  triggerContext: string,
  teamMembers: Array<{
    name: string;
    roles: string[];
    isUser: boolean;
    agentId?: string;
    userInfo?: {
      // 인간 팀원인 경우 추가 정보
      age?: number;
      gender?: string;
      professional?: string;
      skills?: string;
      personality?: string;
      value?: string;
    };
  }>,
  currentIdeas: Array<{
    ideaNumber: number;
    authorName: string;
    object: string;
    function: string;
  }>,
  userProfile?: any,
  memory?: AgentMemory,
  sharedMentalModel?: string // 공유 멘탈 모델 추가
) {
  const prompt = preRequestPrompt(
    triggerContext,
    teamMembers,
    currentIdeas,
    memory,
    userProfile,
    sharedMentalModel
  );
  return getJsonResponse(prompt, userProfile);
}

export async function executeRequestAction(
  targetMember: string,
  requestType: string,
  requestStrategy: string,
  contextToProvide: string,
  targetMemberRoles: string[],
  relationshipType?: string,
  userProfile?: any,
  memory?: AgentMemory,
  originalRequest?: string,
  originalRequester?: string,
  targetMemberInfo?: {
    isUser: boolean;
    age?: number;
    gender?: string;
    professional?: string;
    skills?: string;
    personality?: string;
    value?: string;
  },
  sharedMentalModel?: string // 공유 멘탈 모델 추가
) {
  const prompt = executeRequestPrompt(
    targetMember,
    requestType,
    requestStrategy,
    contextToProvide,
    targetMemberRoles,
    relationshipType,
    memory,
    originalRequest,
    originalRequester,
    targetMemberInfo,
    userProfile,
    sharedMentalModel
  );
  return getJsonResponse(prompt, userProfile);
}

// Unified request function for both users and AI agents
export async function makeRequestAction(
  triggerContext: string,
  teamMembers: Array<{
    name: string;
    roles: string[];
    isUser: boolean;
    agentId?: string;
    userInfo?: {
      // 인간 팀원인 경우 추가 정보
      age?: number;
      gender?: string;
      professional?: string;
      skills?: string;
      personality?: string;
      value?: string;
    };
  }>,
  currentIdeas: Array<{
    ideaNumber: number;
    authorName: string;
    object: string;
    function: string;
  }>,
  userProfile?: any,
  memory?: AgentMemory,
  originalRequest?: string,
  originalRequester?: string,
  sharedMentalModel?: string // 공유 멘탈 모델 추가
) {
  // Step 1: Analyze request
  const requestAnalysis = await preRequestAction(
    triggerContext,
    teamMembers,
    currentIdeas,
    userProfile,
    memory,
    sharedMentalModel
  );

  // Step 2: Execute request
  const targetMemberInfo = teamMembers.find(
    (member) => member.name === requestAnalysis.targetMember
  );

  if (!targetMemberInfo) {
    throw new Error(`Target member ${requestAnalysis.targetMember} not found`);
  }

  const requestMessage = await executeRequestAction(
    requestAnalysis.targetMember,
    requestAnalysis.requestType,
    requestAnalysis.requestStrategy,
    requestAnalysis.contextToProvide,
    targetMemberInfo.roles,
    undefined, // No relationship info for users
    userProfile,
    memory,
    originalRequest,
    originalRequester,
    targetMemberInfo.isUser
      ? {
          isUser: true,
          age: targetMemberInfo.userInfo?.age,
          gender: targetMemberInfo.userInfo?.gender,
          professional: targetMemberInfo.userInfo?.professional,
          skills: targetMemberInfo.userInfo?.skills,
          personality: targetMemberInfo.userInfo?.personality,
          value: targetMemberInfo.userInfo?.value,
        }
      : {
          isUser: false,
        },
    sharedMentalModel
  );

  return {
    analysis: requestAnalysis,
    message: requestMessage,
  };
}


// AI-AI 피드백 세션 대화 생성
export async function generateFeedbackSessionResponse(
  agent: any,
  sessionContext: {
    sessionId: string;
    otherParticipant: { id: string; name: string; isUser: boolean };
    messageHistory: any[];
    feedbackContext?: {
      category: string;
      description?: string;
      type?: string;
      aiStrategy?: {
        reasoning: string;
        plannedMessage: string;
      };
    };
    teamIdeas?: any[];
    sharedMentalModel?: string; // 공유 멘탈 모델 추가
  },
  agentMemory?: any
): Promise<{
  response: string;
  shouldEnd: boolean;
  reasoning: string;
}> {
  try {
    const {
      otherParticipant,
      messageHistory,
      feedbackContext,
      teamIdeas,
      sharedMentalModel,
    } = sessionContext;

    // 현재 메시지 수 확인 (system 메시지 제외하고 실제 대화 메시지만)
    const actualMessageCount = messageHistory.filter(
      (msg) => msg.type === "message"
    ).length;

    // 첫 번째 메시지이고 계획된 메시지가 있는 경우 사용
    if (
      actualMessageCount === 0 &&
      feedbackContext?.aiStrategy?.plannedMessage
    ) {
      console.log(
        `🎯 첫 피드백 메시지에 계획된 메시지 사용: ${feedbackContext.aiStrategy.plannedMessage.substring(
          0,
          50
        )}...`
      );

      return {
        response: feedbackContext.aiStrategy.plannedMessage,
        shouldEnd: false, // 첫 메시지는 항상 계속
        reasoning: "계획된 첫 메시지 사용",
      };
    }

    // 최소 대화 횟수 미만이면 강제로 계속 진행
    const minMessages = 4; // 최소 4개 메시지 (사용자 1회 + AI 1회 + 사용자 1회 + AI 1회)
    const shouldForceContinue = actualMessageCount < minMessages;

    // Memory context will be handled by the prompt function

    // 팀 아이디어 컨텍스트 생성 (참고용, 특정 아이디어를 타겟하지 않음)
    const teamIdeasContext =
      teamIdeas && teamIdeas.length > 0
        ? `\n## Team Ideas Status\nCurrently, ${teamIdeas.length} ideas have been proposed by the team. Various approaches and creative solutions are being discussed.\n`
        : "";

    // 공유 멘탈 모델 컨텍스트 생성
    const sharedMentalModelContext = sharedMentalModel
      ? `\n## Team's Shared Mental Model\n${sharedMentalModel}\nBased on the above shared mental model, provide feedback that aligns with the team's direction and values.\n`
      : "";

    // 피드백 가이드라인 생성
    const feedbackGuideline = feedbackContext
      ? `\n## Feedback Topic\n${
          feedbackContext.category || feedbackContext.type
        }: ${
          feedbackContext.description || "General feedback on collaboration and teamwork"
        }\n`
      : `\n## Feedback Topic\nConstructive feedback on general collaboration, teamwork, and idea development processes\n`;

    // 대화 히스토리 포맷팅
    const conversationHistory =
      messageHistory.length > 0
        ? `\n## Conversation History\n${messageHistory
            .filter((msg) => msg.type === "message")
            .map(
              (msg) =>
                `${msg.sender === agent.id ? "나" : otherParticipant.name}: ${
                  msg.content
                }`
            )
            .join("\n")}\n`
        : "\n## Conversation History\nNo conversation has started yet.\n";

    // 종료 조건 가이드라인 생성
    const endingGuideline = shouldForceContinue
      ? `\n## Important: Continue Conversation Required\nCurrently only ${actualMessageCount} messages have been exchanged. Feedback sessions can only end after at least ${minMessages} messages have been exchanged. You must continue the conversation. (shouldEnd: false required)\n`
      : `\n## Conversation End Decision\n${actualMessageCount} messages have been exchanged so far. You can naturally conclude if you believe sufficient feedback has been shared.\n`;

    // Get prompt components from prompts.ts
    const { agentContext, mainPrompt } = generateFeedbackSessionResponsePrompt(
      agent,
      otherParticipant,
      feedbackGuideline,
      conversationHistory,
      teamIdeasContext,
      sharedMentalModelContext,
      endingGuideline,
      agentMemory
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI agent participating in a feedback session. Provide natural, conversational feedback in Korean while following the guidelines. Respond only with valid JSON.

${agentContext}`,
        },
        {
          role: "user",
          content: mainPrompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 1000,
    });

    const result = completion.choices[0]?.message?.content;
    if (!result) {
      throw new Error("OpenAI 응답이 비어있습니다");
    }

    // ```json으로 감싸진 응답 처리
    let jsonString = result.trim();
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonString);

    // 강제로 계속 진행해야 하는 경우 shouldEnd를 false로 override
    const finalShouldEnd = shouldForceContinue
      ? false
      : parsed.shouldEnd || false;

    return {
      response: parsed.response || "피드백을 공유하고 싶습니다.",
      shouldEnd: finalShouldEnd,
      reasoning: shouldForceContinue
        ? `대화 지속 필요 (현재 ${actualMessageCount}개 메시지, 최소 ${minMessages}개 필요)`
        : parsed.reasoning || "계속 대화하기로 결정",
    };
  } catch (error) {
    console.error("AI 피드백 세션 응답 생성 실패:", error);

    // 현재 메시지 수를 기반으로 기본값 결정
    const actualMessageCount = sessionContext.messageHistory.filter(
      (msg) => msg.type === "message"
    ).length;
    const shouldEndDefault = actualMessageCount >= 6; // 6개 이상이면 종료

    // 기본값 반환
    return {
      response: "좋은 의견 감사합니다. 더 자세히 이야기해보면 좋을 것 같아요.",
      shouldEnd: shouldEndDefault,
      reasoning: `안전한 기본 응답 (메시지 수: ${actualMessageCount})`,
    };
  }
}

// 피드백 세션 요약 생성
export async function generateFeedbackSessionSummary(
  messages: any[],
  participants: any[]
): Promise<{
  summary: string;
  keyInsights: string[];
  participantContributions: { [participantId: string]: string };
}> {
  try {
    // Get prompt components from prompts.ts
    const { agentContext, mainPrompt } = generateFeedbackSessionSummaryPrompt(
      messages,
      participants
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: agentContext,
        },
        {
          role: "user",
          content: mainPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const result = completion.choices[0]?.message?.content;
    if (!result) {
      throw new Error("OpenAI 응답이 비어있습니다");
    }

    // ```json으로 감싸진 응답 처리
    let jsonString = result.trim();
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonString);

    return {
      summary: parsed.summary || "피드백 세션이 완료되었습니다.",
      keyInsights: parsed.keyInsights || [],
      participantContributions: parsed.participantContributions || {},
    };
  } catch (error) {
    console.error("피드백 세션 요약 생성 실패:", error);

    // 기본값 반환
    return {
      summary: `${participants
        .map((p) => p.name)
        .join("과 ")} 간의 건설적인 피드백 세션이 완료되었습니다.`,
      keyInsights: [
        "유용한 피드백이 공유되었습니다",
        "아이디어 개선 방향이 논의되었습니다",
      ],
      participantContributions: participants.reduce((acc, p) => {
        acc[p.id] = `${p.name}이 적극적으로 참여했습니다`;
        return acc;
      }, {} as { [key: string]: string }),
    };
  }
}

// 피드백 전략 결정 함수 - AI가 모든 정보를 고려해서 피드백 대상과 방식을 결정
export async function planFeedbackStrategy(
  agentProfile: any,
  teamContext: {
    teamName: string;
    topic: string;
    teamMembers: Array<{
      id: string;
      name: string;
      isUser: boolean;
      roles: string[];
      isAvailable: boolean; // 피드백 세션 중이지 않은지
    }>;
    existingIdeas: Array<{
      ideaNumber: number;
      authorId: string;
      authorName: string;
      object: string;
      function: string;
      behavior: string;
      structure: string;
      timestamp: string;
      evaluations: any[];
    }>;
    recentMessages: any[];
    sharedMentalModel?: string; // 공유 멘탈 모델 추가
  },
  requestContext: {
    requesterName: string;
    originalMessage: string;
  },
  memory?: AgentMemory
): Promise<{
  targetMember: {
    id: string;
    name: string;
    isUser: boolean;
  };
  feedbackType:
    | "general_collaboration"
    | "specific_idea"
    | "skill_development"
    | "team_dynamics";
  targetIdea?: {
    ideaNumber: number;
    authorId: string;
    object: string;
  };
  feedbackMessage: string;
  reasoning: string;
}> {

  // 팀 멤버 정보 포맷팅
  const teamMembersInfo = teamContext.teamMembers
    .filter((member) => member.id !== agentProfile.id) // 본인 제외
    .map(
      (member) =>
        `- ${member.name}${
          member.isUser ? " (인간 팀원)" : " (AI 팀원)"
        }: 역할 [${member.roles.join(", ")}], ${
          member.isAvailable ? "사용 가능" : "현재 바쁨"
        }`
    )
    .join("\n");

  // 아이디어 정보 포맷팅
  const ideasInfo =
    teamContext.existingIdeas.length > 0
      ? teamContext.existingIdeas
          .map(
            (idea) =>
              `${idea.ideaNumber}. "${idea.object}" by ${idea.authorName}
   - 기능: ${idea.function}
   - 작성자: ${idea.authorName}
   - 평가 수: ${idea.evaluations?.length || 0}개`
          )
          .join("\n")
      : "No ideas have been generated yet.";

  // 최근 메시지 포맷팅
  const recentActivity =
    teamContext.recentMessages.length > 0
      ? teamContext.recentMessages
          .slice(-5)
          .map(
            (msg) =>
              `- ${msg.sender}: ${
                typeof msg.payload === "object"
                  ? msg.payload.content
                  : msg.payload
              }`
          )
          .join("\n")
      : "No recent team activity.";

  const { agentContext, mainPrompt } = planFeedbackStrategyPrompt(
    agentProfile,
    teamContext,
    requestContext,
    teamMembersInfo,
    ideasInfo,
    recentActivity,
    memory,
    teamContext.sharedMentalModel
  );

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `${agentContext}\n\nRespond only with valid JSON.`,
      },
      {
        role: "user",
        content: mainPrompt,
      },
    ],
  });

  const rawResponse = completion.choices[0]?.message?.content;
  if (!rawResponse) {
    throw new Error("OpenAI returned an empty response.");
  }

  // JSON 마크다운 블록 제거
  const cleanedResponse = rawResponse
    .replace(/```json\n?|```/g, "")
    .trim();

  try {
    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error("Failed to parse feedback strategy response:", error);
    throw new Error("Invalid JSON response from OpenAI");
  }
}
