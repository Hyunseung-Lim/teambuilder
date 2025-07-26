import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  ideationPrompt,
  evaluationPrompt,
  requestPrompt,
  preIdeationPrompt,
  newIdeationPrompt,
  updateIdeationPrompt,
  preEvaluationPrompt,
  planningPrompt,
  preRequestPrompt,
  feedbackPrompt,
  preFeedbackPrompt,
  responsePrompt,
  generateFeedbackSessionSummaryPrompt,
  generateAgentPersonaSummaryPrompt,
} from "@/core/prompts";
import { AgentMemory } from "@/lib/types";
import { resolveMultipleAgentIds } from "@/lib/member-utils";
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

/**
 * 팀원들의 역할을 분석하여 가능한 요청 타입을 결정합니다.
 */
function analyzeAvailableRequestTypes(teamMembers: Array<{
  name: string;
  roles: string[];
  isUser: boolean;
  agentId?: string;
}>) {
  const requestTypeToRole = {
    "generate_idea": "아이디어 생성하기",
    "evaluate_idea": "아이디어 평가하기", 
    "give_feedback": "피드백하기"
  };
  
  const availableTypes: string[] = [];
  const membersByRequestType: Record<string, any[]> = {
    "generate_idea": [],
    "evaluate_idea": [],
    "give_feedback": []
  };
  
  // 각 요청 타입별로 수행 가능한 팀원들을 찾음
  Object.entries(requestTypeToRole).forEach(([requestType, requiredRole]) => {
    const capableMembers = teamMembers.filter(member => 
      member.roles.includes(requiredRole)
    );
    
    if (capableMembers.length > 0) {
      availableTypes.push(requestType);
      membersByRequestType[requestType] = capableMembers;
    }
  });
  
  return {
    availableTypes,
    membersByRequestType,
    totalCapableMembers: teamMembers.filter(member => 
      member.roles.some(role => Object.values(requestTypeToRole).includes(role))
    )
  };
}

export async function getJsonResponse(prompt: string, agentProfile?: any) {
  const messages = [];

  // 시스템 프롬프트로 AI 에이전트 데모그래픽 정보 추가
  if (agentProfile) {

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

    messages.push(new SystemMessage(systemPrompt));
  }
  messages.push(new HumanMessage(prompt));

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

    const parsedResponse = JSON.parse(cleanedResponse);
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
    console.log(`🔧 ${agentName} LLM 응답 파싱 실패 - 상태 복구 시작`);

    // 먼저 팀 ID 추출
    const teamId = await extractTeamIdFromContext(agentId);
    if (!teamId) {
      console.error(`❌ ${agentName} 팀 ID 추출 실패 - 복구 불가능`);
      return;
    }

    // 에이전트 상태 관련 함수들 임포트
    const { getAgentState, setAgentState, isFeedbackSessionActive, createNewIdleTimer } = await import(
      "@/lib/agent-state-utils"
    );

    // 현재 에이전트 상태 확인
    const currentState = await getAgentState(teamId, agentId);

    if (!currentState) {
      console.log(`⚠️ ${agentName} 상태 정보 없음 - 새 idle 상태 생성`);
      await setAgentState(teamId, agentId, {
        agentId,
        currentState: "idle",
        lastStateChange: new Date().toISOString(),
        isProcessing: false,
        idleTimer: createNewIdleTimer(),
      });
      console.log(`✅ ${agentName} 새 idle 상태 생성 완료`);
      return;
    }

    // 피드백 세션 중인지 확인
    if (isFeedbackSessionActive(currentState)) {
      console.log(
        `🔄 ${agentName} 피드백 세션 중 - 세션 유지하며 processing 플래그만 해제`
      );
      
      // 피드백 세션은 유지하되 processing 상태만 해제
      await setAgentState(teamId, agentId, {
        ...currentState,
        isProcessing: false,
        lastStateChange: new Date().toISOString(),
      });
    } else {
      console.log(`🔄 ${agentName} 일반 상태 - idle로 전환`);
      
      // 즉시 idle 상태로 전환
      await setAgentState(teamId, agentId, {
        agentId,
        currentState: "idle",
        lastStateChange: new Date().toISOString(),
        isProcessing: false,
        idleTimer: createNewIdleTimer(),
      });
    }

    console.log(`✅ ${agentName} 상태 복구 완료`);
  } catch (error) {
    console.error(`❌ ${agentName} 상태 복구 중 오류:`, error);
    
    // 최후의 수단: 강제 idle 상태 설정
    try {
      const { setAgentState, createNewIdleTimer } = await import("@/lib/agent-state-utils");
      const teamId = await extractTeamIdFromContext(agentId);
      
      if (teamId) {
        await setAgentState(teamId, agentId, {
          agentId,
          currentState: "idle",
          lastStateChange: new Date().toISOString(),
          isProcessing: false,
          idleTimer: createNewIdleTimer(),
        });
        console.log(`🛠️ ${agentName} 강제 idle 전환 완료`);
      }
    } catch (forceError) {
      console.error(`💥 ${agentName} 강제 복구도 실패:`, forceError);
    }
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


// --- Action Functions ---


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
  _team?: any
) {
  // 기존 아이디어가 있으면 프롬프트에 포함
  let enhancedContext = context || "Carbon Emission Reduction";


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

  const prompt = ideationPrompt(enhancedContext, userProfile, memory, userProfile?.personaSummary);
  
  try {
    const ideaResponse = await getJsonResponse(prompt, userProfile);
    
    // 응답 형태 검증
    if (!ideaResponse || typeof ideaResponse !== 'object') {
      return {
        success: false,
        error: "Invalid response format from AI"
      };
    }
    
    // 필수 필드가 있는지 확인 (object는 필수, 나머지는 선택적)
    if (!ideaResponse.object) {
      return {
        success: false,
        error: "Missing required field 'object' in AI response"
      };
    }
    
    return {
      success: true,
      idea: ideaResponse,
      updatedMemory: memory // 메모리 업데이트는 v2 시스템에서 처리하므로 기존 메모리 반환
    };
  } catch (error) {
    console.error("generateIdeaAction 오류:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

export async function evaluateIdeaAction(
  idea: any,
  context?: string,
  agentProfile?: any,
  memory?: any
) {
  const prompt = evaluationPrompt(idea, context || "General evaluation", memory, agentProfile);
  return getJsonResponse(prompt, agentProfile);
}


// Initial feedback function for starting feedback sessions
export async function giveFeedback(
  targetMember: string,
  targetMemberIdeas: any[],
  userProfile: any,
  teamContext: any,
  memory?: AgentMemory,
  targetMemberRoles?: string[],
  allIdeas?: any[],
  feedbackStrategy?: any
) {
  console.log(`🎯 giveFeedback: ${userProfile?.name} → ${targetMember} (ideas: ${targetMemberIdeas?.length || 0})`);

  // preFeedback 실행 (전략 수립)
  console.log("📋 preFeedback 단계 시작");
  const { preFeedbackPrompt } = await import("@/core/prompts");
  const preFeedbackPromptText = preFeedbackPrompt(
    targetMember,
    targetMemberIdeas,
    memory,
    userProfile
  );
  
  let preFeedbackResult;
  try {
    preFeedbackResult = await getJsonResponse(preFeedbackPromptText, userProfile);
    console.log("📊 preFeedback 완료:", preFeedbackResult?.feedbackType || "unknown");
  } catch (error) {
    console.error("❌ preFeedback 실행 실패:", error);
    preFeedbackResult = feedbackStrategy || { hasIdeas: targetMemberIdeas.length > 0, feedbackFocus: "general", feedbackApproach: "supportive" };
  }

  console.log("📋 === feedbackPrompt 단계 시작 ===");
  
  // Resolve agent names in team context before calling feedbackPrompt
  let enhancedTeamContext = teamContext;
  if (teamContext && (teamContext.teamMembers || teamContext.relationships)) {
    // Collect all agent IDs that need resolution
    const agentIds = new Set<string>();
    
    // From team members
    teamContext.teamMembers?.forEach((member: any) => {
      if (!member.isUser && member.agentId) {
        agentIds.add(member.agentId);
      }
    });
    
    // From relationships
    teamContext.relationships?.forEach((rel: any) => {
      if (rel.from !== "나") agentIds.add(rel.from);
      if (rel.to !== "나") agentIds.add(rel.to);
    });
    
    // From ideas authors
    allIdeas?.forEach((idea: any) => {
      if (idea.author !== "나") agentIds.add(idea.author);
    });
    
    // Resolve all agent names
    const agentNameMap = await resolveMultipleAgentIds(Array.from(agentIds));
    
    // Enhance team context with resolved names
    enhancedTeamContext = {
      ...teamContext,
      agentNameMap, // Add the name mapping for use in feedbackPrompt
    };
  }
  
  const { agentContext, mainPrompt } = feedbackPrompt(
    targetMember,
    targetMemberIdeas,
    enhancedTeamContext,
    userProfile,
    memory,
    targetMemberRoles,
    allIdeas,
    preFeedbackResult
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
  memory?: any
) {
  const prompt = requestPrompt(target, "general_request", "Strategic request based on context", context, [], undefined, memory, undefined, undefined, undefined, agentProfile);
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
  },
  memory?: any,
  team?: any
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
    // 피드백 가능한 대상이 있는지 확인
    let canGiveFeedback = false;
    if (team && hasRole("피드백하기")) {
      console.log(`🎯 ${userProfile.name} 피드백 계획 단계 확인 시작`);
      console.log(`🔍 팀 관계 정보 전체 확인:`, JSON.stringify(team.relationships, null, 2));
      console.log(`🔍 팀 멤버 정보:`, team.members.map(m => ({isUser: m.isUser, agentId: m.agentId})));
      const { canCreateFeedbackSession } = await import("@/lib/relationship-utils");
      // 피드백 대상 멤버 필터링: 사용자 + 다른 에이전트들 (자신 제외)
      const otherMembers = team.members.filter(
        (member: any) => {
          if (member.isUser) {
            return true; // 사용자 포함
          } else {
            return member.agentId && member.agentId !== userProfile.id; // 자신 제외한 다른 에이전트들 (null 체크 추가)
          }
        }
      );
      
      
      for (const member of otherMembers) {
        // 사용자인 경우 "나"를 ID로 사용, 에이전트인 경우 agentId 사용
        const targetId = member.isUser ? "나" : member.agentId!;
        const canCreate = canCreateFeedbackSession(userProfile.id, targetId, team);
        console.log(`🎯 피드백 관계 확인: ${userProfile.name}(${userProfile.id}) → ${member.name || targetId}(${targetId}): ${canCreate ? '✅ 가능' : '❌ 불가능'}`);
        
        // 관계 디버깅 정보 추가
        if (!canCreate && !member.isUser) {
          console.log(`🔍 관계 디버깅: ${userProfile.id} → ${targetId}`);
          const relationship = team.relationships?.find((rel: any) => 
            (rel.from === userProfile.id && rel.to === targetId) ||
            (rel.from === targetId && rel.to === userProfile.id)
          );
          console.log(`🔍 찾은 관계:`, relationship || '관계 없음');
        }
        
        if (canCreate) {
          canGiveFeedback = true;
          break;
        }
      }
      
      console.log(`📋 ${userProfile.name} 피드백 계획 결과: ${canGiveFeedback ? '✅ 가능' : '❌ 불가능'}`);
    }

    // 요청 가능 여부 확인
    let canMakeRequestFlag = false;
    if (team && hasRole("요청하기")) {
      console.log(`🎯 ${userProfile.name} 요청 계획 단계 확인 시작`);
      const { canMakeRequest } = await import("@/lib/relationship-utils");
      // 요청 대상 멤버 필터링: 사용자 + 다른 에이전트들 (자신 제외)
      const otherMembers = team.members.filter(
        (member: any) => {
          if (member.isUser) {
            return true; // 사용자 포함
          } else {
            return member.agentId && member.agentId !== userProfile.id; // 자신 제외한 다른 에이전트들 (null 체크 추가)
          }
        }
      );
      
      for (const member of otherMembers) {
        // 사용자인 경우 "나"를 ID로 사용, 에이전트인 경우 agentId 사용
        const targetId = member.isUser ? "나" : member.agentId!;
        const canRequest = canMakeRequest(userProfile.id, targetId, team);
        console.log(`🎯 요청 관계 확인: ${userProfile.name}(${userProfile.id}) → ${member.name || targetId}(${targetId}): ${canRequest ? '✅ 가능' : '❌ 불가능'}`);
        
        // 관계 디버깅 정보 추가
        if (!canRequest && !member.isUser) {
          console.log(`🔍 관계 디버깅: ${userProfile.id} → ${targetId}`);
          const relationship = team.relationships?.find((rel: any) => 
            (rel.from === userProfile.id && rel.to === targetId) ||
            (rel.from === targetId && rel.to === userProfile.id)
          );
          console.log(`🔍 찾은 관계:`, relationship || '관계 없음');
        }
        
        if (canRequest) {
          canMakeRequestFlag = true;
          break;
        }
      }
      
      console.log(`📋 ${userProfile.name} 요청 계획 결과: ${canMakeRequestFlag ? '✅ 가능' : '❌ 불가능'}`);
    }

    // 팀 관계 정보를 위한 agentNameMap 생성
    let agentNameMap: { [agentId: string]: string } = {};
    if (team?.members) {
      const agentIds = team.members
        .filter((m: any) => !m.isUser && m.agentId)
        .map((m: any) => m.agentId);
      
      if (agentIds.length > 0) {
        agentNameMap = await resolveMultipleAgentIds(agentIds);
      }
    }

    // 더 많은 메시지 컨텍스트를 위해 최근 15개 메시지 전달
    const extendedTeamContext = {
      ...teamContext,
      recentMessages: teamContext.recentMessages.slice(-15), // 더 많은 히스토리 제공
      canGiveFeedback, // 피드백 가능 여부 추가
      canMakeRequest: canMakeRequestFlag, // 요청 가능 여부 추가
      relationships: team?.relationships || [], // 팀 관계 정보 추가
      agentNameMap, // agent ID를 이름으로 매핑
    };

    const { agentContext, mainPrompt } = planningPrompt(userProfile, extendedTeamContext, memory);

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
  memory?: AgentMemory
) {
  const prompt = preIdeationPrompt(requestMessage, ideaList, memory, userProfile);
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
    prompt = newIdeationPrompt(ideationStrategy, topic, memory, userProfile);
  } else {
    if (!referenceIdea) {
      throw new Error("Reference idea is required for 'Update' decision.");
    }
    prompt = updateIdeationPrompt(
      referenceIdea,
      ideationStrategy,
      topic,
      memory,
      userProfile
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
  const prompt = preEvaluationPrompt(requestMessage, ideaList, memory, userProfile);
  return getJsonResponse(prompt, userProfile);
}

export async function executeEvaluationAction(
  selectedIdea: any,
  evaluationStrategy: string,
  userProfile?: any,
  memory?: AgentMemory
) {
  const prompt = evaluationPrompt(
    selectedIdea,
    evaluationStrategy,
    memory,
    userProfile
  );
  return getJsonResponse(prompt, userProfile);
}


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
  team?: any
) {
  // 요청 권한이 있는 팀원만 필터링
  let filteredTeamMembers = teamMembers;
  if (team && userProfile) {
    
    const { canMakeRequest } = await import("@/lib/relationship-utils");
    filteredTeamMembers = teamMembers.filter(member => {
      let canRequest = false;
      const targetId = member.isUser ? "나" : member.agentId;
      console.log(`🔍 관계 검증: ${userProfile.id} → ${targetId}`);
      
      if (member.isUser) {
        canRequest = canMakeRequest(userProfile.id, "나", team);
      } else {
        canRequest = member.agentId ? canMakeRequest(userProfile.id, member.agentId, team) : false;
      }
      console.log(`🎯 ${userProfile.name} → ${member.name || member.agentId || '나'}: ${canRequest ? '✅ 가능' : '❌ 불가능'}`);
      return canRequest;
    });
    
    console.log(`📋 ${userProfile.name} 요청 가능한 팀원: ${filteredTeamMembers.length}명`, filteredTeamMembers.map(m => m.name || m.agentId || '나'));
    
    // 요청 가능한 팀원이 없으면 에러 반환
    if (filteredTeamMembers.length === 0) {
      console.log(`❌ ${userProfile.name} 요청 가능한 팀원이 없음 (관계 제약)`);
      console.log(`📊 원본 팀원 수: ${teamMembers.length}, 필터링 후: ${filteredTeamMembers.length}`);
      console.log(`🔍 관계 확인 결과 상세:`);
      teamMembers.forEach(member => {
        const targetId = member.isUser ? "나" : member.agentId;
        const relationshipType = team.relationships.find((rel: any) => 
          (rel.from === userProfile.id && rel.to === targetId) ||
          (rel.from === targetId && rel.to === userProfile.id)
        );
        console.log(`  - ${member.name || targetId}: 관계 ${relationshipType?.type || 'none'}`);
      });
      
      return {
        success: false,
        error: "No team members available for requests due to relationship constraints"
      };
    }
  }
  
  // 역할 기반으로 가능한 요청 타입 결정 및 팀원 추가 필터링
  const roleBasedRequests = analyzeAvailableRequestTypes(filteredTeamMembers);
  
  if (roleBasedRequests.availableTypes.length === 0) {
    console.log(`❌ ${userProfile.name} 요청 가능한 역할을 가진 팀원이 없음`);
    return {
      success: false,
      error: "No team members have roles that can handle any request types"
    };
  }
  
  const prompt = preRequestPrompt(
    triggerContext,
    filteredTeamMembers,
    currentIdeas,
    memory,
    userProfile
  );
  const analysisResult = await getJsonResponse(prompt, userProfile);
  
  return {
    success: true,
    ...analysisResult
  };
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
  const prompt = requestPrompt(
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
    userProfile
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
  _sharedMentalModel?: any,
  team?: any // 관계 검증을 위한 팀 정보 추가
) {
  // Step 1: Analyze request
  const requestAnalysis = await preRequestAction(
    triggerContext,
    teamMembers,
    currentIdeas,
    userProfile,
    memory,
    team
  );

  // 요청 가능한 팀원이 없는 경우 처리
  if (!requestAnalysis.success) {
    return requestAnalysis;
  }

  // Step 2: Execute request
  const targetMemberInfo = teamMembers.find(
    (member) => member.name === requestAnalysis.targetMember
  );

  if (!targetMemberInfo) {
    throw new Error(`Target member ${requestAnalysis.targetMember} not found`);
  }

  // 역할 검증: 선택된 요청 타입이 대상 팀원이 수행할 수 있는지 확인
  const requestTypeToRole = {
    "generate_idea": "아이디어 생성하기",
    "evaluate_idea": "아이디어 평가하기", 
    "give_feedback": "피드백하기"
  };
  
  const requiredRole = requestTypeToRole[requestAnalysis.requestType as keyof typeof requestTypeToRole];
  const canPerformRequest = targetMemberInfo.roles.includes(requiredRole);
  
  if (!canPerformRequest) {
    console.log(`❌ 역할 검증 실패: ${requestAnalysis.targetMember} (역할: ${targetMemberInfo.roles.join(', ')})는 ${requestAnalysis.requestType} 수행 불가 (필요 역할: ${requiredRole})`);
    return {
      success: false,
      error: `Target member ${requestAnalysis.targetMember} cannot perform ${requestAnalysis.requestType}. Required role: ${requiredRole}, but they have: ${targetMemberInfo.roles.join(', ')}`
    };
  }
  
  console.log(`✅ 역할 검증 성공: ${requestAnalysis.targetMember}는 ${requestAnalysis.requestType} 수행 가능 (보유 역할: ${targetMemberInfo.roles.join(', ')})`);

  // 관계 검증: 요청은 관계가 있는 팀원에게만 가능
  if (team && userProfile) {
    const { canMakeRequest } = await import("@/lib/relationship-utils");
    const requesterId = userProfile.id || userProfile.agentId;
    const targetId = targetMemberInfo.agentId || targetMemberInfo.name;
    
    if (!canMakeRequest(requesterId, targetId, team)) {
      console.log(`⚠️ ${userProfile.name}이 ${requestAnalysis.targetMember}에게 요청할 권한이 없음 (관계 없음)`);
      throw new Error(`요청 권한이 없습니다. ${requestAnalysis.targetMember}와의 관계가 설정되지 않았습니다.`);
    }
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
    undefined, // originalRequester parameter not available
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
    targetMemberRoles?: string[];
    targetMemberIdeas?: any[];
    team?: any;
    teamContext?: any;
    teamTopic?: string;
    allIdeas?: any[];
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
      teamIdeas: _teamIdeas,
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

    // 최소 대화 횟수 미만이면 강제로 계속 진행, 최대 횟수 초과시 강제 종료
    const minMessages = 4; // 최소 4개 메시지 (2회씩 주고받음)
    const maxMessages = 8; // 최대 8개 메시지 (4회씩 주고받음)
    const shouldForceContinue = actualMessageCount < minMessages;
    const shouldForceEnd = actualMessageCount >= maxMessages;

    // Memory context will be handled by the prompt function


    // Format message history for the prompt
    const formattedMessageHistory = messageHistory
      .filter((msg) => msg.type === "message")
      .map((msg) => ({
        sender: msg.sender === agent.id ? agent.name : otherParticipant.name,
        content: msg.content,
        timestamp: msg.timestamp
      }));

    // Resolve agent names in team context before calling responsePrompt
    let enhancedTeamContext = sessionContext.teamContext || { 
      topic: sessionContext.teamTopic, 
      teamMembers: sessionContext.team?.members, 
      relationships: sessionContext.team?.relationships 
    };
    
    if (enhancedTeamContext.teamMembers || enhancedTeamContext.relationships) {
      // Collect all agent IDs that need resolution
      const agentIds = new Set<string>();
      
      // From team members
      enhancedTeamContext.teamMembers?.forEach((member: any) => {
        if (!member.isUser && member.agentId) {
          agentIds.add(member.agentId);
        }
      });
      
      // From relationships
      enhancedTeamContext.relationships?.forEach((rel: any) => {
        if (rel.from !== "나") agentIds.add(rel.from);
        if (rel.to !== "나") agentIds.add(rel.to);
      });
      
      // From ideas authors
      sessionContext.allIdeas?.forEach((idea: any) => {
        if (idea.author !== "나") agentIds.add(idea.author);
      });
      
      // Resolve all agent names
      const agentNameMap = await resolveMultipleAgentIds(Array.from(agentIds));
      
      // Enhance team context with resolved names
      enhancedTeamContext = {
        ...enhancedTeamContext,
        agentNameMap, // Add the name mapping for use in responsePrompt
      };
    }

    // Get prompt components from prompts.ts
    const { agentContext, mainPrompt } = responsePrompt(
      formattedMessageHistory,
      otherParticipant.name,
      agent,
      agentMemory,
      sessionContext.targetMemberRoles,
      sessionContext.targetMemberIdeas,
      enhancedTeamContext,
      sessionContext.allIdeas
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

    // 강제로 계속 진행하거나 종료해야 하는 경우 shouldEnd를 override
    const finalShouldEnd = shouldForceContinue
      ? false
      : shouldForceEnd
      ? true
      : parsed.shouldEnd || false;

    return {
      response: parsed.response || "피드백을 공유하고 싶습니다.",
      shouldEnd: finalShouldEnd,
      reasoning: shouldForceContinue
        ? `대화 지속 필요 (현재 ${actualMessageCount}개 메시지, 최소 ${minMessages}개 필요)`
        : shouldForceEnd
        ? `대화 길이 제한으로 종료 (현재 ${actualMessageCount}개 메시지, 최대 ${maxMessages}개 초과)`
        : parsed.reasoning || "계속 대화하기로 결정",
    };
  } catch (error) {
    console.error("AI 피드백 세션 응답 생성 실패:", error);

    // 현재 메시지 수를 기반으로 기본값 결정
    const actualMessageCount = sessionContext.messageHistory.filter(
      (msg) => msg.type === "message"
    ).length;
    const shouldEndDefault = actualMessageCount >= 8; // 8개 이상이면 종료

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



// Individual agent persona summary generation function
export async function generateAgentPersonaSummary(
  agentProfile: {
    name: string;
    skills: string;
    personality?: string;
    workStyle?: string;
    preferences?: string;
    dislikes?: string;
    professional: string;
    age?: number;
    gender?: string;
    value?: string;
  },
  teamContext?: {
    teamName: string;
    topic?: string;
    sharedMentalModel?: string;
  }
): Promise<string> {
  try {
    const prompt = generateAgentPersonaSummaryPrompt(agentProfile, teamContext?.sharedMentalModel);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const result = completion.choices[0]?.message?.content;
    if (!result) {
      throw new Error("OpenAI 응답이 비어있습니다");
    }

    // JSON 마크다운 블록 제거
    let jsonString = result.trim();
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonString);
    return parsed.personaSummary || `${agentProfile.name}의 페르소나 요약이 생성되었습니다.`;
  } catch (error) {
    console.error("개인 페르소나 요약 생성 실패:", error);
    
    // 기본값 반환
    return `${agentProfile.name}은 ${agentProfile.professional} 분야의 전문가로, ${agentProfile.skills} 역량을 바탕으로 팀에 기여합니다. ${agentProfile.personality ? `${agentProfile.personality} 성격을 가지고 있으며, ` : ""}팀 협업에서 중요한 역할을 수행할 것으로 기대됩니다.`;
  }
}
