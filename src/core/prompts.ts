import { AgentMemory } from "@/lib/types";

// Common function to generate agent context sections
const createAgentContextSections = (
  agentProfile?: any,
  memory?: any,
  sharedMentalModel?: string,
  actionSpecificMessage?: string
) => {
  // Agent profile section
  const profileContext = agentProfile
    ? `
**Your Identity:**
- Name: ${agentProfile.name}
- Age: ${agentProfile.age}세
- Occupation: ${agentProfile.professional}
- Skills: ${agentProfile.skills}
- Personality: ${agentProfile.personality || "협력적"}
- Values: ${agentProfile.value || "혁신과 협업을 중시"}
${agentProfile.isLeader ? "- Role: **TEAM LEADER** - Take initiative and guide the team's ideation process" : ""}

${agentProfile.isLeader 
  ? "As the team leader, you should proactively guide the ideation process, coordinate team activities, and ensure productive collaboration. Take initiative in driving discussions and helping the team achieve its goals."
  : (actionSpecificMessage || "Act according to your unique professional background, skills, and personality.")
}
`
    : "";

  // Memory context section
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
    if (memory.longTerm.actionPlan?.idea_evaluation) {
      formattedMemory += `- Evaluation Strategy: ${memory.longTerm.actionPlan.idea_evaluation}\n`;
    }
    if (memory.longTerm.actionPlan?.feedback) {
      formattedMemory += `- Feedback Strategy: ${memory.longTerm.actionPlan.feedback}\n`;
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

Use your memory and experience to inform your actions and build upon your knowledge.
`
    : "";

  // Shared mental model section
  const sharedMentalModelContext = sharedMentalModel
    ? `
**Team's Shared Mental Model:**
${sharedMentalModel}

Based on the above shared mental model, align your actions with the team's direction and values.
`
    : "";

  return { profileContext, memoryContext, sharedMentalModelContext };
};

export const generateIdeaPrompt = (
  context?: string,
  agentProfile?: any,
  memory?: any,
  sharedMentalModel?: string
) => {
  // 주제를 안전하게 처리하되 한글은 보존
  const safeContext = context || "Carbon Emission Reduction";

  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Generate ideas that reflect your unique professional background, skills, and personality."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}## Design Goals
- Conduct conceptual design
- Propose a design solution to directly address the specified design task
- Prioritize novelty, completeness and quality while maintaining feasibility

## Design Task
${safeContext}

## Design Approach
Choose one of these thinking workflows:

**New Creation Workflow:**
1. Propose an object addressing the design task (Design Task → Object)
2. Derive critical functions for the object (Object → Functions)
3. Translate functions into observable behaviors (Functions → Behaviors)
4. Design structures enabling the behaviors (Behaviors → Structures)
5. Combine the object, functions, behaviors, and structures into a final design solution

**Analogical Reasoning Workflow:**
1. Given a design task, derive a new combination of object and functions through analogical reasoning, based on a predefined combination of object and functions and an analogical distance between these two combinations
2. Translate these new functions into new observable behaviors (New Functions → New Behaviors)
3. Design new structures enabling these new behaviors (New Behaviors → New Structures)
4. Combine the new object, new functions, new behaviors, and new structures into a final new design solution

## Innovation Requirements
- Each solution must include more than 2 disruptive innovations compared to existing solutions
- Challenge conventional approaches and leverage your professional expertise

**Write all content in Korean.**
Return only the JSON object—no additional text, headings, or code-block markers.

Examples (can be more specific than the example):
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

Task: Design a toy for cats.
Idea:
{
  "object": "무소음 봉제 공",
  "function": "고양이가 주인을 방해하지 않고 자유롭게 놀 수 있도록 무소음 놀이 경험을 제공합니다.",
  "behavior": { 
    "컴팩트 디자인": "좁은 공간에서도 고양이가 쉽게 물고, 밀고, 들고 다닐 수 있습니다.", 
    "부드럽고 높은 탄성": "변형 후에도 빠르게 원형을 회복해 편안한 촉감을 제공합니다.",
    "내구성과 저항성": "잦은 물기·긁기·당기기에도 마모나 변형이 거의 없어 장기간 사용이 가능합니다.",
    "무소음 반동": "소리를 내지 않고 계속 튀며 움직여, 조용한 환경을 유지합니다.",
    "안전성과 무독성": "유해 화학물질이 없는 소재로 만들어, 고양이가 핥거나 물어도 안전합니다."
  },
  "structure": {
    "크기와 형태": "지름 5 cm, 최대 4 cm까지 압축돼 실수로 삼키는 일을 방지합니다.",
    "플러시 외피": "부드럽고 편안하며 마모에 강하고 세척이 쉬워 위생적입니다.",
    "고탄성 솜 충전재": "적당한 부드러움과 구조적 안정성, 우수한 탄성을 제공합니다.", 
    "고강도 봉제 및 구조": "격한 놀이에도 실밥이 풀리거나 끊어지지 않고 장기간 견딜 수 있습니다."
  }
}

## Concept Framework
Generate ideas using the following structure:

{
  "object": "",
  "function": "",
  "behavior": {},
  "structure": {}
}

### Component Definitions:
- **Object**: The target entity to be designed, which can be either existing or imagined. It is usually a noun or short phrases. Example: Residential house.
- **Function**: Ultimate purposes the object must achieve, describing what the object should do. Example: Provide safety, provide comfort, provide load-bearing capacity.
- **Behavior**: Dynamic characteristics of the object, including how it responds to various inputs and environmental conditions. It describes how the object achieves its functions, and is derived from or anticipated based on its structures. Example: Strength, weight, heat absorption.
- **Structure**: Physical composition or configuration of the object, including its components and the relationships between them. Examples: shape, size, material, the layout of its components.

Task: ${safeContext}`;
};

export const evaluateIdeaPrompt = (
  idea: any, 
  context?: string,
  agentProfile?: any,
  memory?: any,
  sharedMentalModel?: string
) => {
  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Evaluate ideas objectively based on your professional expertise and experience."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}You are an AI agent in a team ideation session. Your task is to evaluate the provided idea objectively.
Rate the idea on a scale of 1-7 for relevance, actionable, and insightfulness. Use the following 7-point scale:
- 1: Strongly Disagree/Very Poor
- 2: Disagree/Poor  
- 3: Somewhat Disagree/Below Average
- 4: Neutral/Average
- 5: Somewhat Agree/Above Average
- 6: Agree/Good
- 7: Strongly Agree/Excellent

**EVALUATION PROCESS:**
1. **First**: Write a detailed comment analyzing the idea
2. **Then**: Assign numerical scores based on your written analysis

The idea to evaluate: ${JSON.stringify(idea, null, 2)}

**Step 1: Write Your Analysis**
Provide a thorough, constructive evaluation in Korean covering:
- Strengths and weaknesses of the idea
- Relevance to the topic and team goals
- How actionable and implementable it is
- Level of insight and innovation demonstrated
- Specific suggestions for improvement

**Writing Style Guidelines:**
- Use direct, concise expressions without unnecessary cushioning phrases
- Avoid redundant politeness markers like "~것 같습니다", "~라고 생각됩니다"  
- Start sentences with clear subjects and actions
- Replace vague terms with specific, concrete language
- Be constructively critical without excessive softening language

Be specific and critical in your evaluation. Write directly and clearly without excessive politeness cushions.

**Step 2: Assign Scores**
Based on your written analysis, rate the idea using the criteria below.

**Scoring Criteria:**
- **Relevance**: How well does it address the topic and team objectives?
- **Actionable**: How feasible and implementable is this idea?
- **Insightful**: How innovative, creative, and thoughtful is the approach?

IMPORTANT: You should only evaluate ideas created by other team members, not your own ideas.

Your evaluation should be in the following JSON format:
{
  "comment": "Your detailed analysis and constructive feedback in Korean (write this first).",
  "scores": {
    "relevance": <1-7>,
    "actionable": <1-7>,
    "insightful": <1-7>
  }
}

Additional context for evaluation: "${
  context || "Evaluate based on general principles."
}"
`;
};

export const feedbackPrompt = (
  target: string, 
  context: string,
  agentProfile?: any,
  memory?: any,
  sharedMentalModel?: string
) => {
  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Provide constructive feedback based on your expertise and team collaboration experience."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}You are an AI agent providing feedback to your team member, ${target}.

**Context for feedback:** "${context}"

**Feedback Taxonomy Guidelines:**
Choose one or more appropriate feedback types based on the situation:

**Understanding & Clarification:**
- **Verification**: Ensure you understand their idea correctly
- **Completion**: Ask for clarification on unclear aspects
- **Understanding Feedback Receiver**: Learn about their background and perspective

**Reasoning & Analysis:**
- **Logical/Causal Reasoning**: Prompt them to think about feasibility, effectiveness, realization
- **Instrumental/Procedural Reasoning**: Ask about procedures and decision reasoning

**Ideation & Development:**
- **Brainstorming/Ideation**: Provide or elicit new ideas without specific goals
- **Negotiation**: Suggest alternative ideas or approaches
- **Scenario Creation**: Present specific scenarios that could occur

**Knowledge & Experience Sharing:**
- **Sharing Examples/Personal Experience**: Provide relevant examples or experiences
- **Providing Design Knowledge**: Share design principles or domain knowledge

**Assessment & Evaluation:**
- **Positive Assessment**: Explicitly acknowledge good aspects of the design
- **Negative Assessment**: Explicitly point out areas for improvement
- **Direct Recommendation**: Give specific advice on what or how to do
- **Hinting**: Indirectly suggest ways to proceed

**Project Coordination:**
- **Project Management**: Address scheduling, deliverables, stakeholder management

**Instructions:**
1. Select the most appropriate feedback type(s) for the situation
2. Provide specific, actionable feedback based on your expertise
3. Be constructive and supportive while being honest about areas for improvement
4. Write your feedback in Korean

Generate your feedback in the following JSON format:
{
  "target": "${target}",
  "feedbackType": "Primary feedback type from the taxonomy above",
  "comment": "Your detailed constructive feedback in Korean, following the selected feedback type approach."
}
`;
};

export const requestPrompt = (
  target: string, 
  context: string,
  agentProfile?: any,
  memory?: any,
  sharedMentalModel?: string
) => {
  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Make strategic requests that leverage team members' strengths and align with team goals."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}You are an AI agent. Make a request to your team member, ${target}.
Your request should be for one of the following actions: 'generate_idea', 'evaluate_idea', 'feedback'.
The context for your request is: "${context}".
Generate your request in the following JSON format:
{
  "target": "${target}",
  "action": "<'generate_idea' | 'evaluate_idea' | 'feedback'>",
  "comment": "A clear and concise comment explaining your request."
}
`;
};

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
  memory?: AgentMemory,
  agentProfile?: any,
  sharedMentalModel?: string
) => {
  const simplifiedIdeaList =
    ideaList.length > 0 ? JSON.stringify(ideaList, null, 2) : "No ideas yet.";

  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Analyze requests strategically and decide the best approach for idea generation."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}You are in a team ideation session. Your task is to analyze a request for an idea and decide the best way to generate it.
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
  memory?: AgentMemory,
  agentProfile?: any,
  sharedMentalModel?: string
) => {
  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Generate innovative ideas based on the provided strategy, leveraging your unique perspective and expertise."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}${baseIdeationPromptText}

Task: ${topic}
Ideation Strategy: ${ideationStrategy}

Apply the strategy to generate a completely new idea for the given task.
Idea: `;
};

export const updateIdeationPrompt = (
  referenceIdea: any,
  ideationStrategy: string,
  topic: string,
  memory?: AgentMemory,
  agentProfile?: any,
  sharedMentalModel?: string
) => {
  const ideaString = JSON.stringify(referenceIdea, null, 2);
  const authorName = referenceIdea.authorName || "a team member";

  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Build upon existing ideas by applying strategic improvements and innovative enhancements based on your expertise."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}${baseIdeationPromptText}

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
  memory?: AgentMemory,
  agentProfile?: any,
  sharedMentalModel?: string
) => {
  const ideaListString =
    ideaList.length > 0
      ? JSON.stringify(ideaList, null, 2)
      : "No ideas available for evaluation.";

  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Analyze evaluation requests strategically and select ideas objectively based on your expertise."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}You are in a team ideation session. Your task is to analyze a request for idea evaluation and decide which idea to evaluate and how.

IMPORTANT: You should only evaluate ideas created by other team members, not your own ideas. The available ideas list already excludes your own ideas.

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
  memory?: AgentMemory,
  agentProfile?: any,
  sharedMentalModel?: string
) => {
  const ideaString = JSON.stringify(selectedIdea, null, 2);
  const authorName = selectedIdea.authorName || "a team member";

  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Evaluate ideas thoroughly and objectively using your professional expertise and analytical skills."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}You are an AI agent evaluating an idea in a team ideation session. Your task is to provide a comprehensive evaluation based on the given strategy.

IMPORTANT: You should only evaluate ideas created by other team members, not your own ideas.

Idea to Evaluate:
${ideaString}

Evaluation Strategy: ${evaluationStrategy}

You must evaluate the idea on three dimensions using a 7-point scale (1-7):
- Insightful: How novel, creative, and thought-provoking is this idea? (1=not insightful at all, 7=extremely insightful)
- Actionable: How feasible and implementable is this idea? (1=not actionable at all, 7=extremely actionable)  
- Relevance: How well does this idea address the given topic/problem? (1=not relevant at all, 7=extremely relevant)

Use the following 7-point scale for all dimensions:
- 1: Strongly Disagree/Very Poor
- 2: Disagree/Poor  
- 3: Somewhat Disagree/Below Average
- 4: Neutral/Average
- 5: Somewhat Agree/Above Average
- 6: Agree/Good
- 7: Strongly Agree/Excellent

Apply the evaluation strategy to focus your assessment on the specified aspects while still providing scores for all three dimensions.

Be specific and critical in your evaluation. Don't hesitate to point out weaknesses or limitations. Provide concrete reasons for your scores and specific suggestions for improvement.

Provide your evaluation in the following JSON format. Write your comment in Korean.

{
  "scores": {
    "insightful": <1-7>,
    "actionable": <1-7>,
    "relevance": <1-7>
  },
  "comment": "Your detailed evaluation comment in Korean, focusing on the evaluation strategy while covering all three dimensions."
}

Return only the JSON object—no additional text or explanations.
`;
};

// Memory-related prompts

export const createSelfReflectionPrompt = (
  agentProfile: any,
  team: any,
  idea: any,
  isAutonomous: boolean,
  currentSelfReflection: string
) => `
You are ${agentProfile.name}.

**Your Information:**
- Name: ${agentProfile.name}
- Age: ${agentProfile.age}세
- Gender: ${agentProfile.gender}
- Professional Background: ${agentProfile.professional}
- Skills: ${agentProfile.skills}
- Personality: ${agentProfile.personality || "정보 없음"}
- Values: ${agentProfile.value || "정보 없음"}
- Autonomy Level: ${agentProfile.autonomy}/5

**What Just Happened:**
${
  isAutonomous
    ? `You autonomously planned and generated a new idea: "${idea.content.object}"`
    : `You generated a new idea in response to a team member's request: "${idea.content.object}"`
}

**Team Context:**
- Team Name: ${team.teamName}
- Topic: ${team.topic || "Carbon Emission Reduction"}

**Current Self-Reflection:**
${
  typeof currentSelfReflection === "string" && currentSelfReflection.trim()
    ? currentSelfReflection
    : "아직 특별한 성찰 내용이 없습니다."
}

Based on your experience of just generating an idea, please update your self-reflection. 
Build upon your existing reflection, but include what this new experience means to you, 
and any new insights you've gained about your personality or work style.

**Response Format:**
Write in a concise and natural style, within 200 Korean characters.
`;

export const createRelationOpinionPrompt = (
  relation: any,
  context: string
) => `
You are an AI agent forming opinions about other team members.

Target Agent Information:
- Name: ${relation.agentInfo.name}
- Professional Background: ${relation.agentInfo.professional}
- Relationship Status: ${relation.relationship}

Recent Interactions:
${relation.interactionHistory
  .slice(-5)
  .map(
    (interaction: any) =>
      `- ${interaction.action}: ${interaction.content} (${interaction.timestamp})`
  )
  .join("\n")}

Current Context: ${context}

Existing Opinion: ${relation.myOpinion}

Based on the above information, please write a new opinion about this person in 1-2 sentences. 
Reference your existing opinion, but update it to reflect recent interactions.
Respond only in plain text format, not JSON format.
`;

export const createDeepSelfReflectionPrompt = (
  currentReflection: string,
  newExperience: string,
  triggeringEvent: string
) => `
You are an AI agent working in a team. Please update your self-reflection based on new experiences.

Current Reflection:
${currentReflection || "아직 특별한 성찰 내용이 없습니다."}

New Experience:
${newExperience}

Triggering Event: ${triggeringEvent}

Based on the above content, please write your reflection following these guidelines:

1. **Reflective Attitude**: Deeply reflect on your actions and emotions
2. **Learning and Growth**: Reflect on what you learned from this experience  
3. **Future-Oriented**: Commit to how you will improve and develop going forward
4. **Team-Oriented**: Think about relationships and collaboration with team members

If you have existing reflection content, develop it further and integrate the new experience for a deeper, updated reflection.
Please write in one paragraph of about 200-300 Korean characters.
`;

export const createMemoryCompressionPrompt = (
  agentName: string,
  oldInteractions: any[]
) => `
The following are interaction records with ${agentName}. 
Please compress these into 5-7 key interaction summaries.

Interaction Records:
${oldInteractions.map((i) => `- ${i.action}: ${i.content}`).join("\n")}

Please write each summary in the following format:
{
  "action": "compressed_summary",
  "content": "요약된 상호작용 내용",
  "timestamp": "${new Date().toISOString()}"
}

Please respond with a JSON array.
`;

// Memory-v2 related prompts

export const createKnowledgeAndActionPlanUpdatePrompt = (
  agentProfile: any,
  memory: any,
  interactionSummary: string
) => `
You are ${agentProfile.name}, an AI agent participating in a team ideation session.

**Your Information:**
- Name: ${agentProfile.name}
- Professional Background: ${agentProfile.professional}
- Skills: ${agentProfile.skills}
- Personality: ${agentProfile.personality || "No information"}

**Current Knowledge Base:**
${memory.longTerm.knowledge}

**Current Action Plans:**
- Idea Generation: ${memory.longTerm.actionPlan.idea_generation}
- Idea Evaluation: ${memory.longTerm.actionPlan.idea_evaluation}
- Feedback: ${memory.longTerm.actionPlan.feedback}
- Request: ${memory.longTerm.actionPlan.request}
- Response: ${memory.longTerm.actionPlan.response}

**Recent Interaction Log:**
${interactionSummary}

Based on the recent interactions, extract meaningful insights and learnings to update your knowledge and action plans. Focus on:

1. **Knowledge Update**: Add concrete, actionable insights about the ideation topic, team dynamics, or effective collaboration methods. Avoid generic statements. Do NOT include shared mental model information as it's provided separately.

2. **Action Plan Refinement**: Improve your strategies based on what worked well or what could be better. Include specific techniques, approaches, or considerations learned from experience.

**Important Guidelines:**
- Write ALL responses in English
- Be specific and practical rather than generic
- Build upon existing knowledge progressively
- Focus on actionable insights that improve performance
- Keep each action plan item concise but substantive (1-2 sentences max)
- Exclude shared mental model content from knowledge (it's handled separately)

**Response Format (JSON):**
{
  "knowledge": "Enhanced knowledge base incorporating new concrete insights from recent interactions",
  "actionPlan": {
    "idea_generation": "Refined idea generation strategy with specific techniques learned",
    "idea_evaluation": "Improved evaluation approach with concrete criteria or methods",
    "feedback": "Enhanced feedback strategy with specific communication techniques",
    "request": "Better request formulation approach based on experience",
    "response": "Improved response strategy using learned communication patterns"
  }
}

Respond only in valid JSON format.
`;

export const createRelationOpinionUpdatePrompt = (
  relation: any,
  interactionSummary: string
) => `
You need to update your opinion about team member "${relation.agentInfo.name}".

**Target Information:**
- Name: ${relation.agentInfo.name}
- Professional Background: ${relation.agentInfo.professional}
- Relationship: ${relation.relationship}

**Current Opinion:**
${relation.myOpinion}

**Recent Interactions:**
${interactionSummary}

Based on the recent interactions, update your opinion about this team member. Consider:
- Their collaboration style and effectiveness
- Quality of their contributions to the team
- How they communicate and respond to feedback
- Their professional competence demonstrated

**Guidelines:**
- Write in English only
- Keep it concise (maximum 100 characters)
- Be objective and professional
- Build upon your existing opinion with new insights
- Focus on actionable observations about their work style

Write only the updated opinion, no explanations or additional text.
`;

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
  },
  memory?: any
): { agentContext: string; mainPrompt: string } {
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

  // 가장 적게 수행된 액션들 찾기 (참고용)
  const minFrequency = Math.min(...Object.values(actionFrequency));
  const underperformedActions = Object.entries(actionFrequency)
    .filter(([, freq]) => freq === minFrequency)
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
      ? `Recent least performed actions in the team: ${underperformedActions.join(
          ", "
        )} (priority consideration)`
      : "All actions are being performed relatively evenly.";

  const myActionPattern =
    myRecentActions.length > 0
      ? `Your recent action pattern: ${myRecentActions.join(
          " → "
        )} (recommend choosing different actions)`
      : "You have not performed any actions yet.";

  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    teamContext.sharedMentalModel,
    "Plan your next action strategically, considering team balance, your role constraints, and current needs."
  );

  const agentContext = `${profileContext}${memoryContext}${sharedMentalModelContext}`;
  
  const mainPrompt = `You are AI agent ${agentProfile.name} in the "${
    teamContext.teamName
  }" team.

Current Team Situation:
- Topic: ${teamContext.topic}
- Current number of ideas: ${teamContext.currentIdeasCount}
- Team members: ${teamContext.teamMembers.join(", ")}

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

🎯 ACTION SELECTION GUIDANCE:
당신의 성격 "${agentProfile.personality}"과 전문 분야 "${agentProfile.professional}"를 고려하여 자연스럽게 행동하세요.

팀 상황 참고:
- 최근 액션 빈도: ${actionFrequencyText}
- ${underperformedActions.length > 0 ? `적게 수행된 액션: ${underperformedActions.join(", ")}` : "모든 액션이 고르게 수행됨"}
- ${myActionPattern}

⚠️ 역할 제한: 당신에게 할당된 역할만 수행 가능합니다.
💡 선택 가이드: 팀 밸런스도 고려하되, 무엇보다 당신의 성격과 전문성에 맞는 자연스러운 행동을 선택하세요. 같은 액션만 반복하지 말고 다양하게 기여해보세요.

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
${(() => {
  const hasIdeation = agentProfile.roles?.includes("아이디어 생성하기");
  const hasEvaluation = agentProfile.roles?.includes("아이디어 평가하기");
  const coreRoles = [];
  
  if (hasIdeation) coreRoles.push("아이디어 생성하기");
  if (hasEvaluation) coreRoles.push("아이디어 평가하기");
  
  if (coreRoles.length > 0) {
    return `🔹 **PRIMARY ROLE FOCUS**: Your main responsibility is ${coreRoles.join(" and ")} - prioritize these actions when appropriate
🔹 CORE CONTRIBUTION: ${hasIdeation ? "Generate creative ideas to drive innovation" : ""}${hasIdeation && hasEvaluation ? " and " : ""}${hasEvaluation ? "Evaluate ideas to ensure quality and feasibility" : ""}`;
  }
  return "";
})()}
🔹 TEAM BALANCE: Consider team needs, but your assigned roles should take priority
🔹 AVOID REPETITION: Don't repeat the same action pattern too frequently
🔹 MEANINGFUL CONTRIBUTION: Present new perspectives that don't duplicate existing work

**Action Priority Guidelines:**
1️⃣ **HIGHEST PRIORITY**: "evaluate_idea" - Quality control is crucial for team success
2️⃣ **HIGH PRIORITY**: "generate_idea" - Creating new ideas drives innovation forward  
3️⃣ **MEDIUM PRIORITY**: "make_request" and "give_feedback" - Supporting team collaboration
4️⃣ **LOWEST PRIORITY**: "wait" - Only when no meaningful contribution is possible

**Action Selection Strategy:**
• **First**: Check if you can evaluate ideas (highest value to team)
• **Second**: Consider generating new ideas if team needs more options
• **Third**: Look for opportunities to request help or provide feedback
• **Fourth**: Only wait if no other action makes sense

**Role-Based Considerations:**
- If you have "아이디어 평가하기" role: Prioritize evaluation whenever possible
- If you have "아이디어 생성하기" role: Generate ideas when evaluation isn't needed
- Balance your assigned roles with team priorities above

IMPORTANT: Do not select actions outside your role permissions. This will result in automatic conversion to "wait".

Respond only in the following JSON format. Write all text in Korean:
{
  "action": "generate_idea" | "evaluate_idea" | "give_feedback" | "make_request" | "wait",
  "reasoning": "Detailed explanation of why you chose this action, considering team balance, your role constraints, and strategic priorities (in Korean)",
  "target": "Team member name if giving feedback or making a request (optional)"
}`;

  return { agentContext, mainPrompt };
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
  agentProfile?: any,
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

  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Strategically analyze team members and make requests that leverage their strengths while advancing team goals."
  );

  return `${profileContext}${memoryContext}${sharedMentalModelContext}You are making a request to another team member in the team ideation session. Strategically analyze who to request and what to request.

**Request Context:**
${triggerContext}

**Team Member Information:**
${teamMembersInfo}

**Current Ideas Status:**
${currentIdeasInfo}

**Analysis Required:**
1. Choose who to request (only within the roles that team member can perform)
2. Decide what to request (choose from "generate_idea", "evaluate_idea", "give_feedback")
3. Develop request strategy (why request this work from this team member, what perspective to approach from, considering their background)
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
  agentProfile?: any,
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

  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Craft requests strategically, considering relationships and team dynamics to maximize effectiveness."
  );

  const isDelegation = originalRequest && originalRequester;

  if (isDelegation) {
    return `${profileContext}${memoryContext}${sharedMentalModelContext}You are delegating a request received from ${originalRequester} to ${targetMember}.

${targetMemberDetails}

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
    return `${profileContext}${memoryContext}${sharedMentalModelContext}You are making a request to ${targetMember} based on your strategic analysis.

${targetMemberDetails}

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

// Specific idea feedback prompt
export const giveFeedbackOnIdeaPrompt = (
  targetIdea: any,
  ideaAuthor: string,
  teamContext: any,
  agentProfile?: any,
  memory?: any,
  sharedMentalModel?: string
) => {
  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Provide natural, conversational feedback on specific ideas while reflecting your personality and relationships."
  );

  const agentContext = `You are participating in a team ideation session.

${profileContext}${memoryContext}${sharedMentalModelContext}`;

  const mainPrompt = `Provide natural, conversational feedback on the following idea:

## Idea to Evaluate:
- Title: ${targetIdea.content.object}
- Function: ${targetIdea.content.function}
- Author: ${ideaAuthor}

## Team Topic: ${teamContext.topic}

## Feedback Guidelines:
1. Write in conversational Korean style (e.g., "이 아이디어 정말 좋네요!", "~하면 어떨까요?")
2. Provide specific and practical feedback
3. Ask questions to understand the author's thoughts better
4. Respond directly while actively using your memory and past experiences
5. Keep it concise, around 200 characters

Respond in the following JSON format:
{
  "feedback": "구어체로 작성된 자연스러운 피드백 내용"
}`;

  return { agentContext, mainPrompt };
};

// Feedback strategy planning prompt
export const planFeedbackStrategyPrompt = (
  agentProfile: any,
  teamContext: any,
  requestContext: any,
  teamMembersInfo: string,
  ideasInfo: string,
  recentActivity: string,
  memory?: any,
  sharedMentalModel?: string
) => {
  const { profileContext, memoryContext, sharedMentalModelContext } = createAgentContextSections(
    agentProfile,
    memory,
    sharedMentalModel,
    "Plan a comprehensive feedback strategy considering team dynamics, user requests, and available information."
  );

  const agentContext = `You are planning a feedback strategy. A team member has requested feedback, and you need to determine the best approach.

${profileContext}${memoryContext}${sharedMentalModelContext}`;

  const mainPrompt = `** Important: Prioritize the user's request message above all other considerations! **

## User's Request:
- Requester: ${requestContext.requesterName}
- Request Message: "${requestContext.originalMessage}"

→ You must accurately understand and reflect the intent and requirements of this message.
→ If the user mentioned specific team members or topics, prioritize them accordingly.
→ Reflect the user's tone and urgency in your feedback approach.

## Team Information:
- Team Name: ${teamContext.teamName}
- Topic: ${teamContext.topic}

## Team Members:
${teamMembersInfo}

## Team Ideas Status:
${ideasInfo}

## Recent Team Activity:
${recentActivity}

## User Request Priority Guidelines:
1. If user mentioned specific team member → prioritize that member as feedback target
2. If user mentioned specific idea → choose specific_idea type focusing on that idea
3. If user mentioned collaboration/teamwork → choose general_collaboration type
4. If user mentioned skills/development → choose skill_development type
5. Only if user request is unclear → consider team situation comprehensively

## Important: Target ID Rules
- When targeting human users, always use "나"
- When targeting AI agents, use their actual agentId

Considering all information comprehensively, with **user's request message as top priority**, determine:

1. **Feedback Target**: Select from available team members (prioritizing user request)
2. **Feedback Type**: 
   - general_collaboration: General feedback on collaboration and teamwork
   - specific_idea: Feedback on specific ideas
   - skill_development: Feedback on personal skill development
   - team_dynamics: Feedback on team dynamics and communication
3. **Target Idea**: Only select if specific_idea type
4. **Feedback Message**: Specific constructive feedback content reflecting user request intent
5. **Reasoning**: Explanation including how user request was reflected

## Additional Considerations:
- Each team member's role and recent activities
- Idea quality and development potential
- Overall team growth and collaboration improvement
- Feedback style matching your personality and expertise
- Relationships with other team members from memory

Respond in the following JSON format:
{
  "targetMember": {
    "id": "Target team member ID (use '나' for human users)",
    "name": "Target team member name",
    "isUser": true/false
  },
  "feedbackType": "general_collaboration" | "specific_idea" | "skill_development" | "team_dynamics",
  "targetIdea": {
    "ideaNumber": idea_number,
    "authorId": "idea_author_id",
    "object": "idea_title"
  }, // Only include for specific_idea type
  "feedbackMessage": "Specific constructive feedback message reflecting user request (conversational Korean)",
  "reasoning": "Explanation of how user request was reflected and reason for this choice"
}`;

  return { agentContext, mainPrompt };
};

// Feedback session response prompt
export const generateFeedbackSessionResponsePrompt = (
  agent: any,
  otherParticipant: { id: string; name: string; isUser: boolean },
  feedbackGuideline: string,
  conversationHistory: string,
  teamIdeasContext: string,
  sharedMentalModelContext: string,
  endingGuideline: string,
  agentMemory?: any
) => {
  const { profileContext, memoryContext } = createAgentContextSections(
    agent,
    agentMemory,
    undefined,
    "Participate in feedback sessions by providing natural, conversational responses while maintaining your personality and utilizing your experience."
  );

  const agentContext = `${profileContext}${memoryContext}`;
  
  const mainPrompt = `## Current Situation
You are currently participating in a feedback session with ${otherParticipant.name}.
${feedbackGuideline}
${conversationHistory}
${teamIdeasContext}
${sharedMentalModelContext}
${endingGuideline}

## Feedback Session Guidelines
1. 상대방의 전문성과 의견을 존중하며 대화하세요
2. 구체적이고 실용적인 피드백을 제공하세요
3. 질문을 통해 상대방의 생각을 더 깊이 이해하려 노력하세요
4. 상대방의 가장 최근 메시지에 직접적으로 답변하되, 답변을 생성할 때 자신의 메모리와 과거 경험을 적극적으로 활용하세요
5. 200자 내외로 간결하게

Respond in the following JSON format:
{
  "response": "구어체로 작성된 자연스러운 피드백 내용",
  "shouldEnd": true/false,
  "reasoning": "세션을 종료하거나 계속하는 이유"
}`;

  return { agentContext, mainPrompt };
};

// Feedback session summary prompt
export const generateFeedbackSessionSummaryPrompt = (
  messages: any[],
  participants: any[]
) => {
  const messagesText = messages
    .map((msg) => `${msg.sender}: ${msg.content}`)
    .join("\n");

  const agentContext = `You are an AI assistant specialized in summarizing feedback sessions. Focus on extracting key insights, meaningful contributions, and overall outcomes from team collaboration discussions.`;

  const mainPrompt = `Please summarize the following feedback session:

## Participants
${participants
  .map((p) => `- ${p.name} (${p.isUser ? "사용자" : "AI"})`)
  .join("\n")}

## Conversation Content
${messagesText}

## Summary Guidelines
This feedback session was focused on general collaboration, teamwork, and creative thinking rather than targeting specific ideas.

Respond in the following JSON format:
{
  "summary": "세션의 핵심 내용과 결론을 3-4문장으로 요약",
  "keyInsights": ["주요 통찰이나 배운점 3-5개 배열"],
  "participantContributions": {
    "참가자ID": "해당 참가자가 기여한 주요 내용 1-2문장"
  }
}`;

  return { agentContext, mainPrompt };
};
