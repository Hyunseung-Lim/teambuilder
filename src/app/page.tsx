"use client";

import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { getUserAgentsAction } from "@/actions/agent.actions";
import { getUserTeamsAction, deleteTeamAction } from "@/actions/team.actions";
import { createAgentAction } from "@/actions/agent.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AIAgent, Team } from "@/lib/types";
import { User, Users, Plus, LogOut, LogIn, Crown, Trash2 } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<"agents" | "teams">("teams");
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      async function loadData() {
        setIsDataLoading(true);
        try {
          const [userAgents, userTeams] = await Promise.all([
            getUserAgentsAction(),
            getUserTeamsAction(),
          ]);
          console.log("🔍 데이터 디버깅:", {
            session: session?.user?.email,
            agentsCount: userAgents.length,
            agents: userAgents.map((a) => ({ id: a.id, name: a.name })),
            teamsCount: userTeams.length,
            teams: userTeams.map((t) => ({
              id: t.id,
              name: t.teamName,
              members: t.members.map((m) => ({
                agentId: m.agentId,
                isUser: m.isUser,
                roles: m.roles,
              })),
            })),
          });
          setAgents(userAgents);
          setTeams(userTeams);
        } catch (error) {
          console.error("데이터 로딩 오류:", error);
          setError("데이터를 불러오는데 실패했습니다.");
        } finally {
          setIsDataLoading(false);
        }
      }
      loadData();
    }
  }, [session]);

  async function handleCreateAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      await createAgentAction(formData);

      // 데이터 새로고침
      const userAgents = await getUserAgentsAction();
      setAgents(userAgents);
      setShowCreateForm(false);

      // 폼 리셋
      event.currentTarget.reset();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "에이전트 생성에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }

  // 팀 삭제 처리 함수
  async function handleDeleteTeam(teamId: string) {
    if (!teamId) return;

    setDeletingTeam(teamId);
    setError(null);

    try {
      const response = await fetch(`/api/teams/${teamId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "팀 삭제에 실패했습니다.");
      }

      // 팀 목록 새로고침
      const userTeams = await getUserTeamsAction();
      setTeams(userTeams);

      // 모달 닫기
      setSelectedTeam(null);
      setShowDeleteConfirm(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "팀 삭제에 실패했습니다."
      );
    } finally {
      setDeletingTeam(null);
    }
  }

  // 로딩 중 또는 마운트되지 않음
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 로그인하지 않은 상태
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">AI 팀 빌더</CardTitle>
            <CardDescription>
              AI 에이전트를 생성하고 팀을 구성해보세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/login">
              <Button className="w-full">
                <LogIn className="h-4 w-4 mr-2" />
                로그인
              </Button>
            </Link>
            <Link href="/signup">
              <Button variant="outline" className="w-full">
                <User className="h-4 w-4 mr-2" />
                회원가입
              </Button>
            </Link>
            <p className="text-sm text-gray-600 text-center">
              이메일과 비밀번호로 로그인/회원가입하세요
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 로그인한 상태
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-gray-900">AI Team Builder</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm font-semibold text-gray-800">
                {session.user?.name || session.user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-2" />
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* 탭 네비게이션 */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab("teams")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "teams"
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Users className="h-5 w-5 inline mr-2" />팀 만들기
              </button>
              <button
                onClick={() => setActiveTab("agents")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "agents"
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <User className="h-5 w-5 inline mr-2" />
                팀원 보기
              </button>
            </nav>
          </div>
        </div>

        {/* 팀원 보기 탭 */}
        {activeTab === "agents" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">팀원 보기</h2>
                <p className="text-gray-600">
                  현재 생성된 AI 팀원들을 확인하세요. 새로운 팀원은 팀
                  만들기에서 생성할 수 있습니다.
                </p>
              </div>
              <Link href="/dashboard/teams/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />새 팀 만들기
                </Button>
              </Link>
            </div>

            {/* 팀원 목록 */}
            {isDataLoading ? (
              // 팀원 스켈레톤 로딩 UI
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Card
                    key={i}
                    className="border-0 bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl"
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        {/* 아바타 스켈레톤 */}
                        <div className="w-20 h-20 bg-gray-300 rounded-full animate-pulse"></div>

                        {/* 정보 스켈레톤 */}
                        <div className="w-full space-y-3">
                          <div className="h-6 w-24 bg-gray-300 rounded animate-pulse mx-auto"></div>

                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <div className="h-4 w-8 bg-gray-300 rounded animate-pulse"></div>
                              <div className="h-4 w-12 bg-gray-300 rounded animate-pulse"></div>
                            </div>
                            <div className="flex justify-between">
                              <div className="h-4 w-8 bg-gray-300 rounded animate-pulse"></div>
                              <div className="h-4 w-8 bg-gray-300 rounded animate-pulse"></div>
                            </div>
                            <div className="flex justify-between">
                              <div className="h-4 w-8 bg-gray-300 rounded animate-pulse"></div>
                              <div className="h-4 w-16 bg-gray-300 rounded animate-pulse"></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 버튼 스켈레톤 */}
                      <div className="mt-4">
                        <div className="h-8 w-full bg-gray-300 rounded animate-pulse"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : agents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {agents.map((agent) => (
                  <Card
                    key={agent.id}
                    className="group relative overflow-hidden border-0 bg-white/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] rounded-2xl cursor-pointer"
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center text-center space-y-4">
                        {/* 아바타 */}
                        <div className="relative">
                          <div className="w-20 h-20 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow duration-300">
                            <User className="h-10 w-10 text-white" />
                          </div>
                        </div>

                        {/* 기본 정보만 표시 */}
                        <div className="w-full space-y-3">
                          <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                            {agent.name}
                          </h3>

                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">나이</span>
                              <span className="font-medium text-gray-900">
                                {agent.age}세
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">성별</span>
                              <span className="font-medium text-gray-900">
                                {agent.gender}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">직업</span>
                              <span className="font-medium text-gray-900 text-right">
                                {agent.professional}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 호버 시 표시되는 액션 버튼 */}
                      <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full bg-white/90 backdrop-blur-sm border-gray-200 hover:bg-gray-50 text-gray-700"
                        >
                          상세 보기
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-16">
                  <div className="max-w-md mx-auto">
                    <User className="mx-auto h-16 w-16 text-gray-400 mb-6" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      아직 생성된 팀원이 없습니다
                    </h3>
                    <p className="text-gray-600 mb-6">
                      새로운 팀을 만들 때 팀원을 생성할 수 있습니다.
                    </p>
                    <Link href="/dashboard/teams/new">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        <Plus className="h-4 w-4 mr-2" />첫 번째 팀 만들기
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* 팀 만들기 탭 */}
        {activeTab === "teams" && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">팀 만들기</h2>
                <p className="text-gray-600">
                  새로운 팀을 만들고 팀원을 생성하여 아이디에이션을 시작하세요.
                </p>
              </div>
              <Link href="/dashboard/teams/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />새 팀 만들기
                </Button>
              </Link>
            </div>

            {isDataLoading ? (
              // 스켈레톤 로딩 UI
              <div className="space-y-8">
                {/* 현재 활성 팀 스켈레톤 */}
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 bg-gray-300 rounded-full animate-pulse"></div>
                    <div className="h-6 w-32 bg-gray-300 rounded animate-pulse"></div>
                  </div>

                  <Card className="bg-gradient-to-br from-gray-50 to-gray-100">
                    <CardContent className="p-8">
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex-1">
                          <div className="h-8 w-48 bg-gray-300 rounded animate-pulse mb-4"></div>
                          <div className="flex items-center gap-4">
                            <div className="h-4 w-24 bg-gray-300 rounded animate-pulse"></div>
                            <div className="h-4 w-32 bg-gray-300 rounded animate-pulse"></div>
                            <div className="h-4 w-28 bg-gray-300 rounded animate-pulse"></div>
                          </div>
                        </div>
                        <div className="flex flex-row gap-3">
                          <div className="h-12 w-32 bg-gray-300 rounded animate-pulse"></div>
                          <div className="h-12 w-40 bg-gray-300 rounded animate-pulse"></div>
                        </div>
                      </div>

                      {/* 팀원 스켈레톤 */}
                      <div>
                        <div className="h-4 w-20 bg-gray-300 rounded animate-pulse mb-3"></div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-white/50"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-12 h-12 bg-gray-300 rounded-full animate-pulse flex-shrink-0"></div>
                                <div className="min-w-0 flex-1 space-y-2">
                                  <div className="h-4 w-20 bg-gray-300 rounded animate-pulse"></div>
                                  <div className="h-3 w-16 bg-gray-300 rounded animate-pulse"></div>
                                  <div className="flex gap-1">
                                    <div className="h-5 w-12 bg-gray-300 rounded animate-pulse"></div>
                                    <div className="h-5 w-16 bg-gray-300 rounded animate-pulse"></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 팀 히스토리 스켈레톤 */}
                <div>
                  <div className="h-6 w-24 bg-gray-300 rounded animate-pulse mb-4"></div>
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Card
                        key={i}
                        className="bg-gray-50 border border-gray-200"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse"></div>
                              <div className="space-y-2">
                                <div className="h-4 w-32 bg-gray-300 rounded animate-pulse"></div>
                                <div className="h-3 w-24 bg-gray-300 rounded animate-pulse"></div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <div className="h-8 w-20 bg-gray-300 rounded animate-pulse"></div>
                              <div className="h-8 w-8 bg-gray-300 rounded animate-pulse"></div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            ) : teams.length > 0 ? (
              <div className="space-y-8">
                {/* 현재 활성 팀 (가장 최근 팀) */}
                {(() => {
                  const sortedTeams = [...teams].sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime()
                  );
                  const currentTeam = sortedTeams[0];
                  const teamAgents = currentTeam.members
                    .map((member) =>
                      agents.find((agent) => agent.id === member.agentId)
                    )
                    .filter(Boolean);

                  return (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          현재 활성 팀
                        </h3>
                      </div>

                      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
                        <CardContent className="p-8">
                          <div className="flex items-start justify-between mb-6">
                            <div>
                              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                                {currentTeam.teamName}
                              </h3>
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4" />
                                  <span>
                                    {currentTeam.members.length}명의 팀원
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span>
                                    생성일:{" "}
                                    {new Date(
                                      currentTeam.createdAt
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                                {currentTeam.topic && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">💡</span>
                                    <span>주제: {currentTeam.topic}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-row gap-3">
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => setSelectedTeam(currentTeam)}
                                className="border-blue-200 text-blue-700 hover:bg-blue-50"
                              >
                                <Users className="h-4 w-4 mr-2" />
                                <span className="text-base font-semibold">
                                  팀 정보 보기
                                </span>
                              </Button>
                              <div className="flex flex-col gap-3">
                                <Link href={`/ideation/${currentTeam.id}`}>
                                  <Button
                                    size="lg"
                                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg w-full"
                                  >
                                    <span className="text-lg mr-2">💡</span>
                                    <span className="text-base font-bold">
                                      아이디에이션 시작
                                    </span>
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          </div>

                          {/* 팀원 미리보기 */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">
                              팀원 구성
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              {currentTeam.members.map(
                                (member, memberIndex) => {
                                  if (member.isUser) {
                                    // 사용자 본인 카드
                                    return (
                                      <div
                                        key={`user-${memberIndex}`}
                                        className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-white/50"
                                      >
                                        <div className="flex items-start gap-3">
                                          <div
                                            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                                              member.isLeader
                                                ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                                                : "bg-gradient-to-br from-green-400 to-emerald-500"
                                            }`}
                                          >
                                            {member.isLeader ? (
                                              <Crown className="h-6 w-6 text-white" />
                                            ) : (
                                              <User className="h-6 w-6 text-white" />
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                              <p className="font-semibold text-gray-900">
                                                나
                                                {member.isLeader && (
                                                  <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                                    <Crown className="h-3 w-3 mr-1" />
                                                    리더
                                                  </span>
                                                )}
                                              </p>
                                            </div>
                                            <p className="text-sm text-gray-600 mb-2">
                                              사용자 본인
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                              {member.roles.map(
                                                (role, index) => (
                                                  <span
                                                    key={index}
                                                    className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg w-fit font-medium"
                                                  >
                                                    {role}
                                                  </span>
                                                )
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  } else {
                                    // AI 팀원 카드
                                    const agent = agents.find(
                                      (agent) => agent.id === member.agentId
                                    );

                                    // agent를 찾지 못해도 기본 정보는 표시
                                    return (
                                      <div
                                        key={`agent-${
                                          member.agentId || memberIndex
                                        }-${memberIndex}`}
                                        className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-white/50"
                                      >
                                        <div className="flex items-start gap-3">
                                          <div
                                            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                                              member.isLeader
                                                ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                                                : "bg-gradient-to-br from-blue-400 to-purple-500"
                                            }`}
                                          >
                                            {member.isLeader ? (
                                              <Crown className="h-6 w-6 text-white" />
                                            ) : (
                                              <User className="h-6 w-6 text-white" />
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                              <p className="font-semibold text-gray-900">
                                                {agent
                                                  ? agent.name
                                                  : `팀원 (ID: ${
                                                      member.agentId ||
                                                      "알 수 없음"
                                                    })`}
                                                {member.isLeader && (
                                                  <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                                    <Crown className="h-3 w-3 mr-1" />
                                                    리더
                                                  </span>
                                                )}
                                              </p>
                                              {agent && (
                                                <span className="text-sm text-gray-500">
                                                  ({agent.age}세, {agent.gender}
                                                  {agent.education &&
                                                    `, ${agent.education}`}
                                                  )
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-sm text-gray-600 mb-2">
                                              {agent
                                                ? agent.professional
                                                : "정보를 불러올 수 없음"}
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                              {member.roles.map(
                                                (role, index) => (
                                                  <span
                                                    key={index}
                                                    className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg w-fit font-medium"
                                                  >
                                                    {role}
                                                  </span>
                                                )
                                              )}
                                            </div>
                                            {!agent && (
                                              <p className="text-xs text-red-600 mt-1">
                                                에이전트 정보를 찾을 수 없습니다
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                }
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}

                {/* 팀 히스토리 */}
                {teams.length > 1 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      팀 히스토리
                    </h3>
                    <div className="space-y-3">
                      {(() => {
                        const sortedTeams = [...teams].sort(
                          (a, b) =>
                            new Date(b.createdAt).getTime() -
                            new Date(a.createdAt).getTime()
                        );
                        return sortedTeams.slice(1).map((team, index) => (
                          <Card
                            key={team.id}
                            className="bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                  <div>
                                    <h4 className="font-medium text-gray-900">
                                      {team.teamName}
                                    </h4>
                                    <p className="text-sm text-gray-600">
                                      {team.members.length}명 •{" "}
                                      {new Date(
                                        team.createdAt
                                      ).toLocaleDateString()}
                                      {team.topic && ` • 주제: ${team.topic}`}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-500 hover:text-gray-700"
                                  onClick={() => setSelectedTeam(team)}
                                >
                                  보기
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 팀이 없을 때 */
              <Card>
                <CardContent className="text-center py-16">
                  <div className="max-w-md mx-auto">
                    <Users className="mx-auto h-16 w-16 text-gray-400 mb-6" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      첫 번째 팀을 만들어보세요
                    </h3>
                    <p className="text-gray-600 mb-6">
                      팀을 만들면서 필요한 AI 팀원들을 생성하고 창의적인
                      아이디에이션을 시작해보세요.
                    </p>
                    <Link href="/dashboard/teams/new">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        <Plus className="h-4 w-4 mr-2" />첫 번째 팀 만들기
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* 에이전트 상세 정보 모달 */}
      {selectedAgent && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedAgent(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  에이전트 상세 정보
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAgent(null)}
                  className="rounded-full"
                >
                  ×
                </Button>
              </div>

              <div className="space-y-6">
                {/* 기본 정보 */}
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                    <User className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {selectedAgent.name}
                    </h3>
                    <p className="text-gray-600">
                      {selectedAgent.age}세, {selectedAgent.gender}
                    </p>
                  </div>
                </div>

                {/* 상세 정보 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      직업/전문성
                    </h4>
                    <p className="text-sm text-gray-600">
                      {selectedAgent.professional}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      자율성
                    </h4>
                    <p className="text-sm text-gray-600">
                      {selectedAgent.autonomy}/5
                      {selectedAgent.autonomy === 1 && " (매우 낮음)"}
                      {selectedAgent.autonomy === 2 && " (낮음)"}
                      {selectedAgent.autonomy === 3 && " (보통)"}
                      {selectedAgent.autonomy === 4 && " (높음)"}
                      {selectedAgent.autonomy === 5 && " (매우 높음)"}
                    </p>
                  </div>
                </div>

                {selectedAgent.skills && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      스킬셋
                    </h4>
                    <p className="text-sm text-gray-600">
                      {selectedAgent.skills}
                    </p>
                  </div>
                )}

                {selectedAgent.personality && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      성격
                    </h4>
                    <p className="text-sm text-gray-600">
                      {selectedAgent.personality}
                    </p>
                  </div>
                )}

                {selectedAgent.value && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      가치관
                    </h4>
                    <p className="text-sm text-gray-600">
                      {selectedAgent.value}
                    </p>
                  </div>
                )}

                {selectedAgent.designStyle && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">
                      추구하는 디자인
                    </h4>
                    <p className="text-sm text-gray-600">
                      {selectedAgent.designStyle}
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    생성일:{" "}
                    {new Date(selectedAgent.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 팀 상세 정보 모달 */}
      {selectedTeam && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedTeam(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  팀 상세 정보
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />팀 삭제
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTeam(null)}
                    className="rounded-full"
                  >
                    ×
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                {/* 팀 기본 정보 */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {selectedTeam.teamName}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>{selectedTeam.members.length}명의 팀원</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>
                            생성일:{" "}
                            {new Date(
                              selectedTeam.createdAt
                            ).toLocaleDateString()}
                          </span>
                        </div>
                        {/* 리더 정보 */}
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4 text-yellow-600" />
                          <span>
                            리더:{" "}
                            {(() => {
                              const leader = selectedTeam.members.find(
                                (m) => m.isLeader
                              );
                              if (!leader) return "없음";
                              if (leader.isUser) return "나";
                              const leaderAgent = agents.find(
                                (a) => a.id === leader.agentId
                              );
                              return leaderAgent?.name || "알 수 없음";
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 팀원 상세 정보 */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">
                    팀원 구성
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedTeam.members.map((member, index) => {
                      const agent = member.isUser
                        ? null
                        : agents.find((agent) => agent.id === member.agentId);

                      // 디버깅 로그
                      if (process.env.NODE_ENV === "development") {
                        console.log(`모달 팀원 ${index}:`, {
                          isUser: member.isUser,
                          agentId: member.agentId,
                          found: member.isUser ? "user" : !!agent,
                          agentName: member.isUser ? "나" : agent?.name,
                        });
                      }

                      return (
                        <div
                          key={
                            member.isUser
                              ? `user-${index}`
                              : `agent-${member.agentId || index}-${index}`
                          }
                          className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${
                            member.isLeader
                              ? "border-yellow-300 bg-yellow-50"
                              : "border-gray-200"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${
                                member.isLeader
                                  ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                                  : member.isUser
                                  ? "bg-gradient-to-br from-green-400 to-emerald-500"
                                  : "bg-gradient-to-br from-blue-400 to-purple-500"
                              }`}
                            >
                              {member.isLeader ? (
                                <Crown className="h-7 w-7 text-white" />
                              ) : (
                                <User className="h-7 w-7 text-white" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h5 className="font-semibold text-gray-900">
                                  {member.isUser
                                    ? "나"
                                    : agent?.name ||
                                      `팀원 (ID: ${
                                        member.agentId || "알 수 없음"
                                      })`}
                                  {member.isLeader && (
                                    <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                                      <Crown className="h-3 w-3 mr-1" />
                                      리더
                                    </span>
                                  )}
                                </h5>
                                {!member.isUser && agent && (
                                  <span className="text-sm text-gray-500">
                                    ({agent.age}세, {agent.gender}
                                    {agent.education && `, ${agent.education}`})
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mb-3">
                                {member.isUser
                                  ? "사용자 본인"
                                  : agent?.professional ||
                                    "정보를 불러올 수 없음"}
                              </p>

                              {/* 역할 */}
                              <div className="mb-3">
                                <p className="text-xs font-medium text-gray-700 mb-1">
                                  담당 역할
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {member.roles.map((role, index) => (
                                    <span
                                      key={index}
                                      className="text-sm px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg w-fit font-medium"
                                    >
                                      {role}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* 스킬셋 (AI 팀원만) */}
                              {!member.isUser && agent && agent.skills && (
                                <div className="mb-2">
                                  <p className="text-xs font-medium text-gray-700 mb-1">
                                    스킬셋
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    {agent.skills}
                                  </p>
                                </div>
                              )}

                              {/* 자율성 (AI 팀원만) */}
                              {!member.isUser && agent && (
                                <div>
                                  <p className="text-xs font-medium text-gray-700 mb-1">
                                    자율성
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <div className="flex gap-1">
                                      {[1, 2, 3, 4, 5].map((level) => (
                                        <div
                                          key={level}
                                          className={`w-2 h-2 rounded-full ${
                                            level <= agent.autonomy
                                              ? "bg-blue-500"
                                              : "bg-gray-300"
                                          }`}
                                        />
                                      ))}
                                    </div>
                                    <span className="text-xs text-gray-600">
                                      {agent.autonomy}/5
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* 에이전트를 찾을 수 없는 경우 경고 메시지 */}
                              {!member.isUser && !agent && (
                                <div className="mt-2">
                                  <p className="text-xs text-red-600">
                                    에이전트 정보를 찾을 수 없습니다
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    Agent ID: {member.agentId || "없음"}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 팀원 간 관계 */}
                {selectedTeam.relationships &&
                  selectedTeam.relationships.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">
                        팀원 간 관계
                      </h4>
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedTeam.relationships.map((rel, index) => {
                            const fromMember = selectedTeam.members.find((m) =>
                              m.isUser
                                ? rel.from === "나"
                                : agents.find((a) => a.id === m.agentId)
                                    ?.name === rel.from
                            );
                            const toMember = selectedTeam.members.find((m) =>
                              m.isUser
                                ? rel.to === "나"
                                : agents.find((a) => a.id === m.agentId)
                                    ?.name === rel.to
                            );

                            const getRelationshipIcon = (type: string) => {
                              switch (type) {
                                case "친구":
                                  return "👫";
                                case "상사":
                                  return "👔";
                                case "어색한 사이":
                                  return "😐";
                                default:
                                  return "🤝";
                              }
                            };

                            const getRelationshipColor = (type: string) => {
                              switch (type) {
                                case "친구":
                                  return "text-green-700 bg-green-100";
                                case "상사":
                                  return "text-blue-700 bg-blue-100";
                                case "어색한 사이":
                                  return "text-orange-700 bg-orange-100";
                                default:
                                  return "text-gray-700 bg-gray-100";
                              }
                            };

                            return (
                              <div
                                key={index}
                                className={`flex items-center gap-3 p-3 rounded-lg ${getRelationshipColor(
                                  rel.type
                                )}`}
                              >
                                <span className="text-lg">
                                  {getRelationshipIcon(rel.type)}
                                </span>
                                <div className="flex-1 text-sm">
                                  <span className="font-medium">
                                    {rel.from}
                                  </span>
                                  <span className="mx-2">→</span>
                                  <span className="font-medium">{rel.to}</span>
                                  <div className="text-xs opacity-75 mt-1">
                                    {rel.type}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {selectedTeam.relationships.length === 0 && (
                          <p className="text-sm text-gray-600 text-center py-4">
                            설정된 관계가 없습니다
                          </p>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 팀 삭제 확인 모달 */}
      {showDeleteConfirm && selectedTeam && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                팀을 삭제하시겠습니까?
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                <span className="font-medium">"{selectedTeam.teamName}"</span>{" "}
                팀이 영구적으로 삭제됩니다.
                <br />
                <span className="text-green-600">
                  팀원 정보는 보존되어 다른 팀에서 재사용할 수 있습니다.
                </span>
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1"
                  disabled={!!deletingTeam}
                >
                  취소
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteTeam(selectedTeam.id)}
                  className="flex-1"
                  disabled={!!deletingTeam}
                >
                  {deletingTeam === selectedTeam.id ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      삭제 중...
                    </div>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-1" />
                      삭제
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
