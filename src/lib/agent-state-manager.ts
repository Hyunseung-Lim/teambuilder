import {
  AgentStateInfo,
  getAgentState,
  setAgentState,
  isFeedbackSessionActive,
  validateTimer,
  createNewIdleTimer,
} from "@/lib/agent-state-utils";
import {
  getTeamById,
  getAgentById,
  getIdeas,
  getChatHistory,
} from "@/lib/redis";
import { planNextAction } from "@/lib/openai";

// 에이전트 상태 업데이트 (시간 경과 반영)
export async function updateAgentStateTimer(
  teamId: string,
  state: AgentStateInfo
): Promise<AgentStateInfo> {
  const now = new Date();

  // 피드백 세션 중인 에이전트는 자동 상태 전환하지 않음
  if (isFeedbackSessionActive(state)) {
    console.log(`🔒 ${state.agentId} 피드백 세션 중 - 자동 상태 전환 차단`);
    return state;
  }

  if (state.currentState === "idle" && state.idleTimer) {
    // 타이머 안정성 검사
    if (!validateTimer(state)) {
      console.warn(`⚠️ ${state.agentId} 비정상적인 타이머 상태 감지, 초기화`);
      state.idleTimer = createNewIdleTimer();
      return state;
    }

    // idle 타이머 업데이트
    const startTime = new Date(state.idleTimer.startTime).getTime();
    const elapsed = Math.floor((now.getTime() - startTime) / 1000);
    const newRemainingTime = Math.max(
      0,
      state.idleTimer.plannedDuration - elapsed
    );

    state.idleTimer.remainingTime = newRemainingTime;

    // 타이머가 끝나면 planning 실행 (비동기로 처리)
    if (newRemainingTime <= 0) {
      console.log(`🧠 ${state.agentId} planning 시작 (비동기 처리)`);

      // planning 상태로 즉시 전환 (AI 작업은 백그라운드에서 진행)
      state.currentState = "plan";
      state.lastStateChange = now.toISOString();
      state.isProcessing = true;
      state.currentTask = {
        type: "planning",
        description: "다음 행동 계획 수립 중...",
        startTime: now.toISOString(),
        estimatedDuration: 15,
        trigger: "autonomous",
      };
      delete state.idleTimer;

      // AI planning 작업을 백그라운드에서 비동기 실행
      setTimeout(async () => {
        try {
          await executePlanningLogic(teamId, state.agentId, now);
        } catch (error) {
          console.error(`❌ ${state.agentId} planning 실패:`, error);
          await handlePlanningFailure(teamId, state.agentId);
        }
      }, 0);

      return state; // planning 상태로 즉시 반환
    }
  } else if (state.currentTask) {
    // 현재 작업이 있는 경우 시간 업데이트
    const taskStartTime = new Date(state.currentTask.startTime).getTime();
    const elapsed = Math.floor((now.getTime() - taskStartTime) / 1000);

    // 작업 시간이 비정상적으로 긴 경우 강제 종료
    if (elapsed > 600) {
      if (isFeedbackSessionActive(state)) {
        console.log(
          `🔒 ${state.agentId} 작업 시간 초과이지만 피드백 세션 중이므로 강제 종료 차단`
        );
        // 피드백 세션의 경우 더 긴 시간 허용 (30분)
        if (elapsed > 1800) {
          console.warn(
            `⚠️ ${state.agentId} 피드백 세션이 30분을 초과하여 강제 idle 전환`
          );
          state = resetToIdleState(state);
        }
      } else {
        console.warn(`⚠️ ${state.agentId} 작업 시간 초과, 강제 idle 전환`);
        state = resetToIdleState(state);
      }
    }
  }

  return state;
}

// planning 로직 실행
async function executePlanningLogic(
  teamId: string,
  agentId: string,
  now: Date
): Promise<void> {
  const team = await getTeamById(teamId);
  const agentProfile = await getAgentById(agentId);
  const ideas = await getIdeas(teamId);
  const recentMessages = await getChatHistory(teamId, 5);

  const agents = await Promise.all(
    (team?.members || [])
      .filter((m) => !m.isUser && m.agentId)
      .map((m) => getAgentById(m.agentId!))
  );

  // 팀 멤버 정보에서 해당 에이전트의 역할 가져오기
  const teamMember = team?.members.find((m) => m.agentId === agentId);
  const agentProfileWithRoles = agentProfile
    ? {
        ...agentProfile,
        roles: teamMember?.roles || [],
      }
    : null;

  if (!agentProfileWithRoles) {
    console.error(`❌ ${agentId} 에이전트 프로필을 찾을 수 없음`);
    return;
  }

  console.log(
    `🔍 ${agentProfileWithRoles.name}의 팀 멤버 역할:`,
    teamMember?.roles
  );

  // 계획 수립
  const planResult = await planNextAction(agentProfileWithRoles, {
    teamName: team?.teamName || "Unknown Team",
    topic: team?.topic || "Carbon Emission Reduction",
    currentIdeasCount: ideas.length,
    recentMessages: recentMessages,
    teamMembers: (team?.members || [])
      .filter((m) => !m.isUser)
      .map((m) => {
        const agent = agents.filter(Boolean).find((a) => a?.id === m.agentId);
        return agent?.name || `에이전트 ${m.agentId}`;
      }),
    existingIdeas: ideas.map((idea, index) => ({
      ideaNumber: index + 1,
      authorName:
        idea.author === "나"
          ? "나"
          : (() => {
              const member = team?.members.find(
                (tm) => tm.agentId === idea.author
              );
              if (member && !member.isUser) {
                const agent = agents
                  .filter(Boolean)
                  .find((a) => a?.id === idea.author);
                return agent?.name || `에이전트 ${idea.author}`;
              }
              return idea.author;
            })(),
      object: idea.content.object,
      function: idea.content.function,
    })),
    sharedMentalModel: team?.sharedMentalModel,
  });

  // planning 완료 후 상태 업데이트
  const currentState = await getAgentState(teamId, agentId);
  if (currentState && currentState.currentState === "plan") {
    currentState.plannedAction = planResult;
    currentState.currentTask = {
      type: "planning",
      description: `다음 행동 계획: ${planResult.action}`,
      startTime: now.toISOString(),
      estimatedDuration: 15,
      trigger: "autonomous",
    };
    await setAgentState(teamId, agentId, currentState);
    console.log(`📋 ${agentId} 계획 완료:`, planResult.action);

    // 계획 완료 후 3초 뒤에 실행
    setTimeout(async () => {
      try {
        const { executeAgentAction } = await import(
          "@/lib/agent-action-executor"
        );
        await executeAgentAction(teamId, agentId, planResult);
      } catch (error) {
        console.error(`❌ ${agentId} 액션 실행 실패:`, error);
        await handleActionExecutionFailure(teamId, agentId);
      }
    }, 3000);
  }
}

// planning 실패 처리
async function handlePlanningFailure(
  teamId: string,
  agentId: string
): Promise<void> {
  const failedState = await getAgentState(teamId, agentId);
  if (failedState) {
    const newState = resetToIdleState(failedState);
    await setAgentState(teamId, agentId, newState);
  }
}

// 액션 실행 실패 처리
async function handleActionExecutionFailure(
  teamId: string,
  agentId: string
): Promise<void> {
  const failedState = await getAgentState(teamId, agentId);
  if (failedState) {
    // 피드백 세션 중인지 확인
    if (isFeedbackSessionActive(failedState)) {
      console.log(
        `🔒 ${agentId} 액션 실행 실패했지만 피드백 세션 중이므로 idle 전환 스킵`
      );
      return;
    }

    const newState = resetToIdleState(failedState);
    await setAgentState(teamId, agentId, newState);
  }
}

// idle 상태로 초기화
function resetToIdleState(state: AgentStateInfo): AgentStateInfo {
  return {
    ...state,
    currentState: "idle",
    lastStateChange: new Date().toISOString(),
    isProcessing: false,
    idleTimer: createNewIdleTimer(),
    currentTask: undefined,
    plannedAction: undefined,
  };
}
