import { useState, useEffect } from "react";

// 에이전트 상태 타입 정의
export interface AgentStateInfo {
  agentId: string;
  currentState:
    | "idle"
    | "plan"
    | "action"
    | "reflecting"
    | "feedback_session"
    | "feedback_waiting";
  lastStateChange: string;
  isProcessing: boolean;
  currentTask?: {
    type:
      | "generate_idea"
      | "evaluate_idea"
      | "planning"
      | "thinking"
      | "give_feedback"
      | "reflecting"
      | "make_request"
      | "feedback_session"
      | "feedback_waiting";
    description: string;
    startTime: string;
    estimatedDuration: number;
    trigger?: "autonomous" | "user_request" | "ai_request";
    requestInfo?: {
      requesterName: string;
      requestMessage: string;
    };
    sessionInfo?: {
      sessionId: string;
      participants: string[];
    };
  };
  idleTimer?: {
    startTime: string;
    plannedDuration: number;
    remainingTime: number;
  };
  plannedAction?: {
    action:
      | "generate_idea"
      | "evaluate_idea"
      | "give_feedback"
      | "make_request"
      | "wait";
    reasoning: string;
    target?: string;
  };
}

// 에이전트 상태를 주기적으로 가져오는 커스텀 훅
export function useAgentStates(teamId: string) {
  const [agentStates, setAgentStates] = useState<Map<string, AgentStateInfo>>(
    new Map()
  );
  const [userState, setUserState] = useState<AgentStateInfo | null>(null);
  const [timers, setTimers] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!teamId) return;

    let isActive = true;
    let timeoutId: NodeJS.Timeout | null = null;
    let isRequestInProgress = false;

    const fetchAgentStates = async () => {
      if (!isActive || isRequestInProgress) return;

      isRequestInProgress = true;

      try {
        const response = await fetch(`/api/teams/${teamId}/agent-states`);
        if (response.ok) {
          const data = await response.json();

          const statesMap = new Map<string, AgentStateInfo>();

          data.agentStates.forEach((agentData: any) => {
            // API 응답 구조: { agentId, name, state: AgentStateInfo, isFeedbackSession }
            const state = agentData.state;
            if (state) {
              statesMap.set(state.agentId, state);
            }
          });

          setAgentStates(statesMap);

          // 🔄 인간 사용자 상태 설정
          if (data.userState) {
            setUserState(data.userState);
          } else {
            setUserState(null);
          }
        } else {
          console.error(
            `에이전트 상태 API 응답 실패: ${response.status} ${response.statusText}`
          );
        }
      } catch (error) {
        console.error("에이전트 상태 조회 실패:", error);
        console.error("에러 상세 정보:", {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } finally {
        isRequestInProgress = false;

        // 요청 완료 후 1초 대기하고 다음 요청 스케줄링
        if (isActive) {
          timeoutId = setTimeout(fetchAgentStates, 1000);
        }
      }
    };

    // 초기 로드
    fetchAgentStates();

    return () => {
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [teamId]);

  // 타이머 계산 (실시간 업데이트)
  useEffect(() => {
    const updateTimers = () => {
      const newTimers = new Map<string, number>();

      agentStates.forEach((state, agentId) => {
        if (state.currentState === "idle" && state.idleTimer) {
          // 서버에서 계산된 remainingTime 사용
          newTimers.set(agentId, state.idleTimer.remainingTime);
        } else if (state.currentTask) {
          // 작업 진행 시간 계산
          const elapsed = Math.floor(
            (Date.now() - new Date(state.currentTask.startTime).getTime()) /
              1000
          );
          const remaining = Math.max(
            0,
            state.currentTask.estimatedDuration - elapsed
          );
          newTimers.set(agentId, remaining);
        }
      });

      // 인간 사용자 타이머도 추가
      if (userState && userState.currentTask) {
        const elapsed = Math.floor(
          (Date.now() - new Date(userState.currentTask.startTime).getTime()) /
            1000
        );
        const remaining = Math.max(
          0,
          userState.currentTask.estimatedDuration - elapsed
        );
        newTimers.set("나", remaining);
      }

      setTimers(newTimers);
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);

    return () => clearInterval(interval);
  }, [agentStates, userState]);

  return {
    agentStates,
    userState,
    timers,
  };
}
