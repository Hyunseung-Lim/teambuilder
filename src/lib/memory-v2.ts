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
  createKnowledgeAndActionPlanUpdatePrompt,
  createRelationOpinionUpdatePrompt,
} from "@/core/prompts";
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
      // Check if user is actually the leader
      const userRole = member.isLeader ? "팀 리더" : "팀원";
      const userSkills = member.isLeader ? "리더십" : "협업";
      otherAgentProfile = {
        id: "나",
        name: "나",
        professional: userRole,
        personality: "알 수 없음",
        skills: userSkills,
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

    // 관계 찾기 - 사용자의 경우 "나"와 실제 이름 모두 확인
    console.log(`🔍 ${agentProfile.name}와 ${otherAgentName} (${member.isUser ? '사용자' : 'AI'}) 간의 관계 찾는 중...`);
    console.log(`팀 관계 데이터:`, team.relationships);
    
    const relationship = team.relationships.find(
      (rel) => {
        if (member.isUser) {
          // 사용자의 경우 "나" 또는 실제 user 이름으로 관계 찾기
          const match = (
            (rel.from === agentProfile.name && (rel.to === "나" || rel.to === otherAgentName)) ||
            (rel.from === "나" && rel.to === agentProfile.name) ||
            (rel.from === otherAgentName && rel.to === agentProfile.name)
          );
          if (match) {
            console.log(`✅ 사용자 관계 발견: ${rel.from} → ${rel.to} (${rel.type})`);
          }
          return match;
        } else {
          // AI 에이전트의 경우 기존 로직
          const match = (
            (rel.from === agentProfile.name && rel.to === otherAgentName) ||
            (rel.from === otherAgentName && rel.to === agentProfile.name)
          );
          if (match) {
            console.log(`✅ AI 관계 발견: ${rel.from} → ${rel.to} (${rel.type})`);
          }
          return match;
        }
      }
    );
    
    if (!relationship) {
      console.log(`⚠️ ${agentProfile.name}와 ${otherAgentName} 간의 관계를 찾을 수 없음`);
    }

    const relationKey = member.isUser ? "나" : otherAgentId;
    relations[relationKey] = {
      agentInfo: otherAgentProfile,
      relationship: relationship ? relationship.type : (member.isUser ? "PEER" : "NULL"),
      interactionHistory: [],
      myOpinion: "No interactions yet to form an opinion.",
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
      knowledge: `I am participating in an ideation session focused on ${
        team.topic || "Carbon Emission Reduction"
      }. My goal is to generate creative and practical ideas while collaborating effectively with team members to achieve our shared objectives.`,
      actionPlan: {
        idea_generation:
          "Brainstorm innovative and feasible ideas related to the topic using my professional expertise and creative thinking methods.",
        idea_evaluation:
          "Evaluate ideas comprehensively considering creativity, feasibility, and potential impact using systematic criteria.",
        feedback:
          "Provide constructive and specific feedback to help improve ideas and enhance team collaboration.",
        request: "Make clear and polite requests for assistance or opinions when needed to advance team goals.",
        response: "Provide prompt and helpful responses to requests from team members using my expertise.",
        planning: "Develop systematic approaches for organizing my activities and setting priorities to contribute effectively to team goals.",
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

  const prompt = createKnowledgeAndActionPlanUpdatePrompt(
    agentProfile,
    memory,
    interactionSummary
  );

  try {
    const response = await getTextResponse(prompt);
    
    // console.log(`📝 ${agentProfile.name} 회고 원본 응답:`, response);
    
    let parsed;
    let doubleCleanedResponse = "";
    
    try {
      // JSON 마크다운 블록 제거 (```json ... ``` 형태)
      const cleanedResponse = response
        .replace(/```json\s*\n?/g, "")
        .replace(/```\s*$/g, "")
        .trim();
      
      parsed = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(`❌ ${agentProfile.name} JSON 파싱 실패:`, parseError);
      console.error(`원본 응답:`, response);
      
      // 두 번째 시도: 더 강력한 정리
      try {
        doubleCleanedResponse = response
          .replace(/```[\w]*\s*\n?/g, "")
          .replace(/```\s*/g, "")
          .replace(/^\s*\n/gm, "")
          .trim();
        
        parsed = JSON.parse(doubleCleanedResponse);
        console.log(`✅ ${agentProfile.name} 두 번째 시도로 JSON 파싱 성공`);
      } catch (secondParseError) {
        console.error(`❌ ${agentProfile.name} 두 번째 시도도 실패:`, secondParseError);
        console.error(`정리된 응답:`, doubleCleanedResponse);
        return;
      }
    }

    // console.log(`🔍 ${agentProfile.name} 회고 응답 파싱 결과:`, {
    //   hasKnowledge: !!parsed.knowledge,
    //   hasActionPlan: !!parsed.actionPlan,
    //   actionPlanKeys: parsed.actionPlan ? Object.keys(parsed.actionPlan) : [],
    //   fullParsedResponse: parsed
    // });

    if (parsed.knowledge) {
      // console.log(`📚 Knowledge 업데이트 전:`, memory.longTerm.knowledge?.substring(0, 100) + "...");
      
      // 기존 knowledge에 새로운 내용 추가 (덮어쓰기 대신)
      if (memory.longTerm.knowledge) {
        // 중복 방지를 위해 새로운 지식이 기존 지식과 다른 경우에만 추가
        const newKnowledge = parsed.knowledge.trim();
        if (!memory.longTerm.knowledge.includes(newKnowledge)) {
          const updatedKnowledge = memory.longTerm.knowledge + "\n\n" + newKnowledge;
          
          // Knowledge 길이 제한 (2500자 초과 시 앞부분 제거)
          if (updatedKnowledge.length > 2500) {
            const lines = updatedKnowledge.split('\n\n');
            // 마지막 몇 개 섹션만 유지
            const keptLines = lines.slice(-3); // 최신 3개 섹션 유지
            memory.longTerm.knowledge = keptLines.join('\n\n');
            console.log(`📚 Knowledge 길이 제한으로 이전 내용 일부 제거 (agentId: ${agentId})`);
          } else {
            memory.longTerm.knowledge = updatedKnowledge;
          }
        }
      } else {
        memory.longTerm.knowledge = parsed.knowledge;
      }
      
      // console.log(`📚 Knowledge 업데이트 후:`, memory.longTerm.knowledge?.substring(0, 100) + "...");
    }

    if (parsed.actionPlan) {
      // console.log(`📋 ActionPlan 업데이트 전:`, {
      //   idea_generation: memory.longTerm.actionPlan?.idea_generation?.substring(0, 50) + "...",
      //   idea_evaluation: memory.longTerm.actionPlan?.idea_evaluation?.substring(0, 50) + "...",
      //   feedback: memory.longTerm.actionPlan?.feedback?.substring(0, 50) + "...",
      //   request: memory.longTerm.actionPlan?.request?.substring(0, 50) + "...",
      //   response: memory.longTerm.actionPlan?.response?.substring(0, 50) + "...",
      //   planning: memory.longTerm.actionPlan?.planning?.substring(0, 50) + "..."
      // });
      
      // console.log(`📋 받은 ActionPlan 데이터:`, parsed.actionPlan);
      
      // 모든 actionPlan 필드를 업데이트하되, 기존 값을 유지하면서 새로운 값으로 덮어쓰기
      Object.assign(memory.longTerm.actionPlan, parsed.actionPlan);
      
      // console.log(`📋 ActionPlan 업데이트 후:`, {
      //   idea_generation: memory.longTerm.actionPlan?.idea_generation?.substring(0, 50) + "...",
      //   idea_evaluation: memory.longTerm.actionPlan?.idea_evaluation?.substring(0, 50) + "...",
      //   feedback: memory.longTerm.actionPlan?.feedback?.substring(0, 50) + "...",
      //   request: memory.longTerm.actionPlan?.request?.substring(0, 50) + "...",
      //   response: memory.longTerm.actionPlan?.response?.substring(0, 50) + "...",
      //   planning: memory.longTerm.actionPlan?.planning?.substring(0, 50) + "..."
      // });
    } else {
      console.warn(`⚠️ ${agentProfile.name} ActionPlan이 응답에 포함되지 않음!`);
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

    const prompt = createRelationOpinionUpdatePrompt(relation, interactionSummary);

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
          myOpinion: relation.myOpinion && !relation.myOpinion.includes("아직 상호작용이 없어 의견이 없습니다") && !relation.myOpinion.includes("No interactions yet to form an opinion.")
            ? (relation.myOpinion.includes("한글") || /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(relation.myOpinion)
                ? "Professional team member with demonstrated capabilities in their field."
                : relation.myOpinion)
            : "No interactions yet to form an opinion.",
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
      knowledge: `I am participating in an ideation session focused on team collaboration. My goal is to generate creative and practical ideas while leveraging my professional expertise in ${
        agentProfile.professional
      }. I am committed to effective collaboration with team members to achieve our shared objectives.`,
      actionPlan: {
        idea_generation:
          "Generate innovative ideas using my professional expertise and creative thinking methods.",
        idea_evaluation: "Evaluate ideas using objective and fair criteria based on my professional knowledge.",
        feedback: "Provide constructive and specific feedback to improve ideas and collaboration.",
        request: "Make clear and polite requests for necessary help when needed.",
        response: "Provide prompt and helpful responses using my professional expertise.",
        planning: "Plan my activities systematically to maximize effectiveness and contribute meaningfully to team objectives.",
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
    const chatSummary = `${chat.chatType} session: exchanged ${chat.messages.length} messages`;

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
