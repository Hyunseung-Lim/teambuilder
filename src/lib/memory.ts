import {
  getAgentMemory,
  updateAgentMemory,
  getAgentById,
  getTeamById,
  getChatHistory,
  getIdeas,
} from "./redis";
import {
  AgentMemory,
  ChatMessage,
  AIAgent,
  Team,
  RelationalMemory,
  Idea,
} from "./types";
import * as OpenAI from "./openai";
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

// 메모리 이벤트 타입 정의 - 더 포괄적으로 확장
type MemoryEvent =
  | {
      type: "IDEA_GENERATED";
      payload: {
        teamId: string;
        authorId: string;
        idea: Idea;
        isAutonomous?: boolean;
        requesterId?: string;
      };
    }
  | {
      type: "IDEA_EVALUATED";
      payload: {
        teamId: string;
        evaluatorId: string;
        ideaId: number;
        ideaAuthorId: string;
        evaluation: any;
        isAutonomous?: boolean;
        requesterId?: string;
      };
    }
  | {
      type: "FEEDBACK_GIVEN";
      payload: {
        teamId: string;
        feedbackerId: string;
        targetId: string;
        content: string;
        targetIdeaId?: number;
        isAutonomous?: boolean;
      };
    }
  | {
      type: "REQUEST_MADE";
      payload: {
        teamId: string;
        requesterId: string;
        targetId: string;
        requestType: string;
        content: string;
      };
    }
  | {
      type: "CHAT_MESSAGE_SENT";
      payload: {
        teamId: string;
        senderId: string;
        message: ChatMessage;
      };
    };

/**
 * 액션 완료 시 모든 관련 에이전트의 메모리를 업데이트하는 중앙 함수
 * @param event 발생한 이벤트
 */
export async function processMemoryUpdate(event: MemoryEvent): Promise<void> {
  try {
    console.log("📝 메모리 업데이트 시작:", event.type);

    if (event.type === "IDEA_GENERATED") {
      const { teamId, authorId, idea, isAutonomous } = event.payload;

      // 메모리 업데이트 시작 - reflecting 상태로 전환
      await updateAgentState(
        teamId,
        authorId,
        "reflecting",
        "아이디어 생성 후 자기 성찰 중"
      );

      // 에이전트 프로필 정보 가져오기
      const agentProfile = await getAgentById(authorId);
      if (!agentProfile) {
        console.error(`❌ 에이전트 ${authorId} 프로필을 찾을 수 없음`);
        return;
      }

      // 팀 정보 가져오기
      const team = await getTeamById(teamId);
      if (!team) {
        console.error(`❌ 팀 ${teamId}를 찾을 수 없음`);
        return;
      }

      // 기존 메모리 가져오기
      let agentMemory = await getAgentMemory(authorId);

      // 메모리가 없으면 초기화
      if (!agentMemory) {
        agentMemory = await createInitialMemory(authorId, team);
      }

      // 자기 성찰 생성
      const selfReflectionPrompt = `
당신은 ${agentProfile.name}입니다.

**당신의 정보:**
- 이름: ${agentProfile.name}
- 나이: ${agentProfile.age}세
- 성별: ${agentProfile.gender}
- 전문성: ${agentProfile.professional}
- 스킬: ${agentProfile.skills}
- 성격: ${agentProfile.personality || "정보 없음"}
- 가치관: ${agentProfile.value || "정보 없음"}
- 자율성: ${agentProfile.autonomy}/5

**방금 일어난 일:**
${
  isAutonomous
    ? `당신이 스스로 계획하여 새로운 아이디어를 생성했습니다: "${idea.content.object}"`
    : `팀원의 요청에 따라 새로운 아이디어를 생성했습니다: "${idea.content.object}"`
}

**팀 컨텍스트:**
- 팀 이름: ${team.teamName}
- 주제: ${team.topic || "Carbon Emission Reduction"}

**현재 자기 성찰 내용:**
${
  typeof agentMemory.longTerm.self === "string" &&
  agentMemory.longTerm.self.trim()
    ? agentMemory.longTerm.self
    : "아직 특별한 성찰 내용이 없습니다."
}

방금 아이디어를 생성한 경험을 바탕으로 자신에 대한 성찰을 업데이트해주세요. 
기존 성찰 내용을 바탕으로 하되, 새로운 경험이 당신에게 어떤 의미인지, 
당신의 성격이나 업무 스타일에 대해 새롭게 깨달은 점이 있는지 포함해주세요.

**응답 형식:**
간결하고 자연스러운 문체로 200자 이내로 작성해주세요.
`;

      try {
        const reflection = await getTextResponse(selfReflectionPrompt);
        if (reflection && reflection.trim()) {
          // 기존 호환성 로직 적용
          if (typeof agentMemory.longTerm.self === "string") {
            agentMemory.longTerm.self = reflection.trim();
          } else if (Array.isArray(agentMemory.longTerm.self)) {
            // 배열인 경우 가장 최근 reflection으로 변환
            agentMemory.longTerm.self = reflection.trim();
          } else {
            agentMemory.longTerm.self = reflection.trim();
          }

          console.log(
            `✅ ${agentProfile.name} 아이디어 생성 후 자기 성찰 업데이트 완료`
          );
        }
      } catch (error) {
        console.error("❌ 자기 성찰 생성 실패:", error);
      }

      // lastAction 업데이트
      agentMemory.shortTerm.lastAction = {
        type: "IDEA_GENERATED",
        timestamp: new Date().toISOString(),
        payload: {
          ideaId: idea.id,
          ideaContent: idea.content.object,
          isAutonomous,
        },
      };

      // 메모리 저장
      await updateAgentMemory(authorId, agentMemory);

      // reflecting 완료 후 idle 상태로 전환
      await updateAgentState(teamId, authorId, "idle");

      console.log(`✅ ${agentProfile.name} 아이디어 생성 메모리 업데이트 완료`);
      return; // 특정 이벤트 처리 완료
    }

    // 다른 이벤트 타입들은 기존 방식으로 처리
    // 팀 정보 조회
    const team = await getTeamById(event.payload.teamId);
    if (!team) {
      console.error(`팀을 찾을 수 없음: ${event.payload.teamId}`);
      return;
    }

    // 에이전트 ID 목록 추출 (사용자 제외)
    const agentIds = team.members
      .filter((member) => !member.isUser && member.agentId)
      .map((member) => member.agentId!);

    if (agentIds.length === 0) {
      console.log("업데이트할 에이전트가 없음");
      return;
    }

    console.log(`📝 ${agentIds.length}개 에이전트 메모리 업데이트 시작`);

    // 모든 에이전트의 메모리를 병렬로 업데이트
    const updateResults = await Promise.allSettled(
      agentIds.map((agentId) => updateAgentMemoryForEvent(agentId, event, team))
    );

    // 결과 확인
    const successful = updateResults.filter(
      (result) => result.status === "fulfilled"
    ).length;
    const failed = updateResults.filter(
      (result) => result.status === "rejected"
    ).length;

    console.log(
      `✅ 메모리 업데이트 완료: ${successful}성공, ${failed}실패 (총 ${agentIds.length}개)`
    );

    if (failed > 0) {
      const errors = updateResults
        .filter((result) => result.status === "rejected")
        .map((result) => (result as PromiseRejectedResult).reason);
      console.error("실패한 메모리 업데이트 오류들:", errors);
    }
  } catch (error) {
    console.error(`❌ 메모리 업데이트 실패: ${event.type}`, error);
  }
}

/**
 * 에이전트 상태를 업데이트하는 헬퍼 함수
 */
async function updateAgentState(
  teamId: string,
  agentId: string,
  state: "idle" | "plan" | "action" | "reflecting",
  taskDescription?: string
): Promise<void> {
  try {
    const response = await fetch(
      `${
        process.env.NEXTAUTH_URL || "http://localhost:3000"
      }/api/teams/${teamId}/agent-states`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId,
          currentState: state,
          taskType: state === "reflecting" ? "reflecting" : undefined,
          taskDescription:
            taskDescription ||
            (state === "reflecting"
              ? "경험을 바탕으로 자기 성찰 중"
              : undefined),
          estimatedDuration: state === "reflecting" ? 10 : undefined, // 10초 예상
        }),
      }
    );

    if (!response.ok) {
      console.error(`에이전트 ${agentId} 상태 업데이트 실패:`, response.status);
    }
  } catch (error) {
    console.error(`에이전트 ${agentId} 상태 업데이트 오류:`, error);
  }
}

/**
 * 개별 에이전트의 메모리를 이벤트에 따라 업데이트
 */
async function updateAgentMemoryForEvent(
  agentId: string,
  event: MemoryEvent,
  team: Team
): Promise<void> {
  try {
    console.log(
      `🔧 에이전트 ${agentId} 메모리 업데이트 시작 (이벤트: ${event.type})`
    );

    // 회고 상태로 변경
    const teamId = (event.payload as any).teamId || team.id;
    await updateAgentState(teamId, agentId, "reflecting");

    // 메모리 조회 또는 생성
    let memory = await getAgentMemory(agentId);
    if (!memory) {
      console.log(
        `💡 에이전트 ${agentId}의 메모리가 실제로 없음 - 초기화 시작`
      );
      memory = await createInitialMemory(agentId, team);
      console.log(`✅ 초기 메모리 생성 완료: ${agentId}`);
    } else {
      console.log(`✅ 에이전트 ${agentId}의 기존 메모리 발견 - 업데이트 진행`);
      console.log(
        `📊 메모리 상태: self="${
          typeof memory.longTerm.self === "string"
            ? memory.longTerm.self.substring(0, 50)
            : JSON.stringify(memory.longTerm.self).substring(0, 50)
        }...", relations=${Object.keys(memory.longTerm.relations).length}개`
      );

      // 기존 배열 형태의 self를 문자열로 마이그레이션
      if (Array.isArray(memory.longTerm.self)) {
        console.log(
          `🔄 에이전트 ${agentId} self 메모리 마이그레이션: 배열 -> 문자열`
        );
        const reflections = memory.longTerm.self as any[];
        if (reflections.length > 0) {
          // 가장 최근 reflection을 문자열로 사용
          const latestReflection = reflections[reflections.length - 1];
          memory.longTerm.self =
            typeof latestReflection === "string"
              ? latestReflection
              : latestReflection.reflection ||
                "팀에서 활동하며 다양한 경험을 쌓고 있습니다.";
        } else {
          memory.longTerm.self =
            "팀에 새로 합류했습니다. 앞으로 팀원들과 좋은 관계를 맺고 협력하여 좋은 결과를 만들어가고 싶습니다.";
        }
        console.log(
          `✅ 마이그레이션 완료: "${memory.longTerm.self.substring(0, 50)}..."`
        );
      }
    }

    // 이벤트 타입에 따른 메모리 업데이트
    try {
      const eventType = event.type;
      switch (eventType) {
        case "IDEA_GENERATED":
          await updateMemoryForIdeaGeneration(memory, event.payload, agentId);
          break;
        case "IDEA_EVALUATED":
          await updateMemoryForIdeaEvaluation(memory, event.payload, agentId);
          break;
        case "FEEDBACK_GIVEN":
          await updateMemoryForFeedback(memory, event.payload, agentId);
          break;
        case "REQUEST_MADE":
          await updateMemoryForRequest(memory, event.payload, agentId);
          break;
        case "CHAT_MESSAGE_SENT":
          await updateMemoryForChatMessage(memory, event.payload, agentId);
          break;
        default:
          console.warn(`알 수 없는 이벤트 타입: ${eventType}`);
          // 회고 상태 해제 후 종료
          await updateAgentState(teamId, agentId, "idle");
          return;
      }
      console.log(`✅ ${agentId} 이벤트 처리 완료: ${eventType}`);
    } catch (eventError) {
      console.error(
        `❌ ${agentId} 이벤트 처리 실패 (${event.type}):`,
        eventError
      );
      // 이벤트 처리 실패해도 메모리는 저장 시도
    }

    // Long-term memory 압축 및 요약 (필요시)
    try {
      const beforeRelationsCount = Object.values(
        memory.longTerm.relations
      ).reduce((sum, rel) => sum + rel.interactionHistory.length, 0);

      memory = await compressLongTermMemory(memory);

      const afterRelationsCount = Object.values(
        memory.longTerm.relations
      ).reduce((sum, rel) => sum + rel.interactionHistory.length, 0);

      if (beforeRelationsCount !== afterRelationsCount) {
        console.log(
          `🗜️ ${agentId} 메모리 압축 수행: relations ${beforeRelationsCount}->${afterRelationsCount}`
        );
      } else {
        console.log(`✅ ${agentId} 메모리 압축 불필요 (크기 적절)`);
      }
    } catch (compressionError) {
      console.error(`❌ ${agentId} 메모리 압축 실패:`, compressionError);
      // 압축 실패해도 원본 메모리는 저장
    }

    // 메모리 저장
    await updateAgentMemory(agentId, memory);
    console.log(`✅ 에이전트 ${agentId} 메모리 업데이트 완료`);

    // 회고 완료 후 idle 상태로 복귀
    await updateAgentState(teamId, agentId, "idle");
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 메모리 업데이트 실패:`, error);

    // 오류 발생 시에도 idle 상태로 복귀
    try {
      const teamId = (event.payload as any).teamId || team.id;
      await updateAgentState(teamId, agentId, "idle");
    } catch (stateError) {
      console.error(`❌ 에이전트 ${agentId} 상태 복구 실패:`, stateError);
    }

    throw error; // 상위 함수에서 에러 처리하도록
  }
}

/**
 * 아이디어 생성에 대한 메모리 업데이트
 */
async function updateMemoryForIdeaGeneration(
  memory: AgentMemory,
  payload: any,
  currentAgentId: string
): Promise<void> {
  const { authorId, idea, isAutonomous, requesterId } = payload;

  // Short-term memory 업데이트
  if (currentAgentId === authorId) {
    // 아이디어를 생성한 에이전트
    memory.shortTerm.lastAction = {
      type: isAutonomous
        ? "autonomous_idea_generation"
        : "requested_idea_generation",
      timestamp: new Date().toISOString(),
      payload: {
        ideaId: idea.id,
        ideaTitle: idea.content.object,
        requesterId: requesterId || null,
      },
    };

    // Long-term self reflection은 요청받았을 때만 업데이트
    if (!isAutonomous && requesterId) {
      const requesterName = await getAgentNameById(requesterId);
      const newReflection = await generateSelfReflection(
        memory.longTerm.self,
        `${requesterName}의 요청에 따라 "${idea.content.object}"라는 아이디어를 생성했습니다. 다른 팀원의 요청에 부응하여 도움을 줄 수 있어서 뿌듯했습니다. 앞으로도 팀워크를 중시하며 협력적인 자세를 유지하고 싶습니다.`,
        "requested_idea_generation"
      );
      memory.longTerm.self = newReflection;
    }
  } else {
    // 다른 에이전트가 아이디어를 생성한 경우
    const authorName = await getAgentNameById(authorId);

    // 관계 메모리 업데이트
    const relationKey = getRelationKey(authorId);
    if (memory.longTerm.relations[relationKey]) {
      memory.longTerm.relations[relationKey].interactionHistory.push({
        action: "generated_idea",
        content: `${authorName}이 "${idea.content.object}"라는 아이디어를 생성했다.`,
        timestamp: new Date().toISOString(),
      });

      // LLM을 사용하여 관계에 대한 의견 업데이트
      await updateRelationOpinion(
        memory.longTerm.relations[relationKey],
        "아이디어 생성을 목격"
      );
    }
  }
}

/**
 * 아이디어 평가에 대한 메모리 업데이트
 */
async function updateMemoryForIdeaEvaluation(
  memory: AgentMemory,
  payload: any,
  currentAgentId: string
): Promise<void> {
  const {
    evaluatorId,
    ideaId,
    ideaAuthorId,
    evaluation,
    isAutonomous,
    requesterId,
  } = payload;

  if (currentAgentId === evaluatorId) {
    // 평가를 한 에이전트
    memory.shortTerm.lastAction = {
      type: isAutonomous ? "autonomous_evaluation" : "requested_evaluation",
      timestamp: new Date().toISOString(),
      payload: {
        ideaId,
        authorId: ideaAuthorId,
        scores: evaluation.scores,
        requesterId: requesterId || null,
      },
    };

    // 요청받아서 평가한 경우에만 self reflection 업데이트
    if (!isAutonomous && requesterId) {
      const requesterName = await getAgentNameById(requesterId);
      const newReflection = await generateSelfReflection(
        memory.longTerm.self,
        `${requesterName}의 요청에 따라 아이디어를 평가했습니다. 객관적이고 공정한 평가를 하려고 노력했으며, 건설적인 평가로 팀에 도움이 되고자 했습니다. 다른 사람의 요청에 성실히 응답하는 것이 팀워크의 기본이라고 생각합니다.`,
        "requested_evaluation"
      );
      memory.longTerm.self = newReflection;
    }

    // 평가받은 사람과의 관계 업데이트
    const relationKey = getRelationKey(ideaAuthorId);
    if (memory.longTerm.relations[relationKey]) {
      memory.longTerm.relations[relationKey].interactionHistory.push({
        action: "evaluated_their_idea",
        content: `그들의 아이디어를 평가함. 점수: 통찰력 ${evaluation.scores.insightful}/5`,
        timestamp: new Date().toISOString(),
      });

      await updateRelationOpinion(
        memory.longTerm.relations[relationKey],
        "아이디어 평가 제공"
      );
    }
  } else if (currentAgentId === ideaAuthorId) {
    // 평가를 받은 에이전트 - self reflection 업데이트
    const evaluatorName = await getAgentNameById(evaluatorId);

    memory.shortTerm.lastAction = {
      type: "received_evaluation",
      timestamp: new Date().toISOString(),
      payload: {
        evaluatorId,
        ideaId,
        scores: evaluation.scores,
      },
    };

    // 평가를 받았을 때 self reflection 업데이트
    const newReflection = await generateSelfReflection(
      memory.longTerm.self,
      `내 아이디어가 ${evaluatorName}에 의해 평가받았습니다. 다른 사람의 관점에서 보는 피드백이 도움이 됩니다. 앞으로 더 나은 아이디어를 만들기 위해 받은 평가를 깊이 성찰하고 개선점을 찾아보겠습니다.`,
      "received_evaluation"
    );
    memory.longTerm.self = newReflection;

    // 평가자와의 관계 업데이트
    const relationKey = getRelationKey(evaluatorId);
    if (memory.longTerm.relations[relationKey]) {
      memory.longTerm.relations[relationKey].interactionHistory.push({
        action: "received_evaluation_from",
        content: `내 아이디어를 평가해줌. 통찰력 점수: ${evaluation.scores.insightful}/5`,
        timestamp: new Date().toISOString(),
      });

      await updateRelationOpinion(
        memory.longTerm.relations[relationKey],
        "평가 받음"
      );
    }
  } else {
    // 제3자가 평가를 관찰한 경우
    const evaluatorName = await getAgentNameById(evaluatorId);
    const authorName = await getAgentNameById(ideaAuthorId);

    // 두 관계 모두 업데이트 (있다면)
    const evaluatorKey = getRelationKey(evaluatorId);
    const authorKey = getRelationKey(ideaAuthorId);

    if (memory.longTerm.relations[evaluatorKey]) {
      memory.longTerm.relations[evaluatorKey].interactionHistory.push({
        action: "observed_evaluation_by",
        content: `${evaluatorName}이 ${authorName}의 아이디어를 평가하는 것을 목격`,
        timestamp: new Date().toISOString(),
      });
    }

    if (memory.longTerm.relations[authorKey]) {
      memory.longTerm.relations[authorKey].interactionHistory.push({
        action: "observed_evaluation_of",
        content: `${authorName}의 아이디어가 ${evaluatorName}에 의해 평가받는 것을 목격`,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * 피드백에 대한 메모리 업데이트
 */
async function updateMemoryForFeedback(
  memory: AgentMemory,
  payload: any,
  currentAgentId: string
): Promise<void> {
  const { feedbackerId, targetId, content, targetIdeaId, isAutonomous } =
    payload;

  if (currentAgentId === feedbackerId) {
    // 피드백을 한 에이전트
    memory.shortTerm.lastAction = {
      type: isAutonomous ? "autonomous_feedback" : "requested_feedback",
      timestamp: new Date().toISOString(),
      payload: {
        targetId,
        content,
        targetIdeaId,
      },
    };

    // 자율적이지 않은 피드백(요청받은 피드백)인 경우에만 self reflection 업데이트
    if (!isAutonomous) {
      const targetName = await getAgentNameById(targetId);
      const newReflection = await generateSelfReflection(
        memory.longTerm.self,
        `${targetName}에게 피드백을 제공했습니다. 건설적인 피드백으로 팀에 도움이 되고자 했습니다. 다른 사람의 성장을 돕는 것이 팀워크의 중요한 부분이라고 생각하며, 앞으로도 진심어린 조언을 아끼지 않겠습니다.`,
        "gave_feedback"
      );
      memory.longTerm.self = newReflection;
    }
  } else if (currentAgentId === targetId) {
    // 피드백을 받은 에이전트 - self reflection 업데이트
    const feedbackerName = await getAgentNameById(feedbackerId);

    memory.shortTerm.lastAction = {
      type: "received_feedback",
      timestamp: new Date().toISOString(),
      payload: {
        feedbackerId,
        content,
        targetIdeaId,
      },
    };

    // 피드백을 받았을 때 self reflection 업데이트
    const newReflection = await generateSelfReflection(
      memory.longTerm.self,
      `${feedbackerName}로부터 피드백을 받았습니다. 다른 사람의 관점과 조언이 매우 도움이 됩니다. 받은 피드백을 겸허히 받아들이고 성장의 기회로 삼아 더 나은 모습이 되도록 노력하겠습니다.`,
      "received_feedback"
    );
    memory.longTerm.self = newReflection;
  }
}

/**
 * 요청에 대한 메모리 업데이트
 */
async function updateMemoryForRequest(
  memory: AgentMemory,
  payload: any,
  currentAgentId: string
): Promise<void> {
  const { requesterId, targetId, requestType, content } = payload;

  if (currentAgentId === requesterId) {
    // 요청을 한 에이전트
    const targetName = await getAgentNameById(targetId);

    memory.shortTerm.lastAction = {
      type: "made_request",
      timestamp: new Date().toISOString(),
      payload: {
        targetId,
        requestType,
        content,
      },
    };

    // 요청을 했을 때는 self reflection 업데이트하지 않음 (응답을 받았을 때만)
  } else if (currentAgentId === targetId) {
    // 요청을 받은 에이전트 - self reflection 업데이트
    const requesterName = await getAgentNameById(requesterId);

    memory.shortTerm.lastAction = {
      type: "received_request",
      timestamp: new Date().toISOString(),
      payload: {
        requesterId,
        requestType,
        content,
      },
    };

    // 요청을 받았을 때 self reflection 업데이트
    const newReflection = await generateSelfReflection(
      memory.longTerm.self,
      `${requesterName}로부터 ${requestType} 요청을 받았습니다. 팀원의 요청에 성실히 응답하는 것이 중요하다고 생각합니다. 서로 도움을 주고받는 협력적인 관계를 통해 더 좋은 결과를 만들어가고 싶습니다.`,
      "received_request"
    );
    memory.longTerm.self = newReflection;
  }
}

/**
 * 채팅 메시지에 대한 메모리 업데이트
 */
async function updateMemoryForChatMessage(
  memory: AgentMemory,
  payload: any,
  currentAgentId: string
): Promise<void> {
  const { senderId, message } = payload;

  if (currentAgentId !== senderId) {
    // 다른 사람의 메시지를 관찰
    memory.shortTerm.activeChat = {
      targetAgentId: senderId,
      messages: [message], // 최근 메시지만 저장
    };
  }
}

/**
 * LLM을 사용하여 관계에 대한 의견을 업데이트
 */
async function updateRelationOpinion(
  relation: RelationalMemory,
  context: string
): Promise<void> {
  try {
    const recentInteractions = relation.interactionHistory.slice(-5); // 최근 5개 상호작용

    if (recentInteractions.length === 0) {
      console.log("상호작용 기록이 없어 관계 의견 업데이트 생략");
      return;
    }

    const prompt = `
당신은 팀 내 다른 멤버에 대한 의견을 형성하는 AI 에이전트입니다.

대상 에이전트 정보:
- 이름: ${relation.agentInfo.name}
- 직업: ${relation.agentInfo.professional}
- 관계: ${relation.relationship}

최근 상호작용들:
${recentInteractions
  .map(
    (interaction) =>
      `- ${interaction.action}: ${interaction.content} (${interaction.timestamp})`
  )
  .join("\n")}

현재 상황: ${context}

기존 의견: ${relation.myOpinion}

위 정보를 바탕으로 이 사람에 대한 새로운 의견을 1-2문장으로 작성해주세요. 
기존 의견을 참고하되, 최근 상호작용을 반영하여 업데이트해주세요.
JSON 형식이 아닌 일반 텍스트로만 응답해주세요.
`;

    const response = await getTextResponse(prompt);
    if (response && response.trim()) {
      relation.myOpinion = response.trim();
      console.log(`✅ 관계 의견 업데이트 성공: ${relation.agentInfo.name}`);
    } else {
      console.log("❌ LLM 응답이 비어있어 관계 의견 업데이트 생략");
    }
  } catch (error) {
    console.error("관계 의견 업데이트 실패:", error);
    // 실패해도 기존 의견 유지하며 계속 진행
  }
}

/**
 * 반성적 자기 성찰을 생성하는 함수
 */
async function generateSelfReflection(
  currentReflection: string,
  newExperience: string,
  triggeringEvent: string
): Promise<string> {
  try {
    const prompt = `
당신은 팀에서 활동하는 AI 에이전트입니다. 새로운 경험을 바탕으로 자기 성찰을 업데이트해주세요.

기존 성찰 내용:
${currentReflection || "아직 특별한 성찰 내용이 없습니다."}

새로운 경험:
${newExperience}

발생 상황: ${triggeringEvent}

위 내용을 바탕으로 다음 가이드라인에 따라 성찰을 작성해주세요:

1. **반성적 태도**: 자신의 행동과 감정을 깊이 돌아보세요
2. **학습과 성장**: 이 경험에서 무엇을 배웠는지 성찰하세요  
3. **미래 지향적**: 앞으로 어떻게 개선하고 발전할지 다짐하세요
4. **팀워크 중시**: 팀원들과의 관계와 협력에 대해 생각해보세요
5. **겸손한 자세**: 자만하지 않고 계속 배우려는 마음가짐을 보이세요

기존 성찰 내용이 있다면 이를 발전시키고, 새로운 경험을 통합하여 더 깊이 있는 성찰로 업데이트해주세요.
200-300자 정도의 한 문단으로 작성해주세요.
`;

    const response = await getTextResponse(prompt);
    if (response && response.trim()) {
      return response.trim();
    } else {
      // LLM 실패 시 기본 성찰 반환
      return currentReflection || newExperience;
    }
  } catch (error) {
    console.error("Self reflection 생성 실패:", error);
    // 실패 시 기존 성찰 유지하거나 새 경험으로 대체
    return currentReflection || newExperience;
  }
}

/**
 * Long-term memory를 압축하고 요약
 */
async function compressLongTermMemory(
  memory: AgentMemory
): Promise<AgentMemory> {
  // Self reflection은 이미 단일 문자열이므로 압축 불필요
  console.log(
    `✅ ${memory.agentId} Self reflection은 단일 문자열로 압축 불필요`
  );

  // 관계별 상호작용 히스토리 압축
  for (const [relationKey, relation] of Object.entries(
    memory.longTerm.relations
  )) {
    if (relation.interactionHistory.length > 30) {
      try {
        console.log(
          `🗜️ ${relationKey} 관계 히스토리 압축 시작: ${relation.interactionHistory.length}개`
        );

        const oldInteractions = relation.interactionHistory.slice(0, -10);
        const recentInteractions = relation.interactionHistory.slice(-10);

        const prompt = `
다음은 ${relation.agentInfo.name}과의 상호작용 기록들입니다. 
이를 5-7개의 핵심 상호작용 요약으로 압축해주세요.

상호작용 기록들:
${oldInteractions.map((i) => `- ${i.action}: ${i.content}`).join("\n")}

각 요약은 다음 형태로 작성해주세요:
{
  "action": "compressed_summary",
  "content": "요약된 상호작용 내용",
  "timestamp": "${new Date().toISOString()}"
}

JSON 배열로 응답해주세요.
`;

        const response = await getTextResponse(prompt);
        if (response && response.trim()) {
          try {
            // JSON 파싱 시도
            const cleanedResponse = response
              .replace(/```json\n?|```/g, "")
              .trim();
            const parsedResponse = JSON.parse(cleanedResponse);
            if (Array.isArray(parsedResponse) && parsedResponse.length > 0) {
              memory.longTerm.relations[relationKey].interactionHistory = [
                ...parsedResponse,
                ...recentInteractions,
              ];
              console.log(
                `✅ ${relationKey} 관계 히스토리 압축 완료: ${oldInteractions.length} -> ${parsedResponse.length}`
              );
            } else {
              console.log(
                `❌ ${relationKey} 관계 히스토리 압축 실패 - 원본 유지`
              );
            }
          } catch (parseError) {
            console.error(`JSON 파싱 실패 for ${relationKey}:`, parseError);
            console.log(
              `❌ ${relationKey} 관계 히스토리 압축 실패 - 원본 유지`
            );
          }
        } else {
          console.log(`❌ ${relationKey} 관계 히스토리 압축 실패 - 원본 유지`);
        }
      } catch (error) {
        console.error(`관계 ${relationKey} 상호작용 압축 실패:`, error);
        // 실패 시 원본 유지
      }
    }
  }

  return memory;
}

/**
 * 초기 메모리 생성
 */
async function createInitialMemory(
  agentId: string,
  team: Team
): Promise<AgentMemory> {
  console.log(`🧠 에이전트 ${agentId} 초기 메모리 생성`);

  const agentProfile = await getAgentById(agentId);
  if (!agentProfile) {
    throw new Error(`에이전트 프로필을 찾을 수 없습니다: ${agentId}`);
  }

  const relations: Record<string, RelationalMemory> = {};

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
      lastAction: null,
      activeChat: null,
    },
    longTerm: {
      self: "팀에 새로 합류했습니다. 앞으로 팀원들과 좋은 관계를 맺고 협력하여 좋은 결과를 만들어가고 싶습니다.", // 초기 성찰
      relations,
    },
  };
}

/**
 * 에이전트 이름 조회 헬퍼
 */
async function getAgentNameById(agentId: string): Promise<string> {
  if (agentId === "나") return "나";

  const agent = await getAgentById(agentId);
  return agent?.name || `에이전트 ${agentId}`;
}

/**
 * 관계 키 생성 헬퍼
 */
function getRelationKey(agentId: string): string {
  return agentId === "나" ? "나" : agentId;
}

// 기존 함수들은 호환성을 위해 유지하되 새 시스템으로 리다이렉트
export async function recordEvent(event: any): Promise<void> {
  console.log("⚠️ 구 recordEvent 사용됨. 새 시스템으로 마이그레이션 필요");
  // 기존 이벤트를 새 형식으로 변환하여 처리할 수 있음
}

export async function createAgentMemory(
  agent: AIAgent,
  team: Team
): Promise<AgentMemory> {
  return createInitialMemory(agent.id, team);
}
