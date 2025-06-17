/**
 * 새로운 에이전트 메모리 시스템 (v2)
 *
 * 구조:
 * - Short-term Memory: action history, request list, current_chat
 * - Long-term Memory: knowledge, actionPlan, relation
 *
 * 메모리 저장 프로세스:
 * 1. Short-term memory 수집
 * 2. Knowledge & ActionPlan 업데이트 (GPT 호출)
 * 3. Relation 업데이트 (GPT 호출)
 * 4. Long-term memory 저장
 */

import {
  getAgentMemory,
  updateAgentMemory,
  getAgentById,
  getTeamById,
  redis,
} from "./redis";
import {
  NewAgentMemory,
  ShortTermMemory,
  NewLongTermMemory,
  MemoryUpdateLog,
  AIAgent,
  Team,
  RelationshipType,
} from "./types";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

// LangChain LLM 인스턴스 생성
const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.5,
});

// 텍스트 응답을 위한 헬퍼 함수
async function getTextResponse(prompt: string): Promise<string> {
  try {
    const response = await llm.invoke([new HumanMessage(prompt)]);
    return response.content.toString().trim();
  } catch (error) {
    console.error("텍스트 응답 생성 실패:", error);
    throw error;
  }
}

/**
 * 새로운 메모리 구조로 초기 메모리 생성
 */
export async function createNewAgentMemory(
  agentId: string,
  team: Team
): Promise<NewAgentMemory> {
  console.log(`🧠 새로운 메모리 구조로 에이전트 ${agentId} 초기 메모리 생성`);

  const agentProfile = await getAgentById(agentId);
  if (!agentProfile) {
    throw new Error(`에이전트 프로필을 찾을 수 없습니다: ${agentId}`);
  }

  // 관계 메모리 초기화
  const relations: NewLongTermMemory["relation"] = {};

  for (const member of team.members) {
    if (member.agentId === agentId) continue; // 자기 자신 제외

    let otherAgentId: string;
    let otherAgentName: string;
    let otherAgentProfile: any;

    if (member.isUser) {
      otherAgentId = "나";
      otherAgentName = "나";
      otherAgentProfile = {
        id: "나",
        name: "나",
        professional: "팀 리더",
        personality: "알 수 없음",
        skills: "리더십",
      };
    } else {
      otherAgentId = member.agentId!;
      const otherAgent = await getAgentById(otherAgentId);
      if (!otherAgent) continue;

      otherAgentName = otherAgent.name;
      otherAgentProfile = {
        id: otherAgent.id,
        name: otherAgent.name,
        professional: otherAgent.professional,
        personality: otherAgent.personality,
        skills: otherAgent.skills,
      };
    }

    const relationship = team.relationships.find(
      (rel) =>
        (rel.from === agentProfile.name && rel.to === otherAgentName) ||
        (rel.from === otherAgentName && rel.to === agentProfile.name)
    );

    const relationKey = member.isUser ? "나" : otherAgentId;
    relations[relationKey] = {
      agentInfo: otherAgentProfile,
      relationship: relationship ? relationship.type : "AWKWARD",
      interactionHistory: [],
      myOpinion: "아직 상호작용이 없어 의견이 없습니다.",
    };
  }

  return {
    agentId,
    shortTerm: {
      actionHistory: null,
      requestList: [],
      currentChat: null,
    },
    longTerm: {
      knowledge: `${
        team.topic || "Carbon Emission Reduction"
      } 주제에 대한 아이디에이션을 진행하고 있습니다. 창의적이고 실용적인 아이디어를 생성하고 평가하는 것이 목표입니다.`,
      actionPlan: {
        idea_generation:
          "주제와 관련된 혁신적이고 실현 가능한 아이디어를 브레인스토밍하여 생성합니다.",
        idea_evaluation:
          "아이디어의 창의성, 실현가능성, 영향력을 종합적으로 평가합니다.",
        feedback:
          "건설적이고 구체적인 피드백을 제공하여 아이디어를 개선할 수 있도록 돕습니다.",
        request: "필요한 도움이나 의견을 명확하고 예의바르게 요청합니다.",
        response: "요청에 대해 신속하고 도움이 되는 응답을 제공합니다.",
      },
      relation: relations,
    },
    lastMemoryUpdate: new Date().toISOString(),
  };
}

/**
 * Short-term memory에서 Long-term memory로 업데이트하는 메인 함수
 */
export async function processMemoryConsolidation(
  agentId: string,
  updateLogs: MemoryUpdateLog[],
  teamId?: string
): Promise<void> {
  try {
    console.log(`📝 에이전트 ${agentId} 메모리 통합 시작`);
    console.log(`처리할 로그 개수: ${updateLogs.length}`);

    // 기존 메모리 가져오기 (새로운 구조 시도 후 기존 구조로 폴백)
    let memory = await getNewAgentMemory(agentId);
    
    if (!memory) {
      // 새로운 구조 메모리가 없으면 팀 정보로 생성
      if (!teamId) {
        console.error("메모리가 없고 팀 ID도 제공되지 않아 메모리 통합 불가");
        return;
      }
      
      const team = await getTeamById(teamId);
      if (!team) {
        throw new Error("팀 정보를 찾을 수 없습니다");
      }
      memory = await createNewAgentMemory(agentId, team);
    }

    if (updateLogs.length === 0) {
      console.log("업데이트할 로그가 없습니다");
      return;
    }

    // 1. Knowledge & ActionPlan 업데이트
    await updateKnowledgeAndActionPlan(memory, updateLogs, agentId);

    // 2. Relation 업데이트
    await updateRelationMemories(memory, updateLogs, agentId);

    // 3. 메모리 저장
    memory.lastMemoryUpdate = new Date().toISOString();
    await saveNewAgentMemory(agentId, memory);

    console.log(`✅ 에이전트 ${agentId} 메모리 통합 완료`);
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 메모리 통합 실패:`, error);
    throw error;
  }
}

/**
 * Knowledge와 ActionPlan 업데이트 (GPT 호출)
 */
async function updateKnowledgeAndActionPlan(
  memory: NewAgentMemory,
  updateLogs: MemoryUpdateLog[],
  agentId: string
): Promise<void> {
  const agentProfile = await getAgentById(agentId);
  if (!agentProfile) return;

  const interactionSummary = updateLogs
    .map((log) => `- ${log.type}: ${log.content} (${log.timestamp})`)
    .join("\n");

  const prompt = `
당신은 ${agentProfile.name}입니다.

**당신의 정보:**
- 이름: ${agentProfile.name}
- 전문성: ${agentProfile.professional}
- 스킬: ${agentProfile.skills}
- 성격: ${agentProfile.personality || "정보 없음"}

**기존 Knowledge:**
${memory.longTerm.knowledge}

**기존 ActionPlan:**
- 아이디어 생성: ${memory.longTerm.actionPlan.idea_generation}
- 아이디어 평가: ${memory.longTerm.actionPlan.idea_evaluation}
- 피드백: ${memory.longTerm.actionPlan.feedback}
- 요청: ${memory.longTerm.actionPlan.request}
- 응답: ${memory.longTerm.actionPlan.response}

**최근 상호작용 로그:**
${interactionSummary}

위 상호작용 로그에서 아이디에이션과 관련된 새로운 지식을 얻었다면 기존 knowledge에 추가하고, 각 action을 더 잘 수행하기 위한 actionPlan을 개선해주세요.

**응답 형식 (JSON):**
{
  "knowledge": "업데이트된 knowledge (기존 + 새로운 지식)",
  "actionPlan": {
    "idea_generation": "개선된 아이디어 생성 방법",
    "idea_evaluation": "개선된 아이디어 평가 방법", 
    "feedback": "개선된 피드백 방법",
    "request": "개선된 요청 방법",
    "response": "개선된 응답 방법"
  }
}

JSON 형식으로만 응답해주세요.
`;

  try {
    const response = await getTextResponse(prompt);
    const parsed = JSON.parse(response);

    if (parsed.knowledge) {
      memory.longTerm.knowledge = parsed.knowledge;
    }

    if (parsed.actionPlan) {
      Object.assign(memory.longTerm.actionPlan, parsed.actionPlan);
    }

    console.log(`✅ ${agentProfile.name} Knowledge & ActionPlan 업데이트 완료`);
  } catch (error) {
    console.error(`❌ Knowledge & ActionPlan 업데이트 실패:`, error);
  }
}

/**
 * Relation 메모리 업데이트 (GPT 호출)
 */
async function updateRelationMemories(
  memory: NewAgentMemory,
  updateLogs: MemoryUpdateLog[],
  agentId: string
): Promise<void> {
  // 로그에서 관련된 다른 에이전트들 추출
  const relatedAgents = new Set(
    updateLogs
      .filter((log) => log.relatedAgentId)
      .map((log) => log.relatedAgentId!)
  );

  for (const relatedAgentId of relatedAgents) {
    if (!memory.longTerm.relation[relatedAgentId]) continue;

    const relation = memory.longTerm.relation[relatedAgentId];
    const relevantLogs = updateLogs.filter(
      (log) => log.relatedAgentId === relatedAgentId
    );

    if (relevantLogs.length === 0) continue;

    // 상호작용 히스토리 업데이트
    for (const log of relevantLogs) {
      relation.interactionHistory.push({
        timestamp: log.timestamp,
        actionItem: log.type,
        content: log.content,
      });
    }

    // GPT를 사용하여 의견 업데이트
    const interactionSummary = relevantLogs
      .map((log) => `- ${log.type}: ${log.content}`)
      .join("\n");

    const prompt = `
당신은 팀원 "${relation.agentInfo.name}"에 대한 의견을 업데이트해야 합니다.

**대상 정보:**
- 이름: ${relation.agentInfo.name}
- 전문성: ${relation.agentInfo.professional}
- 관계: ${relation.relationship}

**기존 의견:**
${relation.myOpinion}

**최근 상호작용:**
${interactionSummary}

위 상호작용을 바탕으로 이 사람에 대한 의견을 업데이트해주세요. 
기존 의견을 참고하되, 최근 상호작용을 반영하여 100자 이내로 작성해주세요.

의견만 작성하고 다른 설명은 하지 마세요.
`;

    try {
      const response = await getTextResponse(prompt);
      if (response && response.trim()) {
        relation.myOpinion = response.trim().substring(0, 100);
        console.log(`✅ ${relation.agentInfo.name}에 대한 의견 업데이트 완료`);
      }
    } catch (error) {
      console.error(`❌ ${relation.agentInfo.name} 의견 업데이트 실패:`, error);
    }
  }
}

/**
 * 새로운 구조의 메모리 가져오기
 */
export async function getNewAgentMemory(
  agentId: string
): Promise<NewAgentMemory | null> {
  try {
    // 새로운 구조 메모리 시도
    const newMemoryData = await redis.get(`new_agent_memory:${agentId}`);
    if (newMemoryData) {
      const parsed =
        typeof newMemoryData === "string"
          ? JSON.parse(newMemoryData)
          : newMemoryData;

      // 새로운 구조인지 검증
      if (
        parsed.longTerm?.knowledge &&
        parsed.longTerm?.actionPlan &&
        parsed.longTerm?.relation
      ) {
        console.log(`✅ 새로운 메모리 구조 발견: ${agentId}`);
        return parsed as NewAgentMemory;
      }
    }

    // 기존 메모리를 새로운 구조로 마이그레이션 시도
    const oldMemory = await getAgentMemory(agentId);
    if (oldMemory) {
      console.log(`🔄 기존 메모리를 새로운 구조로 마이그레이션: ${agentId}`);
      return await migrateOldToNewMemory(agentId, oldMemory);
    }

    return null;
  } catch (error) {
    console.error(`❌ 새로운 메모리 가져오기 실패: ${agentId}`, error);
    return null;
  }
}

/**
 * 새로운 구조의 메모리 저장
 */
export async function saveNewAgentMemory(
  agentId: string,
  memory: NewAgentMemory
): Promise<void> {
  try {
    const memoryJson = JSON.stringify(memory);
    await redis.set(`new_agent_memory:${agentId}`, memoryJson, {
      ex: 3600 * 24 * 7,
    }); // 7일간 보관
    console.log(`💾 새로운 메모리 구조 저장 완료: ${agentId}`);
  } catch (error) {
    console.error(`❌ 새로운 메모리 저장 실패: ${agentId}`, error);
    throw error;
  }
}

/**
 * 기존 메모리를 새로운 구조로 마이그레이션
 */
async function migrateOldToNewMemory(
  agentId: string,
  oldMemory: any
): Promise<NewAgentMemory> {
  const agentProfile = await getAgentById(agentId);
  if (!agentProfile) {
    throw new Error(`에이전트 프로필을 찾을 수 없습니다: ${agentId}`);
  }

  // 기존 relations를 새로운 relation 구조로 변환
  const newRelations: NewLongTermMemory["relation"] = {};

  if (oldMemory.longTerm?.relations) {
    Object.entries(oldMemory.longTerm.relations).forEach(
      ([agentId, relation]: [string, any]) => {
        newRelations[agentId] = {
          agentInfo: relation.agentInfo,
          relationship: relation.relationship,
          interactionHistory:
            relation.interactionHistory?.map((item: any) => ({
              timestamp: item.timestamp,
              actionItem: item.action,
              content: item.content,
            })) || [],
          myOpinion: relation.myOpinion || "마이그레이션된 관계입니다.",
        };
      }
    );
  }

  const newMemory: NewAgentMemory = {
    agentId,
    shortTerm: {
      actionHistory: oldMemory.shortTerm?.lastAction || null,
      requestList: [], // 기존 구조에는 requestList가 없으므로 빈 배열
      currentChat: oldMemory.shortTerm?.feedbackSessionChat
        ? {
            sessionId: oldMemory.shortTerm.feedbackSessionChat.sessionId,
            targetAgentId:
              oldMemory.shortTerm.feedbackSessionChat.targetAgentId,
            targetAgentName:
              oldMemory.shortTerm.feedbackSessionChat.targetAgentName,
            chatType: "feedback_session" as const,
            messages: oldMemory.shortTerm.feedbackSessionChat.messages || [],
          }
        : null,
    },
    longTerm: {
      knowledge: `${
        agentProfile.professional
      } 전문성을 바탕으로 아이디에이션에 참여하고 있습니다. ${
        oldMemory.longTerm?.self ||
        "팀원들과 협력하여 좋은 아이디어를 만들어가고 있습니다."
      }`,
      actionPlan: {
        idea_generation:
          "전문성과 창의성을 활용하여 혁신적인 아이디어를 생성합니다.",
        idea_evaluation: "객관적이고 공정한 기준으로 아이디어를 평가합니다.",
        feedback: "건설적이고 구체적인 피드백을 제공합니다.",
        request: "필요한 도움을 명확하고 예의바르게 요청합니다.",
        response: "요청에 대해 신속하고 도움이 되는 응답을 제공합니다.",
      },
      relation: newRelations,
    },
    lastMemoryUpdate: new Date().toISOString(),
  };

  // 마이그레이션된 메모리 저장
  await saveNewAgentMemory(agentId, newMemory);
  console.log(`✅ 메모리 마이그레이션 완료: ${agentId}`);

  return newMemory;
}

/**
 * 메모리 업데이트 이벤트 트리거
 */
export async function triggerMemoryUpdate(
  agentId: string,
  eventType: "feedback" | "request" | "idea_evaluation",
  content: string,
  relatedAgentId?: string,
  teamId?: string
): Promise<void> {
  try {
    // 새로운 로그 생성
    const updateLog: MemoryUpdateLog = {
      timestamp: new Date().toISOString(),
      type: eventType,
      content,
      relatedAgentId,
    };

    // 최근 로그들 수집 (마지막 업데이트 이후)
    let memory = await getNewAgentMemory(agentId);
    if (!memory) {
      // 메모리가 없으면 생성
      if (!teamId) {
        console.error(`팀 ID가 없어 메모리 업데이트 불가: ${agentId}`);
        return;
      }
      
      const team = await getTeamById(teamId);
      if (team) {
        memory = await createNewAgentMemory(agentId, team);
      } else {
        console.error(`팀 정보를 찾을 수 없어 메모리 업데이트 불가: ${agentId}`);
        return;
      }
    }

    // 로그 수집 및 처리
    const updateLogs = [updateLog]; // 실제로는 마지막 업데이트 이후의 모든 로그 수집
    
    // 메모리 통합 프로세스 실행
    await processMemoryConsolidation(agentId, updateLogs, teamId);
    
  } catch (error) {
    console.error(`❌ 메모리 업데이트 트리거 실패: ${agentId}`, error);
  }
}

/**
 * 모든 에이전트의 메모리를 새로운 구조로 마이그레이션
 */
export async function migrateAllAgentsToNewMemory(
  teamId: string
): Promise<void> {
  try {
    console.log(`🔄 팀 ${teamId}의 모든 에이전트 메모리 마이그레이션 시작`);

    const team = await getTeamById(teamId);
    if (!team) {
      throw new Error(`팀을 찾을 수 없습니다: ${teamId}`);
    }

    const agentIds = team.members
      .filter((member) => !member.isUser && member.agentId)
      .map((member) => member.agentId!);

    console.log(`마이그레이션 대상 에이전트: ${agentIds.length}개`);

    for (const agentId of agentIds) {
      try {
        // 이미 새로운 구조가 있는지 확인
        const existingNew = await getNewAgentMemory(agentId);
        if (existingNew) {
          console.log(`✅ ${agentId}: 이미 새로운 구조 존재`);
          continue;
        }

        // 기존 메모리 마이그레이션
        const oldMemory = await getAgentMemory(agentId);
        if (oldMemory) {
          await migrateOldToNewMemory(agentId, oldMemory);
          console.log(`✅ ${agentId}: 마이그레이션 완료`);
        } else {
          // 메모리가 없으면 새로 생성
          const newMemory = await createNewAgentMemory(agentId, team);
          await saveNewAgentMemory(agentId, newMemory);
          console.log(`✅ ${agentId}: 새 메모리 생성 완료`);
        }
      } catch (error) {
        console.error(`❌ ${agentId} 마이그레이션 실패:`, error);
      }
    }

    console.log(`✅ 팀 ${teamId} 메모리 마이그레이션 완료`);
  } catch (error) {
    console.error(`❌ 팀 메모리 마이그레이션 실패:`, error);
    throw error;
  }
}

/**
 * Short-term memory에 액션 기록 추가
 */
export async function addActionToShortTermMemory(
  agentId: string,
  actionType: string,
  payload: any
): Promise<void> {
  let memory = await getNewAgentMemory(agentId);
  if (!memory) return;

  memory.shortTerm.actionHistory = {
    type: actionType,
    timestamp: new Date().toISOString(),
    payload,
  };

  await saveNewAgentMemory(agentId, memory);
}

/**
 * Short-term memory에 요청 추가
 */
export async function addRequestToShortTermMemory(
  agentId: string,
  request: {
    id: string;
    requesterId: string;
    requesterName: string;
    requestType: "generate_idea" | "evaluate_idea" | "give_feedback";
    content: string;
  }
): Promise<void> {
  let memory = await getNewAgentMemory(agentId);
  if (!memory) return;

  memory.shortTerm.requestList.push({
    ...request,
    timestamp: new Date().toISOString(),
  });

  await saveNewAgentMemory(agentId, memory);
}

/**
 * 현재 채팅 세션 시작
 */
export async function startChatSession(
  agentId: string,
  sessionId: string,
  targetAgentId: string,
  targetAgentName: string,
  chatType: "feedback_session" | "general_chat"
): Promise<void> {
  let memory = await getNewAgentMemory(agentId);
  if (!memory) return;

  memory.shortTerm.currentChat = {
    sessionId,
    targetAgentId,
    targetAgentName,
    chatType,
    messages: [],
  };

  await saveNewAgentMemory(agentId, memory);
}

/**
 * 채팅 세션 종료 시 Long-term memory로 이동
 */
export async function endChatSession(agentId: string): Promise<void> {
  let memory = await getNewAgentMemory(agentId);
  if (!memory || !memory.shortTerm.currentChat) return;

  const chat = memory.shortTerm.currentChat;

  // 채팅 내용을 Long-term memory의 relation에 추가
  if (memory.longTerm.relation[chat.targetAgentId]) {
    const relationKey = chat.targetAgentId;
    const chatSummary = `${chat.chatType} 세션: ${chat.messages.length}개 메시지 교환`;

    memory.longTerm.relation[relationKey].interactionHistory.push({
      timestamp: new Date().toISOString(),
      actionItem: chat.chatType,
      content: chatSummary,
    });
  }

  // Short-term에서 제거
  memory.shortTerm.currentChat = null;

  await saveNewAgentMemory(agentId, memory);
}
