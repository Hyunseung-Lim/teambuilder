"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { getTeamAction } from "@/actions/team.actions";
import { getUserAgentsAction } from "@/actions/agent.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Team,
  AIAgent,
  Idea,
  ChatMessage,
  Evaluation,
  AgentRole,
  AgentMemory,
  SystemMessagePayload,
  ChatMessagePayload,
  FeedbackSessionSummaryPayload,
} from "@/lib/types";
import {
  Users,
  Lightbulb,
  MessageCircle,
  User,
  Crown,
  PlusCircle,
  ChevronUp,
  ChevronDown,
  Loader2,
  Star,
  Clock,
  Eye,
  EyeOff,
  Send,
  Bot,
  Zap,
  Brain,
  Pause,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import IdeaDetailModal from "@/components/IdeaDetailModal";
import FeedbackSessionModal from "@/components/FeedbackSessionModal";
import ViewFeedbackSessionModal from "@/components/ViewFeedbackSessionModal";

// 에이전트 상태 타입 정의 (확장)
interface AgentStateInfo {
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
function useAgentStates(teamId: string) {
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

// 향상된 상태 표시 컴포넌트
function AgentStateIndicator({
  state,
  timer,
  agentName,
}: {
  state: AgentStateInfo | undefined;
  timer: number | undefined;
  agentName: string;
}) {
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

// 타입 가드 함수들
const isSystemMessagePayload = (
  payload: any
): payload is SystemMessagePayload => {
  return (
    payload &&
    typeof payload === "object" &&
    "content" in payload &&
    typeof payload.content === "string"
  );
};

const isChatMessagePayload = (payload: any): payload is ChatMessagePayload => {
  return (
    payload &&
    typeof payload === "object" &&
    "type" in payload &&
    "content" in payload &&
    typeof payload.content === "string"
  );
};

const isFeedbackSessionSummaryPayload = (
  payload: any
): payload is FeedbackSessionSummaryPayload => {
  return (
    payload &&
    typeof payload === "object" &&
    "summary" in payload &&
    "participants" in payload
  );
};

export default function IdeationPage() {
  const params = useParams();
  const { data: session } = useSession();
  const [team, setTeam] = useState<Team | null>(null);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [showIdeaDetailModal, setShowIdeaDetailModal] = useState(false);
  const [ideaDetailModalData, setIdeaDetailModalData] = useState<Idea | null>(
    null
  );
  const [currentIdeaIndex, setCurrentIdeaIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState({
    object: "",
    function: "",
    behavior: "",
    structure: "",
  });
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [authorFilter, setAuthorFilter] = useState<string>("전체");
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [showAddIdeaModal, setShowAddIdeaModal] = useState(false);
  const [addIdeaFormData, setAddIdeaFormData] = useState({
    object: "",
    function: "",
    behavior: "",
    structure: "",
  });
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [topic, setTopic] = useState("");
  const [generationProgress, setGenerationProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [generatingAgents, setGeneratingAgents] = useState<Set<string>>(
    new Set()
  );
  const [generatingViaRequestAgents, setGeneratingViaRequestAgents] = useState<
    Set<string>
  >(new Set());
  const [behaviorPairs, setBehaviorPairs] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [structurePairs, setStructurePairs] = useState<
    Array<{ key: string; value: string }>
  >([]);

  // 스마트 폴링 상태 추가
  const [shouldPoll, setShouldPoll] = useState(false);
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  // New state for chat functionality
  const [chatMode, setChatMode] = useState<"give_feedback" | "make_request">(
    "give_feedback"
  );
  const [mentionedAgent, setMentionedAgent] = useState<AIAgent | null>(null);
  const [requestType, setRequestType] = useState<
    "generate" | "evaluate" | "give_feedback" | null
  >(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);

  // 평가 상태 추가
  const [isSubmittingEvaluation, setIsSubmittingEvaluation] = useState(false);

  // 평가 요청 추적 상태 추가
  const [evaluatingViaRequestAgents, setEvaluatingViaRequestAgents] = useState<
    Set<string>
  >(new Set());

  // 자율적 평가 추적 상태 추가
  const [evaluatingAutonomouslyAgents, setEvaluatingAutonomouslyAgents] =
    useState<Set<string>>(new Set());

  // 피드백 세션 모달 상태 추가
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackSessionData, setFeedbackSessionData] = useState<{
    mentionedAgent: AIAgent;
    message: string;
  } | null>(null);
  const [showViewSessionModal, setShowViewSessionModal] = useState(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  // 활성 피드백 세션 상태 추가
  const [activeFeedbackSessions, setActiveFeedbackSessions] = useState<
    string[]
  >([]);
  const [userInFeedbackSession, setUserInFeedbackSession] = useState(false);

  // AI 피드백 세션 알림 상태 추가
  const [aiFeedbackSessions, setAiFeedbackSessions] = useState<
    Array<{
      id: string;
      participants: string[];
      startTime: string;
    }>
  >([]);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const ideaListRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollIdeaListToTop = () => {
    if (ideaListRef.current) {
      ideaListRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 필터 변경 시 아이디어 리스트 최상단으로 스크롤
  useEffect(() => {
    scrollIdeaListToTop();
  }, [authorFilter]);

  // 현재 팀에 속한 AI 에이전트만 필터링
  const teamAgents = agents.filter((agent) =>
    team?.members.some(
      (member) => !member.isUser && member.agentId === agent.id
    )
  );

  // 현재 사용자가 아이디어 생성 롤을 가지고 있는지 확인
  const userCanGenerateIdeas =
    team?.members.find((m) => m.isUser)?.roles.includes("아이디어 생성하기") ||
    false;

  // 현재 사용자가 아이디어 평가 롤을 가지고 있는지 확인
  const userCanEvaluateIdeas =
    team?.members.find((m) => m.isUser)?.roles.includes("아이디어 평가하기") ||
    false;

  // 에이전트가 특정 역할을 수행할 수 있는지 확인하는 함수
  const canAgentPerformRole = (
    agent: AIAgent,
    requestType: string
  ): boolean => {
    const roleMap = {
      generate: "아이디어 생성하기" as AgentRole,
      evaluate: "아이디어 평가하기" as AgentRole,
      give_feedback: "피드백하기" as AgentRole,
    };

    const requiredRole = roleMap[requestType as keyof typeof roleMap];
    if (!requiredRole || !team) return false;

    // 팀 멤버에서 해당 에이전트의 역할 찾기
    const teamMember = team.members.find(
      (member) => member.agentId === agent.id
    );
    return teamMember ? teamMember.roles.includes(requiredRole) : false;
  };

  // 작성자 이름 가져오기 함수
  const getAuthorName = (authorId: string) => {
    if (authorId === "나") return "나";

    const member = team?.members.find((m) => m.agentId === authorId);
    if (member && !member.isUser) {
      const agent = agents.find((a) => a.id === authorId);
      return agent?.name || `에이전트 ${authorId}`;
    }

    return authorId;
  };

  // 선택된 요청 타입에 따라 필터링된 에이전트 목록
  const getFilteredAgentsForRequest = () => {
    if (chatMode !== "make_request" || !requestType) {
      return teamAgents;
    }

    return teamAgents.filter((agent) =>
      canAgentPerformRole(agent, requestType)
    );
  };

  // 선택된 에이전트가 수행할 수 있는 요청 타입 목록
  const getAvailableRequestTypes = () => {
    if (!mentionedAgent) {
      return [
        { value: "generate", label: "아이디어 생성" },
        { value: "evaluate", label: "아이디어 평가" },
        { value: "give_feedback", label: "피드백" },
      ];
    }

    const availableTypes = [];
    if (canAgentPerformRole(mentionedAgent, "generate")) {
      availableTypes.push({ value: "generate", label: "아이디어 생성" });
    }
    if (canAgentPerformRole(mentionedAgent, "evaluate")) {
      availableTypes.push({ value: "evaluate", label: "아이디어 평가" });
    }
    if (canAgentPerformRole(mentionedAgent, "give_feedback")) {
      availableTypes.push({ value: "give_feedback", label: "피드백" });
    }

    return availableTypes;
  };

  // 고유한 작성자 목록
  const uniqueAuthors = [
    "전체",
    ...Array.from(
      new Set(
        ideas.map((idea) => {
          if (idea.author === "나") return "나";

          // 팀 멤버에서 해당 에이전트 찾기
          const member = team?.members.find((m) => m.agentId === idea.author);
          if (member && !member.isUser) {
            const agent = agents.find((a) => a.id === idea.author);
            return agent?.name || `에이전트 ${idea.author}`;
          }

          return idea.author;
        })
      )
    ),
  ];

  // 아이디어 번호 매기기를 위한 생성순 정렬
  const ideasSortedByCreation = [...ideas].sort((a, b) => a.id - b.id);

  // 화면 표시를 위한 최신순 정렬
  const filteredIdeas = ideas
    .filter((idea) => {
      if (authorFilter === "전체") return true;
      const authorName = getAuthorName(idea.author);
      return authorName === authorFilter;
    })
    .sort((a, b) => b.id - a.id);

  // 타임스탬프 포맷팅 함수
  const formatTimestamp = (timestamp: string) => {
    const now = new Date();
    const messageTime = new Date(timestamp);
    const diffInMinutes = Math.floor(
      (now.getTime() - messageTime.getTime()) / (1000 * 60)
    );

    if (diffInMinutes < 1) return "방금 전";
    if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}시간 전`;
    return `${Math.floor(diffInMinutes / 1440)}일 전`;
  };

  // 데이터 로드
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const teamId = params.teamId as string;
        const [teamData, agentsData] = await Promise.all([
          getTeamAction(teamId),
          getUserAgentsAction(),
        ]);
        setTeam(teamData);
        setAgents(agentsData);

        // 아이디어와 채팅 메시지 로드
        await Promise.all([loadIdeas(teamId), loadMessages(teamId)]);

        // 팀에서 토픽 설정
        if (teamData.topic) {
          setTopic(teamData.topic);
        } else {
          // 토픽이 없으면 에러 표시
          setError(
            "이 팀에는 아이디에이션 주제가 설정되지 않았습니다. 팀을 다시 생성해주세요."
          );
          return;
        }
      } catch (error) {
        setError("팀 정보를 불러올 수 없습니다.");
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      loadData();
    }
  }, [params.teamId, session]);

  // 자동 아이디어 생성 - 팀 데이터와 토픽이 준비되면 실행
  useEffect(() => {
    if (!team || !topic || !agents.length || isAutoGenerating) return;

    // 이미 아이디어가 있으면 자동 생성하지 않음
    if (ideas.length > 0) {
      console.log("💡 이미 아이디어가 존재하므로 자동 생성 건너뜀");
      return;
    }

    // 아이디어 생성 역할을 가진 에이전트가 있는지 확인
    const ideaGenerators = team.members.filter(
      (member) => !member.isUser && member.roles.includes("아이디어 생성하기")
    );

    if (ideaGenerators.length === 0) {
      console.log("💡 아이디어 생성 역할을 가진 에이전트가 없음");
      return;
    }

    console.log("🚀 자동 아이디어 생성 시작:", {
      teamId: team.id,
      topic,
      generators: ideaGenerators.length,
    });

    // 3초 후에 자동 생성 시작 (페이지 로딩 완료 후)
    const timer = setTimeout(() => {
      triggerAutoIdeaGeneration(team.id, topic);
    }, 3000);

    return () => clearTimeout(timer);
  }, [team, topic, agents, ideas.length, isAutoGenerating]);

  // 아이디어 로드 - useCallback으로 메모화
  const loadIdeas = useCallback(async (teamId: string) => {
    try {
      console.log("💡 아이디어 로드 시작:", teamId);
      const response = await fetch(
        `/api/teams/${teamId}/ideas?t=${new Date().getTime()}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log("💡 아이디어 로드 완료:", data.ideas?.length || 0, "개");
        setIdeas(data.ideas || []);
        return (data.ideas || []).length;
      }
      console.log("💡 아이디어 로드 실패: response not ok");
      return 0;
    } catch (error) {
      console.error("💡 아이디어 로드 실패:", error);
      return 0;
    }
  }, []);

  // 채팅 메시지 로드 - useCallback으로 메모화
  const loadMessages = useCallback(async (teamId: string) => {
    try {
      console.log("💬 채팅 메시지 로드 시작:", teamId);
      const response = await fetch(
        `/api/teams/${teamId}/chat?t=${new Date().getTime()}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log(
          "💬 채팅 메시지 로드 완료:",
          data.messages?.length || 0,
          "개"
        );
        setMessages(data.messages || []);
      } else {
        console.log("💬 채팅 메시지 로드 실패: response not ok");
      }
    } catch (error) {
      console.error("💬 채팅 메시지 로드 실패:", error);
    }
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Server-Sent Events 연결 - 폴링 대신 실시간 업데이트
  useEffect(() => {
    if (!team?.id) {
      console.log("팀 ID가 없어서 SSE 연결 안함");
      return;
    }

    console.log("🔥 SSE 연결 시작:", team.id);

    const eventSource = new EventSource(`/api/teams/${team.id}/events`);

    eventSource.onopen = () => {
      console.log("✅ SSE 연결 성공");
      setSseConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📨 SSE 데이터 수신:", data.type, data.timestamp);

        switch (data.type) {
          case "initial":
            console.log("🚀 초기 데이터 로드:", {
              messages: data.messages?.length || 0,
              ideas: data.ideas?.length || 0,
            });
            if (data.messages) setMessages(data.messages);
            if (data.ideas) setIdeas(data.ideas);
            break;

          case "update":
            console.log("🔄 실시간 업데이트:", {
              messagesUpdated: !!data.messages,
              ideasUpdated: !!data.ideas,
            });
            if (data.messages) {
              setMessages(data.messages);
              console.log(
                "💬 메시지 업데이트 완료:",
                data.messages.length + "개"
              );
            }
            if (data.ideas) {
              setIdeas(data.ideas);
              console.log(
                "💡 아이디어 업데이트 완료:",
                data.ideas.length + "개"
              );
            }
            break;

          case "heartbeat":
            console.log("💓 하트비트");
            break;

          default:
            console.log("❓ 알 수 없는 SSE 이벤트:", data.type);
        }
      } catch (error) {
        console.error("❌ SSE 데이터 파싱 실패:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("❌ SSE 연결 오류:", error);
      setSseConnected(false);

      // 연결이 끊어지면 5초 후 재연결 시도
      setTimeout(() => {
        console.log("🔄 SSE 재연결 시도...");
      }, 5000);
    };

    // 컴포넌트 언마운트 시 연결 해제
    return () => {
      console.log("🔌 SSE 연결 해제");
      eventSource.close();
      setSseConnected(false);
    };
  }, [team?.id]);

  // 폴링 시작 헬퍼 함수 - 이제 사용 안함 (SSE로 대체)
  const startPolling = useCallback((reason: string) => {
    console.log("📋 폴링 요청 무시됨 (SSE 사용 중):", reason);
    // SSE를 사용하므로 폴링 불필요
  }, []);

  // 폴링 중지 헬퍼 함수 - 이제 사용 안함 (SSE로 대체)
  const stopPolling = useCallback((reason: string) => {
    console.log("📋 폴링 중지 요청 무시됨 (SSE 사용 중):", reason);
    // SSE를 사용하므로 폴링 불필요
  }, []);

  // 아이디어가 로드되면 주제 모달 상태 체크 - 제거됨

  // 주제 제출 핸들러 - 제거됨

  // AI 에이전트 자동 아이디어 생성
  const triggerAutoIdeaGeneration = async (
    teamId: string,
    selectedTopic?: string
  ) => {
    try {
      setIsAutoGenerating(true);
      setGeneratingAgents(new Set()); // 초기화

      // 아이디어 생성 요청
      const response = await fetch(`/api/teams/${teamId}/ideas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "auto_generate",
          topic: selectedTopic || topic || "Carbon Emission Reduction",
        }),
      });

      if (!response.ok) {
        throw new Error("아이디어 생성 요청 실패");
      }

      const result = await response.json();
      console.log("아이디어 생성 시작:", result);

      // 생성할 에이전트들을 generatingAgents에 추가
      if (result.generatingAgentIds) {
        setGeneratingAgents(new Set(result.generatingAgentIds));
      }

      // 생성 진행 상황 초기화
      const expectedCount = result.agentCount || 1;
      setGenerationProgress({ completed: 0, total: expectedCount });

      // 즉시 한 번 로드
      await Promise.all([loadIdeas(teamId), loadMessages(teamId)]);

      // 생성할 에이전트 수만큼 완료를 기다림
      let completedCount = 0;
      let pollCount = 0;
      const maxPolls = 60; // 최대 60번 폴링 (30초)

      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          console.log(`아이디어 생성 폴링 ${pollCount}/${maxPolls}`);

          // 최대 폴링 횟수 초과 시 중지
          if (pollCount >= maxPolls) {
            console.log("폴링 시간 초과로 중지");
            clearInterval(pollInterval);
            setIsAutoGenerating(false);
            setGeneratingAgents(new Set());
            setGenerationProgress({ completed: 0, total: 0 });
            return;
          }

          await Promise.all([loadIdeas(teamId), loadMessages(teamId)]);

          // 메시지를 다시 확인하여 완료된 에이전트 수 계산
          const messagesResponse = await fetch(
            `/api/teams/${teamId}/chat?t=${new Date().getTime()}`
          );
          if (messagesResponse.ok) {
            const data = await messagesResponse.json();
            const messages = data.messages || [];

            // "새로운 아이디어를 생성했습니다" 메시지 개수 확인
            const completedMessages = messages.filter(
              (msg: any) =>
                msg.type === "system" &&
                typeof msg.payload === "object" &&
                msg.payload?.content?.includes("새로운 아이디어를 생성했습니다")
            );

            completedCount = completedMessages.length;
            console.log(`완료된 아이디어: ${completedCount}/${expectedCount}`);

            // 완료된 에이전트들을 generatingAgents에서 제거
            const completedAgentIds = completedMessages.map(
              (msg: any) => msg.sender
            );
            setGeneratingAgents((prev) => {
              const newSet = new Set(prev);
              completedAgentIds.forEach((agentId: string) =>
                newSet.delete(agentId)
              );
              return newSet;
            });

            // 진행 상황 업데이트
            setGenerationProgress({
              completed: completedCount,
              total: expectedCount,
            });

            // 모든 에이전트가 완료되었으면 폴링 중지
            if (completedCount >= expectedCount) {
              console.log("모든 에이전트 아이디어 생성 완료");
              clearInterval(pollInterval);
              setIsAutoGenerating(false);
              setGeneratingAgents(new Set());
              setGenerationProgress({ completed: 0, total: 0 });
              // 최종 업데이트
              await Promise.all([loadIdeas(teamId), loadMessages(teamId)]);
            }
          }
        } catch (error) {
          console.error("폴링 오류:", error);
        }
      }, 500); // 500ms로 단축
    } catch (error) {
      console.error("AI 에이전트 자동 아이디어 생성 실패:", error);
      setIsAutoGenerating(false);
      setGeneratingAgents(new Set());
      setGenerationProgress({ completed: 0, total: 0 });
    }
  };

  // Check for completion of request-based generation
  useEffect(() => {
    if (generatingViaRequestAgents.size === 0) return;

    const completedAgents = new Set<string>();

    messages.forEach((msg) => {
      if (
        msg.type === "system" &&
        typeof msg.payload === "object" &&
        msg.payload &&
        "content" in msg.payload &&
        typeof msg.payload.content === "string" &&
        msg.payload.content.includes(
          "요청에 따라 새로운 아이디어를 생성했습니다"
        )
      ) {
        if (generatingViaRequestAgents.has(msg.sender)) {
          completedAgents.add(msg.sender);
        }
      }
    });

    if (completedAgents.size > 0) {
      console.log(
        "🎉 요청 기반 아이디어 생성 완료:",
        completedAgents.size + "개"
      );
      setGeneratingViaRequestAgents((prev) => {
        const newSet = new Set(prev);
        completedAgents.forEach((agentId) => newSet.delete(agentId));
        return newSet;
      });

      // 모든 요청 기반 생성이 완료되면 폴링 중지
      if (generatingViaRequestAgents.size === completedAgents.size) {
        setTimeout(() => {
          stopPolling("모든 요청 기반 아이디어 생성 완료");
        }, 2000); // 2초 후 중지 (마지막 업데이트 확인용)
      }
    }
  }, [messages, generatingViaRequestAgents, stopPolling]);

  // Check for completion of request-based evaluation
  useEffect(() => {
    if (evaluatingViaRequestAgents.size === 0) return;

    const completedAgents = new Set<string>();

    messages.forEach((msg) => {
      if (
        msg.type === "system" &&
        typeof msg.payload === "object" &&
        msg.payload &&
        "content" in msg.payload &&
        typeof msg.payload.content === "string" &&
        msg.payload.content.includes("요청에 따라 아이디어 평가를 완료했습니다")
      ) {
        if (evaluatingViaRequestAgents.has(msg.sender)) {
          completedAgents.add(msg.sender);
        }
      }
    });

    if (completedAgents.size > 0) {
      console.log(
        "🎉 요청 기반 아이디어 평가 완료:",
        completedAgents.size + "개"
      );
      setEvaluatingViaRequestAgents((prev) => {
        const newSet = new Set(prev);
        completedAgents.forEach((agentId) => newSet.delete(agentId));
        return newSet;
      });
    }
  }, [messages, evaluatingViaRequestAgents]);

  // Check for completion of autonomous evaluation
  useEffect(() => {
    const completedAgents = new Set<string>();

    messages.forEach((msg) => {
      if (
        msg.type === "system" &&
        typeof msg.payload === "object" &&
        msg.payload &&
        "content" in msg.payload &&
        typeof msg.payload.content === "string" &&
        msg.payload.content.includes("평가했습니다")
      ) {
        completedAgents.add(msg.sender);
      }
    });

    if (completedAgents.size > 0) {
      setEvaluatingAutonomouslyAgents((prev) => {
        const newSet = new Set(prev);
        completedAgents.forEach((agentId) => newSet.delete(agentId));
        return newSet;
      });
    }
  }, [messages]);

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !team || !mentionedAgent) return;

    console.log("📤 메시지 전송 시작:", {
      message: newMessage.trim(),
      mentionedAgent: mentionedAgent.name,
      chatMode,
      requestType,
    });

    // 피드백 모드일 때는 피드백 세션 모달을 띄우고 리턴
    if (chatMode === "give_feedback") {
      setFeedbackSessionData({
        mentionedAgent,
        message: newMessage.trim(),
      });
      setShowFeedbackModal(true);

      // 입력 필드 초기화
      setNewMessage("");
      setMentionedAgent(null);
      setChatMode("give_feedback");
      setRequestType(null);
      return;
    }

    const messageType = chatMode;

    // 일반 메시지 처리 (make_request 등)
    // Trigger generation tracking
    if (messageType === "make_request" && requestType === "generate") {
      console.log("🔄 아이디어 생성 요청 - 추적 시작:", mentionedAgent.id);
      setGeneratingViaRequestAgents((prev) =>
        new Set(prev).add(mentionedAgent.id)
      );
    }

    // Trigger evaluation tracking
    if (messageType === "make_request" && requestType === "evaluate") {
      console.log("🔄 아이디어 평가 요청 - 추적 시작:", mentionedAgent.id);
      setEvaluatingViaRequestAgents((prev) =>
        new Set(prev).add(mentionedAgent.id)
      );
    }

    // 1. 낙관적 업데이트를 위한 임시 메시지 객체 생성
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender: "나",
      timestamp: new Date().toISOString(),
      type: messageType,
      payload: {
        type: messageType,
        content: newMessage.trim(),
        mention: mentionedAgent.id,
        requestType: chatMode === "make_request" ? requestType : undefined,
      },
    };

    // 2. UI에 즉시 반영
    setMessages((prevMessages) => [...prevMessages, tempMessage]);
    console.log("✅ 낙관적 업데이트 완료 - 임시 메시지 추가");

    // 3. 입력 필드 초기화
    setNewMessage("");
    setMentionedAgent(null);
    setChatMode("give_feedback");
    setRequestType(null);

    // 4. 백그라운드에서 서버로 실제 데이터 전송
    try {
      console.log("🌐 서버로 메시지 전송 중...");
      const response = await fetch(`/api/teams/${team.id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: "나",
          payload: tempMessage.payload,
        }),
      });

      if (!response.ok) throw new Error("서버 전송 실패");

      console.log("✅ 서버 전송 성공 - SSE를 통해 자동 업데이트 됨");
      // SSE를 통해 자동으로 업데이트되므로 수동 새로고침 불필요
    } catch (error) {
      console.error("❌ 메시지 전송 실패:", error);
      // 실패 시, 낙관적으로 추가했던 임시 메시지 제거
      setMessages((prevMessages) =>
        prevMessages.filter((m) => m.id !== tempMessage.id)
      );
      console.log("🔄 임시 메시지 제거됨");
    }
  };

  // 아이디어 생성
  const handleGenerateIdea = async () => {
    if (!team || isGeneratingIdea) return;

    try {
      setIsGeneratingIdea(true);

      const response = await fetch(`/api/teams/${team.id}/ideas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "generate",
          author: "나",
        }),
      });

      if (response.ok) {
        console.log("✅ 아이디어 생성 요청 완료 - SSE를 통해 자동 업데이트 됨");
        // SSE를 통해 자동으로 업데이트되므로 수동 새로고침 불필요
      }
    } catch (error) {
      console.error("아이디어 생성 실패:", error);
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  // 수동 아이디어 추가
  const handleAddIdea = async () => {
    if (!team || !addIdeaFormData.object.trim()) return;

    try {
      const response = await fetch(`/api/teams/${team.id}/ideas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "add",
          author: "나",
          content: addIdeaFormData,
        }),
      });

      if (response.ok) {
        console.log("✅ 아이디어 추가 완료 - SSE를 통해 자동 업데이트 됨");
        // SSE를 통해 자동으로 업데이트되므로 수동 새로고침 불필요
        setShowAddIdeaModal(false);
        setAddIdeaFormData({
          object: "",
          function: "",
          behavior: "",
          structure: "",
        });
      }
    } catch (error) {
      console.error("아이디어 추가 실패:", error);
    }
  };

  // 아이디어 평가 제출
  const handleSubmitEvaluationNew = async (evaluationData: {
    insightful: number;
    actionable: number;
    relevance: number;
    comment: string;
  }) => {
    if (!team || !ideaDetailModalData) return;

    try {
      setIsSubmittingEvaluation(true);

      const response = await fetch(
        `/api/teams/${team.id}/ideas/${ideaDetailModalData.id}/evaluate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            evaluator: "나",
            scores: {
              insightful: evaluationData.insightful,
              actionable: evaluationData.actionable,
              relevance: evaluationData.relevance,
            },
            comment: evaluationData.comment || "",
          }),
        }
      );

      if (response.ok) {
        console.log("✅ 아이디어 평가 완료 - 즉시 업데이트 시작");

        // 즉시 아이디어 목록 새로고침
        await loadIdeas(team.id);

        // 현재 보고 있는 아이디어도 업데이트
        const updatedIdeas = await fetch(
          `/api/teams/${team.id}/ideas?t=${new Date().getTime()}`
        );
        if (updatedIdeas.ok) {
          const data = await updatedIdeas.json();
          const updatedIdea = data.ideas.find(
            (i: any) => i.id === ideaDetailModalData.id
          );
          if (updatedIdea) {
            setIdeaDetailModalData(updatedIdea);
          }
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "평가 제출에 실패했습니다.");
      }
    } catch (error) {
      console.error("아이디어 평가 실패:", error);
      throw error; // 에러를 다시 던져서 모달에서 처리하도록
    } finally {
      setIsSubmittingEvaluation(false);
    }
  };

  // 한국어 조사 선택 함수
  function getKoreanParticle(
    name: string,
    hasConsonant: string,
    noConsonant: string
  ): string {
    if (!name) {
      console.log("이름이 없어서 hasConsonant 반환:", hasConsonant);
      return hasConsonant;
    }

    const lastChar = name.charAt(name.length - 1);
    const lastCharCode = lastChar.charCodeAt(0);

    if (lastCharCode >= 0xac00 && lastCharCode <= 0xd7a3) {
      // 받침 있는지 확인 (유니코드 계산)
      const hasJongseong = (lastCharCode - 0xac00) % 28 !== 0;
      const result = hasJongseong ? hasConsonant : noConsonant;
      return result;
    }

    // 한글이 아닌 경우 기본값
    console.log("한글이 아님, hasConsonant 반환:", hasConsonant);
    return hasConsonant;
  }

  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [agentMemory, setAgentMemory] = useState<AgentMemory | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });

  const handleMouseEnter = async (e: React.MouseEvent, agentId: string) => {
    if (!team) return;
    setHoveredAgentId(agentId);
    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverPosition({ top: rect.top, left: rect.right + 10 });

    try {
      const response = await fetch(
        `/api/teams/${team.id}/agents/${agentId}/memory`
      );
      if (response.ok) {
        const memoryData = await response.json();
        setAgentMemory(memoryData);
      } else {
        setAgentMemory(null);
      }
    } catch (error) {
      console.error("Failed to fetch agent memory:", error);
      setAgentMemory(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredAgentId(null);
    setAgentMemory(null);
  };

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showMemoryModal, setShowMemoryModal] = useState(false);

  const handleAgentClick = async (agentId: string) => {
    if (!team) return;
    setSelectedAgentId(agentId);
    setShowMemoryModal(true);

    try {
      const response = await fetch(
        `/api/teams/${team.id}/agents/${agentId}/memory`
      );
      if (response.ok) {
        const memoryData = await response.json();
        setAgentMemory(memoryData);
      } else {
        setAgentMemory(null);
      }
    } catch (error) {
      console.error("Failed to fetch agent memory:", error);
      setAgentMemory(null);
    }
  };

  const closeMemoryModal = () => {
    setShowMemoryModal(false);
    setSelectedAgentId(null);
    setAgentMemory(null);
  };

  const teamId = params.teamId as string;

  // 에이전트 상태 훅 사용
  const { agentStates, timers } = useAgentStates(teamId);

  // 활성 피드백 세션 확인
  const checkActiveFeedbackSessions = useCallback(async () => {
    if (!team?.id) return;

    try {
      const response = await fetch(
        `/api/teams/${team.id}/feedback-sessions/active`
      );
      if (response.ok) {
        const data = await response.json();

        // 실제로 active 상태인 세션만 필터링
        const activeSessions =
          data.sessions?.filter(
            (session: any) => session.status === "active"
          ) || [];

        setActiveFeedbackSessions(activeSessions.map((s: any) => s.id));

        // 사용자가 참여중인 세션이 있는지 확인
        const userParticipating = activeSessions.some((session: any) =>
          session.participants.some((p: any) => p.id === "user" || p.isUser)
        );
        setUserInFeedbackSession(userParticipating);

        // AI 간 피드백 세션 정보 업데이트 (사용자가 참여하지 않은 세션만)
        const aiSessions = activeSessions
          .filter((session: any) =>
            session.participants.every((p: any) => !p.isUser)
          )
          .map((session: any) => ({
            id: session.id,
            participants: session.participants.map((p: any) => p.name),
            startTime: session.createdAt,
          }));

        setAiFeedbackSessions(aiSessions);

        console.log("🔍 활성 피드백 세션 확인:", {
          totalSessions: data.sessions?.length || 0,
          activeSessions: activeSessions.length,
          userParticipating,
          aiSessionCount: aiSessions.length,
        });
      }
    } catch (error) {
      console.error("활성 피드백 세션 확인 실패:", error);
    }
  }, [team?.id]);

  // 주기적으로 피드백 세션 상태 확인
  useEffect(() => {
    if (!team?.id) return;

    checkActiveFeedbackSessions();
    const interval = setInterval(checkActiveFeedbackSessions, 5000); // 5초마다

    return () => clearInterval(interval);
  }, [team?.id, checkActiveFeedbackSessions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">팀 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8">
            <p className="text-red-600 mb-4">
              {error || "팀을 찾을 수 없습니다."}
            </p>
            <Link href="/">
              <Button variant="outline">홈으로 돌아가기</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                홈으로
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {team.teamName}
              </h1>
              <p className="text-sm text-gray-600">
                {topic ? `주제: ${topic}` : "아이디에이션 세션"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* SSE 연결 상태 표시 */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  sseConnected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-xs text-gray-500">
                {sseConnected ? "실시간 연결됨" : "연결 끊어짐"}
              </span>
            </div>

            {/* 피드백 세션 상태 표시 */}
            {userInFeedbackSession && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-xs text-orange-600 font-medium">
                  피드백 세션 진행 중
                </span>
              </div>
            )}
            
            <div className="text-sm text-gray-600">
              {team.members.length}명의 팀원
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      {topic && (
        <div className="flex h-[calc(100vh-80px)]">
          {/* 왼쪽: 팀원 목록 */}
          <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="p-2 space-y-1">
                {team.members.map((member, index) => {
                  const agent = member.isUser
                    ? null
                    : agents.find((a) => a.id === member.agentId);
                  const memberName = member.isUser
                    ? "나"
                    : agent?.name || `팀원 ${member.agentId}`;

                  return (
                    <div
                      key={member.isUser ? "user" : member.agentId || index}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        !member.isUser && member.agentId
                          ? "hover:bg-gray-50 cursor-pointer"
                          : "hover:bg-gray-50"
                      }`}
                      onClick={() =>
                        !member.isUser &&
                        member.agentId &&
                        handleAgentClick(member.agentId)
                      }
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          member.isLeader
                            ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                            : member.isUser
                            ? "bg-gradient-to-br from-green-400 to-emerald-500"
                            : "bg-gradient-to-br from-blue-400 to-purple-500"
                        }`}
                      >
                        {member.isLeader ? (
                          <Crown className="h-5 w-5 text-white" />
                        ) : (
                          <User className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {memberName}
                          </span>
                          {member.isLeader && (
                            <Crown className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                          )}

                          {/* 에이전트 상태 표시 */}
                          {!member.isUser && member.agentId && (
                            <AgentStateIndicator
                              state={agentStates.get(member.agentId)}
                              timer={timers.get(member.agentId)}
                              agentName={memberName}
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {member.roles.map((role, roleIndex) => (
                            <span
                              key={roleIndex}
                              className="text-xs px-2 py-1 rounded-lg w-fit font-medium bg-indigo-50 text-indigo-600"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 가운데: 채팅 영역 */}
          <div className="flex-1 flex flex-col bg-white">
            {/* 채팅 헤더 */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">팀 대화</h3>
              </div>
            </div>

            {/* 메시지 목록 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages
                .filter((message) => {
                  // 타입 가드를 사용하여 안전하게 접근
                  if (typeof message.payload === "string") {
                    return true; // 문자열 메시지는 모두 표시
                  }

                  if (
                    isSystemMessagePayload(message.payload) ||
                    isChatMessagePayload(message.payload)
                  ) {
                    const content = message.payload.content;
                    // "생성중입니다" 메시지만 필터링 (평가 관련 메시지는 모두 표시)
                    return (
                      !content.includes("생성중입니다") &&
                      !content.includes("생성하고 있습니다")
                    );
                  }
                  return true;
                })
                .map((message) => {
                  // 메시지 발송자 이름 가져오기
                  const getSenderName = (senderId: string) => {
                    if (senderId === "나") return "나";

                    // 팀 멤버에서 해당 에이전트 찾기
                    const member = team?.members.find(
                      (m) => m.agentId === senderId
                    );
                    if (member && !member.isUser) {
                      const agent = agents.find((a) => a.id === senderId);
                      return agent?.name || `에이전트 ${senderId}`;
                    }

                    return senderId;
                  };

                  const senderName = getSenderName(message.sender);

                  if (message.type === "feedback_session_summary") {
                    // 피드백 세션 요약 메시지
                    const summaryPayload = message.payload as any;

                    // AI끼리의 세션인지 확인 (사용자가 포함되지 않은 경우)
                    const isAIOnlySession = summaryPayload.participants?.every(
                      (participant: string) => participant !== "나"
                    );

                    return (
                      <div
                        key={message.id}
                        className="flex justify-center mb-6"
                      >
                        <div className="bg-slate-50 rounded-2xl p-6 max-w-2xl w-full">
                          <div className="flex items-center gap-2 mb-4">
                            <div
                              className={`w-6 h-6 ${
                                isAIOnlySession
                                  ? "bg-purple-500"
                                  : "bg-blue-500"
                              } rounded-full flex items-center justify-center`}
                            >
                              <MessageCircle className="h-3 w-3 text-white" />
                            </div>
                            <h4 className="text-slate-800">
                              {summaryPayload.participants?.join(" ↔ ")} 피드백
                              세션 완료
                            </h4>
                          </div>

                          <div className="space-y-3">
                            {/* 실제 대화 내용 표시 (요약 대신) */}
                            {(() => {
                              console.log("🔍 피드백 세션 메시지 디버깅:", {
                                sessionMessages: summaryPayload.sessionMessages,
                                hasMessages:
                                  summaryPayload.sessionMessages &&
                                  summaryPayload.sessionMessages.length > 0,
                                messageCount:
                                  summaryPayload.sessionMessages?.length || 0,
                                isAIOnlySession,
                              });
                              return summaryPayload.sessionMessages &&
                                summaryPayload.sessionMessages.length > 0 ? (
                                <div>
                                  <p className="text-sm text-gray-600 mb-3">
                                    대화 내용
                                  </p>
                                  <div className="bg-white rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                                    {summaryPayload.sessionMessages.map(
                                      (sessionMsg: any, msgIdx: number) => {
                                        if (sessionMsg.type === "system") {
                                          return (
                                            <div
                                              key={msgIdx}
                                              className="flex justify-center"
                                            >
                                              <div className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs">
                                                {sessionMsg.content}
                                              </div>
                                            </div>
                                          );
                                        }

                                        // 실제 에이전트 정보로 이름 매핑
                                        const getSenderDisplayName = (
                                          senderId: string
                                        ) => {
                                          if (senderId === "나") return "나";

                                          // 에이전트 목록에서 실제 이름 찾기
                                          const agent = teamAgents.find(
                                            (a) => a.id === senderId
                                          );
                                          if (agent) {
                                            return agent.name;
                                          }

                                          return senderId;
                                        };

                                        const senderDisplayName =
                                          getSenderDisplayName(
                                            sessionMsg.sender
                                          );
                                        const isFromUser =
                                          sessionMsg.sender === "나";

                                        // AI끼리의 세션인 경우 참가자별로 다른 스타일 적용
                                        let messageStyle =
                                          "bg-gray-100 text-gray-900"; // 기본 스타일
                                        let isRightAligned = false;

                                        if (isFromUser) {
                                          messageStyle =
                                            "bg-blue-500 text-white";
                                          isRightAligned = true;
                                        } else if (
                                          isAIOnlySession &&
                                          summaryPayload.participants?.length >=
                                            2
                                        ) {
                                          // AI 참가자들의 정확한 순서 확인
                                          const participant1Name =
                                            summaryPayload.participants[0];
                                          const participant2Name =
                                            summaryPayload.participants[1];

                                          // 발신자 이름으로 참가자 구분
                                          if (
                                            senderDisplayName ===
                                            participant1Name
                                          ) {
                                            // 첫 번째 참가자: 보라색 + 왼쪽
                                            messageStyle =
                                              "bg-purple-50 text-purple-900";
                                            isRightAligned = false;
                                          } else if (
                                            senderDisplayName ===
                                            participant2Name
                                          ) {
                                            // 두 번째 참가자: 파란색 + 오른쪽
                                            messageStyle =
                                              "bg-blue-50 text-blue-900";
                                            isRightAligned = true;
                                          } else {
                                            // 알 수 없는 발신자
                                            messageStyle =
                                              "bg-orange-100 text-orange-900";
                                            isRightAligned = false;
                                          }
                                        } else if (!isFromUser) {
                                          // 단일 AI 참가자 또는 일반적인 경우
                                          messageStyle =
                                            "bg-gray-100 text-gray-900";
                                        }

                                        return (
                                          <div
                                            key={msgIdx}
                                            className={`flex ${
                                              isRightAligned
                                                ? "justify-end"
                                                : "justify-start"
                                            }`}
                                          >
                                            <div
                                              className={`max-w-[80%] ${
                                                isRightAligned
                                                  ? "ml-auto"
                                                  : "mr-auto"
                                              }`}
                                            >
                                              {!isFromUser && (
                                                <div
                                                  className={`text-xs mb-1 px-2 ${
                                                    isAIOnlySession
                                                      ? isRightAligned
                                                        ? "text-right text-blue-600 font-medium"
                                                        : "text-left text-purple-600 font-medium"
                                                      : "text-gray-500"
                                                  }`}
                                                >
                                                  {senderDisplayName}
                                                </div>
                                              )}
                                              <div
                                                className={`rounded-lg px-3 py-2 text-sm ${messageStyle}`}
                                              >
                                                {sessionMsg.content}
                                              </div>
                                              {isFromUser && (
                                                <div className="text-xs text-gray-500 mt-1 px-2 text-right">
                                                  {senderDisplayName}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-sm text-gray-600 mb-1">
                                    대화 기록 없음
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    메시지가 전송되지 않았거나 로드 중입니다.
                                  </p>
                                </div>
                              );
                            })()}

                            <div className="flex items-center gap-4 text-xs text-gray-500 pt-2">
                              <span>
                                {summaryPayload.messageCount}개 메시지
                              </span>
                              <span>{summaryPayload.duration}분 소요</span>
                              <span>{formatTimestamp(message.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (message.type === "system") {
                    // 시스템 메시지 (아이디어 생성/평가 알림)
                    const isGeneratingMessage =
                      typeof message.payload === "string"
                        ? false
                        : (isSystemMessagePayload(message.payload) ||
                            isChatMessagePayload(message.payload)) &&
                          (message.payload.content.includes("생성중입니다") ||
                            message.payload.content.includes(
                              "생성하고 있습니다"
                            ) ||
                            message.payload.content.includes(
                              "평가하고 있습니다"
                            ));

                    const isIdeaCompletedMessage =
                      typeof message.payload === "string"
                        ? false
                        : (isSystemMessagePayload(message.payload) ||
                            isChatMessagePayload(message.payload)) &&
                          message.payload.content.includes("생성했습니다");

                    const isEvaluationCompletedMessage =
                      typeof message.payload === "string"
                        ? false
                        : (isSystemMessagePayload(message.payload) ||
                            isChatMessagePayload(message.payload)) &&
                          (message.payload.content.includes("평가했습니다") ||
                            message.payload.content.includes(
                              "평가를 완료했습니다"
                            ));

                    const messageContent = (() => {
                      if (typeof message.payload === "string") {
                        return message.payload;
                      }
                      if (
                        isSystemMessagePayload(message.payload) ||
                        isChatMessagePayload(message.payload)
                      ) {
                        return message.payload.content;
                      }
                      return "작업을 완료했습니다.";
                    })();

                    // 평가 완료 메시지는 다른 색상으로 표시
                    const messageStyle = isEvaluationCompletedMessage
                      ? "bg-orange-50 text-orange-600"
                      : "bg-blue-50 text-blue-600";

                    return (
                      <div key={message.id} className="flex justify-center">
                        <div
                          className={`${messageStyle} max-w-xl px-8 py-3 rounded-full text-sm font-medium flex flex-col items-center gap-1 whitespace-pre-wrap text-center`}
                        >
                          <span>
                            {senderName}
                            {getKoreanParticle(senderName, "이", "가")}{" "}
                            {messageContent}
                          </span>
                          {isIdeaCompletedMessage && (
                            <span
                              className="underline cursor-pointer text-blue-600 text-sm font-semibold hover:text-blue-800"
                              onClick={() => {
                                // 해당 메시지 시간과 가장 가까운 아이디어 찾기
                                const messageTime = new Date(
                                  message.timestamp
                                ).getTime();

                                // 해당 작성자의 모든 아이디어 중에서 메시지 시간과 가장 가까운 것 찾기
                                const authorIdeas = ideas
                                  .filter(
                                    (idea) => idea.author === message.sender
                                  )
                                  .map((idea) => ({
                                    ...idea,
                                    timeDiff: Math.abs(
                                      new Date(idea.timestamp).getTime() -
                                        messageTime
                                    ),
                                  }))
                                  .sort((a, b) => a.timeDiff - b.timeDiff);

                                const closestIdea = authorIdeas[0];

                                if (closestIdea) {
                                  console.log(
                                    "🎯 메시지 시간 기준 가장 가까운 아이디어 찾음:",
                                    {
                                      messageTime: message.timestamp,
                                      ideaTime: closestIdea.timestamp,
                                      timeDiff:
                                        closestIdea.timeDiff / 1000 + "초 차이",
                                    }
                                  );

                                  setIdeaDetailModalData(closestIdea);
                                  setCurrentIdeaIndex(
                                    filteredIdeas.indexOf(closestIdea)
                                  );
                                  setShowIdeaDetailModal(true);
                                } else {
                                  console.log(
                                    "❌ 해당 작성자의 아이디어를 찾을 수 없음"
                                  );
                                }
                              }}
                            >
                              "
                              {(() => {
                                // 메시지 시간과 가장 가까운 아이디어의 제목 찾기
                                const messageTime = new Date(
                                  message.timestamp
                                ).getTime();
                                const authorIdeas = ideas
                                  .filter(
                                    (idea) => idea.author === message.sender
                                  )
                                  .map((idea) => ({
                                    ...idea,
                                    timeDiff: Math.abs(
                                      new Date(idea.timestamp).getTime() -
                                        messageTime
                                    ),
                                  }))
                                  .sort((a, b) => a.timeDiff - b.timeDiff);

                                return (
                                  authorIdeas[0]?.content.object || "아이디어"
                                );
                              })()}
                              "
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // 일반 메시지
                  const isMyMessage = message.sender === "나";

                  return (
                    <div
                      key={message.id}
                      className={`flex ${
                        isMyMessage ? "justify-end" : "justify-start"
                      } mb-4`}
                    >
                      <div
                        className={`max-w-md ${
                          isMyMessage ? "order-2" : "order-1"
                        }`}
                      >
                        {!isMyMessage && (
                          <div className="text-xs text-gray-500 mb-1 px-3">
                            {senderName} • {formatTimestamp(message.timestamp)}
                          </div>
                        )}

                        <div
                          className={`rounded-2xl px-4 py-3 ${(() => {
                            // 메시지 타입에 따른 색상 결정
                            if (
                              typeof message.payload === "object" &&
                              message.payload !== null &&
                              "type" in message.payload
                            ) {
                              const isRequest =
                                message.payload.type === "make_request";
                              if (isMyMessage) {
                                return isRequest
                                  ? "bg-indigo-500 text-white"
                                  : "bg-blue-500 text-white";
                              } else {
                                return isRequest
                                  ? "bg-yellow-100 text-gray-900"
                                  : "bg-slate-200 text-gray-900";
                              }
                            }
                            // 기본값
                            return isMyMessage
                              ? "bg-blue-500 text-white"
                              : "bg-gray-100 text-gray-900";
                          })()}`}
                        >
                          {(() => {
                            // Check if payload is the new object format
                            if (
                              typeof message.payload === "object" &&
                              message.payload !== null &&
                              "type" in message.payload
                            ) {
                              const { type, mention, requestType, content } =
                                message.payload;
                              const isRequest =
                                type === "make_request" &&
                                mention &&
                                requestType;
                              const isFeedback = type === "give_feedback";

                              if (isRequest) {
                                const reqType = requestType as
                                  | "generate"
                                  | "evaluate"
                                  | "give_feedback";
                                const requestText =
                                  {
                                    generate: "아이디어 생성",
                                    evaluate: "아이디어 평가",
                                    give_feedback: "피드백",
                                  }[reqType] || "요청";

                                return (
                                  <div>
                                    <div
                                      className={`text-sm font-medium mb-2 ${
                                        isMyMessage
                                          ? "text-indigo-100"
                                          : "text-yellow-800"
                                      }`}
                                    >
                                      <span className="font-medium">
                                        @{getAuthorName(mention)}
                                      </span>
                                      <span>에게 {requestText} 요청</span>
                                    </div>
                                    <p
                                      className={`text-sm leading-relaxed ${
                                        isMyMessage
                                          ? "text-white"
                                          : "text-gray-800"
                                      }`}
                                    >
                                      {content}
                                    </p>
                                  </div>
                                );
                              }

                              if (isFeedback) {
                                // mention이 있는 경우 헤더 포함
                                if (mention && mention.trim()) {
                                  return (
                                    <div>
                                      <div
                                        className={`text-sm mb-2 ${
                                          isMyMessage
                                            ? "text-blue-100"
                                            : "text-slate-600"
                                        }`}
                                      >
                                        <span className="font-medium">
                                          @{getAuthorName(mention)}
                                        </span>
                                        <span>에게 피드백</span>
                                      </div>
                                      <p
                                        className={`text-sm leading-relaxed ${
                                          isMyMessage
                                            ? "text-white"
                                            : "text-gray-800"
                                        }`}
                                      >
                                        {content || "메시지 내용 없음"}
                                      </p>
                                    </div>
                                  );
                                } else {
                                  // mention이 없는 경우 일반 메시지로 표시
                                  return (
                                    <div>
                                      <p
                                        className={`text-sm leading-relaxed ${
                                          isMyMessage
                                            ? "text-white"
                                            : "text-gray-800"
                                        }`}
                                      >
                                        {content || "메시지 내용 없음"}
                                      </p>
                                    </div>
                                  );
                                }
                              }
                            }

                            // Fallback for older string-based messages or other types
                            const messageContent = (() => {
                              if (typeof message.payload === "string") {
                                return message.payload;
                              }
                              if (
                                isSystemMessagePayload(message.payload) ||
                                isChatMessagePayload(message.payload)
                              ) {
                                return message.payload.content;
                              }
                              return "메시지 내용 없음";
                            })();
                            return (
                              <p
                                className={`text-sm leading-relaxed ${
                                  isMyMessage ? "text-white" : "text-gray-800"
                                }`}
                              >
                                {messageContent}
                              </p>
                            );
                          })()}
                        </div>

                        {isMyMessage && (
                          <div className="text-xs text-gray-500 mt-1 px-3 text-right">
                            {formatTimestamp(message.timestamp)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              <div ref={messagesEndRef} />
            </div>

            {/* 메시지 입력 */}
            <div className="p-4 border-t border-gray-200">
              <div className="relative">
                {/* 멘션 및 요청 타입 UI */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="relative">
                    <button
                      onClick={() =>
                        setShowMentionDropdown(!showMentionDropdown)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-200"
                    >
                      <span className="text-gray-500">@</span>
                      <span>
                        {mentionedAgent ? mentionedAgent.name : "팀원 선택"}
                      </span>
                    </button>
                    {showMentionDropdown && (
                      <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                        {getFilteredAgentsForRequest().map((agent) => (
                          <button
                            key={agent.id}
                            onClick={() => {
                              setMentionedAgent(agent);
                              setShowMentionDropdown(false);

                              // 선택된 에이전트가 현재 요청 타입을 수행할 수 없다면 요청 타입 초기화
                              if (
                                chatMode === "make_request" &&
                                requestType &&
                                !canAgentPerformRole(agent, requestType)
                              ) {
                                setRequestType(null);
                              }
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {agent.name}
                          </button>
                        ))}
                        {getFilteredAgentsForRequest().length === 0 &&
                          chatMode === "make_request" &&
                          requestType && (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              해당 역할을 수행할 수 있는 에이전트가 없습니다.
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  <span className="text-sm text-gray-500">에게</span>

                  <select
                    value={chatMode}
                    onChange={(e) => {
                      setChatMode(
                        e.target.value as "give_feedback" | "make_request"
                      );
                      // 채팅 모드 변경 시 요청 타입과 멘션된 에이전트 초기화
                      if (e.target.value === "make_request") {
                        setRequestType(null);
                      }
                    }}
                    className="px-3 py-1.5 bg-gray-100 border-none rounded-md text-sm font-medium text-gray-700 focus:ring-0"
                  >
                    <option value="give_feedback">피드백</option>
                    <option value="make_request">요청</option>
                  </select>

                  {chatMode === "make_request" && (
                    <select
                      value={requestType || ""}
                      onChange={(e) => {
                        const newRequestType = e.target.value as
                          | "generate"
                          | "evaluate"
                          | "give_feedback";
                        setRequestType(newRequestType);

                        // 요청 타입 변경 시, 현재 선택된 에이전트가 해당 역할을 수행할 수 없다면 초기화
                        if (
                          mentionedAgent &&
                          !canAgentPerformRole(mentionedAgent, newRequestType)
                        ) {
                          setMentionedAgent(null);
                        }
                      }}
                      className="px-3 py-1.5 bg-gray-100 border-none rounded-md text-sm font-medium text-gray-700 focus:ring-0"
                    >
                      <option value="" disabled>
                        요청 선택
                      </option>
                      {getAvailableRequestTypes().map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 메시지 입력창 */}
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={
                      userInFeedbackSession
                        ? "피드백 세션 진행 중입니다. 세션이 끝나면 채팅할 수 있습니다."
                        : chatMode === "give_feedback"
                        ? `${
                            mentionedAgent ? mentionedAgent.name : "팀원"
                          }에게 피드백을 보내세요...`
                        : `${
                            mentionedAgent ? mentionedAgent.name : "팀원"
                          }에게 요청할 내용을 입력하세요...`
                    }
                    onKeyPress={(e) =>
                      e.key === "Enter" &&
                      !userInFeedbackSession &&
                      handleSendMessage()
                    }
                    className="flex-1"
                    disabled={
                      isAutoGenerating ||
                      isGeneratingIdea ||
                      userInFeedbackSession
                    }
                  />
                  <Button
                    onClick={handleSendMessage}
                    size="icon"
                    disabled={
                      isAutoGenerating ||
                      isGeneratingIdea ||
                      !mentionedAgent ||
                      (chatMode === "make_request" && !requestType)
                    }
                    className="self-center"
                  >
                    <Send className="w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 오른쪽: 아이디어 목록 */}
          <div className="w-[28rem] bg-gray-50 border-l border-gray-200 flex flex-col">
            {/* Topic 섹션 */}
            <div className="p-4 bg-white border-b border-gray-200">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h3 className="text-sm font-medium text-gray-600 mb-2">
                  Topic
                </h3>
                <h2 className="text-lg font-bold text-gray-900">
                  {topic || "Carbon Emission Reduction"}
                </h2>
              </div>
            </div>

            {/* 아이디어 추가하기 버튼 */}
            <div className="p-4 bg-white border-b border-gray-200">
              {userCanGenerateIdeas && (
                <button
                  onClick={() => setShowAddIdeaModal(true)}
                  disabled={isAutoGenerating || isGeneratingIdea}
                  className="w-full bg-black text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isAutoGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      AI 아이디어 생성 중...
                    </>
                  ) : (
                    "아이디어 추가하기 +"
                  )}
                </button>
              )}
              <div className="flex items-center justify-end gap-2 mt-3">
                {/* 필터 드롭다운 */}
                <select
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  {uniqueAuthors.map((author) => (
                    <option key={author} value={author}>
                      {author}
                    </option>
                  ))}
                </select>

                <button className="p-2 hover:bg-gray-100 rounded">
                  <div className="grid grid-cols-3 gap-1">
                    {[...Array(9)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1 h-1 bg-gray-400 rounded-full"
                      ></div>
                    ))}
                  </div>
                </button>
                <button className="p-2 hover:bg-gray-100 rounded">
                  <div className="flex flex-col gap-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-4 h-0.5 bg-gray-400"></div>
                    ))}
                  </div>
                </button>
                <button className="p-2 hover:bg-gray-100 rounded">
                  <div className="w-4 h-4 border border-gray-400">
                    <div className="w-full h-full border-l border-gray-400 rotate-45 origin-center"></div>
                  </div>
                </button>
              </div>
            </div>

            {/* 아이디어 목록 */}
            <div
              ref={ideaListRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {filteredIdeas.map((idea) => {
                // 원본 생성 순서에 따른 인덱스 찾기
                const creationIndex = ideasSortedByCreation.findIndex(
                  (i) => i.id === idea.id
                );

                const authorName = getAuthorName(idea.author);

                return (
                  <div
                    key={idea.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setIdeaDetailModalData(idea);
                      setCurrentIdeaIndex(filteredIdeas.indexOf(idea));
                      setShowIdeaDetailModal(true);
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">
                        Idea {creationIndex + 1}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          아이디어 제작자
                        </span>
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                            idea.author === "나"
                              ? "bg-green-500 text-white"
                              : "bg-blue-500 text-white"
                          }`}
                        >
                          {authorName === "나" ? "나" : authorName[0]}
                        </div>
                        <span className="text-xs font-medium text-gray-700">
                          {authorName}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Object
                        </h4>
                        <p className="text-sm font-medium text-gray-800 truncate mt-0.5">
                          {idea.content.object}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-2">
                          Function
                        </h4>
                        <p
                          className="text-sm text-gray-600 mt-0.5"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {idea.content.function}
                        </p>
                      </div>
                    </div>

                    <button className="w-full mt-4 bg-gray-100 text-gray-700 py-2 px-3 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                      자세히 보기
                    </button>
                  </div>
                );
              })}

              {filteredIdeas.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Lightbulb className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  {isAutoGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                      <p className="text-sm font-medium">
                        AI 에이전트들이 아이디어를 생성하고 있습니다...
                      </p>
                      {generationProgress.total > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                          {generationProgress.completed}/
                          {generationProgress.total} 완료
                        </p>
                      )}
                    </>
                  ) : ideas.length > 0 && authorFilter !== "전체" ? (
                    <>
                      <p className="text-sm">
                        {authorFilter}가 작성한 아이디어가 없습니다
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        다른 작성자를 선택하거나 전체 보기로 변경해보세요
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm">아직 생성된 아이디어가 없습니다</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {userCanGenerateIdeas
                          ? "위의 '아이디어 추가하기' 버튼을 눌러 시작해보세요"
                          : "아이디어 생성 담당자가 아이디어를 만들 때까지 기다려주세요"}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* 아이디어가 있지만 자동 생성 중일 때도 진행 상황 표시 */}
              {filteredIdeas.length > 0 && isAutoGenerating && (
                <div className="text-center py-4 text-blue-600 bg-blue-50 rounded-lg">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm font-medium">
                    추가 아이디어를 생성하고 있습니다...
                  </p>
                  {generationProgress.total > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      {generationProgress.completed}/{generationProgress.total}{" "}
                      완료
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 아이디어 상세 모달 */}
      {showIdeaDetailModal && ideaDetailModalData && (
        <IdeaDetailModal
          isOpen={showIdeaDetailModal}
          onClose={() => {
            setShowIdeaDetailModal(false);
            setIsEditMode(false);
          }}
          idea={ideaDetailModalData}
          ideas={filteredIdeas}
          currentIndex={currentIdeaIndex}
          onIndexChange={(newIndex) => {
            setCurrentIdeaIndex(newIndex);
            setIdeaDetailModalData(filteredIdeas[newIndex]);
          }}
          team={team}
          agents={agents}
          userCanEvaluateIdeas={userCanEvaluateIdeas}
          onEvaluate={(idea) => {
            // 이제 사용하지 않음 - 모달 내에서 직접 처리
          }}
          onSubmitEvaluation={handleSubmitEvaluationNew}
          isSubmittingEvaluation={isSubmittingEvaluation}
        />
      )}

      {/* 아이디어 추가 모달 */}
      {showAddIdeaModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowAddIdeaModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  새 아이디어 추가하기
                </h2>
                <button
                  onClick={() => setShowAddIdeaModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
                >
                  <span className="text-xl">×</span>
                </button>
              </div>

              <div className="space-y-6">
                {/* Object */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Object *
                  </label>
                  <textarea
                    value={addIdeaFormData.object}
                    onChange={(e) =>
                      setAddIdeaFormData({
                        ...addIdeaFormData,
                        object: e.target.value,
                      })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={2}
                    placeholder="아이디어의 핵심 객체를 입력하세요..."
                    required
                  />
                </div>

                {/* Function */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Function *
                  </label>
                  <textarea
                    value={addIdeaFormData.function}
                    onChange={(e) =>
                      setAddIdeaFormData({
                        ...addIdeaFormData,
                        function: e.target.value,
                      })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={4}
                    placeholder="아이디어의 기능을 상세히 설명하세요..."
                    required
                  />
                </div>

                {/* Behavior */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Behavior
                  </label>
                  <textarea
                    value={addIdeaFormData.behavior}
                    onChange={(e) =>
                      setAddIdeaFormData({
                        ...addIdeaFormData,
                        behavior: e.target.value,
                      })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={4}
                    placeholder="아이디어의 동작 방식을 설명하세요..."
                  />
                </div>

                {/* Structure */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Structure
                  </label>
                  <textarea
                    value={addIdeaFormData.structure}
                    onChange={(e) =>
                      setAddIdeaFormData({
                        ...addIdeaFormData,
                        structure: e.target.value,
                      })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={4}
                    placeholder="아이디어의 구조를 설명하세요..."
                  />
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleAddIdea}
                    disabled={
                      !addIdeaFormData.object.trim() ||
                      !addIdeaFormData.function.trim() ||
                      isAutoGenerating ||
                      isGeneratingIdea
                    }
                    className="flex-1 bg-black text-white py-3 px-4 rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
                  >
                    아이디어 추가하기
                  </button>
                  <button
                    onClick={() => {
                      setShowAddIdeaModal(false);
                      setAddIdeaFormData({
                        object: "",
                        function: "",
                        behavior: "",
                        structure: "",
                      });
                    }}
                    className="flex-1 bg-gray-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-600 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메모리 팝오버 */}
      {hoveredAgentId && agentMemory && (
        <div
          className="absolute bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-[600px] z-50 max-h-[80vh] overflow-y-auto"
          style={{ top: popoverPosition.top, left: popoverPosition.left }}
        >
          <h3 className="font-bold text-lg mb-4 text-blue-600 border-b pb-2">
            🧠 Memory of {getAuthorName(hoveredAgentId)}
          </h3>

          {/* Short-term Memory */}
          <div className="mb-6">
            <h4 className="font-semibold text-md mb-3 text-green-600">
              📋 Short-term Memory
            </h4>
            <div className="space-y-3">
              {/* Last Action */}
              <div className="bg-green-50 p-3 rounded-lg">
                <h5 className="font-medium text-sm mb-2 text-green-800">
                  Last Action:
                </h5>
                {agentMemory.shortTerm?.lastAction ? (
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>Type:</strong>{" "}
                      {agentMemory.shortTerm.lastAction.type}
                    </p>
                    <p>
                      <strong>Timestamp:</strong>{" "}
                      {new Date(
                        agentMemory.shortTerm.lastAction.timestamp
                      ).toLocaleString()}
                    </p>
                    {agentMemory.shortTerm.lastAction.payload && (
                      <div>
                        <strong>Payload:</strong>
                        <pre className="mt-1 text-xs bg-white p-2 rounded border overflow-x-auto">
                          {JSON.stringify(
                            agentMemory.shortTerm.lastAction.payload,
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No recent actions</p>
                )}
              </div>

              {/* Active Chat */}
              <div className="bg-green-50 p-3 rounded-lg">
                <h5 className="font-medium text-sm mb-2 text-green-800">
                  Active Chat:
                </h5>
                {agentMemory.shortTerm?.activeChat ? (
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>Target:</strong>{" "}
                      {getAuthorName(
                        agentMemory.shortTerm.activeChat.targetAgentId
                      )}
                    </p>
                    <p>
                      <strong>Messages:</strong>{" "}
                      {agentMemory.shortTerm.activeChat.messages?.length || 0}{" "}
                      messages
                    </p>
                    {agentMemory.shortTerm.activeChat.messages &&
                      agentMemory.shortTerm.activeChat.messages.length > 0 && (
                        <div className="mt-2">
                          <strong>Recent Messages:</strong>
                          <div className="max-h-32 overflow-y-auto mt-1">
                            {agentMemory.shortTerm.activeChat.messages
                              .slice(-3)
                              .map((msg, idx) => (
                                <div
                                  key={idx}
                                  className="text-xs bg-white p-2 rounded border mb-1"
                                >
                                  <div>
                                    <strong>
                                      {getAuthorName(msg.sender)}:
                                    </strong>
                                  </div>
                                  <div>
                                    {typeof msg.payload === "string"
                                      ? msg.payload
                                      : JSON.stringify(msg.payload)}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No active chat</p>
                )}
              </div>
            </div>
          </div>

          {/* Long-term Memory */}
          <div>
            <h4 className="font-semibold text-md mb-3 text-purple-600">
              🧩 Long-term Memory
            </h4>

            {/* Self Reflections */}
            <div className="mb-4">
              <h5 className="font-medium text-sm mb-2 text-purple-800">
                🪞 Self Reflections
              </h5>
              {agentMemory.longTerm?.self &&
              agentMemory.longTerm.self.trim().length > 0 ? (
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded border">
                    <div className="text-sm space-y-1">
                      <p className="text-gray-700 leading-relaxed">
                        {agentMemory.longTerm.self}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  아직 특별한 성찰 내용이 없습니다.
                </p>
              )}
            </div>

            {/* Relations */}
            <div>
              <h5 className="font-medium text-sm mb-2 text-purple-800">
                👥 Relations (
                {Object.keys(agentMemory.longTerm?.relations || {}).length})
              </h5>
              <div className="bg-purple-50 p-3 rounded-lg max-h-64 overflow-y-auto">
                {agentMemory.longTerm?.relations &&
                Object.keys(agentMemory.longTerm.relations).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(agentMemory.longTerm.relations).map(
                      ([agentId, relation]) => (
                        <div
                          key={agentId}
                          className="bg-white p-3 rounded border"
                        >
                          <div className="space-y-2">
                            {/* Agent Info */}
                            <div className="border-b pb-2">
                              <h6 className="font-semibold text-sm text-gray-800">
                                {getAuthorName(agentId)} ({agentId})
                              </h6>
                              <div className="text-xs text-gray-600 mt-1">
                                <p>
                                  <strong>Professional:</strong>{" "}
                                  {relation.agentInfo?.professional || "N/A"}
                                </p>
                                <p>
                                  <strong>Personality:</strong>{" "}
                                  {relation.agentInfo?.personality || "N/A"}
                                </p>
                                <p>
                                  <strong>Skills:</strong>{" "}
                                  {relation.agentInfo?.skills || "N/A"}
                                </p>
                              </div>
                            </div>

                            {/* Relationship */}
                            <div>
                              <p className="text-sm">
                                <strong>Relationship:</strong>{" "}
                                {relation.relationship}
                              </p>
                            </div>

                            {/* My Opinion */}
                            <div>
                              <p className="text-sm">
                                <strong>My Opinion:</strong>
                              </p>
                              <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded mt-1">
                                {relation.myOpinion || "No opinion yet"}
                              </p>
                            </div>

                            {/* Interaction History */}
                            <div>
                              <p className="text-sm">
                                <strong>
                                  Interaction History (
                                  {relation.interactionHistory?.length || 0}):
                                </strong>
                              </p>
                              {relation.interactionHistory &&
                              relation.interactionHistory.length > 0 ? (
                                <div className="max-h-32 overflow-y-auto mt-1">
                                  {relation.interactionHistory.map(
                                    (interaction, idx) => (
                                      <div
                                        key={idx}
                                        className="text-xs bg-gray-50 p-2 rounded mb-1"
                                      >
                                        <p>
                                          <strong>Action:</strong>{" "}
                                          {interaction.action}
                                        </p>
                                        <p>
                                          <strong>Content:</strong>{" "}
                                          {interaction.content}
                                        </p>
                                        <p>
                                          <strong>Time:</strong>{" "}
                                          {new Date(
                                            interaction.timestamp
                                          ).toLocaleString()}
                                        </p>
                                      </div>
                                    )
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 mt-1">
                                  No interactions yet
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No relations established
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Raw Memory Data (for debugging) */}
          <div className="mt-4 pt-4 border-t">
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-800 font-medium">
                🔍 Raw Memory Data (Debug)
              </summary>
              <pre className="mt-2 bg-gray-100 p-3 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(agentMemory, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}

      {/* Memory Modal */}
      {showMemoryModal && selectedAgentId && agentMemory && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={closeMemoryModal}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  🧠 Memory of {getAuthorName(selectedAgentId)}
                </h2>
                <button
                  onClick={closeMemoryModal}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
                >
                  <span className="text-xl">×</span>
                </button>
              </div>

              {/* Raw JSON Display */}
              <div>
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto max-h-[70vh] overflow-y-auto font-mono whitespace-pre-wrap">
                  {JSON.stringify(agentMemory, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 피드백 세션 모달 */}
      <FeedbackSessionModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        sessionData={feedbackSessionData}
        teamId={team?.id}
      />
      <ViewFeedbackSessionModal
        isOpen={showViewSessionModal}
        onClose={() => setShowViewSessionModal(false)}
        sessionId={viewingSessionId}
      />
    </div>
  );
}
