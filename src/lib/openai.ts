import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  generateIdeaPrompt,
  evaluateIdeaPrompt,
  feedbackPrompt,
  requestPrompt,
  planNextActionPrompt,
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
        : typeof agentProfile.personality === "string"
        ? agentProfile.personality
        : JSON.stringify(agentProfile.personality);
      systemPrompt += ` Your personality: ${personalityText}.`;
    }

    if (agentProfile.skills) {
      const skillsText = Array.isArray(agentProfile.skills)
        ? agentProfile.skills.join(", ")
        : typeof agentProfile.skills === "string"
        ? agentProfile.skills
        : JSON.stringify(agentProfile.skills);
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
    console.log(
      "요청 메시지들:",
      JSON.stringify(
        messages.map((m) => ({
          type: m._getType(),
          content: m.content,
        })),
        null,
        2
      )
    );
    console.log("원본 LLM 응답:", rawResponse);
    console.log("==================");

    if (!rawResponse) {
      throw new Error("OpenAI returned an empty response.");
    }

    try {
      const parsedResponse = JSON.parse(rawResponse as string);
      console.log("파싱된 JSON 응답:", JSON.stringify(parsedResponse, null, 2));
      return parsedResponse;
    } catch (error) {
      console.error("JSON 파싱 오류:", error);
      console.error("파싱 실패한 원본 응답:", rawResponse);
      throw new Error("Invalid JSON response from OpenAI");
    }
  } catch (error) {
    console.error("LLM 호출 오류:", error);

    // 기본 응답 반환
    const fallbackResponse = {
      object: "환경 보호 아이디어",
      function: "탄소 배출을 줄이는 혁신적인 솔루션",
      behavior: {
        "주요 기능": "환경 보호에 기여하는 핵심 동작",
        "사용자 상호작용": "직관적이고 효과적인 사용자 경험 제공",
      },
      structure: {
        "핵심 구조": "효율적이고 지속가능한 시스템 구조",
        "구성 요소": "환경 친화적인 재료와 기술 활용",
      },
    };

    console.log("기본 응답 사용:", JSON.stringify(fallbackResponse, null, 2));
    return fallbackResponse;
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
