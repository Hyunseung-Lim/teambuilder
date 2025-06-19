import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Team } from "@/lib/types";

interface HeaderProps {
  team: Team;
  topic: string;
  sseConnected: boolean;
  feedbackTabsCount: number;
  onResetAgentStates: () => void;
}

export default function Header({
  team,
  topic,
  sseConnected,
  feedbackTabsCount,
  onResetAgentStates,
}: HeaderProps) {
  return (
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
            <h1 className="text-xl font-bold text-gray-900">{team.teamName}</h1>
            <div className="flex flex-row gap-2 text-sm text-gray-600 items-center">
              <p className="text-sm">
                {topic ? `주제: ${topic}` : "아이디에이션 세션"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* SSE 연결 상태 표시 */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                sseConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-xs text-gray-500">
              {sseConnected ? "실시간 연결됨" : "연결 끊어짐"}
            </span>
          </div>

          {/* 피드백 세션 상태 표시 */}
          {feedbackTabsCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <span className="text-xs text-orange-600 font-medium">
                피드백 세션 진행 중 ({feedbackTabsCount}개 탭)
              </span>
            </div>
          )}

          {/* 디버그 버튼 */}
          <Button
            variant="outline"
            size="sm"
            onClick={onResetAgentStates}
            className="text-xs"
          >
            🔄 상태 초기화
          </Button>

          <div className="text-sm text-gray-600">
            {team.members.length}명의 팀원
          </div>
        </div>
      </div>
    </header>
  );
}
