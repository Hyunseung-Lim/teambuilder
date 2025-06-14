export const generateIdeaPrompt = (context?: string, agentProfile?: any) => {
  // 주제를 안전하게 처리하되 한글은 보존
  const safeContext = context || "Carbon Emission Reduction";

  return `Generate ideas for the task below and return only one JSON object in the following structure:

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
You are an AI agent in a team ideation session. Your task is to evaluate the provided idea.
Rate the idea on a scale of 1-7 for relevance, innovation, and insightfulness. Provide a brief comment.
The idea to evaluate: ${JSON.stringify(idea, null, 2)}
Your evaluation should be in the following JSON format:
{
  "scores": {
    "relevance": <1-7>,
    "innovation": <1-7>,
    "insightful": <1-7>
  },
  "comment": "Your concise, constructive feedback."
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
  }[]
) => {
  const simplifiedIdeaList =
    ideaList.length > 0 ? JSON.stringify(ideaList, null, 2) : "No ideas yet.";
  return `You are an AI agent in a team ideation session. Your task is to analyze a request for an idea and decide the best way to generate it.

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

export const newIdeationPrompt = (ideationStrategy: string, topic: string) => {
  return `${baseIdeationPromptText}

Task: ${topic}
Ideation Strategy: ${ideationStrategy}

Apply the strategy to generate a completely new idea for the given task.
Idea: `;
};

export const updateIdeationPrompt = (
  referenceIdea: any,
  ideationStrategy: string,
  topic: string
) => {
  const ideaString = JSON.stringify(referenceIdea, null, 2);
  return `${baseIdeationPromptText}

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
  ideaList: any[]
) => {
  const simplifiedIdeaList = ideaList.map((idea, index) => ({
    ideaNumber: index + 1,
    authorName: idea.author === "나" ? "User" : idea.author,
    object: idea.content.object,
    function: idea.content.function,
  }));

  const ideaListString =
    simplifiedIdeaList.length > 0
      ? JSON.stringify(simplifiedIdeaList, null, 2)
      : "No ideas available for evaluation.";

  return `You are an AI agent in a team ideation session. Your task is to analyze a request for idea evaluation and decide which idea to evaluate and how.

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
  evaluationStrategy: string
) => {
  const ideaString = JSON.stringify(selectedIdea, null, 2);
  return `You are an AI agent evaluating an idea in a team ideation session. Your task is to provide a comprehensive evaluation based on the given strategy.

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
  agentProfile?: any
) => {
  const ideaString = JSON.stringify(selectedIdea, null, 2);
  const evaluationString = JSON.stringify(previousEvaluation, null, 2);

  // 관계 타입에 따른 설명
  const relationshipDescription = relationshipType
    ? {
        FRIEND: "친구 관계로, 편안하고 친근한 톤으로 대화하세요.",
        AWKWARD:
          "어색한 사이로, 정중하지만 약간 거리감 있는 톤으로 대화하세요.",
        SUPERVISOR: "상사 관계로, 존댓말과 격식을 갖춘 톤으로 대화하세요.",
      }[relationshipType] || "일반적인 팀원 관계로 대화하세요."
    : "일반적인 팀원 관계로 대화하세요.";

  return `You are an AI agent in a team ideation session. Someone has asked you to evaluate an idea, but you have already evaluated this idea before. You need to politely explain that you've already provided an evaluation and briefly reference your previous assessment.

Context:
- Requester: ${requesterName}
- Relationship with requester: ${relationshipDescription}
- Idea you were asked to evaluate: ${ideaString}
- Your previous evaluation: ${evaluationString}

Instructions:
1. Consider your specific relationship with the requester: ${relationshipDescription}
2. Politely explain that you've already evaluated this specific idea
3. Briefly summarize your previous evaluation scores or main points
4. Suggest they can check your previous detailed evaluation
5. Offer to help with evaluating other ideas if needed
6. Keep the tone conversational and natural, not robotic
7. Use appropriate Korean honorifics and politeness levels based on your relationship
8. If the relationship is FRIEND, be casual and friendly
9. If the relationship is AWKWARD, be polite but maintain some distance
10. If the relationship is SUPERVISOR, be very respectful and formal

Generate your response in the following JSON format. Write your response in Korean and make it conversational and natural.

{
  "response": "Your natural, polite response in Korean explaining that you've already evaluated this idea, with a brief reference to your previous assessment and offering alternative help. Adjust the tone based on your relationship with the requester."
}

Return only the JSON object—no additional text or explanations.
`;
};
