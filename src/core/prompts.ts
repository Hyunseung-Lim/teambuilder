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
