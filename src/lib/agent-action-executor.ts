import {
  getTeamById,
  getAgentById,
  getIdeas,
  addIdea,
  addChatMessage,
  getAgentMemory,
  redis,
} from "@/lib/redis";
import {
  generateIdeaAction,
  evaluateIdeaAction,
  planFeedbackStrategy,
  makeRequestAction,
} from "@/lib/openai";
import { processMemoryUpdate } from "@/lib/memory";
import {
  AgentStateInfo,
  getAgentState,
  setAgentState,
  isFeedbackSessionActive,
  createNewIdleTimer,
} from "@/lib/agent-state-utils";

// 실제 에이전트 작업 실행 함수
export async function executeAgentAction(
  teamId: string,
  agentId: string,
  plannedAction: {
    action:
      | "generate_idea"
      | "evaluate_idea"
      | "give_feedback"
      | "make_request"
      | "wait";
    reasoning: string;
    target?: string;
  }
) {
  try {
    const team = await getTeamById(teamId);
    const agentProfile = await getAgentById(agentId);

    if (!team || !agentProfile) {
      console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
      return;
    }

    console.log(
      `🎯 ${agentProfile.name} 자율 행동 실행: ${plannedAction.action}`
    );

    if (plannedAction.action === "generate_idea") {
      await executeGenerateIdeaAction(teamId, agentId, team, agentProfile);
    }

    if (plannedAction.action === "evaluate_idea") {
      await executeEvaluateIdeaAction(
        teamId,
        agentId,
        team,
        agentProfile,
        false
      );
    }

    if (plannedAction.action === "give_feedback") {
      await executeGiveFeedbackAction(teamId, agentId, team, agentProfile);
    }

    if (plannedAction.action === "make_request") {
      await executeMakeRequestAction(
        teamId,
        agentId,
        team,
        agentProfile,
        plannedAction
      );
    }
  } catch (error) {
    console.error(`❌ ${agentId} 작업 실행 실패:`, error);
    await handleExecutionFailure(teamId, agentId);
  }
}

// 아이디어 생성 액션 실행
async function executeGenerateIdeaAction(
  teamId: string,
  agentId: string,
  team: any,
  agentProfile: any
) {
  const ideas = await getIdeas(teamId);
  const existingIdeas = ideas.map((idea, index) => ({
    ideaNumber: index + 1,
    authorName: idea.author,
    object: idea.content.object,
    function: idea.content.function,
  }));

  const agentMemory = await getAgentMemory(agentId);
  const generatedContent = await generateIdeaAction(
    team.topic || "Carbon Emission Reduction",
    agentProfile,
    existingIdeas,
    agentMemory || undefined
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
    payload: {
      content: `새로운 아이디어를 생성했습니다.`,
    },
  });

  // 메모리 업데이트
  try {
    await processMemoryUpdate({
      type: "IDEA_GENERATED",
      payload: {
        teamId,
        authorId: agentId,
        idea: newIdea,
        isAutonomous: true,
      },
    });
    console.log(
      `✅ 자율적 아이디어 생성 후 메모리 업데이트 성공: ${agentId} -> idea ${newIdea.id}`
    );
  } catch (memoryError) {
    console.error(
      "❌ 자율적 아이디어 생성 후 메모리 업데이트 실패:",
      memoryError
    );
  }

  console.log(
    `✅ ${agentProfile.name} 아이디어 생성 완료:`,
    generatedContent.object
  );
}

// 아이디어 평가 액션 실행
async function executeEvaluateIdeaAction(
  teamId: string,
  agentId: string,
  team: any,
  agentProfile: any,
  skipChatMessage: boolean = false
) {
  const ideas = await getIdeas(teamId);

  if (ideas.length === 0) {
    console.log(`⚠️ ${agentProfile.name} 평가할 아이디어가 없음`);
    return;
  }

  const otherIdeas = ideas.filter((idea) => idea.author !== agentId);

  if (otherIdeas.length === 0) {
    console.log(`⚠️ 에이전트 ${agentId} 평가할 다른 사람의 아이디어가 없음`);
    return;
  }

  const unevaluatedIdeas = otherIdeas.filter((idea) => {
    const hasAlreadyEvaluated = idea.evaluations.some(
      (evaluation) => evaluation.evaluator === agentId
    );
    return !hasAlreadyEvaluated;
  });

  if (unevaluatedIdeas.length === 0) {
    console.log(
      `⚠️ 에이전트 ${agentId} 평가할 새로운 아이디어가 없음 (모두 평가 완료)`
    );
    return;
  }

  await setAgentState(teamId, agentId, {
    agentId,
    currentState: "action",
    lastStateChange: new Date().toISOString(),
    isProcessing: true,
    currentTask: {
      type: "evaluate_idea",
      description: `아이디어 평가`,
      startTime: new Date().toISOString(),
      estimatedDuration: 300,
    },
  });

  const randomIdea =
    unevaluatedIdeas[Math.floor(Math.random() * unevaluatedIdeas.length)];

  console.log(
    `📊 ${agentProfile.name} → ${randomIdea.content.object} 평가 시작`
  );

  try {
    const evaluation = await evaluateIdeaAction(randomIdea, agentProfile.name);

    const response = await fetch(
      `${
        process.env.NEXTAUTH_URL || "http://localhost:3000"
      }/api/teams/${teamId}/ideas/${randomIdea.id}/evaluate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TeamBuilder-Internal",
        },
        body: JSON.stringify({
          evaluator: agentId,
          scores: {
            insightful: evaluation.scores.insightful,
            actionable: evaluation.scores.actionable,
            relevance: evaluation.scores.relevance,
          },
          comment: evaluation.comment,
        }),
      }
    );

    if (response.ok) {
      console.log(`✅ ${agentProfile.name} 아이디어 평가 완료`);

      // skipChatMessage가 true이면 채팅 메시지를 보내지 않음 (요청 처리에서 별도로 처리)
      if (!skipChatMessage) {
        await addChatMessage(teamId, {
          sender: agentId,
          type: "system",
          payload: {
            content: `아이디어를 평가했습니다.`,
          },
        });
      }
    } else {
      console.error(`❌ ${agentProfile.name} 평가 저장 실패:`, response.status);
    }
  } catch (evaluationError) {
    console.error(`❌ ${agentProfile.name} 평가 수행 실패:`, evaluationError);
  }

  console.log(`✅ 에이전트 ${agentId} 아이디어 평가 요청 처리 완료`);
}

// 피드백 제공 액션 실행
async function executeGiveFeedbackAction(
  teamId: string,
  agentId: string,
  team: any,
  agentProfile: any
) {
  console.log(`💬 ${agentProfile.name} 피드백 세션 시작 로직`);

  const ideas = await getIdeas(teamId);

  if (ideas.length === 0) {
    console.log(`⚠️ ${agentProfile.name} 피드백할 아이디어가 없음`);
    return;
  }

  const otherIdeas = ideas.filter((idea) => idea.author !== agentId);

  if (otherIdeas.length === 0) {
    console.log(`⚠️ ${agentProfile.name} 피드백할 다른 사람의 아이디어가 없음`);
    return;
  }

  const agents = await Promise.all(
    (team?.members || [])
      .filter((m) => !m.isUser && m.agentId)
      .map((m) => getAgentById(m.agentId!))
  );
  const validAgents = agents.filter((agent) => agent !== null);

  const otherMembers = team.members.filter(
    (member) => !member.isUser && member.agentId !== agentId
  );

  if (otherMembers.length === 0) {
    console.log(`⚠️ ${agentProfile.name} 피드백할 다른 팀원이 없음`);
    return;
  }

  const targetMember =
    otherMembers[Math.floor(Math.random() * otherMembers.length)];
  const targetAgent = validAgents.find(
    (a: any) => a.id === targetMember.agentId
  );

  if (!targetAgent) {
    console.log(`⚠️ ${agentProfile.name} 대상 에이전트를 찾을 수 없음`);
    return;
  }

  console.log(`🎯 ${agentProfile.name} → ${targetAgent.name} 피드백 세션 생성`);

  // 락 키 생성
  const lockKey = `feedback_lock:${[agentId, targetAgent.id].sort().join(":")}`;

  const lockAcquired = await redis.set(lockKey, "locked", {
    ex: 30,
    nx: true,
  });

  if (!lockAcquired) {
    console.log(
      `⚠️ ${agentProfile.name} → ${targetAgent.name} 피드백 세션 락 획득 실패`
    );
    await handleLockFailure(teamId, agentId, agentProfile.name);
    return;
  }

  try {
    await createFeedbackSession(teamId, agentId, targetAgent, agentProfile);
  } finally {
    await redis.del(lockKey);
    console.log(`🔓 ${agentProfile.name} → ${targetAgent.name} 락 해제`);
  }
}

// 피드백 세션 생성
async function createFeedbackSession(
  teamId: string,
  agentId: string,
  targetAgent: any,
  agentProfile: any
) {
  const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;
  const sessionResponse = await fetch(
    `${baseUrl}/api/teams/${teamId}/feedback-sessions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TeamBuilder-Internal",
      },
      body: JSON.stringify({
        action: "create",
        initiatorId: agentId,
        targetAgentId: targetAgent.id,
        message: `${agentProfile.name}이 피드백을 제공하고 싶어합니다.`,
        feedbackContext: {
          type: "general_feedback",
          initiatedBy: "ai",
          description: "일반적인 협업과 팀워크에 대한 피드백",
        },
      }),
    }
  );

  if (sessionResponse.ok) {
    const sessionData = await sessionResponse.json();
    console.log(
      `✅ ${agentProfile.name} → ${targetAgent.name} 피드백 세션 생성 성공: ${sessionData.sessionId}`
    );

    await updateAgentStatesForFeedbackSession(
      teamId,
      agentId,
      targetAgent,
      agentProfile,
      sessionData.sessionId
    );

    // 첫 메시지 생성 트리거
    const delay = targetAgent.name === "나" ? 1000 : 3000;
    setTimeout(async () => {
      await triggerFeedbackMessage(
        teamId,
        sessionData.sessionId,
        agentId,
        agentProfile.name,
        targetAgent.name
      );
    }, delay);
  } else {
    const errorData = await sessionResponse.json();
    console.error(
      `❌ ${agentProfile.name} → ${targetAgent.name} 피드백 세션 생성 실패:`,
      errorData
    );
    await handleSessionCreationFailure(teamId, agentId, agentProfile.name);
  }
}

// 피드백 세션을 위한 에이전트 상태 업데이트
async function updateAgentStatesForFeedbackSession(
  teamId: string,
  agentId: string,
  targetAgent: any,
  agentProfile: any,
  sessionId: string
) {
  const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;

  // 피드백 제공자 상태 변경
  try {
    const initiatorResponse = await fetch(
      `${baseUrl}/api/teams/${teamId}/agent-states`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TeamBuilder-Internal",
        },
        body: JSON.stringify({
          agentId: agentId,
          currentState: "feedback_session",
          taskType: "feedback_session",
          taskDescription: `${targetAgent.name}와 피드백 세션 진행 중`,
          estimatedDuration: 300,
          trigger: "autonomous",
          sessionInfo: {
            sessionId: sessionId,
            participants: [agentProfile.name, targetAgent.name],
          },
        }),
      }
    );

    if (initiatorResponse.ok) {
      console.log(`✅ ${agentProfile.name} 상태가 feedback_session으로 변경됨`);
    }
  } catch (error) {
    console.error(
      `❌ ${agentProfile.name} feedback_session 상태 변경 오류:`,
      error
    );
  }

  // 대상 에이전트 상태 변경 (인간이 아닌 경우만)
  if (targetAgent.name !== "나") {
    try {
      const targetResponse = await fetch(
        `${baseUrl}/api/teams/${teamId}/agent-states`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "TeamBuilder-Internal",
          },
          body: JSON.stringify({
            agentId: targetAgent.id,
            currentState: "feedback_session",
            taskType: "feedback_session",
            taskDescription: `${agentProfile.name}와 피드백 세션 진행 중`,
            estimatedDuration: 300,
            trigger: "autonomous",
            sessionInfo: {
              sessionId: sessionId,
              participants: [agentProfile.name, targetAgent.name],
            },
          }),
        }
      );

      if (targetResponse.ok) {
        console.log(
          `✅ ${targetAgent.name} 상태가 feedback_session으로 변경됨`
        );
      }
    } catch (error) {
      console.error(
        `❌ ${targetAgent.name} feedback_session 상태 변경 오류:`,
        error
      );
    }
  }
}

// 피드백 메시지 트리거
async function triggerFeedbackMessage(
  teamId: string,
  sessionId: string,
  agentId: string,
  agentName: string,
  targetName: string
) {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;
    const aiProcessResponse = await fetch(
      `${baseUrl}/api/teams/${teamId}/feedback-sessions/${sessionId}/ai-process`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TeamBuilder-Internal",
        },
        body: JSON.stringify({
          triggerAgentId: agentId,
          action: "respond",
        }),
      }
    );

    if (aiProcessResponse.ok) {
      console.log(
        `✅ ${agentName} 첫 피드백 메시지 생성 트리거 성공 (대상: ${targetName})`
      );
    } else {
      console.error(
        `❌ ${agentName} 첫 피드백 메시지 생성 트리거 실패:`,
        aiProcessResponse.status
      );
    }
  } catch (error) {
    console.error(`❌ ${agentName} 첫 피드백 메시지 생성 트리거 오류:`, error);
  }
}

// 실행 실패 처리
async function handleExecutionFailure(teamId: string, agentId: string) {
  const currentState = await getAgentState(teamId, agentId);
  if (currentState && isFeedbackSessionActive(currentState)) {
    console.log(
      `🔒 에이전트 ${agentId}는 피드백 세션 중이므로 실패 후에도 idle 전환 스킵`
    );
    return;
  }

  setTimeout(async () => {
    await transitionToIdleState(teamId, agentId, "실패 후");
  }, 2000);
}

// 락 획득 실패 처리
async function handleLockFailure(
  teamId: string,
  agentId: string,
  agentName: string
) {
  setTimeout(async () => {
    await transitionToIdleState(teamId, agentId, "락 획득 실패 후");
  }, 1000);
}

// 세션 생성 실패 처리
async function handleSessionCreationFailure(
  teamId: string,
  agentId: string,
  agentName: string
) {
  setTimeout(async () => {
    await transitionToIdleState(teamId, agentId, "피드백 세션 생성 실패 후");
  }, 1000);
}

// idle 상태로 전환
async function transitionToIdleState(
  teamId: string,
  agentId: string,
  reason: string
) {
  try {
    const finalState = await getAgentState(teamId, agentId);
    if (finalState && isFeedbackSessionActive(finalState)) {
      console.log(
        `🔒 에이전트 ${agentId}는 여전히 피드백 세션 중이므로 ${reason} idle 전환 스킵`
      );
      return;
    }

    console.log(`😴 에이전트 ${agentId} → ${reason} Idle 상태 전환 시도 중...`);
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:3000`;
    const response = await fetch(
      `${baseUrl}/api/teams/${teamId}/agent-states`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TeamBuilder-Internal",
        },
        body: JSON.stringify({
          agentId,
          currentState: "idle",
        }),
      }
    );

    if (response.ok) {
      console.log(`😴 에이전트 ${agentId} → ${reason} Idle 상태 전환 완료`);
    } else {
      const errorText = await response.text();
      console.error(
        `❌ 에이전트 ${agentId} ${reason} Idle 전환 실패:`,
        response.status,
        errorText
      );
    }
  } catch (e) {
    console.error(`❌ 에이전트 ${agentId} ${reason} Idle 전환 실패:`, e);
  }
}

// 요청 만들기 액션 실행
async function executeMakeRequestAction(
  teamId: string,
  agentId: string,
  team: any,
  agentProfile: any,
  plannedAction: any
) {
  try {
    console.log(`🎯 ${agentProfile.name} 자율적 요청 실행 시작`);

    // 상태를 action으로 설정
    await setAgentState(teamId, agentId, {
      agentId,
      currentState: "action",
      lastStateChange: new Date().toISOString(),
      isProcessing: true,
      currentTask: {
        type: "make_request",
        description: `자율적 요청`,
        startTime: new Date().toISOString(),
        estimatedDuration: 300,
        trigger: "autonomous",
      },
    });

    // 팀원 정보 준비
    const teamMembers = team.members.map((member: any) => ({
      name: member.isUser ? "나" : member.agentId || "Unknown",
      roles: member.roles.map((role: any) => role.toString()),
      isUser: member.isUser,
      agentId: member.agentId || undefined,
    }));

    // 현재 아이디어 정보 가져오기
    const ideas = await getIdeas(teamId);
    const currentIdeas = ideas.map((idea: any, index: number) => ({
      ideaNumber: index + 1,
      authorName: idea.author,
      object: idea.content.object,
      function: idea.content.function,
    }));

    // 에이전트 메모리 가져오기
    const agentMemory = await getAgentMemory(agentId);

    // 자율적 요청 실행
    const triggerContext =
      "팀 상황을 분석한 결과 다른 팀원에게 작업을 요청하기로 결정했습니다.";

    const requestResult = await makeRequestAction(
      triggerContext,
      teamMembers,
      currentIdeas,
      agentProfile,
      agentMemory || undefined
    );

    // 채팅 메시지로 추가
    await addChatMessage(teamId, {
      sender: agentId,
      type: "make_request",
      payload: {
        type: "make_request",
        content: requestResult.message.message,
        mention: requestResult.analysis.targetMember,
        target: requestResult.analysis.targetMember,
        requestType: requestResult.analysis.requestType,
      },
    });

    console.log(`✅ ${agentProfile.name} 자율적 요청 완료:`, {
      target: requestResult.analysis.targetMember,
      type: requestResult.analysis.requestType,
      message: requestResult.message.message,
    });

    // 메모리 업데이트
    try {
      await processMemoryUpdate({
        type: "REQUEST_MADE",
        payload: {
          teamId,
          requesterId: agentId,
          targetId: requestResult.analysis.targetMember,
          requestType: requestResult.analysis.requestType,
          content: requestResult.message.message,
        },
      });
      console.log(
        `✅ 자율적 요청 후 메모리 업데이트 성공: ${agentId} -> ${requestResult.analysis.targetMember}`
      );
    } catch (memoryError) {
      console.error("❌ 자율적 요청 후 메모리 업데이트 실패:", memoryError);
    }

    // 요청 처리는 채팅 API에서 자동으로 처리됨 (중복 메시지 방지를 위해 직접 호출 제거)
    console.log(
      `📨 자율적 요청이 채팅 메시지로 생성되었습니다. 채팅 API에서 요청을 자동 처리할 예정입니다.`
    );
  } catch (error) {
    console.error(`❌ ${agentProfile.name} 자율적 요청 실패:`, error);
    throw error;
  }
}
