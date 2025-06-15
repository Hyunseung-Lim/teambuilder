import {
  getAgentMemory,
  updateAgentMemory,
  getAgentById,
  getTeamById,
} from "./redis";
import {
  AgentMemory,
  ChatMessage,
  AIAgent,
  Team,
  RelationalMemory,
} from "./types";

// 메모리 이벤트 타입 정의
type MemoryEvent =
  | {
      type: "AUTONOMOUS_ACTION_COMPLETED";
      payload: { teamId: string; agentId: string; actionData: any };
    }
  | {
      type: "REQUEST_RECEIVED";
      payload: { teamId: string; agentId: string; requestData: any };
    }
  | {
      type: "REQUEST_ACTION_COMPLETED";
      payload: { teamId: string; agentId: string; actionData: any };
    }
  | {
      type: "FEEDBACK_RECEIVED";
      payload: {
        agentId: string;
        fromAgentName: string;
        content: string;
      };
    }
  | {
      type: "EVALUATION_RECEIVED";
      payload: {
        agentId: string;
        evaluatorName: string;
        ideaTitle: string;
        evaluationContent: string;
      };
    };

/**
 * 에이전트의 메모리에 이벤트를 기록하는 중앙 함수
 * @param event 기록할 이벤트
 */
export async function recordEvent(event: MemoryEvent): Promise<void> {
  let agentId: string;
  // 이벤트 타입에 따라 agentId를 다르게 설정
  if ("payload" in event && "agentId" in event.payload) {
    agentId = event.payload.agentId;
  } else {
    // 다른 이벤트 타입에 대한 agentId 설정 로직 추가
    console.error("Unsupported event structure:", event);
    return;
  }

  const memory = await getAgentMemory(agentId);
  if (!memory) {
    console.log(`⚠️ 에이전트 ${agentId}의 메모리가 없어 기록을 건너뜁니다.`);
    return;
  }

  switch (event.type) {
    case "AUTONOMOUS_ACTION_COMPLETED":
      await handleAutonomousAction(memory, event.payload.actionData);
      break;
    case "REQUEST_RECEIVED":
      await handleRequestReceived(memory, event.payload.requestData);
      break;
    case "REQUEST_ACTION_COMPLETED":
      await handleRequestActionCompleted(memory, event.payload.actionData);
      break;
    case "FEEDBACK_RECEIVED":
      await handleFeedbackReceived(memory, event.payload);
      break;
    case "EVALUATION_RECEIVED":
      await handleEvaluationReceived(memory, event.payload);
      break;
    default:
      console.warn(`알 수 없는 메모리 이벤트 타입:`, event);
      return;
  }

  await updateAgentMemory(agentId, memory);
  console.log(`✅ 에이전트 ${agentId} 메모리 업데이트 완료: ${event.type}`);
}

// --- 이벤트 핸들러 함수들 ---

async function handleAutonomousAction(memory: AgentMemory, actionData: any) {
  memory.shortTerm.lastAction = {
    type: actionData.action,
    timestamp: new Date().toISOString(),
    payload: actionData,
  };

  let reflectionContent = "";
  if (actionData.action === "autonomous_idea_generation") {
    reflectionContent = `스스로 계획하여 새로운 아이디어 "${actionData.generatedContent.object}"를 생성했다. 창의적인 사고가 중요하다는 것을 느꼈다.`;
  } else if (actionData.action === "autonomous_evaluation") {
    reflectionContent = `스스로 계획하여 "${actionData.targetIdea.content.object}" 아이디어를 평가했다. 객관적인 평가 능력이 중요하다.`;
  } else if (actionData.action === "autonomous_feedback") {
    reflectionContent = `스스로 계획하여 팀원에게 피드백을 제공했다. 건설적인 피드백이 팀에 도움이 된다.`;
  } else if (actionData.action === "autonomous_request") {
    reflectionContent = `스스로 계획하여 팀원에게 작업을 요청했다. 팀워크와 협력이 중요하다.`;
  }

  memory.longTerm.self.push({
    reflection: reflectionContent,
    triggeringEvent: actionData.action,
    timestamp: new Date().toISOString(),
  });
}

async function handleRequestReceived(memory: AgentMemory, requestData: any) {
  memory.shortTerm.lastAction = {
    type: "received_request",
    timestamp: new Date().toISOString(),
    payload: {
      requesterName: requestData.requesterName,
      requestType: requestData.type,
      message: requestData.payload?.message,
    },
  };

  const requesterKey = requestData.requesterName;
  const relation = await getOrCreateRelation(memory, requesterKey);

  relation.interactionHistory.push({
    action: "received_request",
    content: `${requestData.requesterName}로부터 ${
      requestData.type
    } 요청을 받음: "${requestData.payload?.message || ""}"`,
    timestamp: new Date().toISOString(),
  });
  relation.myOpinion += ` 최근에 ${requestData.type} 요청을 받았다.`;
}

async function handleRequestActionCompleted(
  memory: AgentMemory,
  actionData: any
) {
  memory.shortTerm.lastAction = {
    type: actionData.action,
    timestamp: new Date().toISOString(),
    payload: actionData,
  };

  const requesterKey = actionData.requesterName;
  const relation = await getOrCreateRelation(memory, requesterKey);

  let interactionContent = "";
  let opinionUpdate = "";

  if (actionData.action === "completed_evaluation_request") {
    interactionContent = `${actionData.requesterName}의 요청에 따라 "${actionData.targetIdea.content.object}" 아이디어를 평가 완료.`;
    opinionUpdate = ` 내가 평가한 결과를 잘 받아들이는 것 같다.`;
  } else if (actionData.action === "completed_generation_request") {
    interactionContent = `${actionData.requesterName}의 요청에 따라 새로운 아이디어 "${actionData.generatedContent.object}" 생성 완료`;
    opinionUpdate = ` 나에게 아이디어 생성을 요청하는 것으로 보아 내 창의성을 인정하는 것 같다.`;
  }

  relation.interactionHistory.push({
    action: actionData.action,
    content: interactionContent,
    timestamp: new Date().toISOString(),
  });

  relation.myOpinion += opinionUpdate;

  memory.longTerm.self.push({
    reflection: `${actionData.requesterName}의 요청을 처리했다. 팀워크가 중요하다는 것을 느꼈다.`,
    triggeringEvent: actionData.action,
    timestamp: new Date().toISOString(),
  });
}

async function handleFeedbackReceived(
  memory: AgentMemory,
  payload: { fromAgentName: string; content: string }
) {
  memory.shortTerm.lastAction = {
    type: "received_feedback",
    timestamp: new Date().toISOString(),
    payload: { from: payload.fromAgentName, content: payload.content },
  };

  const relation = await getOrCreateRelation(memory, payload.fromAgentName);

  relation.interactionHistory.push({
    action: "received_feedback",
    content: `${payload.fromAgentName}로부터 피드백을 받음: "${payload.content}"`,
    timestamp: new Date().toISOString(),
  });
  relation.myOpinion += ` 나에게 피드백을 주어서 고마웠다.`;

  memory.longTerm.self.push({
    reflection: `${payload.fromAgentName}로부터 피드백을 받았다. 다른 사람의 의견을 듣는 것이 중요하다.`,
    triggeringEvent: "received_feedback",
    timestamp: new Date().toISOString(),
  });
}

async function handleEvaluationReceived(
  memory: AgentMemory,
  payload: {
    evaluatorName: string;
    ideaTitle: string;
    evaluationContent: string;
  }
) {
  memory.shortTerm.lastAction = {
    type: "received_evaluation",
    timestamp: new Date().toISOString(),
    payload: payload,
  };

  const relation = await getOrCreateRelation(memory, payload.evaluatorName);

  relation.interactionHistory.push({
    action: "received_evaluation",
    content: `${payload.evaluatorName}이(가) 내 아이디어 "${payload.ideaTitle}"를 평가함`,
    timestamp: new Date().toISOString(),
  });

  relation.myOpinion += ` 내 아이디어를 평가해주어서 고마웠다.`;

  memory.longTerm.self.push({
    reflection: `내 아이디어 "${payload.ideaTitle}"가 ${payload.evaluatorName}에 의해 평가받았다. 다른 사람의 관점에서 내 아이디어를 보는 것이 도움이 된다.`,
    triggeringEvent: "received_evaluation",
    timestamp: new Date().toISOString(),
  });
}

/**
 * 관계가 존재하지 않으면 새로 생성하여 반환하는 헬퍼 함수
 */
async function getOrCreateRelation(
  memory: AgentMemory,
  relationName: string
): Promise<RelationalMemory> {
  if (memory.longTerm.relations[relationName]) {
    return memory.longTerm.relations[relationName];
  }

  console.log(`⚠️ ${relationName}와의 관계 정보가 없어서 기본 관계 생성`);

  // 에이전트 ID를 찾아야 함
  // 여기서는 name을 key로 사용하므로, name으로 ID를 찾는 로직이 필요.
  // 일단은 name을 id로 가정하고 진행.
  const newRelation: RelationalMemory = {
    agentInfo: {
      id: relationName, // 임시로 이름을 ID로 사용
      name: relationName,
      professional: "알 수 없음",
      personality: "알 수 없음",
      skills: "알 수 없음",
    },
    relationship: "FRIEND",
    interactionHistory: [],
    myOpinion: `${relationName}와(과) 처음 상호작용했다. 좋은 관계를 유지하고 싶다.`,
  };

  memory.longTerm.relations[relationName] = newRelation;
  return newRelation;
}

/**
 * 새로운 에이전트를 위한 초기 메모리 객체를 생성합니다.
 * @param agent - 메모리를 생성할 에이전트
 * @param team - 에이전트가 속한 팀
 * @returns 생성된 AgentMemory 객체
 */
export async function createAgentMemory(
  agent: AIAgent,
  team: Team
): Promise<AgentMemory> {
  const relations: Record<string, RelationalMemory> = {};

  for (const member of team.members) {
    // 자기 자신은 관계에 추가하지 않음
    if (member.agentId === agent.id) continue;

    // 사용자 또는 다른 에이전트 정보 가져오기
    const memberName = member.isUser ? "나" : ""; // isUser로 사용자 식별
    let memberAgent: AIAgent | undefined;

    if (!member.isUser && member.agentId) {
      memberAgent = await getAgentById(member.agentId);
    }

    const relationName = member.isUser
      ? "나"
      : memberAgent?.name || member.agentId || "알 수 없는 팀원";

    relations[relationName] = {
      agentInfo: {
        id: member.isUser
          ? "나"
          : memberAgent?.id || member.agentId || "unknown",
        name: relationName,
        professional: member.isUser
          ? "팀 리더"
          : memberAgent?.professional || "알 수 없음",
        personality: member.isUser
          ? "알 수 없음"
          : memberAgent?.personality || "알 수 없음",
        skills: member.isUser ? "리더십" : memberAgent?.skills || "알 수 없음",
      },
      relationship: "FRIEND", // 기본 관계
      interactionHistory: [],
      myOpinion: "아직 상호작용이 없어 의견이 없습니다.",
    };
  }

  return {
    agentId: agent.id,
    shortTerm: {
      lastAction: null,
      activeChat: null,
    },
    longTerm: {
      self: [],
      relations,
    },
  };
}
