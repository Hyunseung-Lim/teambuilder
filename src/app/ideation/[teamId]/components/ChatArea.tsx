import { useRef, useEffect, useCallback } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Team, AIAgent, ChatMessage, Idea } from "@/lib/types";
import FeedbackTabContent from "@/components/FeedbackTabContent";
import {
  isSystemMessagePayload,
  isChatMessagePayload,
  isFeedbackSessionSummaryPayload,
} from "../utils/typeGuards";
import { formatTimestamp, getKoreanParticle } from "../utils/koreanUtils";
import { canCreateFeedbackSession, canMakeRequest } from "@/lib/relationship-utils";

interface FeedbackTab {
  id: string;
  name: string;
  participantId: string;
  participantName: string;
  type: "user_to_ai" | "ai_to_user";
  sessionData?: any;
  isActive: boolean;
}

interface ChatAreaProps {
  activeTab: string;
  feedbackTabs: FeedbackTab[];
  onSwitchTab: (tabId: string) => void;
  onCloseFeedbackTab: (tabId: string) => void;
  messages: ChatMessage[];
  team: Team;
  agents: AIAgent[];
  ideas: Idea[];
  getAuthorName: (authorId: string) => string;
  teamAgents: AIAgent[];
  newMessage: string;
  onNewMessageChange: (message: string) => void;
  mentionedAgent: AIAgent | null;
  showMentionDropdown: boolean;
  onShowMentionDropdown: (show: boolean) => void;
  onMentionedAgentChange: (agent: AIAgent | null) => void;
  chatMode: "give_feedback" | "make_request";
  onChatModeChange: (mode: "give_feedback" | "make_request") => void;
  requestType: "generate" | "evaluate" | "give_feedback" | null;
  onRequestTypeChange: (
    type: "generate" | "evaluate" | "give_feedback" | null
  ) => void;
  getAvailableRequestTypes: () => Array<{ value: string; label: string }>;
  isAgentInFeedbackSession: (agentId: string) => boolean;
  canAgentPerformRole: (agent: AIAgent, requestType: string) => boolean;
  onSendMessage: () => void;
  isAutoGenerating: boolean;
  isGeneratingIdea: boolean;
  isCreatingFeedbackSession: boolean;
  scrollToBottom: () => void;
  isChatDisabled: () => boolean;
  getChatDisabledMessage: () => string;
  onIdeaClick: (idea: Idea, index: number) => void;
}

export default function ChatArea({
  activeTab,
  feedbackTabs,
  onSwitchTab,
  onCloseFeedbackTab,
  messages,
  team,
  agents,
  ideas,
  getAuthorName,
  teamAgents,
  newMessage,
  onNewMessageChange,
  mentionedAgent,
  showMentionDropdown,
  onShowMentionDropdown,
  onMentionedAgentChange,
  chatMode,
  onChatModeChange,
  requestType,
  onRequestTypeChange,
  getAvailableRequestTypes,
  isAgentInFeedbackSession,
  canAgentPerformRole,
  onSendMessage,
  isAutoGenerating,
  isGeneratingIdea,
  isCreatingFeedbackSession,
  scrollToBottom,
  isChatDisabled,
  getChatDisabledMessage,
  onIdeaClick,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea with responsive max lines
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to calculate scrollHeight correctly
      textarea.style.height = 'auto';
      
      // Calculate the height needed for the content
      const scrollHeight = textarea.scrollHeight;
      const lineHeight = 20; // Approximate line height in pixels
      
      // Responsive max lines based on screen size
      const screenWidth = window.innerWidth;
      let maxLines = 4; // Default for mobile
      if (screenWidth >= 1024) maxLines = 6; // lg screens
      else if (screenWidth >= 768) maxLines = 5; // md screens  
      else if (screenWidth >= 640) maxLines = 4.5; // sm screens
      
      const minHeight = lineHeight * 2.4; // Minimum height for responsive sizing
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

  // Adjust height when screen size changes
  useEffect(() => {
    const handleResize = () => {
      adjustTextareaHeight();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [adjustTextareaHeight]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* 채팅 헤더 */}
      <div className="border-b border-gray-200">
        {/* 탭 목록 */}
        <div className="flex items-center bg-gray-50">
          {/* 메인 채팅 탭 */}
          <button
            onClick={() => onSwitchTab("main")}
            className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 ${
              activeTab === "main"
                ? "text-blue-600 border-blue-600 bg-white"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            <MessageCircle className="h-4 w-4" />팀 대화
          </button>

          {/* 피드백 탭들 */}
          {feedbackTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSwitchTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 ${
                activeTab === tab.id
                  ? "text-orange-600 border-orange-600 bg-white"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "main" ? (
          <div className="p-4 space-y-4">
            {messages
              // 먼저 중복 메시지 제거
              .filter((message, index, array) => {
                // 같은 id와 timestamp를 가진 메시지 중복 제거
                return array.findIndex(m => 
                  m.id === message.id && 
                  m.timestamp === message.timestamp &&
                  m.type === message.type
                ) === index;
              })
              .filter((message) => {
                // 타입 가드를 사용하여 안전하게 접근
                if (typeof message.payload === "string") {
                  return true; // 문자열 메시지는 모두 표시
                }

                if (
                  isSystemMessagePayload(message.payload) ||
                  isChatMessagePayload(message.payload)
                ) {
                  // content를 안전하게 문자열로 변환
                  const contentText = (() => {
                    if (typeof message.payload.content === "string") {
                      return message.payload.content;
                    }
                    if (
                      typeof message.payload.content === "object" &&
                      message.payload.content !== null &&
                      "message" in message.payload.content
                    ) {
                      return (message.payload.content as any).message;
                    }
                    return "";
                  })();

                  // "생성중입니다" 메시지만 필터링 (평가 관련 메시지는 모두 표시)
                  return (
                    !contentText.includes("생성중입니다") &&
                    !contentText.includes("생성하고 있습니다")
                  );
                }
                return true;
              })
              .map((message, index) => {
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

                  // 사용자가 참여한 세션인지 확인
                  const hasUserParticipant =
                    summaryPayload.participants?.includes("나");

                  // 종료 주체에 따른 메시지 생성
                  const getEndMessage = () => {
                    if (hasUserParticipant) {
                      // 사용자가 참여한 세션
                      if (summaryPayload.endedBy === "user") {
                        return "피드백 세션을 종료했습니다.";
                      } else {
                        return "AI가 피드백 세션을 종료했습니다.";
                      }
                    } else {
                      // AI끼리의 세션
                      return "AI 피드백 세션이 완료되었습니다.";
                    }
                  };

                  return (
                    <div key={`${message.type}_${message.id}_${message.timestamp}_${index}`} className="flex justify-center mb-6">
                      <div className="bg-slate-50 rounded-2xl p-6 max-w-4xl w-full">
                        <div className="flex items-center gap-2 mb-4">
                          <div
                            className={`w-6 h-6 ${
                              isAIOnlySession ? "bg-purple-500" : "bg-blue-500"
                            } rounded-full flex items-center justify-center`}
                          >
                            <MessageCircle className="h-3 w-3 text-white" />
                          </div>
                          <div>
                            <h4 className="text-slate-800">
                              {summaryPayload.participants?.join(" ↔ ")} 피드백
                              세션이 종료되었습니다
                            </h4>
                            <p className="text-xs text-slate-600 mt-1">
                              {getEndMessage()}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {/* 실제 대화 내용 표시 (요약 대신) */}
                          {summaryPayload.sessionMessages &&
                          summaryPayload.sessionMessages.length > 0 ? (
                            <div>
                              <p className="text-sm text-gray-600 mb-3">
                                대화 내용
                              </p>
                              <div className="bg-white rounded-lg p-3 space-y-2">
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
                                      getSenderDisplayName(sessionMsg.sender);
                                    const isFromUser =
                                      sessionMsg.sender === "나";

                                    // AI끼리의 세션인 경우 참가자별로 다른 스타일 적용
                                    let messageStyle =
                                      "bg-gray-100 text-gray-900"; // 기본 스타일
                                    let isRightAligned = false;

                                    if (isFromUser) {
                                      // 인간 사용자의 메시지: 파란색 + 오른쪽
                                      messageStyle = "bg-blue-500 text-white";
                                      isRightAligned = true;
                                    } else if (
                                      isAIOnlySession &&
                                      summaryPayload.participants?.length >= 2
                                    ) {
                                      // AI 참가자들의 정확한 순서 확인
                                      const participant1Name =
                                        summaryPayload.participants[0];
                                      const participant2Name =
                                        summaryPayload.participants[1];

                                      // 발신자 이름으로 참가자 구분
                                      if (
                                        senderDisplayName === participant1Name
                                      ) {
                                        // 첫 번째 참가자: 회색 + 왼쪽 (에이전트 스타일)
                                        messageStyle =
                                          "bg-gray-100 text-gray-900";
                                        isRightAligned = false;
                                      } else if (
                                        senderDisplayName === participant2Name
                                      ) {
                                        // 두 번째 참가자: 파란색 + 오른쪽 (인간 스타일)
                                        messageStyle = "bg-blue-500 text-white";
                                        isRightAligned = true;
                                      } else {
                                        // 알 수 없는 발신자
                                        messageStyle =
                                          "bg-orange-100 text-orange-900";
                                        isRightAligned = false;
                                      }
                                    } else if (!isFromUser) {
                                      // 에이전트의 메시지: 회색 + 왼쪽
                                      messageStyle =
                                        "bg-gray-100 text-gray-900";
                                      isRightAligned = false;
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
                                                isRightAligned
                                                  ? "text-right text-blue-600 font-medium"
                                                  : "text-left text-gray-600 font-medium"
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
                          )}

                          <div className="flex items-center gap-4 text-xs text-gray-500 pt-2">
                            <span>{summaryPayload.messageCount}개 메시지</span>
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

                  // content를 안전하게 문자열로 추출하는 헬퍼 함수
                  const getContentText = (payload: any): string => {
                    if (typeof payload === "string") return payload;
                    if (!payload || typeof payload !== "object") return "";

                    if (typeof payload.content === "string") {
                      return payload.content;
                    }
                    if (
                      typeof payload.content === "object" &&
                      payload.content !== null &&
                      "message" in payload.content
                    ) {
                      return (payload.content as any).message;
                    }
                    return "";
                  };

                  const contentText = getContentText(message.payload);

                  const isGeneratingMessage =
                    typeof message.payload === "string"
                      ? false
                      : (isSystemMessagePayload(message.payload) ||
                          isChatMessagePayload(message.payload)) &&
                        (contentText.includes("생성중입니다") ||
                          contentText.includes("생성하고 있습니다") ||
                          contentText.includes("평가하고 있습니다"));

                  const isIdeaCompletedMessage =
                    typeof message.payload === "string"
                      ? false
                      : (isSystemMessagePayload(message.payload) ||
                          isChatMessagePayload(message.payload)) &&
                        contentText.includes("생성했습니다");

                  const isEvaluationCompletedMessage =
                    typeof message.payload === "string"
                      ? false
                      : (isSystemMessagePayload(message.payload) ||
                          isChatMessagePayload(message.payload)) &&
                        (contentText.includes("평가했습니다") ||
                          contentText.includes("평가를 완료했습니다"));

                  const messageContent = (() => {
                    if (typeof message.payload === "string") {
                      return message.payload;
                    }
                    if (
                      isSystemMessagePayload(message.payload) ||
                      isChatMessagePayload(message.payload)
                    ) {
                      // content를 안전하게 문자열로 변환
                      if (typeof message.payload.content === "string") {
                        return message.payload.content;
                      }
                      if (
                        typeof message.payload.content === "object" &&
                        message.payload.content !== null &&
                        "message" in message.payload.content
                      ) {
                        return (message.payload.content as any).message;
                      }
                      return JSON.stringify(message.payload.content);
                    }
                    return "작업을 완료했습니다.";
                  })();

                  // 평가 완료 메시지는 다른 색상으로 표시
                  const messageStyle = isEvaluationCompletedMessage
                    ? "bg-orange-50 text-orange-600"
                    : "bg-blue-50 text-blue-600";

                  return (
                    <div key={`${message.type}_${message.id}_${message.timestamp}_${index}`} className="flex justify-center">
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

                                // 아이디어 모달 열기
                                const ideaIndex = ideas.findIndex(
                                  (idea) => idea.id === closestIdea.id
                                );
                                if (ideaIndex !== -1) {
                                  onIdeaClick(closestIdea, ideaIndex);
                                }
                              } else {
                                // 아이디어를 찾을 수 없음
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
                        {isEvaluationCompletedMessage && (
                          <span
                            className="underline cursor-pointer text-orange-600 text-sm font-semibold hover:text-orange-800"
                            onClick={() => {
                              // 평가 완료 메시지 시간 기준으로 최근에 평가된 아이디어 찾기
                              const messageTime = new Date(
                                message.timestamp
                              ).getTime();

                              // 메시지 발송자가 평가한 아이디어들 중에서 시간이 가장 가까운 것 찾기
                              const evaluatedIdeas = ideas
                                .filter((idea) => {
                                  return idea.evaluations.some(
                                    (evaluation) =>
                                      evaluation.evaluator === message.sender
                                  );
                                })
                                .map((idea) => {
                                  // 해당 평가자의 평가 시간 찾기
                                  const evaluation = idea.evaluations.find(
                                    (evaluation) =>
                                      evaluation.evaluator === message.sender
                                  );
                                  return {
                                    ...idea,
                                    evaluationTime: evaluation?.timestamp,
                                    timeDiff: evaluation?.timestamp
                                      ? Math.abs(
                                          new Date(
                                            evaluation.timestamp
                                          ).getTime() - messageTime
                                        )
                                      : Infinity,
                                  };
                                })
                                .sort((a, b) => a.timeDiff - b.timeDiff);

                              const closestEvaluatedIdea = evaluatedIdeas[0];

                              if (closestEvaluatedIdea) {

                                // 아이디어 모달 열기
                                const ideaIndex = ideas.findIndex(
                                  (idea) => idea.id === closestEvaluatedIdea.id
                                );
                                if (ideaIndex !== -1) {
                                  onIdeaClick(closestEvaluatedIdea, ideaIndex);
                                }
                              } else {
                                // 평가한 아이디어를 찾을 수 없음
                              }
                            }}
                          >
                            "
                            {(() => {
                              // 평가 메시지 시간과 가장 가까운 평가된 아이디어의 제목 찾기
                              const messageTime = new Date(
                                message.timestamp
                              ).getTime();

                              const evaluatedIdeas = ideas
                                .filter((idea) => {
                                  return idea.evaluations.some(
                                    (evaluation) =>
                                      evaluation.evaluator === message.sender
                                  );
                                })
                                .map((idea) => {
                                  const evaluation = idea.evaluations.find(
                                    (evaluation) =>
                                      evaluation.evaluator === message.sender
                                  );
                                  return {
                                    ...idea,
                                    timeDiff: evaluation?.timestamp
                                      ? Math.abs(
                                          new Date(
                                            evaluation.timestamp
                                          ).getTime() - messageTime
                                        )
                                      : Infinity,
                                  };
                                })
                                .sort((a, b) => a.timeDiff - b.timeDiff);

                              return (
                                evaluatedIdeas[0]?.content.object || "아이디어"
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
                    key={`${message.type}_${message.id}_${message.timestamp}_${index}`}
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
                            "type" in message.payload &&
                            isChatMessagePayload(message.payload)
                          ) {
                            const { type, mention, requestType, content } =
                              message.payload;

                            // content가 객체일 경우 message 속성 추출
                            const extractedContent = (() => {
                              if (typeof content === "string") {
                                return content;
                              }
                              if (
                                typeof content === "object" &&
                                content !== null
                              ) {
                                // content.message가 있으면 사용, 없으면 전체를 JSON으로 변환
                                if (
                                  "message" in content &&
                                  typeof (content as any).message === "string"
                                ) {
                                  return (content as any).message;
                                }
                                return JSON.stringify(content);
                              }
                              return "메시지 내용 없음";
                            })();

                            const isRequest =
                              type === "make_request" && mention && requestType;
                            const isFeedback = type === "give_feedback";

                            if (isRequest) {
                              const reqType = requestType as
                                | "generate"
                                | "evaluate"
                                | "give_feedback"
                                | "generate_idea"
                                | "evaluate_idea";
                              const requestText =
                                {
                                  generate: "아이디어 생성",
                                  generate_idea: "아이디어 생성",
                                  evaluate: "아이디어 평가",
                                  evaluate_idea: "아이디어 평가",
                                  give_feedback: "피드백",
                                }[reqType] || "작업";

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
                                    {extractedContent}
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
                                      {extractedContent || "메시지 내용 없음"}
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
                                      {extractedContent || "메시지 내용 없음"}
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
                              // content를 안전하게 문자열로 변환
                              if (typeof message.payload.content === "string") {
                                return message.payload.content;
                              }
                              if (
                                typeof message.payload.content === "object" &&
                                message.payload.content !== null &&
                                "message" in message.payload.content
                              ) {
                                return (message.payload.content as any).message;
                              }
                              return JSON.stringify(message.payload.content);
                            }
                            return "작업을 완료했습니다.";
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
        ) : (
          // 피드백 탭 - FeedbackTabContent 컴포넌트
          (() => {
            const currentTab = feedbackTabs.find((tab) => tab.id === activeTab);
            return currentTab ? (
              <FeedbackTabContent
                tab={currentTab}
                teamId={team?.id || ""}
                onClose={() => onCloseFeedbackTab(currentTab.id)}
              />
            ) : null;
          })()
        )}
      </div>

      {/* 메시지 입력 */}
      {activeTab === "main" && (
        <div className="p-3 sm:p-4 md:p-5 lg:p-6 border-t border-gray-200">
          {/* 아이디어 생성 제한 알림 */}
          {isChatDisabled() && (
            <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                <p className="text-sm text-yellow-800 font-medium">
                  {getChatDisabledMessage()}
                </p>
              </div>
            </div>
          )}

          {/* 멘션 및 요청 타입 UI */}
          <div className="flex items-center gap-2 mb-2">
            <div className="relative">
              <button
                onClick={() => onShowMentionDropdown(!showMentionDropdown)}
                disabled={isChatDisabled()}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-md text-sm font-medium text-gray-700 ${
                  isChatDisabled()
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-200"
                }`}
              >
                <span className="text-gray-500">@</span>
                <span>
                  {mentionedAgent ? mentionedAgent.name : "팀원 선택"}
                </span>
              </button>
              {showMentionDropdown && !isChatDisabled() && (
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                  {teamAgents.map((agent) => {
                    const isInFeedback = isAgentInFeedbackSession(agent.id);
                    const hasRelationship = 
                      chatMode === "give_feedback" 
                        ? canCreateFeedbackSession("나", agent.id, team)
                        : canMakeRequest("나", agent.id, team);
                    const isAvailable =
                      chatMode === "give_feedback"
                        ? !isInFeedback && hasRelationship
                        : requestType
                        ? canAgentPerformRole(agent, requestType) &&
                          !isInFeedback && hasRelationship
                        : !isInFeedback && hasRelationship;

                    return (
                      <button
                        key={agent.id}
                        onClick={() => {
                          if (isAvailable) {
                            onMentionedAgentChange(agent);
                            onShowMentionDropdown(false);

                            // 선택된 에이전트가 현재 요청 타입을 수행할 수 없다면 요청 타입 초기화
                            if (
                              chatMode === "make_request" &&
                              requestType &&
                              !canAgentPerformRole(agent, requestType)
                            ) {
                              onRequestTypeChange(null);
                            }
                          }
                        }}
                        disabled={!isAvailable}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                          isAvailable
                            ? "hover:bg-gray-50 cursor-pointer"
                            : "cursor-not-allowed opacity-50 bg-gray-50"
                        }`}
                      >
                        <span>{agent.name}</span>
                        {isInFeedback && (
                          <span className="text-xs text-orange-600 font-medium">
                            피드백 중
                          </span>
                        )}
                        {!isInFeedback && !hasRelationship && (
                          <span className="text-xs text-gray-500">
                            관계 없음
                          </span>
                        )}
                        {!isInFeedback &&
                          hasRelationship &&
                          chatMode === "make_request" &&
                          requestType &&
                          !canAgentPerformRole(agent, requestType) && (
                            <span className="text-xs text-gray-500">
                              역할 없음
                            </span>
                          )}
                      </button>
                    );
                  })}
                  {teamAgents.filter((agent) => {
                    const isInFeedback = isAgentInFeedbackSession(agent.id);
                    const hasRelationship = 
                      chatMode === "give_feedback" 
                        ? canCreateFeedbackSession("나", agent.id, team)
                        : canMakeRequest("나", agent.id, team);
                    return chatMode === "give_feedback"
                      ? !isInFeedback && hasRelationship
                      : requestType
                      ? canAgentPerformRole(agent, requestType) &&
                        !isInFeedback && hasRelationship
                      : !isInFeedback && hasRelationship;
                  }).length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      {chatMode === "make_request" && requestType
                        ? "해당 역할을 수행할 수 있고 관계가 연결된 에이전트가 없거나 모두 피드백 중입니다."
                        : "관계가 연결된 에이전트가 없거나 모두 피드백 세션 중입니다."}
                    </div>
                  )}
                </div>
              )}
            </div>

            <span className="text-sm text-gray-500">에게</span>

            <select
              value={chatMode}
              onChange={(e) => {
                onChatModeChange(
                  e.target.value as "give_feedback" | "make_request"
                );
                // 채팅 모드 변경 시 요청 타입과 멘션된 에이전트 초기화
                if (e.target.value === "make_request") {
                  onRequestTypeChange(null);
                }
              }}
              disabled={isChatDisabled()}
              className={`px-3 py-1.5 bg-gray-100 border-none rounded-md text-sm font-medium text-gray-700 focus:ring-0 ${
                isChatDisabled() ? "opacity-50 cursor-not-allowed" : ""
              }`}
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
                  onRequestTypeChange(newRequestType);

                  // 요청 타입 변경 시, 현재 선택된 에이전트가 해당 역할을 수행할 수 없다면 초기화
                  if (
                    mentionedAgent &&
                    !canAgentPerformRole(mentionedAgent, newRequestType)
                  ) {
                    onMentionedAgentChange(null);
                  }
                }}
                disabled={isChatDisabled()}
                className={`px-3 py-1.5 bg-gray-100 border-none rounded-md text-sm font-medium text-gray-700 focus:ring-0 ${
                  isChatDisabled() ? "opacity-50 cursor-not-allowed" : ""
                }`}
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
          <div className="flex gap-2 sm:gap-3 md:gap-4 items-end">
            <Textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => onNewMessageChange(e.target.value)}
              placeholder={
                isChatDisabled()
                  ? getChatDisabledMessage()
                  : feedbackTabs.length > 0 && activeTab !== "main"
                  ? "피드백 세션이 진행 중입니다. 메인 탭에서 채팅하세요."
                  : chatMode === "give_feedback"
                  ? `${
                      mentionedAgent ? mentionedAgent.name : "팀원"
                    }에게 피드백을 보내세요...`
                  : `${
                      mentionedAgent ? mentionedAgent.name : "팀원"
                    }에게 요청할 내용을 입력하세요...`
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (activeTab === "main" && !isChatDisabled() && !isCreatingFeedbackSession) {
                    onSendMessage();
                  }
                }
              }}
              className="flex-1 min-h-[48px] max-h-[96px] sm:min-h-[52px] sm:max-h-[104px] md:min-h-[56px] md:max-h-[112px] lg:min-h-[60px] lg:max-h-[120px] resize-none overflow-y-auto"
              disabled={
                isChatDisabled() ||
                isAutoGenerating ||
                isGeneratingIdea ||
                isCreatingFeedbackSession ||
                activeTab !== "main"
              }
            />
            <Button
              onClick={onSendMessage}
              size="icon"
              disabled={
                isChatDisabled() ||
                isAutoGenerating ||
                isGeneratingIdea ||
                isCreatingFeedbackSession ||
                activeTab !== "main" ||
                !mentionedAgent ||
                (chatMode === "make_request" && !requestType)
              }
              className="self-center h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5 md:w-5 md:h-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
