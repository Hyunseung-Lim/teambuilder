"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle } from "lucide-react";

interface FeedbackTabData {
  id: string;
  name: string;
  participantId: string;
  participantName: string;
  type: "user_to_ai" | "ai_to_user";
  sessionData?: any;
  isActive: boolean;
}

interface FeedbackTabContentProps {
  tab: FeedbackTabData;
  teamId: string;
  onClose: () => void;
}

export default function FeedbackTabContent({
  tab,
  teamId,
  onClose,
}: FeedbackTabContentProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [isUserEnded, setIsUserEnded] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 초기 메시지 설정
  useEffect(() => {
    // AI가 시작한 세션의 경우 첫 메시지가 이미 있을 수 있음
    if (tab.type === "ai_to_user") {
      // AI가 시작한 세션은 초기 메시지를 설정하지 않고 폴링으로 가져옴
      return;
    }

    if (tab.sessionData?.message) {
      const initialMessage = {
        id: "initial",
        sender: tab.type === "user_to_ai" ? "나" : tab.participantId,
        content: tab.sessionData.message,
        timestamp: new Date().toISOString(),
        type: "feedback",
      };
      setMessages([initialMessage]);
    }
  }, [tab]);

  // 실시간 메시지 업데이트를 위한 폴링
  useEffect(() => {
    if (!tab.id || sessionEnded || isEndingSession) return; // 종료 상태에서는 폴링하지 않음

    const pollMessages = async () => {
      // 종료 상태라면 폴링 중단
      if (sessionEnded || isEndingSession) return;

      try {
        const response = await fetch(
          `/api/teams/${teamId}/feedback-sessions?sessionId=${tab.id}`
        );
        if (response.ok) {
          const result = await response.json();
          if (result.session && result.session.messages) {
            // 시스템 메시지 제외하고 실제 대화 메시지만 표시
            const chatMessages = result.session.messages
              .filter((msg: any) => msg.type === "message")
              .map((msg: any) => ({
                id: msg.id,
                sender: msg.sender,
                content: msg.content,
                timestamp: msg.timestamp,
                type: "feedback",
              }));

            console.log(`🔄 피드백 세션 ${tab.id} 메시지 업데이트:`, {
              totalMessages: result.session.messages.length,
              chatMessages: chatMessages.length,
              currentMessages: messages.length,
            });

            // 새로운 메시지가 있을 때만 업데이트
            if (chatMessages.length !== messages.length) {
              setMessages(chatMessages);
            }

            // 세션이 종료되었다면 상태 업데이트 (사용자가 종료한 경우가 아닐 때만)
            if (
              (result.session.status === "ended" ||
                result.session.status === "completed") &&
              !isUserEnded
            ) {
              console.log(`✅ 피드백 세션 ${tab.id} AI에 의해 종료됨`);
              setSessionEnded(true);
              setEndReason("AI가 대화를 종료했습니다.");

              // 3초 후 자동으로 탭 닫기
              setTimeout(() => {
                onClose();
              }, 3000);
            }
          }
        } else {
          console.error("피드백 세션 조회 실패:", response.status);
        }
      } catch (error) {
        console.error("피드백 세션 메시지 폴링 실패:", error);
      }
    };

    // 초기 로드
    pollMessages();

    // 세션이 종료되지 않았을 때만 폴링
    if (!sessionEnded && !isEndingSession) {
      // 500ms마다 폴링 (더 빠른 업데이트)
      const interval = setInterval(pollMessages, 500);
      return () => clearInterval(interval);
    }
  }, [
    tab.id,
    teamId,
    onClose,
    messages.length,
    sessionEnded,
    isUserEnded,
    isEndingSession,
  ]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sessionEnded) return;

    const userMessage = {
      id: `msg-${Date.now()}`,
      sender: "나",
      content: newMessage.trim(),
      timestamp: new Date().toISOString(),
      type: "feedback",
    };

    setMessages((prev) => [...prev, userMessage]);
    setNewMessage("");
    setIsLoading(true);

    try {
      // 피드백 세션 API 호출
      const response = await fetch(`/api/teams/${teamId}/feedback-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "send_message",
          sessionId: tab.id,
          message: userMessage.content,
          senderId: "나",
        }),
      });

      if (response.ok) {
        // 성공적으로 전송됨
        console.log("피드백 메시지 전송 완료");
        const result = await response.json();
        console.log("AI 응답 트리거됨:", result);
      } else {
        console.error("피드백 메시지 전송 실패:", response.status);
      }
    } catch (error) {
      console.error("피드백 메시지 전송 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSession = async () => {
    // 이미 종료 요청 중이거나 세션이 종료되었다면 중복 요청 방지
    if (isEndingSession || sessionEnded) return;

    setIsEndingSession(true);
    setIsUserEnded(true);
    // 사용자가 직접 종료했을 때는 종료 알림을 표시하지 않음
    // setSessionEnded(true);
    // setEndReason("대화가 종료되었습니다.");

    // 즉시 탭 닫기
    onClose();

    // 백그라운드에서 세션 종료 API 호출
    try {
      const response = await fetch(`/api/teams/${teamId}/feedback-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "end",
          sessionId: tab.id,
          endedBy: "user", // 사용자가 종료했음을 명시
        }),
      });

      if (response.ok) {
        console.log("피드백 세션 종료 완료");
      } else {
        console.error("피드백 세션 종료 실패:", response.status);
      }
    } catch (error) {
      console.error("피드백 세션 종료 실패:", error);
    } finally {
      setIsEndingSession(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 피드백 세션 헤더 */}
      <div className="p-4 bg-orange-50 border-b border-orange-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-orange-600" />
            <div>
              <h3 className="font-semibold text-orange-800">
                {tab.participantName}와의 피드백 세션
              </h3>
              <p className="text-xs text-orange-600">
                {tab.type === "user_to_ai"
                  ? `${tab.participantName}에게 피드백을 요청했습니다.`
                  : `${tab.participantName}가 피드백을 요청했습니다.`}
              </p>
            </div>
          </div>
          <Button
            onClick={handleEndSession}
            variant="outline"
            size="sm"
            className="text-orange-600 border-orange-300 hover:bg-orange-100"
            disabled={sessionEnded || isEndingSession}
          >
            {isEndingSession ? "종료 중..." : "피드백 종료"}
          </Button>
        </div>
      </div>

      {/* 세션 종료 알림 - AI가 종료했을 때만 표시 */}
      {sessionEnded && !isUserEnded && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mx-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-red-800 font-medium">{endReason}</span>
            </div>
            <Button
              onClick={onClose}
              variant="outline"
              size="sm"
              className="text-red-600 border-red-300 hover:bg-red-100"
            >
              닫기
            </Button>
          </div>
          <div className="text-xs text-red-600 mt-2">
            3초 후 자동으로 닫힙니다.
          </div>
        </div>
      )}

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          const isMyMessage = message.sender === "나";
          const senderName = isMyMessage ? "나" : tab.participantName;

          return (
            <div
              key={message.id}
              className={`flex ${
                isMyMessage ? "justify-end" : "justify-start"
              } mb-4`}
            >
              <div
                className={`max-w-md ${isMyMessage ? "order-2" : "order-1"}`}
              >
                {!isMyMessage && (
                  <div className="text-xs text-gray-500 mb-1 px-3">
                    {senderName} •{" "}
                    {new Date(message.timestamp).toLocaleTimeString()}
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
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                <span className="text-sm text-gray-600">
                  {tab.participantName}가 응답 중...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 메시지 입력 */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder={
              sessionEnded ? "세션이 종료되었습니다." : "메시지를 입력하세요..."
            }
            disabled={isLoading || sessionEnded}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isLoading || sessionEnded}
            className="px-6 bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isLoading ? "전송 중..." : "전송"}
          </Button>
        </div>
      </div>
    </div>
  );
}
