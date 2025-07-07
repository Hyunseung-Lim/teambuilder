import Link from "next/link";
import { getUserAgentsAction } from "@/actions/agent.actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { User, Plus, ArrowLeft } from "lucide-react";

export default async function AgentsPage() {
  const agents = await getUserAgentsAction();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            메인으로
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            AI 에이전트 관리
          </h1>
          <p className="text-gray-600">
            생성된 AI 에이전트들을 관리하고 새로운 에이전트를 만들어보세요.
          </p>
        </div>
        <Link href="/dashboard/agents/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />새 에이전트
          </Button>
        </Link>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <User className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              아직 에이전트가 없습니다
            </h3>
            <p className="text-gray-600 mb-6">
              첫 번째 AI 에이전트를 생성하여 팀 빌딩을 시작해보세요.
            </p>
            <Link href="/dashboard/agents/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />첫 에이전트 만들기
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <Card key={agent.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{agent.name}</CardTitle>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4" />
                    {agent.age}세
                  </div>
                </div>
                <CardDescription>
                  {agent.gender} • 생성일:{" "}
                  {new Date(agent.createdAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {agent.professional && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      직업/전문성
                    </h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {agent.professional}
                    </p>
                  </div>
                )}

                {agent.skills && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      스킬셋
                    </h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {agent.skills}
                    </p>
                  </div>
                )}

                {agent.autonomy && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      자율성
                    </h4>
                    <p className="text-sm text-gray-600">
                      {agent.autonomy}/5
                      {agent.autonomy === 1 && " (매우 낮음)"}
                      {agent.autonomy === 2 && " (낮음)"}
                      {agent.autonomy === 3 && " (보통)"}
                      {agent.autonomy === 4 && " (높음)"}
                      {agent.autonomy === 5 && " (매우 높음)"}
                    </p>
                  </div>
                )}

                {agent.personality && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      성격
                    </h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {agent.personality}
                    </p>
                  </div>
                )}

                {agent.value && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      가치관
                    </h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {agent.value}
                    </p>
                  </div>
                )}

                {agent.workStyle && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      업무 방식
                    </h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {agent.workStyle}
                    </p>
                  </div>
                )}

                {agent.preferences && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      선호하는 것
                    </h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {agent.preferences}
                    </p>
                  </div>
                )}

                {agent.dislikes && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                      싫어하는 것
                    </h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {agent.dislikes}
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  <Button variant="outline" className="w-full" size="sm">
                    상세 보기
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
