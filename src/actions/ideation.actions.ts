"use server";

import {
  getAgentById,
  getIdeas,
  addIdea,
  addChatMessage,
  getTeamById,
  getUserByEmail,
  getUserAgents,
  updateIdea,
} from "@/lib/redis";
import {
  preIdeationAction,
  executeIdeationAction,
  preEvaluationAction,
  executeEvaluationAction,
  generateAlreadyEvaluatedResponse,
} from "@/lib/openai";
import { Idea } from "@/lib/types";
import { getServerSession } from "next-auth";

export async function generateIdeaViaRequest({
  teamId,
  agentId,
  requestMessage,
  topic,
}: {
  teamId: string;
  agentId: string;
  requestMessage: string;
  topic?: string;
}) {
  try {
    const session = await getServerSession();
    const [agentProfile, allIdeas, team] = await Promise.all([
      getAgentById(agentId),
      getIdeas(teamId) as Promise<Idea[]>,
      getTeamById(teamId),
    ]);

    const user = session?.user?.email
      ? await getUserByEmail(session.user.email)
      : null;
    const allUserAgents = user ? await getUserAgents(user.id) : [];

    const agentNameMap = new Map<string, string>();
    allUserAgents.forEach((agent) => agentNameMap.set(agent.id, agent.name));

    const getAuthorNameForPrompt = (authorId: string): string => {
      if (authorId === "나" || authorId === session?.user?.email) return "나";
      return agentNameMap.get(authorId) || `에이전트`;
    };

    const sortedIdeas = [...allIdeas].sort((a, b) => a.id - b.id);
    const simplifiedIdeaList = sortedIdeas.map((idea, index) => ({
      ideaNumber: index + 1,
      authorName: getAuthorNameForPrompt(idea.author),
      object: idea.content.object,
      function: idea.content.function,
    }));

    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: { content: "요청을 받아 아이디어를 생성하고 있습니다..." },
    });

    const preIdeationResult = await preIdeationAction(
      requestMessage,
      simplifiedIdeaList,
      agentProfile
    );
    const { decision, referenceIdea, ideationStrategy } = preIdeationResult;

    let finalReferenceIdea = null;
    if (decision === "Update" && referenceIdea?.ideaNumber) {
      finalReferenceIdea = sortedIdeas[referenceIdea.ideaNumber - 1];
    }

    const generatedContent = await executeIdeationAction(
      decision,
      ideationStrategy,
      topic || "Carbon Emission Reduction",
      finalReferenceIdea,
      agentProfile
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

    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: { content: "요청에 따라 새로운 아이디어를 생성했습니다" },
    });

    return { success: true, idea: newIdea };
  } catch (error) {
    console.error(
      `Error during 'generate_via_request' for agent ${agentId}:`,
      error
    );
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: { content: "아이디어 생성 중 오류가 발생했습니다." },
    });
    return {
      success: false,
      error: "요청 기반 아이디어 생성에 실패했습니다.",
    };
  }
}

export async function evaluateIdeaViaRequest({
  teamId,
  agentId,
  requestMessage,
  requesterName,
}: {
  teamId: string;
  agentId: string;
  requestMessage: string;
  requesterName?: string;
}) {
  try {
    const session = await getServerSession();
    const [agentProfile, allIdeas] = await Promise.all([
      getAgentById(agentId),
      getIdeas(teamId) as Promise<Idea[]>,
    ]);

    if (allIdeas.length === 0) {
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: { content: "평가할 아이디어가 없습니다." },
      });
      return {
        success: false,
        error: "평가할 아이디어가 없습니다.",
      };
    }

    // 1단계: 평가 시작 알림
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: { content: "요청을 받아 아이디어를 평가하고 있습니다..." },
    });

    // 1단계: 어떤 아이디어를 평가할지 선택하고 전략 결정
    const preEvaluationResult = await preEvaluationAction(
      requestMessage,
      allIdeas,
      agentProfile
    );
    const { selectedIdea, evaluationStrategy } = preEvaluationResult;

    // 선택된 아이디어 찾기
    const targetIdea = allIdeas.find(
      (idea, index) => index + 1 === selectedIdea.ideaNumber
    );

    if (!targetIdea) {
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: { content: "선택된 아이디어를 찾을 수 없습니다." },
      });
      return {
        success: false,
        error: "선택된 아이디어를 찾을 수 없습니다.",
      };
    }

    // 이미 평가한 적이 있는지 확인
    const previousEvaluation = targetIdea.evaluations.find(
      (evaluation) => evaluation.evaluator === agentId
    );

    if (previousEvaluation) {
      // 이미 평가한 경우, 자연스러운 응답 생성
      const user = session?.user?.email
        ? await getUserByEmail(session.user.email)
        : null;
      const allUserAgents = user ? await getUserAgents(user.id) : [];

      const agentNameMap = new Map<string, string>();
      allUserAgents.forEach((agent) => agentNameMap.set(agent.id, agent.name));

      // 요청자 이름 처리 (사용자인 경우 "나"로 표시)
      const displayRequesterName =
        requesterName === "나" || requesterName === session?.user?.email
          ? "나"
          : agentNameMap.get(requesterName || "") || requesterName || "팀원";

      // 팀 관계 정보 가져오기
      const team = await getTeamById(teamId);
      let relationshipType = null;

      if (team && requesterName) {
        // 요청자 ID 정규화
        const normalizedRequesterId =
          requesterName === "나" || requesterName === session?.user?.email
            ? "나"
            : requesterName;

        // 에이전트와 요청자 간의 관계 찾기
        const relationship = team.relationships.find(
          (rel) =>
            (rel.from === agentId && rel.to === normalizedRequesterId) ||
            (rel.from === normalizedRequesterId && rel.to === agentId)
        );

        if (relationship) {
          relationshipType = relationship.type;
        }
      }

      try {
        const responseData = await generateAlreadyEvaluatedResponse(
          displayRequesterName,
          targetIdea,
          previousEvaluation,
          relationshipType,
          agentProfile
        );

        // 생성된 응답을 채팅 메시지로 전송
        await addChatMessage(teamId, {
          sender: agentId,
          type: "feedback",
          payload: {
            type: "feedback",
            content: responseData.response,
          },
        });

        return {
          success: true,
          message: "이미 평가한 아이디어에 대한 응답을 전송했습니다.",
        };
      } catch (error) {
        console.error("중복 평가 응답 생성 실패:", error);

        // 기본 응답으로 대체
        await addChatMessage(teamId, {
          sender: agentId,
          type: "feedback",
          payload: {
            type: "feedback",
            content:
              "죄송하지만 해당 아이디어는 이미 평가를 완료했습니다. 이전 평가를 참고해 주세요.",
          },
        });

        return {
          success: true,
          message: "이미 평가한 아이디어에 대한 기본 응답을 전송했습니다.",
        };
      }
    }

    // 2단계: 실제 평가 수행
    const evaluationResult = await executeEvaluationAction(
      targetIdea,
      evaluationStrategy,
      agentProfile
    );

    // 평가 결과를 아이디어에 추가
    const evaluation = {
      evaluator: agentId,
      scores: {
        insightful: evaluationResult.scores.insightful,
        actionable: evaluationResult.scores.actionable,
        relevance: evaluationResult.scores.relevance,
      },
      comment: evaluationResult.comment,
      timestamp: new Date().toISOString(),
    };

    // 아이디어에 평가 추가
    const updatedEvaluations = [...targetIdea.evaluations, evaluation];

    // Redis에서 아이디어 업데이트
    await updateIdea(teamId, targetIdea.id, {
      evaluations: updatedEvaluations,
    });

    // 약간의 지연을 두어 Redis 업데이트가 완전히 반영되도록 함
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 평가 완료 알림
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: { content: "요청에 따라 아이디어 평가를 완료했습니다" },
    });

    return { success: true, evaluation };
  } catch (error) {
    console.error(
      `Error during 'evaluate_via_request' for agent ${agentId}:`,
      error
    );
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: { content: "아이디어 평가 중 오류가 발생했습니다." },
    });
    return {
      success: false,
      error: "요청 기반 아이디어 평가에 실패했습니다.",
    };
  }
}
