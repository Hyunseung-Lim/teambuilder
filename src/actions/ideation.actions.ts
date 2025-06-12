"use server";

import {
  getAgentById,
  getIdeas,
  addIdea,
  addChatMessage,
  getTeamById,
  getUserByEmail,
  getUserAgents,
} from "@/lib/redis";
import { preIdeationAction, executeIdeationAction } from "@/lib/openai";
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
