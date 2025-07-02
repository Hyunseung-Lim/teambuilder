import { Lightbulb } from "lucide-react";
import { Team, Idea, AIAgent } from "@/lib/types";

interface IdeaListProps {
  topic: string;
  userCanGenerateIdeas: boolean;
  isAutoGenerating: boolean;
  isGeneratingIdea: boolean;
  onShowAddIdeaModal: () => void;
  filteredIdeas: Idea[];
  ideasSortedByCreation: Idea[];
  authorFilter: string;
  uniqueAuthors: string[];
  onAuthorFilterChange: (author: string) => void;
  sortBy: "latest" | "rating";
  onSortChange: (sortBy: "latest" | "rating") => void;
  calculateAverageRating: (idea: Idea) => number | null;
  onIdeaClick: (idea: Idea, index: number) => void;
  getAuthorName: (authorId: string) => string;
  generationProgress: { completed: number; total: number };
  ideas: Idea[];
}

export default function IdeaList({
  topic,
  userCanGenerateIdeas,
  isAutoGenerating,
  isGeneratingIdea,
  onShowAddIdeaModal,
  filteredIdeas,
  ideasSortedByCreation,
  authorFilter,
  uniqueAuthors,
  onAuthorFilterChange,
  sortBy,
  onSortChange,
  calculateAverageRating,
  onIdeaClick,
  getAuthorName,
  generationProgress,
  ideas,
}: IdeaListProps) {
  return (
    <div className="w-[28rem] bg-gray-50 border-l border-gray-200 flex flex-col">
      {/* Topic 섹션 */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Topic</h3>
          <h2 className="text-lg font-bold text-gray-900">
            {topic || "Carbon Emission Reduction"}
          </h2>
        </div>
      </div>

      {/* 아이디어 추가하기 버튼 */}
      <div className="p-4 bg-white border-b border-gray-200">
        {userCanGenerateIdeas && (
          <button
            onClick={onShowAddIdeaModal}
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
        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-2">
            {/* 정렬 드롭다운 */}
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as "latest" | "rating")}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value="latest">최신순</option>
              <option value="rating">평가순</option>
            </select>
            
            {/* 필터 드롭다운 */}
            <select
              value={authorFilter}
              onChange={(e) => onAuthorFilterChange(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              {uniqueAuthors.map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button className="p-2 hover:bg-gray-100 rounded">
              <div className="grid grid-cols-3 gap-1">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="w-1 h-1 bg-gray-400 rounded-full"></div>
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
              onClick={() => onIdeaClick(idea, filteredIdeas.indexOf(idea))}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">
                    Idea {creationIndex + 1}
                  </h3>
                  {(() => {
                    const avgRating = calculateAverageRating(idea);
                    return avgRating !== null ? (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                        {avgRating.toFixed(1)}
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">아이디어 제작자</span>
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
                    {generationProgress.completed}/{generationProgress.total}{" "}
                    완료
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
                {generationProgress.completed}/{generationProgress.total} 완료
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
