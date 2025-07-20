"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AIAgent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const [sessionEnded, setSessionEnded] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea with max 4 lines
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to calculate scrollHeight correctly
      textarea.style.height = 'auto';
      
      // Calculate the height needed for the content
      const scrollHeight = textarea.scrollHeight;
      const lineHeight = 20; // Approximate line height in pixels
      const maxLines = 4;
      const minHeight = lineHeight * 1.2; // Minimum height for 1 line
      const maxHeight = lineHeight * maxLines;
      
      // Set height based on content, but constrained by min/max
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Adjust height whenever newMessage changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [newMessage, adjustTextareaHeight]);

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
          initiatorId: "나",
          targetAgentId: sessionData.mentionedAgent.id,
          message: sessionData.message,
          feedbackContext: {
            type: "general_feedback",
            initiatedBy: "user",
            description: "사용자가 시작한 피드백 세션",
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
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
          if (data.session) {
            // 메시지 수 변경이나 상태 변경 시 업데이트
            if (
              data.session.messages.length !== session.messages.length ||
              data.session.status !== session.status
            ) {
              console.log("🔍 [피드백세션] 폴링 업데이트:", {
                oldStatus: session.status,
                newStatus: data.session.status,
                oldMessageCount: session.messages.length,
                newMessageCount: data.session.messages.length,
                sessionId: data.session.id
              });
              
              setSession(data.session);

              // 세션이 종료되었는지 확인
              if (
                data.session.status === "completed" ||
                data.session.status === "ended"
              ) {
                console.log("🏁 [피드백세션] 폴링에서 세션 종료 감지 - 모달 닫기 프로세스 시작");
                setAiGenerating(false);
                setSessionEnded(true);
                setCountdown(5); // 5초 카운트다운 시작

                // 카운트다운 시작
                countdownIntervalRef.current = setInterval(() => {
                  setCountdown((prev) => {
                    if (prev <= 1) {
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                      }
                      onClose(); // 5초 후 모달 닫기
                      return 0;
                    }
                    return prev - 1;
                  });
                }, 1000);
              }
            }
          }
        }
      } catch (error) {
        console.error("세션 폴링 실패:", error);
      }
    };

    // 500ms마다 폴링 (더 빠른 업데이트)
    pollIntervalRef.current = setInterval(pollSession, 500);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [session, teamId]);

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!newMessage.trim() || isLoading || !session || !teamId || sessionEnded)
      return;

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
          let aiData;
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
              aiData = await aiResponse.json();
              setSession(aiData.session);

              console.log("🔍 [피드백세션] AI 응답 결과:", {
                sessionEnded: aiData.sessionEnded,
                sessionStatus: aiData.session?.status,
                sessionId: aiData.session?.id,
                messageCount: aiData.session?.messages?.length
              });

              if (aiData.sessionEnded) {
                console.log("🏁 [피드백세션] AI가 세션 종료 - 모달 닫기 프로세스 시작");
                setAiGenerating(false);
                setSessionEnded(true);
                setCountdown(5); // 5초 카운트다운 시작

                // 카운트다운 시작
                countdownIntervalRef.current = setInterval(() => {
                  setCountdown((prev) => {
                    if (prev <= 1) {
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                      }
                      onClose(); // 5초 후 모달 닫기
                      return 0;
                    }
                    return prev - 1;
                  });
                }, 1000);
              }
            }
          } catch (error) {
            console.error("AI 응답 요청 실패:", error);
          } finally {
            if (!aiData?.sessionEnded) {
              setAiGenerating(false); // AI 응답 생성 완료
            }
          }
        }, 1000); // 1초 후 응답 (더 빠른 응답)
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
          endedBy: "user",
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

  // 컴포넌트 언마운트 시 모든 인터벌 정리
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
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
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                sessionEnded
                  ? "세션이 종료되었습니다."
                  : `${sessionData.mentionedAgent.name}에게 메시지를 보내세요...`
              }
              disabled={isLoading || sessionEnded}
              className="flex-1 min-h-[40px] max-h-[80px] resize-none overflow-y-auto focus:ring-blue-500"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isLoading || sessionEnded}
              className="px-6 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
            >
              {isLoading ? "전송 중..." : "전송"}
            </Button>
          </div>
        </div>

        {/* 세션 종료 상태 */}
        {session.status === "ended" && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 text-center">
            <p className="text-sm text-gray-600">
              피드백 세션이 종료되었습니다.
            </p>
          </div>
        )}

        {/* 세션 종료 알림 */}
        {sessionEnded && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  대화가 종료되었습니다
                </h3>
                <p className="text-gray-600 mb-4">
                  {sessionData.mentionedAgent.name}가 피드백 세션을
                  종료했습니다.
                </p>
                <div className="mb-4">
                  <p className="text-sm text-gray-500">
                    {countdown}초 후 자동으로 닫힙니다
                  </p>
                </div>
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => {
                      // 카운트다운 중지
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                      }
                      onClose();
                    }}
                    variant="outline"
                    className="px-4 py-2"
                  >
                    닫기
                  </Button>
                  <Button
                    onClick={async () => {
                      // 카운트다운 중지
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                      }
                      
                      // 새로운 피드백 세션 시작
                      try {
                        setSessionEnded(false);
                        setIsLoading(true);
                        
                        const response = await fetch(`/api/teams/${teamId}/feedback-sessions`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "create",
                            targetAgentId: sessionData.mentionedAgent.id,
                          }),
                        });

                        if (response.ok) {
                          const newSessionData = await response.json();
                          setSession(newSessionData.session);
                          setNewMessage("");
                          console.log("새로운 피드백 세션 시작:", newSessionData.session.id);
                        } else {
                          const error = await response.json();
                          console.error("새 세션 생성 실패:", error);
                          alert(error.error || "새 피드백 세션 시작에 실패했습니다.");
                        }
                      } catch (error) {
                        console.error("새 세션 생성 중 오류:", error);
                        alert("새 피드백 세션 시작 중 오류가 발생했습니다.");
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2"
                    disabled={isLoading}
                  >
                    {isLoading ? "시작 중..." : "새 대화 시작"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
