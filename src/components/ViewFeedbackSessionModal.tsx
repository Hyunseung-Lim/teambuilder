"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, MessageCircle, Clock, Users, Eye } from "lucide-react";

interface FeedbackSessionMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  type: "user" | "ai" | "system" | "message";
}

interface FeedbackSession {
  id: string;
  status: "active" | "ended" | "completed";
  participants: Array<{
    id: string;
    name: string;
    isUser: boolean;
  }>;
  messages: FeedbackSessionMessage[];
  createdAt: string;
  endedAt?: string;
}

interface ViewFeedbackSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

export default function ViewFeedbackSessionModal({
  isOpen,
  onClose,
  sessionId,
}: ViewFeedbackSessionModalProps) {
  const [session, setSession] = useState<FeedbackSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 메시지 끝으로 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages]);

  // 세션 데이터 로드
  useEffect(() => {
    if (!isOpen || !sessionId) return;

    const loadSession = async () => {
      setIsLoading(true);
      try {
        // teamId는 URL에서 추출
        const pathParts = window.location.pathname.split("/");
        const teamId = pathParts[pathParts.length - 1];

        const response = await fetch(
          `/api/teams/${teamId}/feedback-sessions?sessionId=${sessionId}`
        );

        if (response.ok) {
          const data = await response.json();
          setSession(data.session);
        } else {
          console.error("세션 데이터 로드 실패:", response.status);
        }
      } catch (error) {
        console.error("세션 데이터 로드 오류:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [isOpen, sessionId]);

  // 실시간 업데이트 (진행 중인 세션의 경우)
  useEffect(() => {
    if (!session || session.status !== "active" || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const pathParts = window.location.pathname.split("/");
        const teamId = pathParts[pathParts.length - 1];

        const response = await fetch(
          `/api/teams/${teamId}/feedback-sessions?sessionId=${sessionId}`
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
        console.error("세션 실시간 업데이트 실패:", error);
      }
    }, 3000); // 3초마다 업데이트

    return () => clearInterval(interval);
  }, [session, sessionId]);

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

  if (!isOpen) return null;

  if (isLoading || !session) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-lg w-full p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">세션 데이터 로딩 중...</span>
          </div>
        </div>
      </div>
    );
  }

  // AI끼리의 세션인지 확인
  const isAIOnlySession = session.participants.every((p) => !p.isUser);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-bold text-gray-900">
                피드백 세션 보기
              </h2>
            </div>
            {isAIOnlySession && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                AI 자율 피드백
              </span>
            )}
            <div
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                session.status === "active"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {session.status === "active" ? "진행중" : "완료됨"}
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
            <Users className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-600">참가자:</span>
            {session.participants.map((participant, index) => (
              <span
                key={participant.id}
                className={`text-sm font-medium ${
                  isAIOnlySession && index === 0
                    ? "text-purple-700 bg-purple-100 px-2 py-1 rounded"
                    : isAIOnlySession && index === 1
                    ? "text-blue-700 bg-blue-100 px-2 py-1 rounded"
                    : "text-gray-900"
                }`}
              >
                {isAIOnlySession && (
                  <span className="text-xs mr-1 font-mono">
                    {index === 0 ? "A" : "B"}:
                  </span>
                )}
                {participant.name}
                {index < session.participants.length - 1 &&
                  !isAIOnlySession &&
                  ", "}
              </span>
            ))}
          </div>
        </div>

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {session.messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <MessageCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">아직 메시지가 없습니다</p>
              </div>
            </div>
          ) : (
            session.messages.map((message, index) => {
              const isSystemMessage = message.type === "system";

              if (isSystemMessage) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-sm">
                      {message.content}
                    </div>
                  </div>
                );
              }

              // 발신자 이름 찾기
              const sender = session.participants.find(
                (p) => p.id === message.sender
              );
              const senderName = sender?.name || message.sender;

              // AI끼리의 세션인 경우 참가자별로 다른 스타일 적용
              let messageStyle = "bg-gray-100 text-gray-900"; // 기본 스타일
              let isRightAligned = false;

              if (isAIOnlySession && session.participants.length >= 2) {
                const participant1 = session.participants[0];
                const participant2 = session.participants[1];

                if (message.sender === participant1.id) {
                  // 첫 번째 참가자: 회색 + 왼쪽 (에이전트 스타일)
                  messageStyle = "bg-gray-100 text-gray-900";
                  isRightAligned = false;
                } else if (message.sender === participant2.id) {
                  // 두 번째 참가자: 파란색 + 오른쪽 (인간 스타일)
                  messageStyle = "bg-blue-500 text-white";
                  isRightAligned = true;
                } else {
                  // 알 수 없는 발신자
                  messageStyle = "bg-orange-100 text-orange-900";
                  isRightAligned = false;
                }
              } else {
                // 인간-에이전트 세션인 경우
                if (message.sender === "나") {
                  // 인간의 메시지: 파란색 + 오른쪽
                  messageStyle = "bg-blue-500 text-white";
                  isRightAligned = true;
                } else {
                  // 에이전트의 메시지: 회색 + 왼쪽
                  messageStyle = "bg-gray-100 text-gray-900";
                  isRightAligned = false;
                }
              }

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isRightAligned ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] ${
                      isRightAligned ? "ml-auto" : "mr-auto"
                    }`}
                  >
                    {/* 발신자 이름 표시 */}
                    <div
                      className={`text-xs mb-1 px-3 ${
                        isRightAligned
                          ? "text-right text-blue-600 font-medium"
                          : "text-left text-gray-600 font-medium"
                      }`}
                    >
                      {senderName}
                    </div>
                    <div className={`rounded-2xl px-4 py-3 ${messageStyle}`}>
                      <p className="text-sm leading-relaxed">
                        {message.content}
                      </p>
                    </div>
                    <div
                      className={`text-xs text-gray-500 mt-1 px-3 ${
                        isRightAligned ? "text-right" : "text-left"
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 하단 */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 text-center">
          <p className="text-sm text-gray-600">
            {session.status === "active"
              ? "진행 중인 피드백 세션을 구경하고 있습니다"
              : "완료된 피드백 세션입니다"}
          </p>
          <Button onClick={onClose} variant="outline" className="mt-2">
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
