import { redis } from "@/lib/redis";

// 에이전트 상태 타입
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
      | "make_request"
      | "reflecting"
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

// 에이전트 상태를 Redis에서 가져오기
export async function getAgentState(
  teamId: string,
  agentId: string
): Promise<AgentStateInfo | null> {
  try {
    const stateKey = `agent_state:${teamId}:${agentId}`;
    const stateData = await redis.get(stateKey);

    if (!stateData) {
      // 기본 idle 상태 생성
      const defaultState: AgentStateInfo = {
        agentId,
        currentState: "idle",
        lastStateChange: new Date().toISOString(),
        isProcessing: false,
        idleTimer: createNewIdleTimer(),
      };

      try {
        await redis.set(stateKey, JSON.stringify(defaultState), { ex: 3600 });
      } catch (saveError) {
        console.error(`에이전트 ${agentId} 기본 상태 저장 실패:`, saveError);
      }

      return defaultState;
    }

    const parsedState =
      typeof stateData === "string" ? JSON.parse(stateData) : stateData;
    return parsedState;
  } catch (error) {
    console.error(`에이전트 ${agentId} 상태 조회 실패:`, error);

    return {
      agentId,
      currentState: "idle",
      lastStateChange: new Date().toISOString(),
      isProcessing: false,
      idleTimer: createNewIdleTimer(),
    };
  }
}

// 에이전트 상태를 Redis에 저장
export async function setAgentState(
  teamId: string,
  agentId: string,
  state: AgentStateInfo
): Promise<void> {
  try {
    const stateKey = `agent_state:${teamId}:${agentId}`;
    await redis.set(stateKey, JSON.stringify(state), { ex: 3600 });
  } catch (error) {
    console.error(`에이전트 ${agentId} 상태 저장 실패:`, error);
  }
}

// 피드백 세션 중인지 확인
export function isFeedbackSessionActive(state: AgentStateInfo): boolean {
  return (
    state.currentState === "feedback_session" ||
    state.currentState === "feedback_waiting"
  );
}

// 타이머 안정성 검사
export function validateTimer(state: AgentStateInfo): boolean {
  if (!state.idleTimer) return true;

  const now = new Date();
  const startTime = new Date(state.idleTimer.startTime).getTime();
  const elapsed = Math.floor((now.getTime() - startTime) / 1000);

  // 타이머가 음수가 되거나 비정상적으로 큰 값이 되는 것을 방지
  return elapsed >= 0 && elapsed <= state.idleTimer.plannedDuration * 2;
}

// 새로운 idle 타이머 생성
export function createNewIdleTimer(): {
  startTime: string;
  plannedDuration: number;
  remainingTime: number;
} {
  // 랜덤 타이머로 에이전트들이 서로 다른 시간에 활동하도록 함
  // 30초 ~ 60초 범위로 더 빠른 반응성 제공
  const duration = Math.floor(Math.random() * 31) + 30; // 30-60초
  return {
    startTime: new Date().toISOString(),
    plannedDuration: duration,
    remainingTime: duration,
  };
}
