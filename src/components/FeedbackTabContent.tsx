"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

interface FeedbackMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  type: string;
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
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 메시지 로드
  const loadMessages = async () => {
    try {
      const response = await fetch(
        `/api/teams/${teamId}/feedback-sessions?sessionId=${tab.id}`
      );

      if (response.ok) {
        const result = await response.json();
        if (result.session?.messages) {
          // 실제 대화 메시지만 필터링
          const chatMessages = result.session.messages
            .filter((msg: any) => msg.type === "message")
            .map((msg: any) => ({
              id: msg.id,
              sender: msg.sender,
              content: msg.content,
              timestamp: msg.timestamp,
              type: msg.type,
            }));

          // 메시지 수가 변경된 경우에만 상태 업데이트
          if (chatMessages.length !== lastMessageCountRef.current) {
            setMessages(chatMessages);
            lastMessageCountRef.current = chatMessages.length;

            // AI 응답이 추가되었으면 생성 상태 해제
            if (chatMessages.length > 0) {
              const lastMessage = chatMessages[chatMessages.length - 1];
              if (lastMessage.sender !== "나") {
                setIsGenerating(false);
              }
            }
          }

          // 세션 종료 확인
          if (
            result.session.status === "completed" ||
            result.session.status === "ended"
          ) {
            setSessionEnded(true);
            setIsGenerating(false);
          }
        }
      }
    } catch (error) {
      // 메시지 로드 실패 처리
    }
  };

  // 초기 메시지 설정
  useEffect(() => {
    if (tab.sessionData?.message && tab.type === "user_to_ai") {
      const initialMessage: FeedbackMessage = {
        id: "initial",
        sender: "나",
        content: tab.sessionData.message,
        timestamp: new Date().toISOString(),
        type: "message",
      };
      setMessages([initialMessage]);
      lastMessageCountRef.current = 1;
    }

    // 초기 로드
    loadMessages();
  }, [tab.id]);

  // 폴링 (3초마다)
  useEffect(() => {
    if (sessionEnded) return;

    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [sessionEnded, tab.id, teamId]);

  // 스크롤
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 메시지 전송
  const handleSendMessage = async () => {
    if (!newMessage.trim() || sessionEnded || isLoading) return;

    const userMessage: FeedbackMessage = {
      id: `temp-${Date.now()}`,
      sender: "나",
      content: newMessage.trim(),
      timestamp: new Date().toISOString(),
      type: "message",
    };

    // 즉시 UI 업데이트
    setMessages((prev) => [...prev, userMessage]);
    setNewMessage("");
    setIsLoading(true);
    setIsGenerating(true);

    try {
      const response = await fetch(`/api/teams/${teamId}/feedback-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_message",
          sessionId: tab.id,
          message: userMessage.content,
          senderId: "나",
        }),
      });

      if (response.ok) {
        console.log("메시지 전송 완료");
        // 1초 후 메시지 다시 로드
        setTimeout(loadMessages, 1000);
      } else {
        console.error("메시지 전송 실패:", response.status);
        // 실패 시 메시지 제거
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        setIsGenerating(false);
      }
    } catch (error) {
      console.error("메시지 전송 오류:", error);
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      setIsGenerating(false);
    } finally {
      setIsLoading(false);
    }
  };

  // 세션 종료
  const handleEndSession = async () => {
    try {
      await fetch(`/api/teams/${teamId}/feedback-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          sessionId: tab.id,
          endedBy: "user",
        }),
      });
    } catch (error) {
      console.error("세션 종료 실패:", error);
    }

    onClose();
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 헤더 */}
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
            disabled={sessionEnded}
          >
            피드백 종료
          </Button>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => {
          const isMyMessage = message.sender === "나";

          return (
            <div
              key={`${message.id}-${message.timestamp}`}
              className={`flex ${
                isMyMessage ? "justify-end" : "justify-start"
              }`}
            >
              <div className="max-w-md">
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

        {/* AI 생성 중 스피너 */}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
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
              sessionEnded ? "세션이 종료되었습니다." : "메시지를 입력하세요..."
            }
            disabled={isLoading || sessionEnded}
            className="flex-1 min-h-[40px] max-h-[80px] resize-none overflow-y-auto focus:ring-orange-500"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isLoading || sessionEnded}
            className="px-6 bg-orange-500 hover:bg-orange-600 text-white"
          >
            전송
          </Button>
        </div>
      </div>
    </div>
  );
}
