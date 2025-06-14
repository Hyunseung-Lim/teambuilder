import Link from "next/link";
import { getUserTeamsAction } from "@/actions/team.actions";
import { getUserAgentsAction } from "@/actions/agent.actions";
import { getAgentById } from "@/lib/redis";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, Plus, User, ArrowLeft } from "lucide-react";

export default async function TeamsPage() {
  const [teams, agents] = await Promise.all([
    getUserTeamsAction(),
    getUserAgentsAction(),
  ]);

  // 팀별 에이전트 정보를 미리 로드
  const teamsWithAgents = await Promise.all(
    teams.map(async (team) => {
      const teamAgents = await Promise.all(
        team.members.map(async (member) => {
          const agent = await getAgentById(member.agentId);
          return { ...member, agent };
        })
      );
      return { ...team, membersWithAgents: teamAgents };
    })
  );

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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">팀 관리</h1>
          <p className="text-gray-600">
            생성된 팀들을 관리하고 새로운 팀을 만들어보세요.
          </p>
        </div>
        <Link href="/dashboard/teams/new">
          <Button disabled={agents.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            {agents.length === 0 ? "에이전트가 필요합니다" : "새 팀"}
          </Button>
        </Link>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              아직 팀이 없습니다
            </h3>
            <p className="text-gray-600 mb-6">
              AI 에이전트들을 조합하여 첫 번째 팀을 만들어보세요.
            </p>
            {agents.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-orange-600">
                  팀을 만들기 전에 먼저 AI 에이전트를 생성해야 합니다.
                </p>
                <Link href="/">
                  <Button>
                    <User className="h-4 w-4 mr-2" />
                    에이전트 만들기
                  </Button>
                </Link>
              </div>
            ) : (
              <Link href="/dashboard/teams/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />첫 팀 만들기
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teamsWithAgents.map((team) => (
            <Link
              href={`/dashboard/teams/${team.id}`}
              key={team.id}
              className="block"
            >
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{team.teamName}</CardTitle>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="h-4 w-4" />
                      {team.members.length}명
                    </div>
                  </div>
                  <CardDescription>
                    생성일: {new Date(team.createdAt).toLocaleDateString()}
                    {team.topic && (
                      <>
                        <br />
                        주제: {team.topic}
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 flex-grow">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      팀원
                    </h4>
                    <div className="space-y-2">
                      {team.membersWithAgents.map((member, memberIndex) => (
                        <div
                          key={`${team.id}-${memberIndex}`}
                          className="bg-gray-50 p-3 rounded-lg"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-sm">
                              {member.isUser
                                ? "나"
                                : member.agent?.name || "알 수 없음"}
                            </span>
                            <span className="text-xs text-gray-600">
                              {member.isUser ? "" : `${member.agent?.age}세`}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {member.roles.slice(0, 2).map((role, roleIndex) => (
                              <span
                                key={`${team.id}-${memberIndex}-${roleIndex}`}
                                className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded"
                              >
                                {role}
                              </span>
                            ))}
                            {member.roles.length > 2 && (
                              <span className="text-xs text-gray-500">
                                +{member.roles.length - 2}개
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
