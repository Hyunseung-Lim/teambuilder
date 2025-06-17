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
  const [timers, setTimers] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!teamId) return;

    const fetchAgentStates = async () => {
      try {
        console.log(`🔄 팀 ${teamId} 에이전트 상태 요청 중...`);
        const response = await fetch(`/api/teams/${teamId}/agent-states`);
        if (response.ok) {
          const data = await response.json();
          console.log(`📨 에이전트 상태 API 응답:`, data);

          const statesMap = new Map<string, AgentStateInfo>();

          data.agentStates.forEach((state: AgentStateInfo) => {
            console.log(`📝 에이전트 ${state.agentId} 상태 처리:`, {
              currentState: state.currentState,
              isProcessing: state.isProcessing,
              hasCurrentTask: !!state.currentTask,
              taskType: state.currentTask?.type,
              hasIdleTimer: !!state.idleTimer,
            });

            statesMap.set(state.agentId, state);
          });

          console.log(`✅ 상태 맵 설정 완료:`, statesMap.size, "개 에이전트");
          setAgentStates(statesMap);
        } else {
          console.error("에이전트 상태 API 응답 실패:", response.status);
        }
      } catch (error) {
        console.error("에이전트 상태 조회 실패:", error);
      }
    };

    // 초기 로드
    fetchAgentStates();

    // 1초마다 상태 업데이트
    const interval = setInterval(fetchAgentStates, 1000);

    return () => clearInterval(interval);
  }, [teamId]); // agentStates 제거

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

      setTimers(newTimers);
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);

    return () => clearInterval(interval);
  }, [agentStates]);

  return {
    agentStates,
    timers,
  };
}
