import { Clock, Brain, MessageCircle, Pause, Zap } from "lucide-react";
import { AgentStateInfo } from "../hooks/useAgentStates";

interface AgentStateIndicatorProps {
  state: AgentStateInfo | undefined;
  timer: number | undefined;
  agentName: string;
}

// 향상된 상태 표시 컴포넌트
export default function AgentStateIndicator({
  state,
  timer,
  agentName,
}: AgentStateIndicatorProps) {
  if (!state) return null;

  const getStateInfo = () => {
    // 디버깅을 위한 로깅 강화
    console.log(`🔍 ${agentName} 상태 분석:`, {
      currentState: state.currentState,
      isProcessing: state.isProcessing,
      currentTask: state.currentTask,
      idleTimer: state.idleTimer,
      lastStateChange: state.lastStateChange,
    });

    switch (state.currentState) {
      case "idle":
        return {
          icon: <Clock className="h-3 w-3" />,
          text: timer && timer > 0 ? `대기 (${timer}초)` : "대기중",
          color: "bg-gray-100 text-gray-600",
          tooltip: state.idleTimer
            ? `${Math.floor((timer || 0) / 60)}분 ${
                (timer || 0) % 60
              }초 후 다음 행동 계획`
            : "대기 중",
        };
      case "plan":
        return {
          icon: <Brain className="h-3 w-3" />,
          text: "계획중",
          color: "bg-yellow-100 text-yellow-700",
          tooltip:
            state.currentTask?.description || "다음 행동을 계획하고 있습니다",
        };
      case "reflecting":
        return {
          icon: <Brain className="h-3 w-3" />,
          text: "회고중",
          color: "bg-purple-100 text-purple-700",
          tooltip:
            state.currentTask?.description || "경험을 바탕으로 자기 성찰 중",
        };
      case "feedback_session":
        return {
          icon: <MessageCircle className="h-3 w-3" />,
          text: "피드백 세션 중",
          color: "bg-orange-100 text-orange-700",
          tooltip: state.currentTask?.sessionInfo
            ? `피드백 세션: ${state.currentTask.sessionInfo.participants.join(
                " & "
              )}`
            : state.currentTask?.description || "피드백 세션 진행 중",
        };
      case "feedback_waiting":
        return {
          icon: <Pause className="h-3 w-3" />,
          text: "피드백 대기 중",
          color: "bg-amber-100 text-amber-700",
          tooltip: state.currentTask?.requestInfo
            ? `${state.currentTask.requestInfo.requesterName}의 피드백을 기다리는 중`
            : state.currentTask?.description || "피드백을 기다리는 중",
        };
      case "action":
        // 작업 타입에 따른 구체적인 표시
        const getActionText = () => {
          const taskType = state.currentTask?.type;
          const trigger = state.currentTask?.trigger;
          const requester = state.currentTask?.requestInfo?.requesterName;

          let baseText = "";
          switch (taskType) {
            case "generate_idea":
              baseText = "아이디어 생성중";
              break;
            case "evaluate_idea":
              baseText = "아이디어 평가중";
              break;
            case "planning":
              baseText = "계획중";
              break;
            case "thinking":
              baseText = "사고중";
              break;
            case "give_feedback":
              baseText = "피드백 세션 준비중";
              break;
            case "make_request":
              baseText = "요청 생성중";
              break;
            case "reflecting":
              baseText = "회고중";
              break;
            case "feedback_session":
              baseText = "피드백 세션 중";
              break;
            case "feedback_waiting":
              baseText = "피드백 대기 중";
              break;
            default:
              baseText = "작업중";
          }

          // 트리거에 따라 추가 정보 표시
          if (trigger === "user_request" && requester) {
            return `${baseText}\n(${requester} 요청)`;
          } else if (trigger === "ai_request" && requester) {
            return `${baseText}\n(${requester} 요청)`;
          }

          return baseText;
        };

        const getActionColor = () => {
          const trigger = state.currentTask?.trigger;
          switch (trigger) {
            case "user_request":
              return "bg-purple-100 text-purple-700"; // 사용자 요청
            case "ai_request":
              return "bg-blue-100 text-blue-700"; // AI 요청
            default:
              return "bg-green-100 text-green-700"; // 자율적 작업
          }
        };

        const getActionTooltip = () => {
          const trigger = state.currentTask?.trigger;
          const requester = state.currentTask?.requestInfo?.requesterName;
          const message = state.currentTask?.requestInfo?.requestMessage;

          let tooltip =
            state.currentTask?.description || "작업을 수행하고 있습니다";

          if (trigger === "user_request" && requester) {
            tooltip += `\n요청자: ${requester}`;
            if (message) {
              tooltip += `\n요청 내용: ${message}`;
            }
          } else if (trigger === "ai_request" && requester) {
            tooltip += `\n요청자: ${requester}`;
            if (message) {
              tooltip += `\n요청 내용: ${message}`;
            }
          } else if (trigger === "autonomous") {
            tooltip += "\n(자율적 계획에 의한 작업)";
          }

          return tooltip;
        };

        return {
          icon: <Zap className="h-3 w-3" />,
          text: getActionText(),
          color: getActionColor(),
          tooltip: getActionTooltip(),
        };
      default:
        console.warn(`알 수 없는 에이전트 상태 감지:`, {
          agentName,
          currentState: state.currentState,
          isProcessing: state.isProcessing,
          currentTask: state.currentTask,
          lastStateChange: state.lastStateChange,
        });
        return {
          icon: <Clock className="h-3 w-3" />,
          text: "알 수 없음",
          color: "bg-gray-100 text-gray-600",
          tooltip: `상태를 확인할 수 없습니다 (${state.currentState})`,
        };
    }
  };

  const stateInfo = getStateInfo();

  return (
    <div className="relative group">
      <span
        className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${stateInfo.color} flex-shrink-0 cursor-help whitespace-pre-line`}
      >
        {stateInfo.icon}
        {stateInfo.text}
      </span>

      {/* 툴팁 */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 w-52">
        <div className="font-medium">{agentName}</div>
        <div className="whitespace-pre-line">{stateInfo.tooltip}</div>
        {state.currentState === "idle" &&
          state.idleTimer &&
          timer &&
          timer > 0 && (
            <div className="text-gray-300 mt-1">
              예상 완료: {Math.ceil(timer)}초 후
            </div>
          )}
        {state.currentState === "action" &&
          state.currentTask?.trigger &&
          state.currentTask.trigger !== "autonomous" && (
            <div className="text-gray-300 mt-1">
              {state.currentTask.trigger === "user_request"
                ? "👤 사용자 요청"
                : "🤖 AI 요청"}
            </div>
          )}
        {/* 툴팁 화살표 */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );
}
