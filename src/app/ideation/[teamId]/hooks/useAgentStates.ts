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
  const [isConnected, setIsConnected] = useState(true); // 연결 상태 추가

  useEffect(() => {
    if (!teamId) return;

    let isActive = true;
    let timeoutId: NodeJS.Timeout | null = null;
    let isRequestInProgress = false;
    let consecutiveErrors = 0; // 연속 오류 횟수 추적

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

            // API에서 항상 유효한 상태를 반환하므로 state는 null이 아님
            if (state && state.agentId) {
              statesMap.set(state.agentId, state);
            } else {
              console.error(`⚠️ 유효하지 않은 에이전트 상태:`, agentData);
            }
          });

          // 성공적으로 응답을 받았으므로 상태 업데이트
          setAgentStates(statesMap);

          // 🔄 인간 사용자 상태 설정
          if (data.userState) {
            setUserState(data.userState);
          } else {
            setUserState(null);
          }

          // 연결 성공 시 연속 오류 횟수 초기화
          consecutiveErrors = 0;
          setIsConnected(true);
        } else {
          console.error(
            `에이전트 상태 API 응답 실패: ${response.status} ${response.statusText}`
          );
          consecutiveErrors++;

          // 3회 연속 실패 시 연결 상태를 false로 설정
          if (consecutiveErrors >= 3) {
            setIsConnected(false);
          }

          // 응답 실패 시에는 기존 상태를 유지 (setAgentStates 호출하지 않음)
        }
      } catch (error) {
        console.error("에이전트 상태 조회 실패:", error);
        consecutiveErrors++;

        // 3회 연속 실패 시 연결 상태를 false로 설정
        if (consecutiveErrors >= 3) {
          setIsConnected(false);
        }

        // 네트워크 오류 시에도 기존 상태를 유지 (setAgentStates 호출하지 않음)
        console.error("에러 상세 정보:", {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : String(error),
          consecutiveErrors,
        });
      } finally {
        isRequestInProgress = false;

        // 요청 완료 후 연속 오류 횟수에 따라 대기 시간 조정
        const waitTime =
          consecutiveErrors > 0
            ? Math.min(10000, 2000 * consecutiveErrors) // 오류 시 최대 10초 대기
            : 3000; // 정상 시 3초 간격

        if (isActive) {
          timeoutId = setTimeout(fetchAgentStates, waitTime);
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
          // 클라이언트에서도 시간 계산하여 더 정확한 표시
          const startTime = new Date(state.idleTimer.startTime).getTime();
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = Math.max(
            0,
            state.idleTimer.plannedDuration - elapsed
          );
          newTimers.set(agentId, remaining);
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
    isConnected, // 연결 상태도 반환
  };
}
