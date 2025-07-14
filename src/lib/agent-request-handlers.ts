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
import { Evaluation, TeamMember } from "@/lib/types";
import {
  generateIdeaAction,
  evaluateIdeaAction,
  getJsonResponse,
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
    const baseAgentProfile = await getAgentById(agentId);

    if (!team || !baseAgentProfile) {
      console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
      return;
    }

    // TeamMember 정보로 agentProfile 강화
    const teamMember = team.members.find((m) => m.agentId === agentId);
    const agentProfile = {
      ...baseAgentProfile,
      roles: teamMember?.roles || [],
      isLeader: teamMember?.isLeader || false
    };

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
    
    // Helper function to get author name
    const getAuthorName = async (authorId: string) => {
      if (authorId === "나") return "나";
      
      const member = team?.members.find((m: any) => m.agentId === authorId);
      if (member && !member.isUser) {
        // Find agent profile
        const agent = await getAgentById(authorId);
        return agent?.name || `에이전트 ${authorId}`;
      }
      
      return authorId;
    };

    const existingIdeas = await Promise.all(ideas.map(async (idea, index) => ({
      ideaNumber: index + 1,
      authorName: await getAuthorName(idea.author),
      object: idea.content.object,
      function: idea.content.function,
      behavior: idea.content.behavior,
      structure: idea.content.structure,
    })));

    const agentMemory = await getAgentMemory(agentId);
    
    // 1단계: 아이디어 생성 요청 사전 분석 (새로 만들지 기존 것을 업데이트할지 결정)
    const requestMessage = requestData.payload?.message || "새로운 아이디어를 생성해주세요";
    const preAnalysis = await (await import("@/lib/openai")).preIdeationAction(
      requestMessage,
      existingIdeas,
      agentProfile,
      agentMemory || undefined
    );

    console.log(`🔍 아이디어 생성 사전 분석 완료:`, {
      decision: preAnalysis.decision,
      ideationStrategy: preAnalysis.ideationStrategy,
      selectedIdea: preAnalysis.selectedIdea
    });

    // 2단계: 결정에 따른 아이디어 생성 또는 업데이트 실행
    let generatedContent;
    if (preAnalysis.decision === "Update" && preAnalysis.selectedIdea) {
      // 기존 아이디어를 참조하여 업데이트
      const referenceIdea = ideas.find(idea => 
        idea.content.object === preAnalysis.selectedIdea.object ||
        (idea.id && preAnalysis.selectedIdea.ideaNumber && 
         ideas.indexOf(idea) + 1 === preAnalysis.selectedIdea.ideaNumber)
      );

      console.log(`🔄 기존 아이디어 업데이트 모드:`, referenceIdea?.content.object);

      generatedContent = await (await import("@/lib/openai")).executeIdeationAction(
        "Update",
        preAnalysis.ideationStrategy,
        team.topic || "Carbon Emission Reduction",
        referenceIdea,
        agentProfile,
        agentMemory || undefined
      );
    } else {
      // 새로운 아이디어 생성
      console.log(`✨ 새로운 아이디어 생성 모드`);

      generatedContent = await (await import("@/lib/openai")).executeIdeationAction(
        "New",
        preAnalysis.ideationStrategy,
        team.topic || "Carbon Emission Reduction",
        undefined,
        agentProfile,
        agentMemory || undefined
      );
    }

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
        content: `${requestData.requesterName}의 요청에 따라 ${preAnalysis.decision === "Update" ? "기존 아이디어를 개선한" : "새로운"} 아이디어를 생성했습니다.`,
      },
    });

    console.log(
      `✅ ${agentProfile.name} 아이디어 생성 완료:`,
      generatedContent.object
    );
  } catch (error) {
    console.error(`❌ ${agentId} 아이디어 생성 실패:`, error);

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
    const baseAgentProfile = await getAgentById(agentId);

    if (!team || !baseAgentProfile) {
      console.error(`❌ ${agentId} 팀 또는 에이전트 정보 없음`);
      return;
    }

    // TeamMember 정보로 agentProfile 강화
    const teamMember = team.members.find((m) => m.agentId === agentId);
    const agentProfile = {
      ...baseAgentProfile,
      roles: teamMember?.roles || [],
      isLeader: teamMember?.isLeader || false
    };

    const requesterName = requestData.requesterName;
    const requesterId = requestData.requesterId;

    // 사용자가 직접 피드백을 요청한 경우 - 새로운 세션 생성하지 않고 기존 세션에 응답
    if (requesterId === "나" || requesterName === "나") {
      console.log(
        `👤 사용자가 ${agentProfile.name}에게 피드백을 요청함 - 기존 세션에 응답`
      );
      
      // 사용자가 이미 피드백 세션을 시작했으므로, AI는 응답만 하면 됨
      // 새로운 세션을 만들지 않고 여기서 처리 완료
      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: `피드백 요청을 확인했습니다. 곧 피드백을 제공하겠습니다.`,
        },
      });
      
      console.log(`✅ ${agentProfile.name} 사용자 피드백 요청 확인 완료`);
      return;
    }

    // AI 에이전트가 다른 AI에게 피드백을 요청한 경우에만 새로운 세션 생성
    console.log(
      `🤖 AI 에이전트 ${requesterName}가 ${agentProfile.name}에게 피드백 요청 - 새로운 세션 생성`
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

    // 사용자가 요청한 피드백이므로 preFeedbackPrompt에 요청 컨텍스트 전달
    // 실제 사용자("나")의 아이디어를 가져오기
    const userIdeas = feedbackContext.existingIdeas
      .filter(idea => idea.authorId === "나")
      .map(idea => ({
        content: {
          object: idea.object,
          function: idea.function,
          behavior: idea.behavior,
          structure: idea.structure
        }
      }));

    console.log(`🔍 사용자 아이디어 확인 (${userIdeas.length}개):`, 
      userIdeas.map(idea => idea.content.object));

    const { preFeedbackPrompt } = await import("@/core/prompts");
    const preFeedbackPromptText = preFeedbackPrompt(
      "나", // 기본적으로 사용자를 대상으로 설정
      userIdeas, // 실제 사용자 아이디어 전달
      feedbackContext.agentMemory,
      agentProfile,
      {
        isRequestBased: true,
        requesterName,
        requestMessage: requestData.payload?.message || "피드백을 요청했습니다.",
        teamContext: {
          teamName: team.teamName || "팀",
          topic: team.topic || "아이디에이션",
          availableMembers: feedbackContext.availableMembers,
          existingIdeas: feedbackContext.existingIdeas,
          recentMessages: feedbackContext.recentMessages,
        }
      }
    );

    const feedbackStrategy = await getJsonResponse(preFeedbackPromptText, agentProfile);

    console.log(`🎯 ${agentProfile.name} 피드백 전략 결정 완료:`, {
      target: feedbackStrategy.targetMember?.name || "나",
      type: feedbackStrategy.feedbackType,
      reasoning: feedbackStrategy.reasoning,
    });

    // 요청 기반 피드백에서는 targetMember가 사용자("나")이므로 적절히 처리
    const targetMember = {
      id: "나",
      name: "나",
      isUser: true
    };

    // 피드백 전략 수립 후 대상이 현재 피드백 세션 중인지 재확인
    const isTargetBusy = await isInActiveFeedbackSession(targetMember.id);

    if (isTargetBusy) {
      console.log(
        `⚠️ ${targetMember.name}이 현재 피드백 세션 중이므로 피드백 불가능`
      );

      // 간단한 메시지 생성 (generateBusyTargetMessage 함수 대신)
      const busyMessage = `${targetMember.name}는 현재 다른 피드백 세션에 참여 중입니다.`;

      await addChatMessage(teamId, {
        sender: agentId,
        type: "system",
        payload: {
          content: busyMessage,
        },
      });

      // 상태를 idle로 전환
      await setAgentState(teamId, agentId, {
        agentId,
        currentState: "idle",
        lastStateChange: new Date().toISOString(),
        isProcessing: false,
        currentTask: undefined,
      });

      return;
    }

    // executeFeedbackSession이 예상하는 형식으로 feedbackStrategy 변환
    const adaptedFeedbackStrategy = {
      targetMember,
      feedbackType: feedbackStrategy.feedbackType || "general_collaboration",
      reasoning: feedbackStrategy.reasoning || "요청 기반 피드백",
      feedbackMessage: `${requesterName}의 요청에 따른 피드백을 제공합니다.`,
      ...feedbackStrategy
    };

    await executeFeedbackSession(
      teamId,
      agentId,
      adaptedFeedbackStrategy,
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
  let isFeedbackSession = false;
  try {
    const { redis } = await import("@/lib/redis");
    const teamId = await extractTeamIdFromAgentId(agentId);

    if (teamId) {
      // redis.keys() 대신 smembers() 사용
      const activeSessionIds = await redis.smembers(
        `team:${teamId}:active_feedback_sessions`
      );

      for (const sessionId of activeSessionIds) {
        const sessionData = await redis.get(`feedback_session:${sessionId}`);
        if (sessionData) {
          const session =
            typeof sessionData === "string"
              ? JSON.parse(sessionData)
              : sessionData;

          if (
            session.status === "active" &&
            session.participants.some((p: any) => p.id === agentId)
          ) {
            isFeedbackSession = true;
            break;
          }
        } else {
          // 존재하지 않는 세션은 set에서 제거
          redis.srem(`team:${teamId}:active_feedback_sessions`, sessionId);
        }
      }
    }
  } catch (error) {
    console.error(`❌ ${agentId} 피드백 세션 확인 실패:`, error);
  }
  return isFeedbackSession;
}

// 평가되지 않은 아이디어 가져오기
function getUnevaluatedIdeas(ideas: any[], agentId: string) {
  const otherIdeas = ideas.filter((idea) => idea.author !== agentId);
  return otherIdeas.filter((idea) => {
    const hasAlreadyEvaluated = idea.evaluations.some(
      (evaluation: Evaluation) => evaluation.evaluator === agentId
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

  // 1단계: 평가 전략 수립 (preEvaluationAction)
  const ideas = await getIdeas(teamId);
  const allIdeas = ideas.map((idea, index) => ({
    ideaNumber: index + 1,
    authorName: idea.author === "나" ? "나" : idea.author,
    object: idea.content.object,
    function: idea.content.function,
    behavior: idea.content.behavior,
    structure: idea.content.structure,
  }));

  const agentMemory = await getAgentMemory(agentId);
  
  try {
    // Pre-evaluation 단계: 어떤 아이디어를 어떻게 평가할지 전략 수립
    const { preEvaluationAction } = await import("@/lib/openai");
    const preAnalysis = await preEvaluationAction(
      "사용자가 요청한 아이디어 평가", // 요청 메시지
      allIdeas,
      agentProfile,
      agentMemory || undefined
    );
    
    console.log(`📊 ${agentProfile.name} 평가 전략:`, preAnalysis);
    
    // 전략에 따라 특정 아이디어 선택하거나 랜덤 선택
    const targetIdea = preAnalysis.targetIdeaNumber 
      ? ideas.find((_, index) => index + 1 === preAnalysis.targetIdeaNumber)
      : unevaluatedIdeas[Math.floor(Math.random() * unevaluatedIdeas.length)];
    
    if (!targetIdea) {
      console.log(`⚠️ 평가할 아이디어를 찾을 수 없음`);
      return;
    }

    console.log(`📊 ${agentProfile.name} → ${targetIdea.content.object} 평가 시작`);

    // 2단계: 실제 평가 수행
    const evaluation = await evaluateIdeaAction(
      targetIdea,
      agentProfile.name,
      team
    );

    const response = await fetch(
      `${
        process.env.NEXTAUTH_URL || "http://localhost:3000"
      }/api/teams/${teamId}/ideas/${targetIdea.id}/evaluate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "TeamBuilder-Internal",
        },
        body: JSON.stringify({
          evaluator: agentId,
          scores: {
            novelty: evaluation.scores.novelty,
            completeness: evaluation.scores.completeness,
            quality: evaluation.scores.quality,
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
        .filter((m: TeamMember) => !m.isUser && m.agentId)
        .map((m: TeamMember) => getAgentById(m.agentId!))
    ),
    getIdeas(teamId),
    getChatHistory(teamId, 5),
    getAgentMemory(agentId),
  ]);

  const validAgents = agents.filter((agent) => agent !== null);

  // 바쁜 에이전트들 찾기 - redis.keys() 대신 smembers() 사용
  const extractedTeamId = await extractTeamIdFromAgentId(agentId);
  const busyAgents = new Set<string>();

  if (extractedTeamId) {
    const activeSessionIds = await redis.smembers(
      `team:${extractedTeamId}:active_feedback_sessions`
    );

    for (const sessionId of activeSessionIds) {
      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (sessionData) {
        const session =
          typeof sessionData === "string"
            ? JSON.parse(sessionData)
            : sessionData;
        if (session.status === "active") {
          session.participants.forEach((p: any) => busyAgents.add(p.id));
        }
      } else {
        // 존재하지 않는 세션은 set에서 제거
        redis.srem(
          `team:${extractedTeamId}:active_feedback_sessions`,
          sessionId
        );
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
  const humanMember = team.members.find((member: TeamMember) => member.isUser);
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
              (tm: TeamMember) => tm.agentId === idea.author
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

  // 🔒 관계 기반 피드백 세션 생성 권한 확인
  const team = await getTeamById(teamId);
  if (!team) {
    console.error(`❌ 팀 ${teamId}를 찾을 수 없음`);
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: {
        content: `팀 정보를 찾을 수 없어 피드백 세션을 생성할 수 없습니다.`,
      },
    });
    return;
  }

  const { canCreateFeedbackSession } = await import("@/lib/relationship-utils");
  const hasRelationship = canCreateFeedbackSession(agentId, targetMember.id, team);
  
  if (!hasRelationship) {
    console.log(`❌ ${agentProfile.name} → ${targetMember.name} 관계가 없어 피드백 세션 생성 불가`);
    await addChatMessage(teamId, {
      sender: agentId,
      type: "system",
      payload: {
        content: `${targetMember.name}와 관계가 연결되지 않아 피드백 세션을 생성할 수 없습니다.`,
      },
    });
    return;
  }

  console.log(`✅ ${agentProfile.name} → ${targetMember.name} 관계 기반 피드백 세션 권한 확인 완료`);

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
        `❌ ${agentName} 첫 피드백 메시지 생성 트리거 실패 (대상: ${targetName})`
      );
    }
  } catch (error) {
    console.error(
      `❌ ${agentName} 첫 피드백 메시지 생성 트리거 오류 (대상: ${targetName}):`,
      error
    );
  }
}

// 유틸리티: 에이전트 ID로부터 팀 ID 추출
async function extractTeamIdFromAgentId(
  agentId: string
): Promise<string | null> {
  try {
    // Redis에서 agent_state 키 패턴으로 팀 ID 찾기
    // 패턴: agent_state:teamId:agentId
    const stateKeys = await redis.keys(`agent_state:*:${agentId}`);

    if (stateKeys.length > 0) {
      // 첫 번째 키에서 팀 ID 추출
      const keyParts = stateKeys[0].split(":");
      if (keyParts.length >= 3) {
        const teamId = keyParts[1]; // agent_state:{teamId}:agentId
        return teamId;
      }
    }

    return null;
  } catch (error) {
    console.error(`❌ ${agentId} 팀 ID 추출 오류:`, error);
    return null;
  }
}
