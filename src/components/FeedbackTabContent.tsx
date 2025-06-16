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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 초기 메시지 설정
  useEffect(() => {
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

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

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
          participantId: tab.participantId,
        }),
      });

      if (response.ok) {
        // 성공적으로 전송됨
        console.log("피드백 메시지 전송 완료");
      }
    } catch (error) {
      console.error("피드백 메시지 전송 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSession = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/feedback-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "end_session",
          sessionId: tab.id,
          participantId: tab.participantId,
        }),
      });

      if (response.ok) {
        onClose();
      }
    } catch (error) {
      console.error("피드백 세션 종료 실패:", error);
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
          >
            세션 종료
          </Button>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          const isMyMessage = message.sender === "나";

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
                    {tab.participantName} •{" "}
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
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`${tab.participantName}에게 메시지를 보내세요...`}
            onKeyPress={(e) =>
              e.key === "Enter" && !isLoading && handleSendMessage()
            }
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            size="icon"
            disabled={!newMessage.trim() || isLoading}
            className="self-center"
          >
            <Send className="w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
