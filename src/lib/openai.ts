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
} from "@/core/prompts";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in the environment variables.");
}

const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.5,
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

export async function generateIdeaAction(context?: string, agentProfile?: any) {
  const prompt = generateIdeaPrompt(context, agentProfile);
  return getJsonResponse(prompt, agentProfile);
}

export async function evaluateIdeaAction(idea: any, context?: string) {
  const prompt = evaluateIdeaPrompt(idea, context);
  return getJsonResponse(prompt);
}

export async function feedbackAction(target: string, context: string) {
  const prompt = feedbackPrompt(target, context);
  return getJsonResponse(prompt);
}

export async function requestAction(target: string, context: string) {
  const prompt = requestPrompt(target, context);
  return getJsonResponse(prompt);
}

// --- Planning Function ---

export async function planNextAction(context: any) {
  const prompt = planNextActionPrompt(context);
  return getJsonResponse(prompt);
}

// --- New 2-Stage Ideation Action Functions ---

export async function preIdeationAction(
  requestMessage: string,
  ideaList: { object: string; function: string }[],
  agentProfile?: any
) {
  const prompt = preIdeationPrompt(requestMessage, ideaList);
  return getJsonResponse(prompt, agentProfile);
}

export async function executeIdeationAction(
  decision: "New" | "Update",
  ideationStrategy: string,
  topic: string,
  referenceIdea?: any,
  agentProfile?: any
) {
  let prompt;
  if (decision === "New") {
    prompt = newIdeationPrompt(ideationStrategy, topic);
  } else {
    if (!referenceIdea) {
      throw new Error("Reference idea is required for 'Update' decision.");
    }
    prompt = updateIdeationPrompt(referenceIdea, ideationStrategy, topic);
  }
  return getJsonResponse(prompt, agentProfile);
}
