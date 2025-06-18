import {
  getTeamById,
  getAgentById,
  getIdeas,
  addIdea,
  addChatMessage,
  getAgentMemory,
  getChatHistory,
  redis,
} from "@/lib/redis";
import {
  generateIdeaAction,
  evaluateIdeaAction,
  planFeedbackStrategy,
} from "@/lib/openai";
import {
  AgentStateInfo,
  getAgentState,
  setAgentState,
  isFeedbackSessionActive,
} from "@/lib/agent-state-utils";

// 직접 아이디어 평가 요청 처리
export async function handleEvaluateIdeaRequestDirect(
  teamId: string,
  agentId: string,
  requestData: any
) {
  console.log(
    `📊 에이전트 ${agentId} 아이디어 평가 요청 직접 처리 (요청 이미 수락됨)`
  );

  try {
    // 피드백 세션 체크 제거 - 요청 접수 시점에 이미 체크했음
    console.log(`🎯 ${agentId} 아이디어 평가 요청 처리 시작 (세션 체크 스킵)`);

    const ideas = await getIdeas(teamId);
    if (ideas.length === 0) {
      console.log(`⚠️ 에이전트 ${agentId} 평가할 아이디어가 없음`);
      return;
    }

    const unevaluatedIdeas = getUnevaluatedIdeas(ideas, agentId);
    if (unevaluatedIdeas.length === 0) {
      console.log(
        `⚠️ 에이전트 ${agentId} 평가할 새로운 아이디어가 없음 (모두 평가 완료)`
      );
      return;
    }

    await performIdeaEvaluation(teamId, agentId, unevaluatedIdeas);
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 평가 요청 처리 실패:`, error);
  }
}

// 아이디어 생성 요청 처리
export async function handleGenerateIdeaRequestDirect(
  teamId: string,
  agentId: string,
  requestData: any
) {
  console.log(
    `📊 에이언트 ${agentId} 아이디어 생성 요청 직접 처리 (요청 이미 수락됨)`
  );

  try {
    // 피드백 세션 체크 제거 - 요청 접수 시점에 이미 체크했음
    console.log(`🎯 ${agentId} 아이디어 생성 요청 처리 시작 (세션 체크 스킵)`);

    const team = await getTeamById(teamId);
    const agentProfile = await getAgentById(agentId);

    if (!team || !agentProfile) {
      console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
      return;
    }

    await setAgentState(teamId, agentId, {
      agentId,
      currentState: "action",
      lastStateChange: new Date().toISOString(),
      isProcessing: true,
      currentTask: {
        type: "generate_idea",
        description: `요청받은 아이디어 생성`,
        startTime: new Date().toISOString(),
        estimatedDuration: 300,
        trigger: "user_request",
        requestInfo: {
          requesterName: requestData.requesterName,
          requestMessage: requestData.payload?.message || "",
        },
      },
    });

    console.log(`🎯 ${agentProfile.name} 요청받은 아이디어 생성 시작`);

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
        content: `${requestData.requesterName}의 요청에 따라 새로운 아이디어를 생성했습니다.`,
      },
    });

    console.log(
      `✅ ${agentProfile.name} 아이디어 생성 완료:`,
      generatedContent.object
    );

    if (response.ok) {
      const result = await response.json();
      console.log(
        `✅ ${agentProfile.name} 요청받은 아이디어 생성 완료:`,
        result.idea
      );

      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `요청에 따라 새로운 아이디어를 생성했습니다: "${result.idea.content.object}"`,
        },
      });
    } else {
      console.error(
        `❌ ${agentProfile.name} 아이디어 저장 실패:`,
        response.status
      );
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `아이디어 저장에 실패했습니다. (오류: ${response.status})`,
        },
      });
    }
  } catch (error) {
    console.error(`❌ ${agentProfile.name} 아이디어 생성 실패:`, error);

    // LLM 응답 파싱 실패인지 확인
    const isJsonParseError =
      error instanceof Error &&
      (error.message.includes("JSON.parse") ||
        error.message.includes("not valid JSON") ||
        error.message.includes("Unexpected token"));

    if (isJsonParseError) {
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `아이디어 생성 중 AI 응답 오류가 발생했습니다. 다시 시도해주세요.`,
        },
      });
    } else {
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `아이디어 생성 중 오류가 발생했습니다.`,
        },
      });
    }
  }
}

// 피드백 요청 처리
export async function handleGiveFeedbackRequestDirect(
  teamId: string,
  agentId: string,
  requestData: any
) {
  console.log(
    `💬 에이전트 ${agentId} 피드백 요청 직접 처리 (요청 이미 수락됨)`
  );

  try {
    const team = await getTeamById(teamId);
    const agentProfile = await getAgentById(agentId);

    if (!team || !agentProfile) {
      console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
      return;
    }

    const requesterName = requestData.requesterName;
    const requesterId = requestData.requesterId;

    // 피드백 세션 체크 제거 - 요청 접수 시점에 이미 체크했음
    console.log(
      `🎯 ${agentProfile.name} 피드백 요청 처리 시작 (세션 체크 스킵)`
    );

    await setAgentState(teamId, agentId, {
      agentId,
      currentState: "action",
      lastStateChange: new Date().toISOString(),
      isProcessing: true,
      currentTask: {
        type: "give_feedback",
        description: `${requesterName}의 요청에 따른 피드백 전략 수립 중`,
        startTime: new Date().toISOString(),
        estimatedDuration: 60,
        trigger: "user_request",
        requestInfo: {
          requesterName: requesterName,
          requestMessage: requestData.payload?.message || "",
        },
      },
    });

    console.log(`🎯 ${agentProfile.name} 피드백 전략 수립 시작`);

    const feedbackContext = await prepareFeedbackContext(
      teamId,
      agentId,
      team,
      requestData
    );

    if (!feedbackContext.availableMembers.length) {
      console.log(
        `⚠️ ${agentProfile.name} 현재 사용 가능한 피드백 대상이 없음`
      );
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `현재 모든 팀원이 다른 작업 중이어서 피드백을 제공할 수 없습니다.`,
        },
      });
      return;
    }

    const feedbackStrategy = await planFeedbackStrategy(
      agentProfile,
      {
        teamName: team.teamName || "팀",
        topic: team.topic || "아이디에이션",
        teamMembers: feedbackContext.availableMembers,
        existingIdeas: feedbackContext.existingIdeas,
        recentMessages: feedbackContext.recentMessages,
      },
      {
        requesterName,
        originalMessage:
          requestData.payload?.message || "피드백을 요청했습니다.",
      },
      feedbackContext.agentMemory || undefined
    );

    console.log(`🎯 ${agentProfile.name} 피드백 전략 결정 완료:`, {
      target: feedbackStrategy.targetMember.name,
      type: feedbackStrategy.feedbackType,
      reasoning: feedbackStrategy.reasoning,
    });

    await executeFeedbackSession(
      teamId,
      agentId,
      feedbackStrategy,
      agentProfile,
      requestData
    );
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 피드백 요청 처리 실패:`, error);

    // LLM 응답 파싱 실패인지 확인
    const isJsonParseError =
      error instanceof Error &&
      (error.message.includes("JSON.parse") ||
        error.message.includes("not valid JSON") ||
        error.message.includes("Unexpected token"));

    if (isJsonParseError) {
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `피드백 처리 중 AI 응답 오류가 발생했습니다. 다시 시도해주세요.`,
        },
      });
    } else {
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `피드백 요청 처리 중 오류가 발생했습니다.`,
        },
      });
    }
  }
}

// 활성 피드백 세션 중인지 확인
async function isInActiveFeedbackSession(agentId: string): Promise<boolean> {
  const activeSessions = await redis.keys("feedback_session:*");

  for (const sessionKey of activeSessions) {
    const sessionData = await redis.get(sessionKey);
    if (sessionData) {
      const session =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;

      // 세션 상태가 정확히 "active"이고 참가자에 포함된 경우만 true 반환
      if (
        session.status === "active" &&
        session.participants.some((p: any) => p.id === agentId)
      ) {
        // 추가 검증: 세션이 너무 오래된 경우 (1시간 이상) 무시
        const sessionStartTime = new Date(session.createdAt).getTime();
        const now = Date.now();
        const hourInMs = 60 * 60 * 1000;

        if (now - sessionStartTime > hourInMs) {
          console.log(
            `⚠️ 세션 ${session.id}이 1시간을 초과하여 무시 (만료된 세션)`
          );
          continue;
        }

        console.log(`🔒 ${agentId}는 활성 피드백 세션 ${session.id}에 참가 중`);
        return true;
      }
    }
  }
  return false;
}

// 평가되지 않은 아이디어 가져오기
function getUnevaluatedIdeas(ideas: any[], agentId: string) {
  const otherIdeas = ideas.filter((idea) => idea.author !== agentId);
  return otherIdeas.filter((idea) => {
    const hasAlreadyEvaluated = idea.evaluations.some(
      (evaluation) => evaluation.evaluator === agentId
    );
    return !hasAlreadyEvaluated;
  });
}

// 아이디어 평가 수행
async function performIdeaEvaluation(
  teamId: string,
  agentId: string,
  unevaluatedIdeas: any[]
) {
  const team = await getTeamById(teamId);
  const agentProfile = await getAgentById(agentId);

  if (!team || !agentProfile) {
    console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
    return;
  }

  await setAgentState(teamId, agentId, {
    agentId,
    currentState: "action",
    lastStateChange: new Date().toISOString(),
    isProcessing: true,
    currentTask: {
      type: "evaluate_idea",
      description: `요청받은 아이디어 평가`,
      startTime: new Date().toISOString(),
      estimatedDuration: 300,
      trigger: "user_request",
      requestInfo: {
        requesterName: "사용자 요청",
        requestMessage: "",
      },
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
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `요청받은 아이디어를 평가했습니다.`,
        },
      });
    } else {
      console.error(`❌ ${agentProfile.name} 평가 저장 실패:`, response.status);
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `평가 저장에 실패했습니다. (오류: ${response.status})`,
        },
      });
    }
  } catch (evaluationError) {
    console.error(`❌ ${agentProfile.name} 평가 수행 실패:`, evaluationError);

    // LLM 응답 파싱 실패인지 확인
    const isJsonParseError =
      evaluationError instanceof Error &&
      (evaluationError.message.includes("JSON.parse") ||
        evaluationError.message.includes("not valid JSON") ||
        evaluationError.message.includes("Unexpected token"));

    if (isJsonParseError) {
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `아이디어 평가 중 AI 응답 오류가 발생했습니다. 다시 시도해주세요.`,
        },
      });
    } else {
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `아이디어 평가 중 오류가 발생했습니다.`,
        },
      });
    }
  }

  console.log(`✅ 에이전트 ${agentId} 아이디어 평가 요청 처리 완료`);
}

// 피드백 컨텍스트 준비
async function prepareFeedbackContext(
  teamId: string,
  agentId: string,
  team: any,
  requestData: any
) {
  const [agents, ideas, recentMessages, agentMemory] = await Promise.all([
    Promise.all(
      (team?.members || [])
        .filter((m) => !m.isUser && m.agentId)
        .map((m) => getAgentById(m.agentId!))
    ),
    getIdeas(teamId),
    getChatHistory(teamId, 5),
    getAgentMemory(agentId),
  ]);

  const validAgents = agents.filter((agent) => agent !== null);

  // 바쁜 에이전트들 찾기
  const activeSessions = await redis.keys("feedback_session:*");
  const busyAgents = new Set<string>();

  for (const sessionKey of activeSessions) {
    const sessionData = await redis.get(sessionKey);
    if (sessionData) {
      const session =
        typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;
      if (session.status === "active") {
        session.participants.forEach((p: any) => busyAgents.add(p.id));
      }
    }
  }

  // 팀 멤버 정보 구성
  const teamMembers = [];

  // AI 에이전트들 추가 (본인 제외)
  for (const member of team.members) {
    if (!member.isUser && member.agentId && member.agentId !== agentId) {
      const agent = validAgents.find((a: any) => a?.id === member.agentId);
      if (agent) {
        teamMembers.push({
          id: member.agentId,
          name: agent.name,
          isUser: false,
          roles: member.roles || [],
          isAvailable: !busyAgents.has(member.agentId),
        });
      }
    }
  }

  // 인간 사용자 추가
  const humanMember = team.members.find((member) => member.isUser);
  if (humanMember) {
    teamMembers.push({
      id: "나",
      name: "나",
      isUser: true,
      roles: humanMember.roles || [],
      isAvailable: !busyAgents.has("나"),
    });
  }

  const existingIdeas = ideas.map((idea, index) => ({
    ideaNumber: index + 1,
    authorId: idea.author,
    authorName:
      idea.author === "나"
        ? "나"
        : (() => {
            const member = team?.members.find(
              (tm) => tm.agentId === idea.author
            );
            if (member && !member.isUser) {
              const agent = validAgents.find((a: any) => a?.id === idea.author);
              return agent?.name || `에이전트 ${idea.author}`;
            }
            return idea.author;
          })(),
    object: idea.content.object,
    function: idea.content.function,
    behavior: idea.content.behavior,
    structure: idea.content.structure,
    timestamp: idea.timestamp,
    evaluations: idea.evaluations || [],
  }));

  return {
    availableMembers: teamMembers.filter((member) => member.isAvailable),
    existingIdeas,
    recentMessages,
    agentMemory,
  };
}

// 피드백 세션 실행
async function executeFeedbackSession(
  teamId: string,
  agentId: string,
  feedbackStrategy: any,
  agentProfile: any,
  requestData: any
) {
  const targetMember = feedbackStrategy.targetMember;

  // 락 키 생성
  const lockKey = `feedback_lock:${[agentId, targetMember.id]
    .sort()
    .join(":")}`;

  const lockAcquired = await redis.set(lockKey, "locked", {
    ex: 30,
    nx: true,
  });

  if (!lockAcquired) {
    console.log(
      `⚠️ ${agentProfile.name} → ${targetMember.name} 피드백 세션 락 획득 실패`
    );
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: {
        content: `${targetMember.name}와의 피드백 세션이 이미 진행 중입니다.`,
      },
    });
    return;
  }

  try {
    const feedbackContext = {
      type: feedbackStrategy.feedbackType,
      initiatedBy: "user_request",
      description: `${requestData.requesterName}의 요청에 따른 ${feedbackStrategy.feedbackType} 피드백`,
      originalRequest: requestData.payload?.message,
      targetIdea: feedbackStrategy.targetIdea,
      aiStrategy: {
        reasoning: feedbackStrategy.reasoning,
        plannedMessage: feedbackStrategy.feedbackMessage,
      },
    };

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
          targetAgentId: targetMember.id,
          message: feedbackStrategy.feedbackMessage,
          feedbackContext: feedbackContext,
        }),
      }
    );

    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      console.log(
        `✅ ${agentProfile.name} → ${targetMember.name} 피드백 세션 생성 성공: ${sessionData.sessionId}`
      );

      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `${requestData.requesterName}의 요청에 따라 ${
            targetMember.name
          }와 ${
            feedbackStrategy.feedbackType === "specific_idea"
              ? "특정 아이디어에 대한"
              : "협업"
          } 피드백 세션을 시작합니다.`,
        },
      });

      await updateAgentStatesForFeedbackSession(
        teamId,
        agentId,
        targetMember,
        agentProfile,
        sessionData.sessionId,
        feedbackStrategy
      );

      // 첫 메시지 생성 트리거
      const delay = targetMember.isUser ? 1000 : 3000;
      setTimeout(async () => {
        await triggerFirstFeedbackMessage(
          teamId,
          sessionData.sessionId,
          agentId,
          agentProfile.name,
          targetMember.name
        );
      }, delay);
    } else {
      const errorData = await sessionResponse.json();
      console.error(
        `❌ ${agentProfile.name} → ${targetMember.name} 피드백 세션 생성 실패:`,
        errorData
      );
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `${targetMember.name}와의 피드백 세션 생성에 실패했습니다.`,
        },
      });
    }
  } finally {
    await redis.del(lockKey);
    console.log(`🔓 ${agentProfile.name} → ${targetMember.name} 락 해제`);
  }
}

// 피드백 세션을 위한 에이전트 상태 업데이트
async function updateAgentStatesForFeedbackSession(
  teamId: string,
  agentId: string,
  targetMember: any,
  agentProfile: any,
  sessionId: string,
  feedbackStrategy: any
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
          taskDescription: `${targetMember.name}와 ${feedbackStrategy.feedbackType} 피드백 세션 진행 중`,
          estimatedDuration: 300,
          trigger: "autonomous",
          sessionInfo: {
            sessionId: sessionId,
            participants: [agentProfile.name, targetMember.name],
            feedbackType: feedbackStrategy.feedbackType,
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
  if (!targetMember.isUser) {
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
            agentId: targetMember.id,
            currentState: "feedback_session",
            taskType: "feedback_session",
            taskDescription: `${agentProfile.name}와 ${feedbackStrategy.feedbackType} 피드백 세션 진행 중`,
            estimatedDuration: 300,
            trigger: "autonomous",
            sessionInfo: {
              sessionId: sessionId,
              participants: [agentProfile.name, targetMember.name],
              feedbackType: feedbackStrategy.feedbackType,
            },
          }),
        }
      );

      if (targetResponse.ok) {
        console.log(
          `✅ ${targetMember.name} 상태가 feedback_session으로 변경됨`
        );
      }
    } catch (error) {
      console.error(
        `❌ ${targetMember.name} feedback_session 상태 변경 오류:`,
        error
      );
    }
  }
}

// 첫 피드백 메시지 트리거
async function triggerFirstFeedbackMessage(
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

// 필요한 함수 임포트 (getChatHistory)
// import { getChatHistory } from "@/lib/redis"; - 이미 위에서 import 됨
