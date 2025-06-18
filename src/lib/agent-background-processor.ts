import { redis } from "@/lib/redis";
import {
  getAgentState,
  setAgentState,
  isFeedbackSessionActive,
  createNewIdleTimer,
} from "@/lib/agent-state-utils";
import {
  handleEvaluateIdeaRequestDirect,
  handleGenerateIdeaRequestDirect,
  handleGiveFeedbackRequestDirect,
} from "./agent-request-handlers";

// 백그라운드에서 요청 처리하는 함수
export async function processRequestInBackground(
  teamId: string,
  agentId: string,
  requestData: any
) {
  try {
    console.log(
      `🔧 에이전트 ${agentId} 백그라운드 요청 처리 시작: ${requestData.type}`
    );

    if (requestData.type === "evaluate_idea") {
      await handleEvaluateIdeaRequestDirect(teamId, agentId, requestData);
    } else if (requestData.type === "generate_idea") {
      await handleGenerateIdeaRequestDirect(teamId, agentId, requestData);
    } else if (requestData.type === "give_feedback") {
      await handleGiveFeedbackRequestDirect(teamId, agentId, requestData);
    }

    console.log(`✅ 에이전트 ${agentId} 요청 처리 완료`);

    // 처리 완료 후 상태 전환 처리
    await handlePostProcessingStateTransition(teamId, agentId);
  } catch (error) {
    console.error(`❌ 에이전트 ${agentId} 백그라운드 요청 처리 실패:`, error);
    await handleProcessingFailure(teamId, agentId);
  }
}

// 처리 완료 후 상태 전환 처리
async function handlePostProcessingStateTransition(
  teamId: string,
  agentId: string
) {
  // 피드백 세션 중인지 확인 후 상태 전환 결정
  const currentState = await getAgentState(teamId, agentId);
  if (currentState && isFeedbackSessionActive(currentState)) {
    console.log(`🔒 에이전트 ${agentId}는 피드백 세션 중이므로 idle 전환 스킵`);
    return;
  }

  // 처리 완료 후 idle 상태로 전환 (피드백 세션 중이 아닌 경우만)
  setTimeout(async () => {
    await transitionToIdleIfNotInFeedbackSession(
      teamId,
      agentId,
      "처리 완료 후"
    );
  }, 2000);
}

// 처리 실패 시 처리
async function handleProcessingFailure(teamId: string, agentId: string) {
  // 실패 시에도 피드백 세션 중인지 확인
  const currentState = await getAgentState(teamId, agentId);
  if (currentState && isFeedbackSessionActive(currentState)) {
    console.log(
      `🔒 에이전트 ${agentId}는 피드백 세션 중이므로 실패 후에도 idle 전환 스킵`
    );
    return;
  }

  // 실패 시에도 idle 상태로 전환 (피드백 세션 중이 아닌 경우만)
  setTimeout(async () => {
    await transitionToIdleIfNotInFeedbackSession(teamId, agentId, "실패 후");
  }, 2000);
}

// 피드백 세션 중이 아니면 idle로 전환
async function transitionToIdleIfNotInFeedbackSession(
  teamId: string,
  agentId: string,
  reason: string
) {
  try {
    // 다시 한번 피드백 세션 상태 확인 (상태가 변경될 수 있음)
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

// 큐에서 대기 중인 요청 처리
export async function processQueuedRequest(teamId: string, agentId: string) {
  const queueKey = `agent_queue:${teamId}:${agentId}`;
  const queuedRequest = await redis.rpop(queueKey);

  // 디버깅을 위한 상세 로깅
  console.log(`🔍 큐 확인 결과:`, {
    agentId,
    queueKey,
    queuedRequest,
    queuedRequestType: typeof queuedRequest,
    queuedRequestIsNull: queuedRequest === null,
  });

  if (queuedRequest && queuedRequest !== null) {
    // 큐에 대기 중인 요청이 있으면 즉시 처리
    console.log(`📋 에이전트 ${agentId} 큐에서 요청 발견 - 즉시 처리`);

    let requestData;
    try {
      if (typeof queuedRequest === "string") {
        requestData = JSON.parse(queuedRequest);
      } else if (typeof queuedRequest === "object" && queuedRequest !== null) {
        requestData = queuedRequest;
      } else {
        throw new Error(
          `예상하지 못한 큐 데이터 타입: ${typeof queuedRequest}`
        );
      }

      // requestData 유효성 검사
      if (!requestData || typeof requestData !== "object") {
        throw new Error("유효하지 않은 요청 데이터");
      }

      // 액션 상태로 설정하고 백그라운드에서 처리
      const actionState = createActionState(agentId, requestData);
      await setAgentState(teamId, agentId, actionState);

      // 백그라운드에서 요청 처리
      processRequestInBackground(teamId, agentId, requestData);

      return actionState;
    } catch (parseError) {
      console.error(`❌ 에이전트 ${agentId} 큐 데이터 파싱 실패:`, parseError);
      console.error(`큐 데이터 상세:`, {
        queuedRequest,
        type: typeof queuedRequest,
        isNull: queuedRequest === null,
        isUndefined: queuedRequest === undefined,
      });

      // 파싱 실패 시 기본 idle 상태로
      return createIdleState(agentId);
    }
  }

  // 큐가 비어있으면 idle 상태 반환
  return createIdleState(agentId);
}

// 액션 상태 생성
function createActionState(agentId: string, requestData: any) {
  const now = new Date();
  return {
    agentId,
    currentState: "action" as const,
    lastStateChange: now.toISOString(),
    isProcessing: true,
    currentTask: {
      type:
        requestData.type === "evaluate_idea"
          ? ("evaluate_idea" as const)
          : ("thinking" as const),
      description: `${requestData.requesterName}의 요청: ${
        requestData.payload?.message || "요청 처리"
      }`,
      startTime: now.toISOString(),
      estimatedDuration: 30,
      trigger: "user_request" as const,
      requestInfo: {
        requesterName: requestData.requesterName,
        requestMessage: requestData.payload?.message || "",
      },
    },
  };
}

// idle 상태 생성
function createIdleState(agentId: string) {
  return {
    agentId,
    currentState: "idle" as const,
    lastStateChange: new Date().toISOString(),
    isProcessing: false,
    idleTimer: createNewIdleTimer(),
  };
}
