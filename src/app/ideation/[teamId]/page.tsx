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
} from "@/lib/types";
import {
  User,
  Users,
  Crown,
  Send,
  Lightbulb,
  ArrowLeft,
  MessageCircle,
  Plus,
  ArrowRight,
  ClipboardCheck,
  MessageSquareText,
} from "lucide-react";
import Link from "next/link";
import IdeaDetailModal from "@/components/IdeaDetailModal";

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
  const [chatMode, setChatMode] = useState<"feedback" | "request">("feedback");
  const [mentionedAgent, setMentionedAgent] = useState<AIAgent | null>(null);
  const [requestType, setRequestType] = useState<
    "generate" | "evaluate" | "feedback" | null
  >(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);

  // 평가 상태 추가
  const [isSubmittingEvaluation, setIsSubmittingEvaluation] = useState(false);

  // 평가 요청 추적 상태 추가
  const [evaluatingViaRequestAgents, setEvaluatingViaRequestAgents] = useState<
    Set<string>
  >(new Set());

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      feedback: "피드백하기" as AgentRole,
    };

    const requiredRole = roleMap[requestType as keyof typeof roleMap];
    if (!requiredRole || !team) return false;

    // 팀 멤버에서 해당 에이전트의 역할 찾기
    const teamMember = team.members.find(
      (member) => member.agentId === agent.id
    );
    return teamMember ? teamMember.roles.includes(requiredRole) : false;
  };

  // 선택된 요청 타입에 따라 필터링된 에이전트 목록
  const getFilteredAgentsForRequest = () => {
    if (chatMode !== "request" || !requestType) {
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
        { value: "feedback", label: "피드백" },
      ];
    }

    const availableTypes = [];
    if (canAgentPerformRole(mentionedAgent, "generate")) {
      availableTypes.push({ value: "generate", label: "아이디어 생성" });
    }
    if (canAgentPerformRole(mentionedAgent, "evaluate")) {
      availableTypes.push({ value: "evaluate", label: "아이디어 평가" });
    }
    if (canAgentPerformRole(mentionedAgent, "feedback")) {
      availableTypes.push({ value: "feedback", label: "피드백" });
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
        msg.payload.content?.includes(
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
        msg.payload.content?.includes(
          "요청에 따라 아이디어 평가를 완료했습니다"
        )
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

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !team || !mentionedAgent) return;

    console.log("📤 메시지 전송 시작:", {
      message: newMessage.trim(),
      mentionedAgent: mentionedAgent.name,
      chatMode,
      requestType,
    });

    const messageType = chatMode;

    // Trigger generation tracking
    if (messageType === "request" && requestType === "generate") {
      console.log("🔄 아이디어 생성 요청 - 추적 시작:", mentionedAgent.id);
      setGeneratingViaRequestAgents((prev) =>
        new Set(prev).add(mentionedAgent.id)
      );
    }

    // Trigger evaluation tracking
    if (messageType === "request" && requestType === "evaluate") {
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
        requestType: chatMode === "request" ? requestType : undefined,
      },
    };

    // 2. UI에 즉시 반영
    setMessages((prevMessages) => [...prevMessages, tempMessage]);
    console.log("✅ 낙관적 업데이트 완료 - 임시 메시지 추가");

    // 3. 입력 필드 초기화
    setNewMessage("");
    setMentionedAgent(null);
    setChatMode("feedback");
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
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 mb-2">
                TEAM {team.teamName.toUpperCase()}
              </h2>
            </div>

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
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                      onMouseEnter={(e) =>
                        !member.isUser &&
                        member.agentId &&
                        handleMouseEnter(e, member.agentId)
                      }
                      onMouseLeave={handleMouseLeave}
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
                          {!member.isUser &&
                            member.agentId &&
                            generatingAgents.has(member.agentId) && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full animate-pulse flex-shrink-0">
                                아이디어 생성중...
                              </span>
                            )}
                          {!member.isUser &&
                            member.agentId &&
                            generatingViaRequestAgents.has(member.agentId) && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full animate-pulse flex-shrink-0">
                                요청 아이디어 생성중...
                              </span>
                            )}
                          {!member.isUser &&
                            member.agentId &&
                            evaluatingViaRequestAgents.has(member.agentId) && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full animate-pulse flex-shrink-0">
                                아이디어 평가중...
                              </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {member.roles.map((role, roleIndex) => (
                            <span
                              key={roleIndex}
                              className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg w-fit font-medium"
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
                  if (
                    typeof message.payload === "object" &&
                    message.payload &&
                    "content" in message.payload &&
                    typeof message.payload.content === "string"
                  ) {
                    // "생성중입니다" 메시지만 필터링 (평가 관련 메시지는 모두 표시)
                    return (
                      !message.payload.content.includes("생성중입니다") &&
                      !message.payload.content.includes("생성하고 있습니다")
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

                  if (message.type === "system") {
                    // 시스템 메시지 (아이디어 생성/평가 알림)
                    const isGeneratingMessage =
                      typeof message.payload === "object" &&
                      message.payload &&
                      typeof message.payload.content === "string" &&
                      (message.payload.content.includes("생성중입니다") ||
                        message.payload.content.includes("생성하고 있습니다") ||
                        message.payload.content.includes("평가하고 있습니다"));

                    const isIdeaCompletedMessage =
                      typeof message.payload === "object" &&
                      message.payload?.content?.includes("생성했습니다");

                    const isEvaluationCompletedMessage =
                      typeof message.payload === "object" &&
                      message.payload?.content?.includes("평가를 완료했습니다");

                    const messageContent =
                      (typeof message.payload === "object" &&
                        message.payload?.content) ||
                      "작업을 완료했습니다.";

                    // 평가 완료 메시지는 다른 색상으로 표시
                    const messageStyle = isEvaluationCompletedMessage
                      ? "bg-orange-50 text-orange-600"
                      : "bg-blue-50 text-blue-600";

                    return (
                      <div key={message.id} className="flex justify-center">
                        <div
                          className={`${messageStyle} px-7 py-2 rounded-full text-sm font-medium flex items-center gap-3`}
                        >
                          <span>
                            {senderName}
                            {getKoreanParticle(senderName, "이", "가")}{" "}
                            {messageContent}
                          </span>
                          {isIdeaCompletedMessage && (
                            <div
                              className="underline cursor-pointer border-blue-300 text-blue-600 text-xs h-auto"
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
                              생성된 아이디어 보기
                            </div>
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
                                message.payload.type === "request";
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
                                type === "request" && mention && requestType;
                              const isFeedback = type === "feedback" && mention;

                              if (isRequest) {
                                const reqType = requestType as
                                  | "generate"
                                  | "evaluate"
                                  | "feedback";
                                const requestText =
                                  {
                                    generate: "아이디어 생성",
                                    evaluate: "아이디어 평가",
                                    feedback: "피드백",
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
                              }
                            }

                            // Fallback for older string-based messages or other types
                            const messageContent =
                              (typeof message.payload === "string"
                                ? message.payload
                                : message.payload?.content) ||
                              "메시지 내용 없음";
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
                                chatMode === "request" &&
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
                          chatMode === "request" &&
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
                      setChatMode(e.target.value as "feedback" | "request");
                      // 채팅 모드 변경 시 요청 타입과 멘션된 에이전트 초기화
                      if (e.target.value === "feedback") {
                        setRequestType(null);
                      }
                    }}
                    className="px-3 py-1.5 bg-gray-100 border-none rounded-md text-sm font-medium text-gray-700 focus:ring-0"
                  >
                    <option value="feedback">피드백</option>
                    <option value="request">요청</option>
                  </select>

                  {chatMode === "request" && (
                    <select
                      value={requestType || ""}
                      onChange={(e) => {
                        const newRequestType = e.target.value as
                          | "generate"
                          | "evaluate"
                          | "feedback";
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
                      chatMode === "feedback"
                        ? `${
                            mentionedAgent ? mentionedAgent.name : "팀원"
                          }에게 피드백을 보내세요...`
                        : `${
                            mentionedAgent ? mentionedAgent.name : "팀원"
                          }에게 요청할 내용을 입력하세요...`
                    }
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                    className="flex-1"
                    disabled={isAutoGenerating || isGeneratingIdea}
                  />
                  <Button
                    onClick={handleSendMessage}
                    size="icon"
                    disabled={
                      isAutoGenerating ||
                      isGeneratingIdea ||
                      !mentionedAgent ||
                      (chatMode === "request" && !requestType)
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
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
          className="absolute bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-96 z-50"
          style={{ top: popoverPosition.top, left: popoverPosition.left }}
        >
          <h3 className="font-bold text-lg mb-2">
            Memory of {getAuthorName(hoveredAgentId)}
          </h3>
          {/* 단기 기억 */}
          <div className="mb-4">
            <h4 className="font-semibold text-md mb-1">Short-term Memory</h4>
            <div className="text-sm bg-gray-50 p-2 rounded">
              <p>
                <strong>Last Action:</strong>{" "}
                {agentMemory.shortTerm?.lastAction?.type || "None"}
              </p>
            </div>
          </div>
          {/* 장기 기억 */}
          <div>
            <h4 className="font-semibold text-md mb-1">Long-term Memory</h4>
            <div className="space-y-2 text-sm bg-gray-50 p-2 rounded">
              <p>
                <strong>Reflections:</strong>{" "}
                {agentMemory.longTerm?.self?.length || 0} items
              </p>
              <div>
                <strong>Relations:</strong>
                <ul className="list-disc pl-5 mt-1">
                  {agentMemory.longTerm?.relations &&
                    Object.entries(agentMemory.longTerm.relations).map(
                      ([agentId, relation]) => (
                        <li key={agentId}>
                          {getAuthorName(agentId)}:{" "}
                          {relation?.myOpinion || "No opinion"}
                        </li>
                      )
                    )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
