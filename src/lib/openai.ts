import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  generateIdeaPrompt,
  evaluateIdeaPrompt,
  feedbackPrompt,
  requestPrompt,
  planNextActionPrompt,
  preIdeationPrompt,
  newIdeationPrompt,
  updateIdeationPrompt,
  preEvaluationPrompt,
  executeEvaluationPrompt,
  alreadyEvaluatedResponsePrompt,
  createPlanningPrompt,
  preRequestPrompt,
  executeRequestPrompt,
} from "@/core/prompts";
import { AgentMemory } from "@/lib/types";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in the environment variables.");
}

const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.5,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getJsonResponse(prompt: string, agentProfile?: any) {
  const messages = [];

  // 시스템 프롬프트로 AI 에이전트 데모그래픽 정보 추가
  if (agentProfile) {
    console.log("원본 agentProfile:", JSON.stringify(agentProfile, null, 2));

    // 필드명 매핑 (professional -> occupation)
    const occupation =
      agentProfile.occupation || agentProfile.professional || "professional";

    let systemPrompt = `You are ${agentProfile.name || "Agent"}, a ${
      agentProfile.age || "30"
    }-year-old ${occupation}.`;

    if (agentProfile.description) {
      systemPrompt += ` ${agentProfile.description}`;
    }

    if (agentProfile.personality) {
      const personalityText = Array.isArray(agentProfile.personality)
        ? agentProfile.personality.join(", ")
        : String(agentProfile.personality);
      systemPrompt += ` Your personality: ${personalityText}.`;
    }

    if (agentProfile.skills) {
      const skillsText = Array.isArray(agentProfile.skills)
        ? agentProfile.skills.join(", ")
        : String(agentProfile.skills);
      systemPrompt += ` Your skills: ${skillsText}.`;
    }

    systemPrompt +=
      " Generate ideas that reflect your unique background, expertise, and perspective. Always respond in Korean.";

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
    // 오류를 그대로 전달하여 호출한 쪽에서 처리하도록 함
    throw error;
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
      enhancedTopic = `${topic}\n\n[아이디에이션 시작] 팀 '${teamContext.teamName}'에서 위 주제로 아이디에이션을 시작합니다. 당신의 전문성을 활용해 창의적이고 실현 가능한 첫 번째 아이디어를 제안해주세요.`;
    }

    // 아이디어 생성 실행
    const ideaResult = await generateIdeaAction(
      enhancedTopic,
      agentProfile,
      [], // 초기에는 기존 아이디어 없음
      memory || undefined
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

        const updatedSelf = `${newSelfReflection}\n\n[${new Date().toISOString()}] 주제 '${topic}'에 대한 아이디어를 생성했습니다. ${
          trigger === "initial_startup"
            ? "팀 아이디에이션의 첫 번째 아이디어로 제안했습니다."
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
  memory?: AgentMemory
) {
  // 기존 아이디어가 있으면 프롬프트에 포함
  let enhancedContext = context || "Carbon Emission Reduction";

  if (existingIdeas && existingIdeas.length > 0) {
    const existingIdeasText = existingIdeas
      .map(
        (idea) =>
          `${idea.ideaNumber}. "${idea.object}" (작성자: ${idea.authorName}) - ${idea.function}`
      )
      .join("\n");

    enhancedContext += `\n\n기존에 생성된 아이디어들:\n${existingIdeasText}\n\n위 아이디어들과 중복되지 않는 새로운 관점의 아이디어를 생성하세요.`;
  }

  // 메모리 컨텍스트 추가
  if (memory) {
    enhancedContext += `\n\n**당신의 메모리:**\n`;

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
        enhancedContext += `- 자기 성찰: ${selfReflection}\n`;
      }
    }

    // 최근 행동 추가
    if (memory.shortTerm.lastAction) {
      enhancedContext += `- 최근 행동: ${memory.shortTerm.lastAction.type} (${memory.shortTerm.lastAction.timestamp})\n`;
    }

    // 주요 관계 정보 추가 (최대 3개)
    const relationEntries = Object.entries(memory.longTerm.relations).slice(
      0,
      3
    );
    if (relationEntries.length > 0) {
      enhancedContext += `- 팀원들과의 관계:\n`;
      relationEntries.forEach(([agentId, relation]) => {
        enhancedContext += `  * ${relation.agentInfo.name}: ${relation.myOpinion}\n`;
      });
    }

    enhancedContext += `\n위 메모리를 바탕으로 당신의 성격과 경험을 반영한 아이디어를 생성하세요.`;
  }

  const prompt = generateIdeaPrompt(enhancedContext, userProfile, memory);
  return getJsonResponse(prompt, userProfile);
}

export async function evaluateIdeaAction(idea: any, context?: string) {
  const prompt = evaluateIdeaPrompt(idea, context);
  return getJsonResponse(prompt);
}

export async function feedbackAction(target: string, context: string) {
  const prompt = feedbackPrompt(target, context);
  return getJsonResponse(prompt);
}

// 새로운 구체적인 피드백 함수
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

  const prompt = `당신은 ${
    userProfile.name
  }입니다. 팀 아이디어 세션에서 다음 아이디어에 대해 구어체로 자연스러운 피드백을 주세요.

평가할 아이디어:
- 제목: ${targetIdea.content.object}
- 기능: ${targetIdea.content.function}
- 작성자: ${ideaAuthor}

주제: ${teamContext.topic}

${
  memory
    ? `
**당신의 메모리:**
${(() => {
  // self가 배열인 경우 문자열로 변환
  let selfReflection = "";
  if (memory.longTerm.self) {
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
  }
  return selfReflection ? `- 자기 성찰: ${selfReflection}` : "";
})()}
${(() => {
  const authorKey = targetIdea.author === "나" ? "나" : targetIdea.author;
  if (memory.longTerm.relations[authorKey]) {
    const relation = memory.longTerm.relations[authorKey];
    const recentInteractions = relation.interactionHistory.slice(-2);
    return `- ${ideaAuthor}와의 관계: ${relation.myOpinion}${
      recentInteractions.length > 0
        ? `\n- 최근 상호작용: ${recentInteractions
            .map((i) => i.content)
            .join(", ")}`
        : ""
    }`;
  }
  return "";
})()}

위 메모리를 바탕으로 당신의 성격과 관계를 반영한 피드백을 주세요.
`
    : ""
}
피드백 가이드라인:
1. 구어체로 자연스럽게 작성 (예: "이 아이디어 정말 좋네요!", "~하면 어떨까요?")
2. 구체적인 개선점이나 확장 아이디어 제시
3. 긍정적이면서도 건설적인 톤 유지
4. 작성자를 직접 언급하며 대화하듯 작성
5. 200자 내외로 간결하게

다음 JSON 형식으로 응답하세요:
{
  "feedback": "구어체로 작성된 자연스러운 피드백 내용"
}`;

  return getJsonResponse(prompt, userProfile);
}

export async function requestAction(target: string, context: string) {
  const prompt = requestPrompt(target, context);
  return getJsonResponse(prompt);
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
  }
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
    const prompt = createPlanningPrompt(userProfile, teamContext);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8, // 약간의 창의성 허용
      max_tokens: 200,
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
      `🧠 ${userProfile.name} 계획 결과 (역할 확인 완료):`,
      planResult
    );

    return {
      action: planResult.action,
      reasoning: planResult.reasoning || "No reasoning provided",
      target: planResult.target,
    };
  } catch (error) {
    console.error("Planning 실패:", error);

    // 실패 시 기본 행동 (역할에 따라)
    if (hasRole("아이디어 생성하기")) {
      return {
        action: "generate_idea",
        reasoning:
          "Default action due to planning error - generating idea based on role",
      };
    } else if (
      hasRole("아이디어 평가하기") &&
      teamContext.currentIdeasCount > 0
    ) {
      return {
        action: "evaluate_idea",
        reasoning:
          "Default action due to planning error - evaluating ideas based on role",
      };
    } else if (hasRole("요청하기")) {
      return {
        action: "make_request",
        reasoning:
          "Default action due to planning error - making request based on role",
      };
    } else {
      return {
        action: "wait",
        reasoning: "Default action due to planning error - waiting",
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
  memory?: AgentMemory
) {
  const prompt = preIdeationPrompt(requestMessage, ideaList, memory);
  return getJsonResponse(prompt, userProfile);
}

export async function executeIdeationAction(
  decision: "New" | "Update",
  ideationStrategy: string,
  topic: string,
  referenceIdea?: any,
  userProfile?: any,
  memory?: AgentMemory
) {
  let prompt;
  if (decision === "New") {
    prompt = newIdeationPrompt(ideationStrategy, topic, memory);
  } else {
    if (!referenceIdea) {
      throw new Error("Reference idea is required for 'Update' decision.");
    }
    prompt = updateIdeationPrompt(
      referenceIdea,
      ideationStrategy,
      topic,
      memory
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
  memory?: AgentMemory
) {
  const prompt = preEvaluationPrompt(requestMessage, ideaList, memory);
  return getJsonResponse(prompt, userProfile);
}

export async function executeEvaluationAction(
  selectedIdea: any,
  evaluationStrategy: string,
  userProfile?: any,
  memory?: AgentMemory
) {
  const prompt = executeEvaluationPrompt(
    selectedIdea,
    evaluationStrategy,
    memory
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
  memory?: AgentMemory
) {
  const prompt = preRequestPrompt(
    triggerContext,
    teamMembers,
    currentIdeas,
    memory
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
  }
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
    targetMemberInfo
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
  originalRequester?: string
) {
  // Step 1: Analyze request
  const requestAnalysis = await preRequestAction(
    triggerContext,
    teamMembers,
    currentIdeas,
    userProfile,
    memory
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
        }
  );

  return {
    analysis: requestAnalysis,
    message: requestMessage,
  };
}

// 메모리를 프롬프트용으로 포맷팅하는 헬퍼 함수
function formatMemoryForPrompt(memory: any): string {
  if (!memory) return "";

  // 새로운 메모리 구조인지 확인
  if (
    memory.longTerm?.knowledge &&
    memory.longTerm?.actionPlan &&
    memory.longTerm?.relation
  ) {
    return formatNewMemoryForPrompt(memory);
  }

  // 기존 메모리 구조 처리
  let formatted = "";

  if (memory.longTerm?.self) {
    formatted += `### 개인적 성찰\n${memory.longTerm.self}\n\n`;
  }

  if (
    memory.longTerm?.relations &&
    Object.keys(memory.longTerm.relations).length > 0
  ) {
    formatted += `### 팀원들과의 관계\n`;
    Object.entries(memory.longTerm.relations).forEach(
      ([agentId, relation]: [string, any]) => {
        formatted += `- ${relation.agentInfo?.name || agentId}: ${
          relation.myOpinion || "아직 특별한 의견 없음"
        }\n`;
      }
    );
    formatted += "\n";
  }

  if (memory.shortTerm?.lastAction) {
    formatted += `### 최근 활동\n${memory.shortTerm.lastAction.type} (${memory.shortTerm.lastAction.timestamp})\n`;
  }

  return formatted.trim();
}

// 새로운 메모리 구조를 프롬프트용으로 포맷팅하는 함수
function formatNewMemoryForPrompt(memory: any): string {
  let formatted = "";

  // Knowledge 섹션
  if (memory.longTerm?.knowledge) {
    formatted += `### 🧠 아이디에이션 지식\n${memory.longTerm.knowledge}\n\n`;
  }

  // Action Plan 섹션
  if (memory.longTerm?.actionPlan) {
    formatted += `### 📋 행동 계획\n`;
    const actionPlan = memory.longTerm.actionPlan;
    formatted += `- **아이디어 생성**: ${actionPlan.idea_generation}\n`;
    formatted += `- **아이디어 평가**: ${actionPlan.idea_evaluation}\n`;
    formatted += `- **피드백 제공**: ${actionPlan.feedback}\n`;
    formatted += `- **요청하기**: ${actionPlan.request}\n`;
    formatted += `- **응답하기**: ${actionPlan.response}\n\n`;
  }

  // Relation 섹션
  if (
    memory.longTerm?.relation &&
    Object.keys(memory.longTerm.relation).length > 0
  ) {
    formatted += `### 👥 팀원 관계\n`;
    Object.entries(memory.longTerm.relation).forEach(
      ([agentId, relation]: [string, any]) => {
        formatted += `- **${relation.agentInfo?.name || agentId}** (${
          relation.relationship
        }): ${relation.myOpinion}\n`;

        // 최근 상호작용 기록 (최대 3개)
        if (relation.interactionHistory?.length > 0) {
          const recentInteractions = relation.interactionHistory.slice(-3);
          formatted += `  최근 상호작용: ${recentInteractions
            .map((i: any) => i.actionItem)
            .join(", ")}\n`;
        }
      }
    );
    formatted += "\n";
  }

  // Short-term Memory 섹션
  if (memory.shortTerm) {
    formatted += `### ⚡ 현재 상황\n`;

    // 최근 액션
    if (memory.shortTerm.actionHistory) {
      formatted += `- **최근 행동**: ${memory.shortTerm.actionHistory.type} (${memory.shortTerm.actionHistory.timestamp})\n`;
    }

    // 대기 중인 요청들
    if (memory.shortTerm.requestList?.length > 0) {
      formatted += `- **대기 중인 요청** (${memory.shortTerm.requestList.length}개):\n`;
      memory.shortTerm.requestList.slice(-3).forEach((req: any) => {
        formatted += `  • ${req.requesterName}: ${req.requestType} - ${req.content}\n`;
      });
    }

    // 현재 채팅 세션
    if (memory.shortTerm.currentChat) {
      const chat = memory.shortTerm.currentChat;
      formatted += `- **진행 중인 대화**: ${chat.targetAgentName}와 ${
        chat.chatType
      } (${chat.messages?.length || 0}개 메시지)\n`;
    }
  }

  return formatted.trim();
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
    };
    teamIdeas?: any[];
  },
  agentMemory?: any
): Promise<{
  response: string;
  shouldEnd: boolean;
  reasoning: string;
}> {
  try {
    const { otherParticipant, messageHistory, feedbackContext, teamIdeas } =
      sessionContext;

    // 현재 메시지 수 확인 (system 메시지 제외하고 실제 대화 메시지만)
    const actualMessageCount = messageHistory.filter(
      (msg) => msg.type === "message"
    ).length;

    // 최소 대화 횟수 미만이면 강제로 계속 진행
    const minMessages = 4; // 최소 4개 메시지 (사용자 1회 + AI 1회 + 사용자 1회 + AI 1회)
    const shouldForceContinue = actualMessageCount < minMessages;

    // 메모리 컨텍스트 생성
    const memoryContext = agentMemory ? formatMemoryForPrompt(agentMemory) : "";

    // 팀 아이디어 컨텍스트 생성 (참고용, 특정 아이디어를 타겟하지 않음)
    const teamIdeasContext =
      teamIdeas && teamIdeas.length > 0
        ? `\n## 팀의 아이디어 현황\n현재 팀에서 ${teamIdeas.length}개의 아이디어가 제안되었습니다. 다양한 접근법과 창의적인 솔루션들이 논의되고 있습니다.\n`
        : "";

    // 피드백 가이드라인 생성
    const feedbackGuideline = feedbackContext
      ? `\n## 피드백 주제\n${feedbackContext.category}: ${
          feedbackContext.description || "일반적인 협업과 팀워크에 대한 피드백"
        }\n`
      : `\n## 피드백 주제\n일반적인 협업과 팀워크, 아이디어 발전 과정에 대한 건설적인 피드백\n`;

    // 대화 히스토리 포맷팅
    const conversationHistory =
      messageHistory.length > 0
        ? `\n## 대화 기록\n${messageHistory
            .filter((msg) => msg.type === "message")
            .map(
              (msg) =>
                `${msg.sender === agent.id ? "나" : otherParticipant.name}: ${
                  msg.content
                }`
            )
            .join("\n")}\n`
        : "\n## 대화 기록\n아직 대화가 시작되지 않았습니다.\n";

    // 종료 조건 가이드라인 생성
    const endingGuideline = shouldForceContinue
      ? `\n## 중요: 대화 지속 필수\n현재 대화가 ${actualMessageCount}개 메시지만 주고받아졌습니다. 피드백 세션은 최소한 ${minMessages}개의 메시지가 오간 후에 종료할 수 있습니다. 반드시 대화를 계속 진행하세요. (shouldEnd: false로 설정 필수)\n`
      : `\n## 대화 종료 판단\n현재까지 ${actualMessageCount}개의 메시지가 주고받아졌습니다. 충분한 피드백이 오갔다고 판단되면 자연스럽게 마무리할 수 있습니다.\n`;

    const prompt = `당신은 ${agent.name}입니다.\n\n## 상황\n현재 ${
      otherParticipant.name
    }와 피드백 세션에 참여하고 있습니다.\n${feedbackGuideline}\n${conversationHistory}\n${memoryContext}\n${teamIdeasContext}\n${endingGuideline}\n\n## 성격과 역할\n- 이름: ${
      agent.name
    }\n- 나이: ${agent.age}세\n- 성별: ${agent.gender}\n- 직업: ${
      agent.professional
    }\n- 전문 기술: ${agent.skills}\n- 성격: ${
      agent.personality || "협력적이고 건설적"
    }\n- 가치관: ${
      agent.value || "팀워크와 혁신을 중시"
    }\n\n## 피드백 세션 가이드라인\n1. 상대방의 전문성과 의견을 존중하며 대화하세요\n2. 구체적이고 실용적인 피드백을 제공하세요\n3. 질문을 통해 상대방의 생각을 더 깊이 이해하려 노력하세요\n4. 상대방의 가장 최근 메시지에 직접적으로 답변하되, 답변을 생성할 때 자신의 메모리와 과거 경험을 적극적으로 활용하세요\n\n## 대화 스타일\n- 상대와의 관계를 고려한 대화 스타일\n- 너무 길지 않고 간결하면서도 의미 있는 응답\n- 상대방과의 협업과 창의적 사고에 대해 진심으로 관심을 보이기\n- 메모리에 있는 과거 상호작용, 자기 성찰, 관계 정보를 바탕으로 개인화된 응답 제공\n\n## 세션 종료 판단 기준\n${
      shouldForceContinue
        ? "**중요: 현재는 대화를 계속 진행해야 합니다. shouldEnd를 반드시 false로 설정하세요.**"
        : `다음 중 하나에 해당하면 세션을 종료할 수 있습니다:
- 피드백이 충분히 주고받아졌을 때 (최소 ${minMessages}개 메시지 이후)
- 대화가 반복되거나 더 이상 진전이 없을 때
- 양측이 만족스러운 결론에 도달했을 때
- 메시지가 8개 이상 주고받아졌을 때`
    }\n\n다음 JSON 형식으로 응답하세요:\n{\n  \"response\": \"피드백 세션에서의 응답 (한국어, 1-3문장)\",\n  \"shouldEnd\": ${
      shouldForceContinue ? "false" : "true/false"
    },\n  \"reasoning\": \"세션을 종료하거나 계속하는 이유\"\n}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
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
  participants: any[],
  feedbackContext?: any
): Promise<{
  summary: string;
  keyInsights: string[];
  participantContributions: { [participantId: string]: string };
}> {
  try {
    const messagesText = messages
      .map((msg) => `${msg.sender}: ${msg.content}`)
      .join("\n");

    const prompt = `다음은 피드백 세션의 대화 내용입니다:

## 참가자들
${participants
  .map((p) => `- ${p.name} (${p.isUser ? "사용자" : "AI"})`)
  .join("\n")}

## 대화 내용
${messagesText}

## 요약 작성 가이드라인
이 피드백 세션은 특정 아이디어를 대상으로 한 것이 아니라, 팀워크와 협업, 창의적 사고에 대한 일반적인 피드백 대화입니다.

다음 JSON 형식으로 응답하세요:
{
  "summary": "세션의 핵심 내용과 결론을 3-4문장으로 요약",
  "keyInsights": ["주요 통찰이나 배운점 3-5개 배열"],
  "participantContributions": {
    "참가자ID": "해당 참가자가 기여한 주요 내용 1-2문장"
  }
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
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
  // 메모리 컨텍스트 생성
  const memoryContext = memory ? formatMemoryForPrompt(memory) : "";

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
      : "아직 생성된 아이디어가 없습니다.";

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
      : "최근 팀 활동이 없습니다.";

  const prompt = `당신은 ${agentProfile.name}입니다. ${
    requestContext.requesterName
  }가 피드백을 요청했습니다.

**당신의 정보:**
- 이름: ${agentProfile.name}
- 나이: ${agentProfile.age}세
- 전문분야: ${agentProfile.professional}
- 스킬: ${agentProfile.skills}
- 성격: ${agentProfile.personality || "정보 없음"}
- 역할: ${agentProfile.roles?.join(", ") || "정보 없음"}

**팀 정보:**
- 팀명: ${teamContext.teamName}
- 주제: ${teamContext.topic}

**요청 컨텍스트:**
- 요청자: ${requestContext.requesterName}
- 요청 메시지: "${requestContext.originalMessage}"

**팀원 정보:**
${teamMembersInfo}

**팀의 아이디어 현황:**
${ideasInfo}

**최근 팀 활동:**
${recentActivity}

${memoryContext ? `**당신의 메모리:**\n${memoryContext}\n` : ""}

모든 정보를 종합적으로 고려하여 다음을 결정하세요:

1. **피드백 대상**: 사용 가능한 팀원 중에서 선택
2. **피드백 유형**: 
   - general_collaboration: 일반적인 협업과 팀워크에 대한 피드백
   - specific_idea: 특정 아이디어에 대한 피드백
   - skill_development: 개인의 스킬 발전에 대한 피드백
   - team_dynamics: 팀 역학과 커뮤니케이션에 대한 피드백
3. **대상 아이디어**: specific_idea 유형인 경우에만 선택
4. **피드백 메시지**: 구체적이고 건설적인 피드백 내용
5. **선택 이유**: 왜 이 대상과 방식을 선택했는지

**고려사항:**
- 요청자의 메시지 내용과 의도
- 각 팀원의 역할과 최근 활동
- 아이디어의 품질과 발전 가능성
- 팀 전체의 성장과 협업 향상
- 당신의 성격과 전문성에 맞는 피드백 방식
- 메모리에 있는 다른 팀원들과의 관계

다음 JSON 형식으로 응답하세요:
{
  "targetMember": {
    "id": "대상 팀원의 ID",
    "name": "대상 팀원의 이름",
    "isUser": true/false
  },
  "feedbackType": "general_collaboration" | "specific_idea" | "skill_development" | "team_dynamics",
  "targetIdea": {
    "ideaNumber": 아이디어 번호,
    "authorId": "아이디어 작성자 ID",
    "object": "아이디어 제목"
  }, // specific_idea 유형일 때만 포함
  "feedbackMessage": "구체적이고 건설적인 피드백 메시지 (구어체로 자연스럽게)",
  "reasoning": "이 선택을 한 이유에 대한 설명"
}`;

  return getJsonResponse(prompt, agentProfile);
}
