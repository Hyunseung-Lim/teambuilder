"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getTeamAction } from "@/actions/team.actions";
import { getUserAgentsAction } from "@/actions/agent.actions";
import {
  Team,
  AIAgent,
  Idea,
  ChatMessage,
  AgentMemory,
  AgentRole,
} from "@/lib/types";
import IdeaDetailModal from "@/components/IdeaDetailModal";
import ViewFeedbackSessionModal from "@/components/ViewFeedbackSessionModal";

// 분리된 컴포넌트와 유틸리티 import
import { useAgentStates } from "./hooks/useAgentStates";
import { getKoreanParticle } from "./utils/koreanUtils";
import Header from "./components/Header";
import TeamMembersList from "./components/TeamMembersList";
import ChatArea from "./components/ChatArea";
import IdeaList from "./components/IdeaList";
import AddIdeaModal from "./components/AddIdeaModal";
import MemoryModal from "./components/MemoryModal";

interface FeedbackTab {
  id: string;
  name: string;
  participantId: string;
  participantName: string;
  type: "user_to_ai" | "ai_to_user";
  sessionData?: any;
  isActive: boolean;
}

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
  const [sseConnected, setSseConnected] = useState(false);

  // 채팅 기능 상태
  const [chatMode, setChatMode] = useState<"give_feedback" | "make_request">(
    "give_feedback"
  );
  const [mentionedAgent, setMentionedAgent] = useState<AIAgent | null>(null);
  const [requestType, setRequestType] = useState<
    "generate" | "evaluate" | "give_feedback" | null
  >(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [isSubmittingEvaluation, setIsSubmittingEvaluation] = useState(false);
  const [evaluatingViaRequestAgents, setEvaluatingViaRequestAgents] = useState<
    Set<string>
  >(new Set());
  const [evaluatingAutonomouslyAgents, setEvaluatingAutonomouslyAgents] =
    useState<Set<string>>(new Set());

  // 탭 시스템 상태
  const [activeTab, setActiveTab] = useState<"main" | string>("main");
  const [feedbackTabs, setFeedbackTabs] = useState<FeedbackTab[]>([]);

  // 피드백 세션 모달 상태
  const [showViewSessionModal, setShowViewSessionModal] = useState(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  // 활성 피드백 세션 상태
  const [activeFeedbackSessions, setActiveFeedbackSessions] = useState<
    string[]
  >([]);
  const [userInFeedbackSession, setUserInFeedbackSession] = useState(false);
  const [aiFeedbackSessions, setAiFeedbackSessions] = useState<
    Array<{
      id: string;
      participants: string[];
      startTime: string;
    }>
  >([]);

  // 에이전트 메모리 관련 상태
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [agentMemory, setAgentMemory] = useState<AgentMemory | null>(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showMemoryModal, setShowMemoryModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const ideaListRef = useRef<HTMLDivElement | null>(null);

  const teamId = params.teamId as string;
  const { agentStates, userState, timers } = useAgentStates(teamId);

  // 현재 팀에 속한 AI 에이전트만 필터링
  const teamAgents = agents.filter((agent) =>
    team?.members.some(
      (member) => !member.isUser && member.agentId === agent.id
    )
  );

  // 사용자 권한 확인
  const userCanGenerateIdeas =
    team?.members.find((m) => m.isUser)?.roles.includes("아이디어 생성하기") ||
    false;
  const userCanEvaluateIdeas =
    team?.members.find((m) => m.isUser)?.roles.includes("아이디어 평가하기") ||
    false;

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
    const teamMember = team.members.find(
      (member) => member.agentId === agent.id
    );
    return teamMember ? teamMember.roles.includes(requiredRole) : false;
  };

  // 에이전트가 피드백 세션 중인지 확인하는 함수 (인간 포함)
  const isAgentInFeedbackSession = (agentId: string): boolean => {
    if (agentId === "나") {
      // 인간 사용자의 경우
      return userState?.currentState === "feedback_session";
    } else {
      // AI 에이전트의 경우
      const agentState = agentStates.get(agentId);
      return agentState?.currentState === "feedback_session";
    }
  };

  // 아이디어 필터링
  const ideasSortedByCreation = [...ideas].sort((a, b) => a.id - b.id);
  const filteredIdeas = ideas
    .filter((idea) => {
      if (authorFilter === "전체") return true;
      const authorName = getAuthorName(idea.author);
      return authorName === authorFilter;
    })
    .sort((a, b) => b.id - a.id);

  // 고유한 작성자 목록
  const uniqueAuthors = [
    "전체",
    ...Array.from(new Set(ideas.map((idea) => getAuthorName(idea.author)))),
  ];

  // 선택된 요청 타입에 따라 필터링된 에이전트 목록
  const getFilteredAgentsForRequest = () => {
    if (chatMode !== "make_request" && chatMode !== "give_feedback") {
      return teamAgents;
    }
    return teamAgents.filter((agent) => {
      if (chatMode === "make_request" && requestType) {
        if (!canAgentPerformRole(agent, requestType)) {
          return false;
        }
      }
      const agentState = agentStates.get(agent.id);
      if (agentState?.currentState === "feedback_session") {
        return false;
      }
      return true;
    });
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 데이터 로드 함수들
  const loadIdeas = useCallback(async (teamId: string) => {
    try {
      const response = await fetch(
        `/api/teams/${teamId}/ideas?t=${new Date().getTime()}`
      );
      if (response.ok) {
        const data = await response.json();
        setIdeas(data.ideas || []);
        return (data.ideas || []).length;
      }
      return 0;
    } catch (error) {
      console.error("💡 아이디어 로드 실패:", error);
      return 0;
    }
  }, []);

  const loadMessages = useCallback(async (teamId: string) => {
    try {
      const response = await fetch(
        `/api/teams/${teamId}/chat?t=${new Date().getTime()}`
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("💬 채팅 메시지 로드 실패:", error);
    }
  }, []);

  // 탭 관리 함수들
  const createFeedbackTab = async (
    participantId: string,
    participantName: string,
    type: "user_to_ai" | "ai_to_user",
    sessionData?: any
  ) => {
    try {
      const response = await fetch(`/api/teams/${team?.id}/feedback-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          initiatorId: "나",
          targetAgentId: participantId,
          message: sessionData?.message,
          feedbackContext: {
            type: "general_feedback",
            initiatedBy: "user",
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 409 && errorData.busy) {
          let alertMessage = "";
          if (errorData.reason === "initiator_busy") {
            alertMessage =
              "현재 다른 피드백 세션에 참여 중입니다. 기존 세션을 종료한 후 다시 시도해주세요.";
          } else if (errorData.reason === "target_busy") {
            alertMessage = `${participantName}는 현재 다른 피드백 세션에 참여 중입니다. 잠시 후 다시 시도해주세요.`;
          } else {
            alertMessage = `${participantName}는 현재 다른 피드백 세션에 참여 중입니다. 잠시 후 다시 시도해주세요.`;
          }
          alert(alertMessage);
          return null;
        }
        throw new Error(`피드백 세션 생성 실패: ${response.status}`);
      }

      const result = await response.json();
      const tabId = result.sessionId;
      const newTab = {
        id: tabId,
        name: `${participantName}와의 피드백`,
        participantId,
        participantName,
        type,
        sessionData: {
          ...sessionData,
          realSessionId: result.sessionId,
        },
        isActive: true,
      };

      setFeedbackTabs((prev) => [...prev, newTab]);
      setActiveTab(tabId);
      return tabId;
    } catch (error) {
      console.error("❌ 피드백 세션 생성 실패:", error);
      alert("피드백 세션 생성에 실패했습니다. 다시 시도해주세요.");
      return null;
    }
  };

  const closeFeedbackTab = async (tabId: string) => {
    try {
      const response = await fetch(`/api/teams/${team?.id}/feedback-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          sessionId: tabId,
          endedBy: "user",
        }),
      });
      if (response.ok) {
        console.log(`✅ 피드백 세션 ${tabId} 백엔드 종료 완료`);
      }
    } catch (error) {
      console.error(`❌ 피드백 세션 ${tabId} 백엔드 종료 오류:`, error);
    }

    setFeedbackTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    if (activeTab === tabId) {
      setActiveTab("main");
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  // 메시지 전송 핸들러
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !team || !mentionedAgent) return;

    // 🔒 사용자가 피드백 세션 중인지 확인
    if (isAgentInFeedbackSession("나")) {
      alert(
        "현재 피드백 세션에 참여 중입니다. 피드백 세션을 종료한 후 다시 시도해주세요."
      );
      return;
    }

    if (isAgentInFeedbackSession(mentionedAgent.id)) {
      alert(
        `${mentionedAgent.name}는 현재 다른 피드백 세션에 참여 중입니다. 잠시 후 다시 시도해주세요.`
      );
      return;
    }

    if (chatMode === "give_feedback") {
      const tabId = await createFeedbackTab(
        mentionedAgent.id,
        mentionedAgent.name,
        "user_to_ai",
        { mentionedAgent, message: newMessage.trim() }
      );
      if (tabId) {
        setNewMessage("");
        setMentionedAgent(null);
        setChatMode("give_feedback");
        setRequestType(null);
      }
      return;
    }

    // 요청 추적
    if (chatMode === "make_request" && requestType === "generate") {
      setGeneratingViaRequestAgents((prev) =>
        new Set(prev).add(mentionedAgent.id)
      );
    }
    if (chatMode === "make_request" && requestType === "evaluate") {
      setEvaluatingViaRequestAgents((prev) =>
        new Set(prev).add(mentionedAgent.id)
      );
    }

    // 낙관적 업데이트
    const tempMessage = {
      id: `temp-${Date.now()}`,
      sender: "나",
      timestamp: new Date().toISOString(),
      type: chatMode,
      payload: {
        type: chatMode,
        content: newMessage.trim(),
        mention: mentionedAgent.id,
        requestType: chatMode === "make_request" ? requestType : undefined,
      },
    };

    setMessages((prevMessages) => [...prevMessages, tempMessage]);
    setNewMessage("");
    setMentionedAgent(null);
    setChatMode("give_feedback");
    setRequestType(null);

    try {
      const response = await fetch(`/api/teams/${team.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: "나",
          payload: tempMessage.payload,
        }),
      });
      if (!response.ok) throw new Error("서버 전송 실패");
    } catch (error) {
      console.error("❌ 메시지 전송 실패:", error);
      setMessages((prevMessages) =>
        prevMessages.filter((m) => m.id !== tempMessage.id)
      );
    }
  };

  // 아이디어 생성 핸들러
  const handleGenerateIdea = async () => {
    if (!team || isGeneratingIdea) return;
    try {
      setIsGeneratingIdea(true);
      const response = await fetch(`/api/teams/${team.id}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          author: "나",
        }),
      });
      if (response.ok) {
        // 성공적으로 요청됨
      }
    } catch (error) {
      console.error("아이디어 생성 실패:", error);
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  // 아이디어 추가 핸들러
  const handleAddIdea = async () => {
    if (!team || !addIdeaFormData.object.trim()) return;
    try {
      const response = await fetch(`/api/teams/${team.id}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          author: "나",
          content: addIdeaFormData,
        }),
      });
      if (response.ok) {
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

  // 에이전트 상태 초기화 핸들러
  const handleResetAgentStates = async () => {
    if (confirm("모든 에이전트 상태를 초기화하시겠습니까?")) {
      try {
        const response = await fetch(`/api/teams/${team?.id}/agent-states`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset_all_agents" }),
        });
        if (response.ok) {
          const result = await response.json();
          alert(
            `에이전트 상태 초기화 완료!\n성공: ${
              result.results.filter((r: any) => r.status === "success").length
            }개\n실패: ${
              result.results.filter((r: any) => r.status === "error").length
            }개`
          );
        } else {
          const error = await response.json();
          alert(`초기화 실패: ${error.error}`);
        }
      } catch (error) {
        console.error("에이전트 상태 초기화 실패:", error);
        alert("초기화 중 오류가 발생했습니다.");
      }
    }
  };

  // 에이전트 클릭 핸들러
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

  // 아이디어 평가 제출 핸들러
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
          headers: { "Content-Type": "application/json" },
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
        await loadIdeas(team.id);
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
      throw error;
    } finally {
      setIsSubmittingEvaluation(false);
    }
  };

  // 실시간 피드백 세션 감지를 위한 ref
  const feedbackTabsRef = useRef<FeedbackTab[]>([]);

  // feedbackTabs 상태가 변경될 때마다 ref 업데이트
  useEffect(() => {
    feedbackTabsRef.current = feedbackTabs;
  }, [feedbackTabs]);

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
        await Promise.all([loadIdeas(teamId), loadMessages(teamId)]);
        if (teamData.topic) {
          setTopic(teamData.topic);
        } else {
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
  }, [params.teamId, session, loadIdeas, loadMessages]);

  // 아이디에이션 시작 시 아이디어 생성하기 역할 에이전트들의 자동 아이디어 생성
  useEffect(() => {
    if (!team || !agents.length || loading || ideas.length > 0) return;

    const triggerInitialIdeaGeneration = async () => {
      // '아이디어 생성하기' 역할을 가진 AI 에이전트들 찾기
      const ideaGenerators = team.members.filter(
        (member) => !member.isUser && member.roles.includes("아이디어 생성하기")
      );

      if (ideaGenerators.length === 0) {
        return;
      }

      // 각 아이디어 생성 에이전트에게 아이디어 생성 요청
      for (const member of ideaGenerators) {
        if (!member.agentId) continue;

        const agent = agents.find((a) => a.id === member.agentId);
        if (!agent) continue;

        try {
          const response = await fetch(
            `/api/teams/${team.id}/agents/${agent.id}/generate-idea`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                trigger: "initial_startup",
                topic: team.topic,
                teamContext: {
                  teamName: team.teamName,
                  memberCount: team.members.length,
                  agentRole: member.roles,
                },
              }),
            }
          );

          if (!response.ok) {
            console.warn(
              `❌ ${agent.name}의 초기 아이디어 생성 요청 실패:`,
              response.status
            );
          }
        } catch (error) {
          console.error(
            `❌ ${agent.name}의 초기 아이디어 생성 중 오류:`,
            error
          );
        }
      }
    };

    // 약간의 지연 후 실행 (다른 초기화가 완료될 시간 확보)
    const timer = setTimeout(triggerInitialIdeaGeneration, 1000);

    return () => clearTimeout(timer);
  }, [team, agents, loading, ideas.length]);

  // SSE 연결
  useEffect(() => {
    if (!team?.id) return;
    const eventSource = new EventSource(`/api/teams/${team.id}/events`);

    eventSource.onopen = () => {
      setSseConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "initial":
            if (data.messages) setMessages(data.messages);
            if (data.ideas) setIdeas(data.ideas);
            break;
          case "update":
            if (data.messages) setMessages(data.messages);
            if (data.ideas) setIdeas(data.ideas);
            break;
          case "heartbeat":
            break;
        }
      } catch (error) {
        console.error("❌ SSE 데이터 파싱 실패:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("❌ SSE 연결 오류:", error);
      setSseConnected(false);
    };

    return () => {
      eventSource.close();
      setSseConnected(false);
    };
  }, [team?.id]);

  // 아이디어 생성 완료 상태 확인 함수
  const isInitialIdeaGenerationComplete = (): boolean => {
    if (!team) return false;

    // 아이디어 생성 역할을 가진 팀원들 (에이전트만)
    const ideaGenerators = team.members.filter(
      (member) => !member.isUser && member.roles.includes("아이디어 생성하기")
    );

    if (ideaGenerators.length === 0) return true; // 아이디어 생성자가 없으면 제한 없음

    // 각 아이디어 생성자가 최소 1개의 아이디어를 생성했는지 확인
    const hasAllGeneratorsCreatedIdeas = ideaGenerators.every((generator) => {
      const hasIdea = ideas.some((idea) => idea.author === generator.agentId);
      return hasIdea;
    });

    return hasAllGeneratorsCreatedIdeas;
  };

  // 채팅 비활성화 여부 확인 함수
  const isChatDisabled = (): boolean => {
    // 초기 아이디어 생성이 완료되지 않았으면 채팅 비활성화
    return !isInitialIdeaGenerationComplete();
  };

  // 채팅 비활성화 메시지 생성 함수
  const getChatDisabledMessage = (): string => {
    if (!isInitialIdeaGenerationComplete()) {
      const incompleteGenerators =
        team?.members
          .filter(
            (member) =>
              !member.isUser &&
              member.roles.includes("아이디어 생성하기") &&
              !ideas.some((idea) => idea.author === member.agentId)
          )
          .map((member) => {
            const agent = agents.find((a) => a.id === member.agentId);
            return agent?.name || member.agentId;
          }) || [];

      if (incompleteGenerators.length > 0) {
        return `아이디어 생성 단계입니다. ${incompleteGenerators.join(
          ", "
        )}이(가) 아이디어를 생성할 때까지 채팅이 제한됩니다.`;
      }
    }
    return "채팅을 입력하세요...";
  };

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
        <div className="max-w-md w-full bg-white rounded-lg p-8 text-center">
          <p className="text-red-600 mb-4">
            {error || "팀을 찾을 수 없습니다."}
          </p>
          <Link href="/" className="text-blue-600 hover:underline">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <Header
        team={team}
        topic={topic}
        sseConnected={sseConnected}
        feedbackTabsCount={feedbackTabs.length}
        onResetAgentStates={handleResetAgentStates}
      />

      {/* 메인 컨텐츠 */}
      {topic && (
        <div className="flex h-[calc(100vh-80px)]">
          {/* 왼쪽: 팀원 목록 */}
          <TeamMembersList
            team={team}
            agents={agents}
            agentStates={agentStates}
            timers={timers}
            onAgentClick={handleAgentClick}
          />

          {/* 가운데: 채팅 영역 */}
          <ChatArea
            activeTab={activeTab}
            feedbackTabs={feedbackTabs}
            onSwitchTab={setActiveTab}
            onCloseFeedbackTab={closeFeedbackTab}
            messages={messages}
            team={team}
            agents={agents}
            ideas={ideas}
            getAuthorName={getAuthorName}
            teamAgents={teamAgents}
            newMessage={newMessage}
            onNewMessageChange={setNewMessage}
            mentionedAgent={mentionedAgent}
            showMentionDropdown={showMentionDropdown}
            onShowMentionDropdown={setShowMentionDropdown}
            onMentionedAgentChange={setMentionedAgent}
            chatMode={chatMode}
            onChatModeChange={setChatMode}
            requestType={requestType}
            onRequestTypeChange={setRequestType}
            getAvailableRequestTypes={getAvailableRequestTypes}
            isAgentInFeedbackSession={isAgentInFeedbackSession}
            canAgentPerformRole={canAgentPerformRole}
            onSendMessage={handleSendMessage}
            isAutoGenerating={isAutoGenerating}
            isGeneratingIdea={isGeneratingIdea}
            scrollToBottom={scrollToBottom}
            isChatDisabled={isChatDisabled}
            getChatDisabledMessage={getChatDisabledMessage}
          />

          {/* 오른쪽: 아이디어 목록 */}
          <IdeaList
            topic={topic}
            userCanGenerateIdeas={userCanGenerateIdeas}
            isAutoGenerating={isAutoGenerating}
            isGeneratingIdea={isGeneratingIdea}
            onShowAddIdeaModal={() => setShowAddIdeaModal(true)}
            filteredIdeas={filteredIdeas}
            ideasSortedByCreation={ideasSortedByCreation}
            authorFilter={authorFilter}
            uniqueAuthors={uniqueAuthors}
            onAuthorFilterChange={setAuthorFilter}
            onIdeaClick={(idea, index) => {
              setIdeaDetailModalData(idea);
              setCurrentIdeaIndex(index);
              setShowIdeaDetailModal(true);
            }}
            getAuthorName={getAuthorName}
            generationProgress={generationProgress}
            ideas={ideas}
          />
        </div>
      )}

      {/* 모달들 */}
      {showIdeaDetailModal && ideaDetailModalData && (
        <IdeaDetailModal
          isOpen={showIdeaDetailModal}
          onClose={() => {
            setShowIdeaDetailModal(false);
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
          onEvaluate={() => {}}
          onSubmitEvaluation={handleSubmitEvaluationNew}
          isSubmittingEvaluation={isSubmittingEvaluation}
        />
      )}

      <AddIdeaModal
        isOpen={showAddIdeaModal}
        onClose={() => {
          setShowAddIdeaModal(false);
          setAddIdeaFormData({
            object: "",
            function: "",
            behavior: "",
            structure: "",
          });
        }}
        formData={addIdeaFormData}
        onFormDataChange={setAddIdeaFormData}
        onSubmit={handleAddIdea}
        isAutoGenerating={isAutoGenerating}
        isGeneratingIdea={isGeneratingIdea}
      />

      <MemoryModal
        isOpen={showMemoryModal}
        onClose={() => {
          setShowMemoryModal(false);
          setSelectedAgentId(null);
          setAgentMemory(null);
        }}
        agentName={selectedAgentId ? getAuthorName(selectedAgentId) : ""}
        agentMemory={agentMemory}
      />

      <ViewFeedbackSessionModal
        isOpen={showViewSessionModal}
        onClose={() => setShowViewSessionModal(false)}
        sessionId={viewingSessionId}
      />
    </div>
  );
}
