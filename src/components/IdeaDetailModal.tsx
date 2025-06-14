"use client";

import { useState, useEffect } from "react";
import { Idea, AIAgent, Team, Evaluation } from "@/lib/types";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface IdeaDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  idea: Idea | null;
  ideas: Idea[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  team: Team | null;
  agents: AIAgent[];
  userCanEvaluateIdeas: boolean;
  onEvaluate: (idea: Idea) => void;
  onSubmitEvaluation?: (evaluationData: {
    insightful: number;
    actionable: number;
    relevance: number;
    comment: string;
  }) => Promise<void>;
  isSubmittingEvaluation?: boolean;
}

export default function IdeaDetailModal({
  isOpen,
  onClose,
  idea,
  ideas,
  currentIndex,
  onIndexChange,
  team,
  agents,
  userCanEvaluateIdeas,
  onEvaluate,
  onSubmitEvaluation,
  isSubmittingEvaluation = false,
}: IdeaDetailModalProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const [evaluationSubmitted, setEvaluationSubmitted] = useState(false);
  const [editFormData, setEditFormData] = useState({
    object: "",
    function: "",
    behavior: "",
    structure: "",
  });
  const [behaviorPairs, setBehaviorPairs] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [structurePairs, setStructurePairs] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [evaluationFormData, setEvaluationFormData] = useState({
    insightful: 0,
    actionable: 0,
    relevance: 0,
    comment: "",
  });

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

  const getEvaluatorName = (evaluatorId: string) => {
    if (evaluatorId === "나") return "나";

    const member = team?.members.find((m) => m.agentId === evaluatorId);
    if (member && !member.isUser) {
      const agent = agents.find((a) => a.id === evaluatorId);
      return agent?.name || `에이전트 ${evaluatorId}`;
    }

    return evaluatorId;
  };

  // 아이디어 번호 매기기를 위한 생성순 정렬
  const ideasSortedByCreation = [...ideas].sort((a, b) => a.id - b.id);

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : ideas.length - 1;
    onIndexChange(newIndex);
  };

  const handleNext = () => {
    const newIndex = currentIndex < ideas.length - 1 ? currentIndex + 1 : 0;
    onIndexChange(newIndex);
  };

  const handleEditModeToggle = () => {
    if (!idea) return;

    setIsEditMode(true);
    // 편집 모드 진입 시 현재 데이터로 폼 초기화
    setEditFormData({
      object: idea.content.object,
      function: idea.content.function,
      behavior: idea.content.behavior,
      structure: idea.content.structure,
    });
    // behavior와 structure를 키-값 쌍으로 파싱
    setBehaviorPairs(parseJsonToPairs(idea.content.behavior));
    setStructurePairs(parseJsonToPairs(idea.content.structure));
  };

  const handleSave = () => {
    if (!idea) return;

    // 새로운 아이디어 생성 로직은 부모 컴포넌트에서 처리
    setIsEditMode(false);
    console.log("아이디어 업데이트:", {
      object: editFormData.object,
      function: editFormData.function,
      behavior: pairsToJsonString(behaviorPairs),
      structure: pairsToJsonString(structurePairs),
    });
  };

  const handleCancel = () => {
    if (!idea) return;

    setIsEditMode(false);
    // 편집 취소 시 원래 데이터로 복원
    setEditFormData({
      object: idea.content.object,
      function: idea.content.function,
      behavior: idea.content.behavior,
      structure: idea.content.structure,
    });
    setBehaviorPairs(parseJsonToPairs(idea.content.behavior));
    setStructurePairs(parseJsonToPairs(idea.content.structure));
  };

  const handleEvaluationSubmit = async () => {
    if (!onSubmitEvaluation || !idea) return;

    if (
      !evaluationFormData.insightful ||
      !evaluationFormData.actionable ||
      !evaluationFormData.relevance ||
      !evaluationFormData.comment.trim()
    ) {
      alert("모든 평가 항목을 완료해주세요.");
      return;
    }

    try {
      await onSubmitEvaluation(evaluationFormData);

      // 성공 시 폼 초기화 및 숨기기
      setEvaluationFormData({
        insightful: 0,
        actionable: 0,
        relevance: 0,
        comment: "",
      });
      setShowEvaluationForm(false);

      // 성공 메시지 표시
      alert("평가가 성공적으로 제출되었습니다!");
    } catch (error) {
      console.error("평가 제출 실패:", error);
      alert("평가 제출에 실패했습니다. 다시 시도해주세요.");
    }
  };

  if (!isOpen || !idea) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 고정 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevious}
                className="px-2 py-1 w-10 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={ideas.length <= 1 || isEditMode}
              >
                <span className="text-gray-400 w-6 h-6">
                  <ArrowLeft />
                </span>
              </button>
              <h2 className="text-xl font-bold text-gray-900">
                Idea{" "}
                {(() => {
                  // 아이디어 섹션과 동일한 방식으로 인덱스 계산
                  const creationIndex = ideasSortedByCreation.findIndex(
                    (i) => i.id === idea.id
                  );
                  return creationIndex + 1;
                })()}
              </h2>
              <button
                onClick={handleNext}
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
                <span className="text-sm text-gray-500">아이디어 제작자</span>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                    idea.author === "나"
                      ? "bg-green-500 text-white"
                      : "bg-blue-500 text-white"
                  }`}
                >
                  {getAuthorName(idea.author) === "나"
                    ? "나"
                    : getAuthorName(idea.author)[0]}
                </div>
                <span className="font-medium text-gray-900">
                  {getAuthorName(idea.author)}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-2 w-10 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
              >
                <span className="text-xl">×</span>
              </button>
            </div>
          </div>
        </div>

        {/* 메인 컨텐츠 - 2열 레이아웃 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 왼쪽: 아이디어 상세 정보 */}
          <div className="flex-1 overflow-y-auto p-6">
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
                    {idea.content.object}
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
                    {idea.content.function}
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
                        const behaviorObj = JSON.parse(idea.content.behavior);
                        return (
                          <div className="space-y-4">
                            {Object.entries(behaviorObj).map(([key, value]) => (
                              <div key={key} className="">
                                <div className="font-medium text-gray-800 mb-1">
                                  {key}
                                </div>
                                <div className="text-gray-600 text-sm">
                                  {value as string}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      } catch {
                        return <p>{idea.content.behavior}</p>;
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
                        const structureObj = JSON.parse(idea.content.structure);
                        return (
                          <div className="space-y-4">
                            {Object.entries(structureObj).map(
                              ([key, value]) => (
                                <div key={key} className="">
                                  <div className="font-medium text-gray-800 mb-1">
                                    {key}
                                  </div>
                                  <div className="text-gray-600 text-sm">
                                    {value as string}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        );
                      } catch {
                        return <p>{idea.content.structure}</p>;
                      }
                    })()}
                  </div>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-3 pt-4">
                {isEditMode ? (
                  <>
                    <button
                      onClick={handleSave}
                      className="flex-1 bg-black text-white py-3 px-4 rounded-lg font-medium"
                    >
                      저장하기
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex-1 bg-gray-500 text-white py-3 px-4 rounded-lg font-medium"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleEditModeToggle}
                      className="flex-1 bg-black text-white py-3 px-4 rounded-lg font-medium"
                    >
                      아이디어 업데이트
                    </button>
                    {userCanEvaluateIdeas && (
                      <button
                        onClick={() => setShowEvaluationForm(true)}
                        className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        아이디어 평가하기
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 오른쪽: 평가 영역 */}
          <div className="w-96 border-l border-gray-200 flex flex-col">
            {/* 평가 헤더 */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Evaluations</h3>
            </div>

            {/* 평가 목록 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {idea.evaluations.map((evaluation: Evaluation, index: number) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
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
                        {getEvaluatorName(evaluation.evaluator)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
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
                        actionable
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        {evaluation.scores.actionable}
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
                    <div className="text-xs text-gray-500 mb-1">comments</div>
                    <p className="text-sm text-gray-700">
                      {evaluation.comment}
                    </p>
                  </div>
                </div>
              ))}

              {idea.evaluations.length === 0 && !showEvaluationForm && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">아직 평가가 없습니다</p>
                  {userCanEvaluateIdeas && (
                    <button
                      onClick={() => setShowEvaluationForm(true)}
                      className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      첫 번째 평가를 남겨보세요
                    </button>
                  )}
                </div>
              )}

              {/* 평가 폼 */}
              {showEvaluationForm && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-4">
                    새 평가 작성
                  </h4>

                  {/* Insightful */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Insightful
                    </label>
                    <div className="flex justify-between">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          onClick={() =>
                            setEvaluationFormData({
                              ...evaluationFormData,
                              insightful: value,
                            })
                          }
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                            evaluationFormData.insightful === value
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-gray-300 text-gray-600 hover:border-blue-300"
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* actionable */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      actionable
                    </label>
                    <div className="flex justify-between">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          onClick={() =>
                            setEvaluationFormData({
                              ...evaluationFormData,
                              actionable: value,
                            })
                          }
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                            evaluationFormData.actionable === value
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-gray-300 text-gray-600 hover:border-blue-300"
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Relevance */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Relevance
                    </label>
                    <div className="flex justify-between">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          onClick={() =>
                            setEvaluationFormData({
                              ...evaluationFormData,
                              relevance: value,
                            })
                          }
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                            evaluationFormData.relevance === value
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-gray-300 text-gray-600 hover:border-blue-300"
                          }`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Comment
                    </label>
                    <textarea
                      value={evaluationFormData.comment}
                      onChange={(e) =>
                        setEvaluationFormData({
                          ...evaluationFormData,
                          comment: e.target.value,
                        })
                      }
                      className="w-full p-2 border border-gray-300 rounded text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      placeholder="평가 의견을 작성해주세요..."
                    />
                  </div>

                  {/* 버튼 */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleEvaluationSubmit}
                      disabled={
                        isSubmittingEvaluation ||
                        !evaluationFormData.insightful ||
                        !evaluationFormData.actionable ||
                        !evaluationFormData.relevance ||
                        !evaluationFormData.comment.trim()
                      }
                      className="flex-1 bg-blue-600 text-white py-2 px-3 rounded text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                    >
                      {isSubmittingEvaluation ? "제출 중..." : "제출"}
                    </button>
                    <button
                      onClick={() => {
                        setShowEvaluationForm(false);
                        setEvaluationFormData({
                          insightful: 0,
                          actionable: 0,
                          relevance: 0,
                          comment: "",
                        });
                      }}
                      className="px-3 py-2 text-gray-600 hover:text-gray-800 text-sm"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
