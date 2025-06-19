import { AgentMemory, InteractionRecord } from "@/lib/types";

export const generateIdeaPrompt = (
  context?: string,
  agentProfile?: any,
  memory?: any
) => {
  // 주제를 안전하게 처리하되 한글은 보존
  const safeContext = context || "Carbon Emission Reduction";

  // 에이전트 프로필 정보 추가
  const profileContext = agentProfile
    ? `
**Your Identity:**
- Name: ${agentProfile.name}
- Age: ${agentProfile.age}세
- Occupation: ${agentProfile.professional}
- Skills: ${agentProfile.skills}
- Personality: ${agentProfile.personality || "협력적"}
- Values: ${agentProfile.value || "혁신과 협업을 중시"}

Generate ideas that reflect your unique professional background, skills, and personality.
`
    : "";

  // 메모리 컨텍스트 추가
  const memoryContext = memory
    ? `
**Your Memory and Experience:**
${(() => {
  let formattedMemory = "";

  // v2 메모리 구조 확인
  if (
    memory.longTerm?.knowledge ||
    memory.longTerm?.actionPlan ||
    memory.longTerm?.relation
  ) {
    // v2 메모리 처리
    if (memory.longTerm.knowledge) {
      formattedMemory += `- Knowledge: ${memory.longTerm.knowledge}\n`;
    }
    if (memory.longTerm.actionPlan?.idea_generation) {
      formattedMemory += `- Idea Generation Strategy: ${memory.longTerm.actionPlan.idea_generation}\n`;
    }
    if (
      memory.longTerm.relation &&
      Object.keys(memory.longTerm.relation).length > 0
    ) {
      formattedMemory += `- Team Relationships: You have formed relationships with ${
        Object.keys(memory.longTerm.relation).length
      } team members\n`;
    }
  } else {
    // 기존 메모리 구조 처리
    if (memory.longTerm?.self) {
      const selfReflection =
        typeof memory.longTerm.self === "string"
          ? memory.longTerm.self
          : Array.isArray(memory.longTerm.self) &&
            memory.longTerm.self.length > 0
          ? memory.longTerm.self[memory.longTerm.self.length - 1]
          : "";
      if (selfReflection) {
        formattedMemory += `- Self Reflection: ${selfReflection}\n`;
      }
    }
    if (
      memory.longTerm?.relations &&
      Object.keys(memory.longTerm.relations).length > 0
    ) {
      formattedMemory += `- Team Relationships: You have relationships with ${
        Object.keys(memory.longTerm.relations).length
      } team members\n`;
    }
  }

  if (memory.shortTerm?.lastAction) {
    formattedMemory += `- Recent Action: ${memory.shortTerm.lastAction.type} (${memory.shortTerm.lastAction.timestamp})\n`;
  }

  return formattedMemory || "- This is your first action in the team";
})()}

Use your memory and experience to generate ideas that build upon your knowledge and reflect your growth in the team.
`
    : "";

  return `${profileContext}${memoryContext}Generate ideas for the task below and return only one JSON object in the following structure:

{
  "object": "",
  "function": "",
  "behavior": {},
  "structure": {}
}

object: The design target that appears beside each idea node, helping users quickly recall and locate ideas—even when many are listed.

function: The purpose or teleology of the object.

behavior: What the object does, expressed as a JSON object whose keys are behavior factors and whose values are concise descriptions.

structure: The object's components and their relationships, expressed as a JSON object whose keys are structural elements and whose values are concise descriptions.

Write all content in Korean.
Return only the JSON object—no additional text, headings, or code-block markers.

Example (in Korean):
Task: Design a smart speaker in the future.
Idea: 
{
  "object": "교육적 튜터링 스피커",
  "function": "모든 연령의 학생에게 인터랙티브한 교육을 제공하는 인공지능 어시스턴트",
  "behavior": {
    "인터랙티브 수업": "다양한 주제와 학생의 수준에 맞는 음성 기반 교육 콘텐츠 제공",
    "과제 지원": "학생들에게 적절한 설명과 답변을 제공하여 과제 수행을 지원"
  },
  "structure": {
    "적응형 교육 AI": "사용자의 수준과 선호를 파악해 맞춤형 교육 콘텐츠를 생성",
    "고성능 오디오": "효과적인 교육을 위한 고품질 오디오 출력을 지원",
    "다중 인식 마이크": "여러 학생의 발화를 인식하기 위한 다중 마이크 배열",
    "부모용 컨트롤러": "부모가 교육 콘텐츠를 모니터링하고 관리할 수 있도록 지원"
  }
}

Task: ${safeContext}
Idea: `;
};

export const evaluateIdeaPrompt = (idea: any, context?: string) => `
You are an AI agent in a team ideation session. Your task is to evaluate the provided idea objectively.
Rate the idea on a scale of 1-5 for relevance, actionable, and insightfulness. Provide a brief comment in Korean.

IMPORTANT: You should only evaluate ideas created by other team members, not your own ideas.

The idea to evaluate: ${JSON.stringify(idea, null, 2)}
Your evaluation should be in the following JSON format:
{
  "scores": {
    "relevance": <1-5>,
    "actionable": <1-5>,
    "insightful": <1-5>
  },
  "comment": "Your concise, constructive feedback in Korean."
}

Additional context for evaluation: "${
  context || "Evaluate based on general principles."
}"
`;

export const feedbackPrompt = (target: string, context: string) => `
You are an AI agent. Provide constructive feedback to your team member, ${target}.
The context for your feedback is: "${context}".
Generate your feedback in the following JSON format:
{
  "target": "${target}",
  "comment": "Your constructive feedback here."
}
`;

export const requestPrompt = (target: string, context: string) => `
You are an AI agent. Make a request to your team member, ${target}.
Your request should be for one of the following actions: 'generate_idea', 'evaluate_idea', 'feedback'.
The context for your request is: "${context}".
Generate your request in the following JSON format:
{
  "target": "${target}",
  "action": "<'generate_idea' | 'evaluate_idea' | 'feedback'>",
  "comment": "A clear and concise comment explaining your request."
}
`;

export const planNextActionPrompt = (context: any) => `
You are an AI agent in an ideation session. Your role is to decide the next best action.
Based on your memory, roles, and recent conversation, choose one of the following actions: 
'generate_idea', 'evaluate_idea', 'feedback', 'request', 'wait'.

If you choose to act, you must also provide the necessary payload for that action.

- For 'generate_idea', provide a 'context' for the idea generation.
- For 'evaluate_idea', you must select an 'idea' from the recent ideas in the chat history to evaluate.
- For 'feedback' or 'request', you must specify a 'target' agent and the 'content' of your message.
- If no action is necessary, choose 'wait'.

Your context is: ${JSON.stringify(context, null, 2)}

Provide your decision in the following JSON format. Ensure the payload matches the chosen action.
{
  "action": "<your chosen action>",
  "payload": {
    "context": "<For generate_idea: a string describing the topic>",
    "idea": "<For evaluate_idea: the full idea object to evaluate>",
    "target": "<For feedback/request: the name of the agent to address>",
    "content": "<For feedback/request: the message content>"
  },
  "reasoning": "A brief explanation for your choice."
}
`;

// New prompts for the 2-stage idea generation process

export const preIdeationPrompt = (
  requestMessage: string,
  ideaList: {
    ideaNumber: number;
    authorName: string;
    object: string;
    function: string;
  }[],
  memory?: AgentMemory
) => {
  const simplifiedIdeaList =
    ideaList.length > 0 ? JSON.stringify(ideaList, null, 2) : "No ideas yet.";

  const memoryContext = memory
    ? `
**Your Memory:**
- Your last action was: ${memory.shortTerm.lastAction?.type || "none"}.
`
    : "";

  return `You are in a team ideation session. Your task is to analyze a request for an idea and decide the best way to generate it.
${memoryContext}
Inputs:
1. Request Message: "${requestMessage}"
2. Existing Ideas: ${simplifiedIdeaList}

Based on the inputs, you must perform the following tasks:
1.  Decide whether to create a completely "New" idea or "Update" an existing one. A "New" idea is suitable for a broad or novel request. An "Update" is better if the request aims to refine, combine, or build upon an existing concept. If there are no existing ideas, you must choose "New".
2.  If you decide to "Update", you MUST select one idea from the "Existing Ideas" list by its "ideaNumber". The reference idea should be the one most relevant to the request.
3.  Extract a concise "Ideation Strategy" from the request message. This strategy will guide the next stage of idea generation. For example, "Make it more eco-friendly" or "Combine it with AI features".

Return your decision as a single JSON object in the following format. Do not include any other text or explanations.

{
  "decision": "New" | "Update",
  "referenceIdea": { "ideaNumber": 1, "object": "...", "function": "..." } | null,
  "ideationStrategy": "Your extracted ideation strategy."
}

Example:
Request Message: "I like idea #1, the '교육적 튜터링 스피커', but can we make it more focused on elderly care?"
Existing Ideas: [
  { 
    "ideaNumber": 1, 
    "authorName": "Agent Jane", 
    "object": "교육적 튜터링 스피커", 
    "function": "..."
  }
]

Your output:
{
  "decision": "Update",
  "referenceIdea": { "ideaNumber": 1, "object": "교육적 튜터링 스피커", "function": "..." },
  "ideationStrategy": "Focus on elderly care features instead of general education."
}

Now, process the given inputs and provide your JSON output.
`;
};

const baseIdeationPromptText = `Generate one idea based on the provided instructions and return only one JSON object in the following structure:
{
  "object": "",
  "function": "",
  "behavior": {},
  "structure": {}
}
- object: The design target that appears beside each idea node.
- function: The purpose or teleology of the object.
- behavior: What the object does, expressed as a JSON object.
- structure: The object's components and their relationships, as a JSON object.
Write all content in Korean. Return only the JSON object.`;

export const newIdeationPrompt = (
  ideationStrategy: string,
  topic: string,
  memory?: AgentMemory
) => {
  const memoryContext = memory
    ? `
**Your Memory Context:**
- Your last action was: ${memory.shortTerm.lastAction?.type || "none"}.
- You have reflections on ${memory.longTerm.self.length} past events.
`
    : "";

  return `${baseIdeationPromptText}
${memoryContext}
Task: ${topic}
Ideation Strategy: ${ideationStrategy}

Apply the strategy to generate a completely new idea for the given task.
Idea: `;
};

export const updateIdeationPrompt = (
  referenceIdea: any,
  ideationStrategy: string,
  topic: string,
  memory?: AgentMemory
) => {
  const ideaString = JSON.stringify(referenceIdea, null, 2);
  const authorName = referenceIdea.authorName || "a team member";

  const memoryContext =
    memory && memory.longTerm.relations[authorName]
      ? `
**Your Memory Context:**
- Your opinion of ${authorName}: ${
          memory.longTerm.relations[authorName].myOpinion
        }
- Recent interactions with ${authorName}: ${
          memory.longTerm.relations[authorName].interactionHistory
            .slice(-2)
            .map((i: InteractionRecord) => i.content)
            .join(", ") || "none"
        }
`
      : "";

  return `${baseIdeationPromptText}
${memoryContext}
Task: ${topic}
Reference Idea to Update:
${ideaString}

Ideation Strategy: ${ideationStrategy}

Apply the strategy to the reference idea to create an improved or modified version. The new idea should be a clear evolution of the reference.
Idea: `;
};

// New prompts for the 2-stage evaluation process

export const preEvaluationPrompt = (
  requestMessage: string,
  ideaList: {
    ideaNumber: number;
    authorName: string;
    object: string;
    function: string;
  }[],
  memory?: AgentMemory
) => {
  const ideaListString =
    ideaList.length > 0
      ? JSON.stringify(ideaList, null, 2)
      : "No ideas available for evaluation.";

  const memoryContext = memory
    ? `
**Your Memory:**
- Your last action was: ${memory.shortTerm.lastAction?.type || "none"}.
`
    : "";

  return `You are in a team ideation session. Your task is to analyze a request for idea evaluation and decide which idea to evaluate and how.

IMPORTANT: You should only evaluate ideas created by other team members, not your own ideas. The available ideas list already excludes your own ideas.

${memoryContext}
Inputs:
1. Request Message: "${requestMessage}"
2. Available Ideas: ${ideaListString}

Based on the inputs, you must perform the following tasks:
1. Select ONE idea from the "Available Ideas" list that is most relevant to the request message. If the request mentions a specific idea number, prioritize that. Otherwise, choose the most suitable one based on the request context.
2. Extract an "Evaluation Strategy" from the request message that will guide how you evaluate the selected idea. This should focus on what aspects to emphasize (e.g., "Focus on environmental impact", "Evaluate technical feasibility", "Consider user experience").

Return your decision as a single JSON object in the following format. Do not include any other text or explanations.

{
  "selectedIdea": {
    "ideaNumber": 1,
    "object": "...",
    "function": "..."
  },
  "evaluationStrategy": "Your extracted evaluation strategy focusing on specific aspects to evaluate."
}

Example:
Request Message: "Can you evaluate idea #2 focusing on its environmental benefits?"
Available Ideas: [
  { "ideaNumber": 1, "authorName": "User", "object": "스마트 조명", "function": "..." },
  { "ideaNumber": 2, "authorName": "Agent A", "object": "태양광 충전기", "function": "..." }
]

Your output:
{
  "selectedIdea": { "ideaNumber": 2, "object": "태양광 충전기", "function": "..." },
  "evaluationStrategy": "Focus on environmental benefits and sustainability impact."
}

Now, process the given inputs and provide your JSON output.
`;
};

export const executeEvaluationPrompt = (
  selectedIdea: any,
  evaluationStrategy: string,
  memory?: AgentMemory
) => {
  const ideaString = JSON.stringify(selectedIdea, null, 2);
  const authorName = selectedIdea.authorName || "a team member";

  const memoryContext =
    memory && memory.longTerm.relations[authorName]
      ? `
**Your Memory Context:**
- Your opinion of ${authorName}: ${
          memory.longTerm.relations[authorName].myOpinion
        }
- Recent interactions with ${authorName}: ${
          memory.longTerm.relations[authorName].interactionHistory
            .slice(-2)
            .map((i: InteractionRecord) => i.content)
            .join(", ") || "none"
        }
`
      : "";

  return `You are an AI agent evaluating an idea in a team ideation session. Your task is to provide a comprehensive evaluation based on the given strategy.

IMPORTANT: You should only evaluate ideas created by other team members, not your own ideas.

${memoryContext}
Idea to Evaluate:
${ideaString}

Evaluation Strategy: ${evaluationStrategy}

You must evaluate the idea on three dimensions using a 5-point scale (1-5):
- Insightful: How novel, creative, and thought-provoking is this idea? (1=not insightful, 5=very insightful)
- Actionable: How feasible and implementable is this idea? (1=not actionable, 5=very actionable)  
- Relevance: How well does this idea address the given topic/problem? (1=not relevant, 5=very relevant)

Apply the evaluation strategy to focus your assessment on the specified aspects while still providing scores for all three dimensions.

Provide your evaluation in the following JSON format. Write your comment in Korean.

{
  "scores": {
    "insightful": <1-5>,
    "actionable": <1-5>,
    "relevance": <1-5>
  },
  "comment": "Your detailed evaluation comment in Korean, focusing on the evaluation strategy while covering all three dimensions."
}

Return only the JSON object—no additional text or explanations.
`;
};

// Prompt for generating responses when an agent has already evaluated an idea
export const alreadyEvaluatedResponsePrompt = (
  requesterName: string,
  selectedIdea: any,
  previousEvaluation: any,
  relationshipType: string | null,
  userProfile?: any
) => {
  const ideaString = JSON.stringify(selectedIdea, null, 2);
  const evaluationString = JSON.stringify(previousEvaluation, null, 2);

  // 관계 타입에 따른 설명
  const relationshipDescription = relationshipType
    ? {
        FRIEND: "As friends, communicate in a comfortable and friendly tone.",
        AWKWARD:
          "As someone with an awkward relationship, be polite but maintain some distance in your tone.",
        SUPERVISOR:
          "As this person's supervisor, communicate in a friendly yet guiding tone. Use informal speech (반말) as is appropriate for a superior addressing a subordinate in Korean workplace culture.",
        SUBORDINATE:
          "As this person's subordinate, use respectful language and maintain a formal tone.",
      }[relationshipType] || "Communicate as general team members."
    : "Communicate as general team members.";

  return `You are in a team ideation session. ${
    requesterName
      ? `Someone has asked you to evaluate an idea, but you have already evaluated this idea before.`
      : `You tried to evaluate an idea autonomously, but you have already evaluated this idea before.`
  } You need to politely explain that you've already provided an evaluation and briefly reference your previous assessment.

Context:
${
  requesterName
    ? `- Requester: ${requesterName}`
    : "- This is autonomous evaluation"
}
${
  requesterName
    ? `- Relationship with requester: ${relationshipDescription}`
    : "- You are speaking to the general team"
}
- Idea you ${
    requesterName ? "were asked to evaluate" : "tried to evaluate"
  }: ${ideaString}
- Your previous evaluation: ${evaluationString}

Instructions:
${
  requesterName
    ? `1. Consider your specific relationship with the requester: ${relationshipDescription}`
    : "1. Speak to the general team in a polite and professional tone"
}
2. Politely explain that you've already evaluated this specific idea
3. Briefly summarize your previous evaluation scores or main points
4. Suggest they can check your previous detailed evaluation
${
  requesterName
    ? "5. Offer to help with evaluating other ideas if needed"
    : "5. Express willingness to evaluate other ideas"
}
6. Keep the tone conversational and natural, not robotic
7. Use appropriate Korean honorifics and politeness levels${
    requesterName ? " based on your relationship" : ""
  }

Generate your response in the following JSON format. Write your response in Korean and make it conversational and natural.

{
  "response": "Your natural response in Korean explaining that you've already evaluated this idea, with a brief reference to your previous assessment and offering alternative help.${
    requesterName
      ? " Adjust the tone based on your relationship with the requester."
      : ""
  }"
}

Return only the JSON object—no additional text or explanations.
`;
};

// Planning 프롬프트 - 에이전트가 다음 행동을 스스로 결정
export function createPlanningPrompt(
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
    sharedMentalModel?: string;
  }
): string {
  const existingIdeasText =
    teamContext.existingIdeas.length > 0
      ? teamContext.existingIdeas
          .map(
            (idea) =>
              `${idea.ideaNumber}. "${idea.object}" (Author: ${idea.authorName}) - ${idea.function}`
          )
          .join("\n")
      : "No ideas have been generated yet.";

  // 최근 메시지에서 각 액션 타입별 빈도 분석
  const recentActions = teamContext.recentMessages
    .filter(
      (msg) =>
        msg.type === "system" &&
        typeof msg.payload === "object" &&
        msg.payload.content
    )
    .map((msg) => {
      const content = msg.payload.content;
      if (content.includes("생성했습니다"))
        return { action: "generate_idea", author: msg.sender };
      if (content.includes("평가했습니다"))
        return { action: "evaluate_idea", author: msg.sender };
      if (content.includes("피드백 세션"))
        return { action: "give_feedback", author: msg.sender };
      if (content.includes("요청"))
        return { action: "make_request", author: msg.sender };
      return null;
    })
    .filter(
      (item): item is { action: string; author: string } => item !== null
    );

  // 액션별 빈도 계산
  const actionFrequency = {
    generate_idea: recentActions.filter((a) => a.action === "generate_idea")
      .length,
    evaluate_idea: recentActions.filter((a) => a.action === "evaluate_idea")
      .length,
    give_feedback: recentActions.filter((a) => a.action === "give_feedback")
      .length,
    make_request: recentActions.filter((a) => a.action === "make_request")
      .length,
  };

  // 가장 적게 수행된 액션들 찾기
  const minFrequency = Math.min(...Object.values(actionFrequency));
  const underperformedActions = Object.entries(actionFrequency)
    .filter(([action, freq]) => freq === minFrequency)
    .map(([action]) => action);

  // 본인의 최근 액션 패턴 분석
  const myRecentActions = recentActions
    .filter((a) => a.author === agentProfile.name)
    .slice(-3)
    .map((a) => a.action);

  const actionFrequencyText = Object.entries(actionFrequency)
    .map(([action, freq]) => `${action}: ${freq}회`)
    .join(", ");

  const balanceAnalysis =
    underperformedActions.length > 0
      ? `팀에서 최근 가장 적게 수행된 액션들: ${underperformedActions.join(
          ", "
        )} (우선 고려 대상)`
      : "모든 액션이 비교적 균등하게 수행되고 있습니다.";

  const myActionPattern =
    myRecentActions.length > 0
      ? `당신의 최근 액션 패턴: ${myRecentActions.join(
          " → "
        )} (다른 액션 선택 권장)`
      : "당신은 아직 액션을 수행하지 않았습니다.";

  // 공유 멘탈 모델 섹션 생성
  const sharedMentalModelSection = teamContext.sharedMentalModel
    ? `

**팀의 공유 멘탈 모델:**
${teamContext.sharedMentalModel}

위 공유 멘탈 모델을 바탕으로 팀의 방향성과 가치관에 맞는 행동을 선택하세요.`
    : "";

  return `You are AI agent ${agentProfile.name} in the "${
    teamContext.teamName
  }" team.

Your Profile:
- Age: ${agentProfile.age} years old
- Occupation: ${agentProfile.professional}
- Skills: ${agentProfile.skills}
- Personality: ${agentProfile.personality || "Not specified"}
- Roles: ${agentProfile.roles?.join(", ") || "Not specified"}

Current Team Situation:
- Topic: ${teamContext.topic}
- Current number of ideas: ${teamContext.currentIdeasCount}
- Team members: ${teamContext.teamMembers.join(", ")}${sharedMentalModelSection}

Existing Ideas:
${existingIdeasText}

Recent Team Activity (Last ${teamContext.recentMessages.length} messages):
${teamContext.recentMessages
  .map(
    (msg) =>
      `- ${msg.sender}: ${
        typeof msg.payload === "object" ? msg.payload.content : msg.payload
      }`
  )
  .join("\n")}

Team Action Balance Analysis:
- Recent action frequency: ${actionFrequencyText}
- ${balanceAnalysis}
- ${myActionPattern}

🎯 STRATEGIC GUIDANCE: 
${
  underperformedActions.length > 0 &&
  underperformedActions.some(
    (action) =>
      (action === "generate_idea" &&
        agentProfile.roles?.includes("아이디어 생성하기")) ||
      (action === "evaluate_idea" &&
        agentProfile.roles?.includes("아이디어 평가하기")) ||
      (action === "give_feedback" &&
        agentProfile.roles?.includes("피드백하기")) ||
      (action === "make_request" && agentProfile.roles?.includes("요청하기"))
  )
    ? `현재 팀에서 ${underperformedActions
        .filter(
          (action) =>
            (action === "generate_idea" &&
              agentProfile.roles?.includes("아이디어 생성하기")) ||
            (action === "evaluate_idea" &&
              agentProfile.roles?.includes("아이디어 평가하기")) ||
            (action === "give_feedback" &&
              agentProfile.roles?.includes("피드백하기")) ||
            (action === "make_request" &&
              agentProfile.roles?.includes("요청하기"))
        )
        .join(
          ", "
        )}이(가) 부족합니다. 당신이 이 역할을 수행할 수 있다면 우선적으로 고려해주세요.`
    : "팀 밸런스가 양호하니 상황에 맞는 액션을 선택하세요."
}

You are currently in the planning phase. Based on your role, personality, current team situation, and team action balance, decide what to do next.

Available Actions (ONLY within your assigned roles):
1. "generate_idea" - Generate new ideas for the topic ${
    agentProfile.roles?.includes("아이디어 생성하기") ? "✅" : "❌"
  }
2. "evaluate_idea" - Evaluate existing ideas (only when there are ideas to evaluate) ${
    agentProfile.roles?.includes("아이디어 평가하기") ? "✅" : "❌"
  }
3. "give_feedback" - Provide feedback to team members ${
    agentProfile.roles?.includes("피드백하기") ? "✅" : "❌"
  }
4. "make_request" - Request work from other team members ${
    agentProfile.roles?.includes("요청하기") ? "✅" : "❌"
  }
5. "wait" - Return to waiting state (always available)

Decision Considerations:
🔹 ROLE CONSTRAINT: You can ONLY perform actions within your assigned roles (marked with ✅)
🔹 TEAM BALANCE: Prioritize actions that have been performed less frequently by the team
🔹 AVOID REPETITION: Don't repeat the same action pattern too frequently
🔹 QUALITY OVER QUANTITY: Consider whether the team needs more ideas or more evaluations
🔹 MEANINGFUL CONTRIBUTION: Present new perspectives that don't duplicate existing work

Action Selection Priority:
1️⃣ HIGH PRIORITY: Actions you can perform that are currently underperformed by the team
2️⃣ MEDIUM PRIORITY: Actions you can perform that serve the team's current needs
3️⃣ LOW PRIORITY: Actions you recently performed (avoid immediate repetition)
4️⃣ LAST RESORT: "wait" if no meaningful action is possible

IMPORTANT: Do not select actions outside your role permissions. This will result in automatic conversion to "wait".

Respond only in the following JSON format. Write all text in Korean:
{
  "action": "generate_idea" | "evaluate_idea" | "give_feedback" | "make_request" | "wait",
  "reasoning": "Detailed explanation of why you chose this action, considering team balance, your role constraints, and strategic priorities (in Korean)",
  "target": "Team member name if giving feedback or making a request (optional)"
}`;
}

// New prompts for the 2-stage request process

export const preRequestPrompt = (
  triggerContext: string, // Context that triggered the request (received direct request or decided in plan)
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
  memory?: AgentMemory,
  sharedMentalModel?: string // 공유 멘탈 모델 추가
) => {
  const teamMembersInfo = teamMembers
    .map((member) => {
      const memberType = member.isUser ? "Human User" : "AI Agent";
      let memberDetails = `- ${
        member.name
      } (${memberType}): Roles - ${member.roles.join(", ")}`;

      // 인간 팀원인 경우 추가 정보 포함
      if (member.isUser && member.userInfo) {
        const info = member.userInfo;
        const details = [];
        if (info.age) details.push(`${info.age}세`);
        if (info.professional) details.push(`직업: ${info.professional}`);
        if (info.skills) details.push(`스킬: ${info.skills}`);
        if (info.personality) details.push(`성격: ${info.personality}`);

        if (details.length > 0) {
          memberDetails += `\n    → ${details.join(", ")}`;
        }
      }

      return memberDetails;
    })
    .join("\n");

  const currentIdeasInfo =
    currentIdeas.length > 0
      ? currentIdeas
          .map(
            (idea) =>
              `${idea.ideaNumber}. "${idea.object}" (Author: ${idea.authorName})`
          )
          .join("\n")
      : "No ideas have been generated yet.";

  const memoryContext = memory
    ? `
**Your Memory:**
- Last action: ${memory.shortTerm.lastAction?.type || "none"}
- Relationship info: Formed relationships with ${
        Object.keys(memory.longTerm.relations).length
      } members
`
    : "";

  // 공유 멘탈 모델 섹션 생성
  const sharedMentalModelSection = sharedMentalModel
    ? `

**팀의 공유 멘탈 모델:**
${sharedMentalModel}

위 공유 멘탈 모델을 바탕으로 팀의 방향성과 가치관에 맞는 요청을 하세요.`
    : "";

  return `You are making a request to another team member in the team ideation session. Strategically analyze who to request and what to request.

${memoryContext}

**Request Context:**
${triggerContext}${sharedMentalModelSection}

**Team Member Information:**
${teamMembersInfo}

**Current Ideas Status:**
${currentIdeasInfo}

**Analysis Required:**
1. Choose who to request (only within the roles that team member can perform)
2. Decide what to request (choose from "generate_idea", "evaluate_idea", "give_feedback")
3. Develop request strategy (why request this work from this team member, what context to provide)
4. Consider team member's background and expertise when making the request

**Important Constraints:**
- Can only request within the scope of roles that team member has
- Request must be specific and actionable
- Consider avoiding duplicate work
- For human users, consider their professional background and skills when crafting requests
- For AI agents, consider their programmed personality and capabilities

Respond only in the following JSON format:
{
  "targetMember": "Name of team member to request",
  "requestType": "generate_idea" | "evaluate_idea" | "give_feedback",
  "requestStrategy": "Explanation of request strategy (why request this work from this team member, what perspective to approach from, considering their background)",
  "contextToProvide": "Specific context or background information to provide with the request"
}

Start your analysis now and respond only in JSON format.`;
};

export const executeRequestPrompt = (
  targetMember: string,
  requestType: string,
  requestStrategy: string,
  contextToProvide: string,
  targetMemberRoles: string[],
  relationshipType?: string,
  memory?: AgentMemory,
  originalRequest?: string,
  originalRequester?: string,
  targetMemberInfo?: {
    // 인간 팀원인 경우 추가 정보
    isUser: boolean;
    age?: number;
    gender?: string;
    professional?: string;
    skills?: string;
    personality?: string;
    value?: string;
  },
  sharedMentalModel?: string // 공유 멘탈 모델 추가
) => {
  const relationshipDescription = relationshipType
    ? {
        FRIEND: "As friends, communicate in a comfortable and friendly tone.",
        AWKWARD:
          "As someone with an awkward relationship, be polite but maintain some distance in your tone.",
        SUPERVISOR:
          "As this person's supervisor, communicate in a friendly yet guiding tone. Use informal speech as is appropriate for a superior addressing a subordinate in Korean workplace culture.",
        SUBORDINATE:
          "As this person's subordinate, use respectful language and maintain a formal tone.",
      }[relationshipType] || "Communicate as general team members."
    : "Communicate as general team members.";

  const memoryContext =
    memory && memory.longTerm.relations[targetMember]
      ? `
**Relationship Memory:**
- My opinion of ${targetMember}: ${
          memory.longTerm.relations[targetMember].myOpinion
        }
- Recent interactions: ${
          memory.longTerm.relations[targetMember].interactionHistory
            .slice(-2)
            .map((i: any) => i.content)
            .join(", ") || "none"
        }
`
      : "";

  // 타겟 멤버 정보 추가
  const targetMemberDetails = targetMemberInfo
    ? `
**Target Member Details:**
- Type: ${targetMemberInfo.isUser ? "Human User" : "AI Agent"}
- Roles: ${targetMemberRoles.join(", ")}${
        targetMemberInfo.isUser && targetMemberInfo.professional
          ? `\n- Professional Background: ${targetMemberInfo.professional}`
          : ""
      }${
        targetMemberInfo.isUser && targetMemberInfo.skills
          ? `\n- Skills: ${targetMemberInfo.skills}`
          : ""
      }${
        targetMemberInfo.isUser && targetMemberInfo.personality
          ? `\n- Personality: ${targetMemberInfo.personality}`
          : ""
      }
`
    : `
**Target Member Details:**
- Roles: ${targetMemberRoles.join(", ")}
`;

  // 공유 멘탈 모델 섹션 생성
  const sharedMentalModelSection = sharedMentalModel
    ? `

**팀의 공유 멘탈 모델:**
${sharedMentalModel}

위 공유 멘탈 모델을 바탕으로 팀의 방향성과 가치관에 맞는 요청을 작성하세요.`
    : "";

  const isDelegation = originalRequest && originalRequester;

  if (isDelegation) {
    return `You are delegating a request received from ${originalRequester} to ${targetMember}.

${memoryContext}${targetMemberDetails}${sharedMentalModelSection}

**Original Request from ${originalRequester}:**
"${originalRequest}"

**Delegation Strategy:**
${requestStrategy}

**Context to Provide:**
${contextToProvide}

**Request Type:** ${requestType}

Based on the analysis, craft a natural and conversational message to delegate this request to ${targetMember}. Consider the following:
- ${relationshipDescription}
- Explain why you're delegating this specific request to them
- Provide the necessary context for them to act on the request
- Be clear about what specific action you want them to take
- Reference the original requester if appropriate

Write in Korean using casual but respectful language.

Respond only in the following JSON format:
{
  "message": "Your delegation message to ${targetMember} in Korean"
}`;
  } else {
    return `You are making a request to ${targetMember} based on your strategic analysis.

${memoryContext}${targetMemberDetails}${sharedMentalModelSection}

**Request Analysis:**
- Target: ${targetMember}
- Request Type: ${requestType}
- Strategy: ${requestStrategy}
- Context: ${contextToProvide}

Based on the analysis, craft a natural and conversational message to request ${requestType} from ${targetMember}. Consider the following:
- ${relationshipDescription}
- Explain why you're specifically requesting this from them
- Provide any necessary context or background
- Be clear about what specific action you want them to take
- Consider their expertise and background when framing the request

Write in Korean using casual but respectful language.

Respond only in the following JSON format:
{
  "message": "Your request message to ${targetMember} in Korean"
}`;
  }
};
