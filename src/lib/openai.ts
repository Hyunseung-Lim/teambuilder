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

export async function generateIdeaAction(
  context?: string,
  agentProfile?: any,
  existingIdeas?: Array<{
    ideaNumber: number;
    authorName: string;
    object: string;
    function: string;
  }>
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

  const prompt = generateIdeaPrompt(enhancedContext, agentProfile);
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

// 새로운 구체적인 피드백 함수
export async function giveFeedbackOnIdea(
  targetIdea: any,
  agentProfile: any,
  teamContext: any
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

  const prompt = `당신은 ${agentProfile.name}입니다. 팀 아이디어 세션에서 다음 아이디어에 대해 구어체로 자연스러운 피드백을 주세요.

평가할 아이디어:
- 제목: ${targetIdea.content.object}
- 기능: ${targetIdea.content.function}
- 작성자: ${ideaAuthor}

주제: ${teamContext.topic}

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

  return getJsonResponse(prompt, agentProfile);
}

export async function requestAction(target: string, context: string) {
  const prompt = requestPrompt(target, context);
  return getJsonResponse(prompt);
}

// --- Planning Function ---

export async function planNextAction(
  agentProfile: any,
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
  action: "generate_idea" | "evaluate_idea" | "give_feedback" | "wait";
  reasoning: string;
  target?: string;
}> {
  try {
    const prompt = createPlanningPrompt(agentProfile, teamContext);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an AI agent planning your next action in a team ideation session. Respond only with valid JSON.",
        },
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
      "wait",
    ];
    if (!validActions.includes(planResult.action)) {
      throw new Error(`Invalid action: ${planResult.action}`);
    }

    console.log(`🧠 ${agentProfile.name} 계획 결과:`, planResult);

    return {
      action: planResult.action,
      reasoning: planResult.reasoning || "No reasoning provided",
      target: planResult.target,
    };
  } catch (error) {
    console.error("Planning 실패:", error);

    // 실패 시 기본 행동 (역할에 따라)
    if (agentProfile.roles?.includes("아이디어 생성하기")) {
      return {
        action: "generate_idea",
        reasoning:
          "Default action due to planning error - generating idea based on role",
      };
    } else if (
      agentProfile.roles?.includes("아이디어 평가하기") &&
      teamContext.currentIdeasCount > 0
    ) {
      return {
        action: "evaluate_idea",
        reasoning:
          "Default action due to planning error - evaluating ideas based on role",
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
  agentProfile?: any,
  memory?: AgentMemory
) {
  const prompt = preIdeationPrompt(requestMessage, ideaList, memory);
  return getJsonResponse(prompt, agentProfile);
}

export async function executeIdeationAction(
  decision: "New" | "Update",
  ideationStrategy: string,
  topic: string,
  referenceIdea?: any,
  agentProfile?: any,
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
  return getJsonResponse(prompt, agentProfile);
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
  agentProfile?: any,
  memory?: AgentMemory
) {
  const prompt = preEvaluationPrompt(requestMessage, ideaList, memory);
  return getJsonResponse(prompt, agentProfile);
}

export async function executeEvaluationAction(
  selectedIdea: any,
  evaluationStrategy: string,
  agentProfile?: any,
  memory?: AgentMemory
) {
  const prompt = executeEvaluationPrompt(
    selectedIdea,
    evaluationStrategy,
    memory
  );
  return getJsonResponse(prompt, agentProfile);
}

// --- Function for generating responses when already evaluated ---

export async function generateAlreadyEvaluatedResponse(
  requesterName: string,
  selectedIdea: any,
  previousEvaluation: any,
  relationshipType: string | null,
  agentProfile?: any
) {
  const prompt = alreadyEvaluatedResponsePrompt(
    requesterName,
    selectedIdea,
    previousEvaluation,
    relationshipType,
    agentProfile
  );
  return getJsonResponse(prompt, agentProfile);
}
