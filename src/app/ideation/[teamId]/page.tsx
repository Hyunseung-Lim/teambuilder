"use client";

import { useState, useEffect } from "react";
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
import { Team, AIAgent, Idea, ChatMessage } from "@/lib/types";
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
  const [showTopicModal, setShowTopicModal] = useState(true);
  const [topic, setTopic] = useState("");
  const [topicFormData, setTopicFormData] = useState("");
  const [generationProgress, setGenerationProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [generatingAgents, setGeneratingAgents] = useState<Set<string>>(
    new Set()
  );
  const [behaviorPairs, setBehaviorPairs] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [structurePairs, setStructurePairs] = useState<
    Array<{ key: string; value: string }>
  >([]);

  // New state for chat functionality
  const [chatMode, setChatMode] = useState<"feedback" | "request">("feedback");
  const [mentionedAgent, setMentionedAgent] = useState<AIAgent | null>(null);
  const [requestType, setRequestType] = useState<
    "generate" | "evaluate" | "feedback" | null
  >(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);

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

  // JSON 문자열을 키-값 쌍 배열로 변환
  const parseJsonToPairs = (
    jsonString: string
  ): Array<{ key: string; value: string }> => {
    try {
      const parsed = JSON.parse(jsonString);
      if (typeof parsed === "object" && parsed !== null) {
        return Object.entries(parsed).map(([key, value]) => ({
          key,
          value: String(value),
        }));
      }
    } catch (error) {
      // JSON 파싱 실패 시 원본 텍스트를 단일 쌍으로 처리
    }
    return [{ key: "", value: jsonString }];
  };

  // 키-값 쌍 배열을 JSON 문자열로 변환
  const pairsToJsonString = (
    pairs: Array<{ key: string; value: string }>
  ): string => {
    const validPairs = pairs.filter(
      (pair) => pair.key.trim() && pair.value.trim()
    );
    if (validPairs.length === 0) return "";

    const obj = validPairs.reduce((acc, pair) => {
      acc[pair.key] = pair.value;
      return acc;
    }, {} as Record<string, string>);

    return JSON.stringify(obj);
  };

  // 필터링된 아이디어 목록 (최신순 정렬)
  const filteredIdeas = ideas
    .filter((idea) => {
      if (authorFilter === "전체") return true;
      const authorName = getAuthorName(idea.author);
      return authorName === authorFilter;
    })
    .sort((a, b) => b.id - a.id);

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

        // 아이디어가 있으면 주제 설정 모달 숨기기
        if (ideas.length > 0) {
          setShowTopicModal(false);
          // 기존 아이디어에서 주제 추정 (첫 번째 아이디어의 object를 주제로 사용하거나 기본값)
          if (!topic) {
            setTopic("기존 아이디에이션 세션");
          }
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

  // 아이디어 로드
  const loadIdeas = async (teamId: string) => {
    try {
      const response = await fetch(`/api/teams/${teamId}/ideas`);
      if (response.ok) {
        const data = await response.json();
        setIdeas(data.ideas || []);
        return (data.ideas || []).length;
      }
      return 0;
    } catch (error) {
      console.error("아이디어 로드 실패:", error);
      return 0;
    }
  };

  // 채팅 메시지 로드
  const loadMessages = async (teamId: string) => {
    try {
      const response = await fetch(`/api/teams/${teamId}/chat`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("채팅 메시지 로드 실패:", error);
    }
  };

  // 아이디어가 로드되면 주제 모달 상태 체크
  useEffect(() => {
    if (ideas.length > 0 && showTopicModal) {
      setShowTopicModal(false);
      if (!topic) {
        setTopic("기존 아이디에이션 세션");
      }
    }
  }, [ideas.length, showTopicModal, topic]);

  // 주제 제출 핸들러
  const handleTopicSubmit = async () => {
    if (!topicFormData.trim() || !team) return;

    setTopic(topicFormData.trim());
    setShowTopicModal(false);

    // 주제가 설정된 후 AI 에이전트 자동 아이디어 생성 트리거
    await triggerAutoIdeaGeneration(team.id, topicFormData.trim());
  };

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
      const maxPolls = 30; // 최대 30번 폴링 (30초)

      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          console.log(`폴링 ${pollCount}/${maxPolls}`);

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
          const messagesResponse = await fetch(`/api/teams/${teamId}/chat`);
          if (messagesResponse.ok) {
            const data = await messagesResponse.json();
            const messages = data.messages || [];

            // "새로운 아이디어를 생성했습니다" 메시지 개수 확인
            const completedMessages = messages.filter(
              (msg: any) =>
                msg.type === "system" &&
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
            }
          }
        } catch (error) {
          console.error("폴링 오류:", error);
        }
      }, 2000); // 2초마다 체크
    } catch (error) {
      console.error("AI 에이전트 자동 아이디어 생성 실패:", error);
      setIsAutoGenerating(false);
      setGeneratingAgents(new Set());
      setGenerationProgress({ completed: 0, total: 0 });
    }
  };

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !team || !mentionedAgent) return;

    const messageType = chatMode;
    const requestTextMap = {
      generate: "아이디어 생성",
      evaluate: "아이디어 평가",
      feedback: "피드백",
    };

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

    // 3. 입력 필드 초기화
    setNewMessage("");
    setMentionedAgent(null);
    setChatMode("feedback");
    setRequestType(null);

    // 4. 백그라운드에서 서버로 실제 데이터 전송
    try {
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

      // 성공 시, 서버로부터 최신 메시지 목록을 다시 불러와 동기화
      await loadMessages(team.id);
    } catch (error) {
      console.error("메시지 전송 실패:", error);
      // 실패 시, 낙관적으로 추가했던 임시 메시지 제거
      setMessages((prevMessages) =>
        prevMessages.filter((m) => m.id !== tempMessage.id)
      );
      // 사용자에게 에러 알림 (추가 가능)
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
        await loadIdeas(team.id);
        await loadMessages(team.id);
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
        await loadIdeas(team.id);
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
          <div className="text-sm text-gray-600">
            {team.members.length}명의 팀원
          </div>
        </div>
      </header>

      {/* 주제가 설정되지 않으면 메인 컨텐츠 숨기기 */}
      {!showTopicModal && (
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
                .filter(
                  (message) =>
                    message.type !== "system" ||
                    !message.payload.content?.includes("생성중입니다")
                )
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
                    // 시스템 메시지 (아이디어 생성 알림)
                    const isGeneratingMessage =
                      message.payload.content?.includes("생성중입니다");

                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="bg-blue-50 text-blue-600 px-7 py-2 rounded-full text-sm font-medium flex items-center gap-3">
                          <span>
                            {senderName}가{" "}
                            {message.payload.content || "작업을 완료했습니다"}
                          </span>
                          {!isGeneratingMessage && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-white hover:bg-gray-50 border-blue-300 text-blue-700 text-xs h-auto"
                              onClick={() => {
                                // 해당 작성자의 아이디어 찾기
                                const authorIdea = ideas.find(
                                  (idea) => idea.author === message.sender
                                );
                                if (authorIdea) {
                                  setIdeaDetailModalData(authorIdea);
                                  setCurrentIdeaIndex(
                                    ideas.indexOf(authorIdea)
                                  );
                                  setShowIdeaDetailModal(true);
                                }
                              }}
                            >
                              생성된 아이디어 보기
                            </Button>
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
                        className={`max-w-xs ${
                          isMyMessage ? "order-2" : "order-1"
                        }`}
                      >
                        {!isMyMessage && (
                          <div className="text-xs text-gray-500 mb-1 px-3">
                            {senderName} • {formatTimestamp(message.timestamp)}
                          </div>
                        )}

                        <div
                          className={`rounded-2xl px-4 py-3 ${
                            isMyMessage
                              ? "bg-blue-500 text-white"
                              : "bg-gray-100 text-gray-900"
                          }`}
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
                                const requestInfo = {
                                  generate: {
                                    text: "아이디어 생성 요청",
                                    icon: <Lightbulb className="w-4 h-4" />,
                                    bgColor: isMyMessage
                                      ? "bg-blue-300/40"
                                      : "bg-purple-50",
                                    textColor: isMyMessage
                                      ? "text-blue-50"
                                      : "text-purple-700",
                                    iconColor: isMyMessage
                                      ? "text-blue-100"
                                      : "text-purple-600",
                                  },
                                  evaluate: {
                                    text: "아이디어 평가 요청",
                                    icon: (
                                      <ClipboardCheck className="w-4 h-4" />
                                    ),
                                    bgColor: isMyMessage
                                      ? "bg-blue-300/40"
                                      : "bg-orange-50",
                                    textColor: isMyMessage
                                      ? "text-blue-50"
                                      : "text-orange-700",
                                    iconColor: isMyMessage
                                      ? "text-blue-100"
                                      : "text-orange-600",
                                  },
                                  feedback: {
                                    text: "피드백 요청",
                                    icon: (
                                      <MessageSquareText className="w-4 h-4" />
                                    ),
                                    bgColor: isMyMessage
                                      ? "bg-blue-300/40"
                                      : "bg-blue-50",
                                    textColor: isMyMessage
                                      ? "text-blue-50"
                                      : "text-blue-700",
                                    iconColor: isMyMessage
                                      ? "text-blue-100"
                                      : "text-blue-600",
                                  },
                                }[reqType];

                                return (
                                  <div>
                                    <div
                                      className={`flex items-center gap-2 text-sm font-medium mb-2 p-2 rounded-lg ${requestInfo.bgColor}`}
                                    >
                                      <span className={requestInfo.iconColor}>
                                        {requestInfo.icon}
                                      </span>
                                      <span className={requestInfo.textColor}>
                                        {requestInfo.text}
                                      </span>
                                    </div>
                                    <div
                                      className={`text-sm mb-2 ${
                                        isMyMessage
                                          ? "text-blue-100"
                                          : "text-gray-600"
                                      }`}
                                    >
                                      <span className="font-medium">
                                        @{getAuthorName(mention)}
                                      </span>
                                      <span>에게</span>
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
                                          : "text-gray-600"
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
                        {teamAgents.map((agent) => (
                          <button
                            key={agent.id}
                            onClick={() => {
                              setMentionedAgent(agent);
                              setShowMentionDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {agent.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="text-sm text-gray-500">에게</span>

                  <select
                    value={chatMode}
                    onChange={(e) =>
                      setChatMode(e.target.value as "feedback" | "request")
                    }
                    className="px-3 py-1.5 bg-gray-100 border-none rounded-md text-sm font-medium text-gray-700 focus:ring-0"
                  >
                    <option value="feedback">피드백</option>
                    <option value="request">요청</option>
                  </select>

                  {chatMode === "request" && (
                    <select
                      value={requestType || ""}
                      onChange={(e) =>
                        setRequestType(
                          e.target.value as "generate" | "evaluate" | "feedback"
                        )
                      }
                      className="px-3 py-1.5 bg-gray-100 border-none rounded-md text-sm font-medium text-gray-700 focus:ring-0"
                    >
                      <option value="" disabled>
                        요청 선택
                      </option>
                      <option value="generate">아이디어 생성</option>
                      <option value="evaluate">아이디어 평가</option>
                      <option value="feedback">피드백</option>
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

              {/* 아이디어 생성 버튼 - 해당 롤을 가진 사용자만 표시 */}
              {userCanGenerateIdeas && (
                <div className="mt-3">
                  <Button
                    onClick={handleGenerateIdea}
                    disabled={isGeneratingIdea || isAutoGenerating}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white disabled:opacity-50"
                  >
                    {isGeneratingIdea ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        생성 중...
                      </>
                    ) : (
                      <>
                        <Lightbulb className="h-4 w-4 mr-2" />
                        아이디어 생성하기
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 아이디어 목록 */}
          <div className="w-96 bg-gray-50 border-l border-gray-200 flex flex-col">
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
              {filteredIdeas.map((idea, index) => {
                // 원본 배열에서의 실제 인덱스 찾기
                const originalIndex = ideas.findIndex(
                  (originalIdea) => originalIdea.id === idea.id
                );
                const authorName = getAuthorName(idea.author);

                return (
                  <div
                    key={idea.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setIdeaDetailModalData(idea);
                      setCurrentIdeaIndex(originalIndex);
                      setShowIdeaDetailModal(true);
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">
                        Idea {originalIndex + 1}
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
                      <p className="text-xs text-gray-400 mt-1">
                        잠시만 기다려주세요
                      </p>
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
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowIdeaDetailModal(false);
            setIsEditMode(false);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const newIndex =
                        currentIdeaIndex > 0
                          ? currentIdeaIndex - 1
                          : ideas.length - 1;
                      setCurrentIdeaIndex(newIndex);
                      setIdeaDetailModalData(ideas[newIndex]);
                    }}
                    className="px-2 py-1 w-10 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={ideas.length <= 1 || isEditMode}
                  >
                    <span className="text-gray-400 w-6 h-6">
                      <ArrowLeft />
                    </span>
                  </button>
                  <h2 className="text-xl font-bold text-gray-900">
                    Idea {currentIdeaIndex + 1}
                  </h2>
                  <button
                    onClick={() => {
                      const newIndex =
                        currentIdeaIndex < ideas.length - 1
                          ? currentIdeaIndex + 1
                          : 0;
                      setCurrentIdeaIndex(newIndex);
                      setIdeaDetailModalData(ideas[newIndex]);
                    }}
                    className="px-2 py-1 w-10 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={ideas.length <= 1 || isEditMode}
                  >
                    <span className="text-gray-400 w-6 h-6">
                      <ArrowRight />
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      아이디어 제작자
                    </span>
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                        ideaDetailModalData.author === "나"
                          ? "bg-green-500 text-white"
                          : "bg-blue-500 text-white"
                      }`}
                    >
                      {getAuthorName(ideaDetailModalData.author) === "나"
                        ? "나"
                        : getAuthorName(ideaDetailModalData.author)[0]}
                    </div>
                    <span className="font-medium text-gray-900">
                      {getAuthorName(ideaDetailModalData.author)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setShowIdeaDetailModal(false);
                      setIsEditMode(false);
                    }}
                    className="p-2 w-10 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
                  >
                    <span className="text-xl">×</span>
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {/* Object */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Object:
                  </h3>
                  {isEditMode ? (
                    <textarea
                      value={editFormData.object}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          object: e.target.value,
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg text-gray-900 bg-gray-50 resize-none"
                      rows={2}
                      placeholder="Object를 입력하세요..."
                    />
                  ) : (
                    <h4 className="text-lg font-bold text-gray-900">
                      {ideaDetailModalData.content.object}
                    </h4>
                  )}
                </div>

                {/* Function */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Function:
                  </h3>
                  {isEditMode ? (
                    <textarea
                      value={editFormData.function}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          function: e.target.value,
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg text-gray-700 bg-gray-50 resize-none"
                      rows={4}
                      placeholder="Function을 입력하세요..."
                    />
                  ) : (
                    <p className="text-gray-700 leading-relaxed">
                      {ideaDetailModalData.content.function}
                    </p>
                  )}
                </div>

                {/* Behavior */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Behavior:
                  </h3>
                  {isEditMode ? (
                    <div className="space-y-3">
                      {behaviorPairs.map((pair, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={pair.key}
                            onChange={(e) => {
                              const newPairs = [...behaviorPairs];
                              newPairs[index].key = e.target.value;
                              setBehaviorPairs(newPairs);
                            }}
                            placeholder="키"
                            className="w-1/3 p-2 border border-gray-300 rounded text-sm text-gray-900"
                          />
                          <span className="text-gray-500">:</span>
                          <input
                            type="text"
                            value={pair.value}
                            onChange={(e) => {
                              const newPairs = [...behaviorPairs];
                              newPairs[index].value = e.target.value;
                              setBehaviorPairs(newPairs);
                            }}
                            placeholder="값"
                            className="flex-1 p-2 border border-gray-300 rounded text-sm text-gray-900"
                          />
                          <button
                            onClick={() => {
                              const newPairs = behaviorPairs.filter(
                                (_, i) => i !== index
                              );
                              setBehaviorPairs(newPairs);
                            }}
                            className="text-red-500 hover:text-red-700 px-2 py-1 text-sm"
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setBehaviorPairs([
                            ...behaviorPairs,
                            { key: "", value: "" },
                          ]);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        + 항목 추가
                      </button>
                    </div>
                  ) : (
                    <div className="text-gray-700 leading-relaxed">
                      {(() => {
                        try {
                          const behaviorObj = JSON.parse(
                            ideaDetailModalData.content.behavior
                          );
                          return (
                            <div className="space-y-2">
                              {Object.entries(behaviorObj).map(
                                ([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium text-gray-600">
                                      {key}:
                                    </span>
                                    <span className="ml-2">
                                      {value as string}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          );
                        } catch {
                          return <p>{ideaDetailModalData.content.behavior}</p>;
                        }
                      })()}
                    </div>
                  )}
                </div>

                {/* Structure */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Structure:
                  </h3>
                  {isEditMode ? (
                    <div className="space-y-3">
                      {structurePairs.map((pair, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={pair.key}
                            onChange={(e) => {
                              const newPairs = [...structurePairs];
                              newPairs[index].key = e.target.value;
                              setStructurePairs(newPairs);
                            }}
                            placeholder="키"
                            className="w-1/3 p-2 border border-gray-300 rounded text-sm text-gray-900"
                          />
                          <span className="text-gray-500">:</span>
                          <input
                            type="text"
                            value={pair.value}
                            onChange={(e) => {
                              const newPairs = [...structurePairs];
                              newPairs[index].value = e.target.value;
                              setStructurePairs(newPairs);
                            }}
                            placeholder="값"
                            className="flex-1 p-2 border border-gray-300 rounded text-sm text-gray-900"
                          />
                          <button
                            onClick={() => {
                              const newPairs = structurePairs.filter(
                                (_, i) => i !== index
                              );
                              setStructurePairs(newPairs);
                            }}
                            className="text-red-500 hover:text-red-700 px-2 py-1 text-sm"
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setStructurePairs([
                            ...structurePairs,
                            { key: "", value: "" },
                          ]);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        + 항목 추가
                      </button>
                    </div>
                  ) : (
                    <div className="text-gray-700 leading-relaxed">
                      {(() => {
                        try {
                          const structureObj = JSON.parse(
                            ideaDetailModalData.content.structure
                          );
                          return (
                            <div className="space-y-2">
                              {Object.entries(structureObj).map(
                                ([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium text-gray-600">
                                      {key}:
                                    </span>
                                    <span className="ml-2">
                                      {value as string}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          );
                        } catch {
                          return <p>{ideaDetailModalData.content.structure}</p>;
                        }
                      })()}
                    </div>
                  )}
                </div>

                {/* Evaluation */}
                {ideaDetailModalData.evaluations.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-3">
                      Evaluation
                    </h3>
                    {ideaDetailModalData.evaluations.map(
                      (evaluation, index) => (
                        <div
                          key={index}
                          className="bg-gray-50 rounded-lg p-4 mb-3"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-gray-600">from</span>
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                  evaluation.evaluator === "나"
                                    ? "bg-green-500 text-white"
                                    : "bg-blue-500 text-white"
                                }`}
                              >
                                {evaluation.evaluator === "나"
                                  ? "나"
                                  : evaluation.evaluator[0]}
                              </div>
                              <span className="text-sm font-medium text-gray-900">
                                {evaluation.evaluator}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 mb-3">
                            <div className="text-center">
                              <div className="text-xs text-gray-500 mb-1">
                                Relevance
                              </div>
                              <div className="text-lg font-bold text-gray-900">
                                {evaluation.scores.relevance}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500 mb-1">
                                Innovation
                              </div>
                              <div className="text-lg font-bold text-gray-900">
                                {evaluation.scores.innovation}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500 mb-1">
                                Insightful
                              </div>
                              <div className="text-lg font-bold text-gray-900">
                                {evaluation.scores.insightful}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">
                              comments
                            </div>
                            <p className="text-sm text-gray-700">
                              {evaluation.comment}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* 액션 버튼 */}
                <div className="flex gap-3 pt-4">
                  {isEditMode ? (
                    <>
                      <button
                        onClick={() => {
                          setIsEditMode(false);
                          // 새로운 아이디어 생성
                          const newIdea: Idea = {
                            id: ideas.length + 1,
                            author: "나",
                            timestamp: new Date().toISOString(),
                            content: {
                              object: editFormData.object,
                              function: editFormData.function,
                              behavior: pairsToJsonString(behaviorPairs),
                              structure: pairsToJsonString(structurePairs),
                            },
                            evaluations: [],
                          };

                          // 새로운 아이디어를 목록에 추가
                          const updatedIdeas = [...ideas, newIdea];
                          setIdeas(updatedIdeas);

                          // 새로 생성된 아이디어로 모달 전환
                          setIdeaDetailModalData(newIdea);
                          setCurrentIdeaIndex(updatedIdeas.length - 1);

                          console.log("새로운 아이디어 생성됨:", newIdea);
                        }}
                        className="flex-1 bg-black text-white py-3 px-4 rounded-lg font-medium"
                      >
                        저장하기
                      </button>
                      <button
                        onClick={() => {
                          setIsEditMode(false);
                          // 편집 취소 시 원래 데이터로 복원
                          setEditFormData({
                            object: ideaDetailModalData.content.object,
                            function: ideaDetailModalData.content.function,
                            behavior: ideaDetailModalData.content.behavior,
                            structure: ideaDetailModalData.content.structure,
                          });
                          setBehaviorPairs(
                            parseJsonToPairs(
                              ideaDetailModalData.content.behavior
                            )
                          );
                          setStructurePairs(
                            parseJsonToPairs(
                              ideaDetailModalData.content.structure
                            )
                          );
                        }}
                        className="flex-1 bg-gray-500 text-white py-3 px-4 rounded-lg font-medium"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setIsEditMode(true);
                          // 편집 모드 진입 시 현재 데이터로 폼 초기화
                          setEditFormData({
                            object: ideaDetailModalData.content.object,
                            function: ideaDetailModalData.content.function,
                            behavior: ideaDetailModalData.content.behavior,
                            structure: ideaDetailModalData.content.structure,
                          });
                          // behavior와 structure를 키-값 쌍으로 파싱
                          setBehaviorPairs(
                            parseJsonToPairs(
                              ideaDetailModalData.content.behavior
                            )
                          );
                          setStructurePairs(
                            parseJsonToPairs(
                              ideaDetailModalData.content.structure
                            )
                          );
                        }}
                        className="flex-1 bg-black text-white py-3 px-4 rounded-lg font-medium"
                      >
                        아이디어 업데이트
                      </button>
                      <button className="flex-1 bg-black text-white py-3 px-4 rounded-lg font-medium">
                        아이디어 평가하기
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
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

      {/* 주제 입력 모달 */}
      {showTopicModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-6">
              {/* 헤더 */}
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  아이디에이션 주제 설정
                </h2>
                <p className="text-sm text-gray-600">
                  AI 에이전트들과 함께 토론할 주제를 입력해주세요
                </p>
              </div>

              <div className="space-y-4">
                {/* 주제 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    주제 *
                  </label>
                  <input
                    type="text"
                    value={topicFormData}
                    onChange={(e) => setTopicFormData(e.target.value)}
                    className="w-full p-3 text-gray-500 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="예: Carbon Emission Reduction, 미래의 교육 시스템, ..."
                    onKeyPress={(e) => e.key === "Enter" && handleTopicSubmit()}
                    autoFocus
                  />
                </div>

                {/* 액션 버튼 */}
                <div className="pt-4">
                  <button
                    onClick={handleTopicSubmit}
                    disabled={!topicFormData.trim()}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                  >
                    아이디에이션 시작하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
