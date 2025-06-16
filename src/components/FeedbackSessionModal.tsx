"use client";

import { useState, useEffect, useRef } from "react";
import { AIAgent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X, Users, Clock, MessageCircle } from "lucide-react";

interface FeedbackSessionMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  type: "user" | "ai" | "system";
}

interface FeedbackSession {
  id: string;
  status: "active" | "ended";
  participants: Array<{
    id: string;
    name: string;
    isUser: boolean;
  }>;
  messages: FeedbackSessionMessage[];
  createdAt: string;
  endedAt?: string;
  targetIdea?: {
    ideaId: number;
    ideaTitle: string;
    authorName: string;
  };
}

interface FeedbackSessionData {
  mentionedAgent: {
    id: string;
    name: string;
  };
  message: string;
}

interface FeedbackSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionData: FeedbackSessionData | null;
  teamId?: string;
}

export default function FeedbackSessionModal({
  isOpen,
  onClose,
  sessionData,
  teamId,
}: FeedbackSessionModalProps) {
  const [session, setSession] = useState<FeedbackSession | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 메시지 끝으로 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages]);

  // 세션 생성
  const createFeedbackSession = async () => {
    if (!sessionData || !teamId) return;

    setIsCreatingSession(true);
    try {
      const response = await fetch(`/api/teams/${teamId}/feedback-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          targetAgentId: sessionData.mentionedAgent.id,
          initialMessage: sessionData.message,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
        console.log("✅ 피드백 세션 생성 완료:", data.session.id);
      } else {
        const errorData = await response.json();
        console.error("❌ 피드백 세션 생성 실패:", errorData.error);
      }
    } catch (error) {
      console.error("❌ 피드백 세션 생성 실패:", error);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // 실시간 세션 폴링
  useEffect(() => {
    if (!session || session.status !== "active" || !teamId) return;

    const pollSession = async () => {
      try {
        const response = await fetch(
          `/api/teams/${teamId}/feedback-sessions?sessionId=${session.id}`
        );
        if (response.ok) {
          const data = await response.json();
          if (
            data.session &&
            data.session.messages.length !== session.messages.length
          ) {
            setSession(data.session);
          }
        }
      } catch (error) {
        console.error("세션 폴링 실패:", error);
      }
    };

    pollIntervalRef.current = setInterval(pollSession, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [session, teamId]);

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!newMessage.trim() || isLoading || !session || !teamId) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/teams/${teamId}/feedback-sessions/${session.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: "나",
            content: newMessage.trim(),
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
        setNewMessage("");

        // AI 응답 트리거
        setTimeout(async () => {
          try {
            setAiGenerating(true); // AI 응답 생성 시작
            const aiResponse = await fetch(
              `/api/teams/${teamId}/feedback-sessions/${session.id}/ai-process`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  triggerAgentId: sessionData?.mentionedAgent.id,
                  action: "respond",
                }),
              }
            );

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              setSession(aiData.session);

              if (aiData.sessionEnded) {
                console.log("AI가 세션을 종료했습니다");
              }
            }
          } catch (error) {
            console.error("AI 응답 요청 실패:", error);
          } finally {
            setAiGenerating(false); // AI 응답 생성 완료
          }
        }, 1500);
      }
    } catch (error) {
      console.error("메시지 전송 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 세션 종료
  const handleEndSession = async () => {
    if (!session || !teamId || session.status !== "active") return;

    try {
      const response = await fetch(`/api/teams/${teamId}/feedback-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "end",
          sessionId: session.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
      }
    } catch (error) {
      console.error("세션 종료 실패:", error);
    }
  };

  // 세션 지속 시간 계산
  const getSessionDuration = () => {
    if (!session) return "";
    const start = new Date(session.createdAt);
    const end = session.endedAt ? new Date(session.endedAt) : new Date();
    const diffMinutes = Math.floor(
      (end.getTime() - start.getTime()) / (1000 * 60)
    );

    if (diffMinutes < 1) return "1분 미만";
    if (diffMinutes < 60) return `${diffMinutes}분`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}시간 ${minutes}분`;
  };

  // 컴포넌트 언마운트 시 폴링 정리
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen || !sessionData) return null;

  // 세션이 아직 생성되지 않은 경우
  if (!session) {
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl max-w-lg w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                💬 피드백 세션 시작
              </h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">
                  {sessionData.mentionedAgent.name}와 피드백 세션을
                  시작하시겠습니까?
                </h3>
                <p className="text-sm text-gray-600">
                  전송할 메시지: "{sessionData.message}"
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={createFeedbackSession}
                  disabled={isCreatingSession}
                  className="flex-1"
                >
                  {isCreatingSession ? "세션 생성 중..." : "피드백 세션 시작"}
                </Button>
                <Button onClick={onClose} variant="outline" className="flex-1">
                  취소
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 세션이 생성된 후 - 실제 채팅 인터페이스
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">
                {sessionData.mentionedAgent.name}와의 피드백 세션
              </h2>
            </div>
            <div
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                session.status === "active"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {session.status === "active" ? "진행중" : "종료됨"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              <span>{getSessionDuration()}</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 참가자 정보 */}
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">참가자:</span>
            {session.participants.map((participant, index) => (
              <span
                key={participant.id}
                className="text-sm font-medium text-gray-900"
              >
                {participant.name}
                {index < session.participants.length - 1 && ", "}
              </span>
            ))}
          </div>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {session.messages.map((message) => {
            const isMyMessage = message.sender === "나";

            if (message.type === "system") {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-sm">
                    {message.content}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={message.id}
                className={`flex ${
                  isMyMessage ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] ${
                    isMyMessage ? "order-2" : "order-1"
                  }`}
                >
                  {!isMyMessage && (
                    <div className="text-xs text-gray-500 mb-1 px-3">
                      {message.sender}
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      isMyMessage
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{message.content}</p>
                  </div>
                  {isMyMessage && (
                    <div className="text-xs text-gray-500 mt-1 px-3 text-right">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* AI 응답 생성 중 표시 */}
          {aiGenerating && (
            <div className="flex justify-start">
              <div className="max-w-[80%]">
                <div className="text-xs text-gray-500 mb-1 px-3">
                  {sessionData.mentionedAgent.name}
                </div>
                <div className="rounded-2xl px-4 py-3 bg-gray-100 text-gray-900">
                  <div className="flex items-center space-x-1">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-dot-pulse animation-delay-0"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-dot-pulse animation-delay-200"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-dot-pulse animation-delay-400"></div>
                    </div>
                    <span className="text-xs text-gray-500 ml-2">
                      응답 생성 중...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 메시지 입력 */}
        {session.status === "active" && (
          <div className="p-4 border-t border-gray-200">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="피드백을 입력하세요..."
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                className="flex-1"
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                size="icon"
                disabled={isLoading || !newMessage.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleEndSession}
                variant="outline"
                size="sm"
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                세션 종료
              </Button>
            </div>
          </div>
        )}

        {/* 세션 종료 상태 */}
        {session.status === "ended" && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 text-center">
            <p className="text-sm text-gray-600">
              피드백 세션이 종료되었습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
