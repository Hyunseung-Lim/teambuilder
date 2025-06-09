"use client";

import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { getUserAgentsAction } from "@/actions/agent.actions";
import { getUserTeamsAction } from "@/actions/team.actions";
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
import { User, Users, Plus, LogOut, LogIn } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<"agents" | "teams">("agents");
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      async function loadData() {
        try {
          const [userAgents, userTeams] = await Promise.all([
            getUserAgentsAction(),
            getUserTeamsAction(),
          ]);
          setAgents(userAgents);
          setTeams(userTeams);
        } catch (error) {
          setError("데이터를 불러오는데 실패했습니다.");
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

  // 로딩 중
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
                onClick={() => setActiveTab("agents")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "agents"
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <User className="h-5 w-5 inline mr-2" />
                팀원 만들기
              </button>
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
            </nav>
          </div>
        </div>

        {/* 팀원 만들기 탭 */}
        {activeTab === "agents" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">팀원 관리</h2>
                <p className="text-gray-600">
                  AI 에이전트를 생성하고 관리하세요.
                </p>
              </div>
              <Button
                onClick={() => setShowCreateForm(!showCreateForm)}
                disabled={isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                {showCreateForm ? "취소" : "새 팀원"}
              </Button>
            </div>

            {/* 에이전트 생성 폼 */}
            {showCreateForm && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>새 AI 에이전트 만들기</CardTitle>
                  <CardDescription>
                    에이전트의 기본 정보와 성격을 입력해주세요.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateAgent} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">이름</Label>
                        <Input
                          id="name"
                          name="name"
                          placeholder="예: Dave"
                          required
                          disabled={isLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="age">나이 *</Label>
                        <Input
                          id="age"
                          name="age"
                          type="number"
                          min="1"
                          max="100"
                          placeholder="21"
                          required
                          disabled={isLoading}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gender">성별 *</Label>
                      <Select
                        id="gender"
                        name="gender"
                        placeholder="성별을 선택해주세요"
                        required
                        disabled={isLoading}
                      >
                        <option value="여자">여자</option>
                        <option value="남자">남자</option>
                        <option value="정의하지 않음">정의하지 않음</option>
                        <option value="알 수 없음">알 수 없음</option>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="personality">성격</Label>
                      <Textarea
                        id="personality"
                        name="personality"
                        placeholder="예: 창의적이고 도전적인 성격"
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="value">가치관</Label>
                      <Textarea
                        id="value"
                        name="value"
                        placeholder="예: 사용자 중심의 디자인을 추구"
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="designStyle">추구하는 디자인</Label>
                      <Textarea
                        id="designStyle"
                        name="designStyle"
                        placeholder="예: 미니멀하고 깔끔한 디자인"
                        disabled={isLoading}
                      />
                    </div>

                    {error && (
                      <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                        {error}
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full"
                    >
                      {isLoading ? "생성 중..." : "에이전트 생성"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* 에이전트 목록 */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {agents.map((agent) => (
                <Card
                  key={agent.id}
                  className="group relative overflow-hidden border-0 bg-white/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] rounded-2xl"
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                      {/* 아바타 */}
                      <div className="relative">
                        <div className="w-20 h-20 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow duration-300">
                          <User className="h-10 w-10 text-white" />
                        </div>
                      </div>

                      {/* 정보 */}
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
                        </div>

                        {/* 추가 정보 (있을 때만 표시) */}
                        {(agent.personality || agent.designStyle) && (
                          <div className="pt-3 border-t border-gray-100 space-y-3">
                            {agent.personality && (
                              <div>
                                <p className="text-xs font-semibold text-gray-800 mb-1">
                                  💭 성격
                                </p>
                                <p className="text-xs text-gray-600 line-clamp-2 pl-4">
                                  {agent.personality}
                                </p>
                              </div>
                            )}
                            {agent.designStyle && (
                              <div>
                                <p className="text-xs font-semibold text-gray-800 mb-1">
                                  🎨 추구하는 디자인
                                </p>
                                <p className="text-xs text-gray-600 line-clamp-2 pl-4">
                                  {agent.designStyle}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
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

              {/* + 버튼 카드 */}
              <Card
                className="group border-2 border-dashed border-gray-300 hover:border-blue-400 cursor-pointer transition-all duration-300 hover:scale-[1.02] rounded-2xl bg-gray-50/50 hover:bg-blue-50/50"
                onClick={() => setShowCreateForm(true)}
              >
                <CardContent className="p-6 flex items-center justify-center min-h-[240px]">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-500 group-hover:from-blue-400 group-hover:to-blue-500 rounded-xl flex items-center justify-center mx-auto transition-all duration-300">
                      <Plus className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 group-hover:text-blue-700 transition-colors">
                        새 팀원 추가
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        AI 에이전트 생성하기
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* 팀 만들기 탭 */}
        {activeTab === "teams" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">팀 관리</h2>
                <p className="text-gray-600">
                  에이전트들을 조합하여 팀을 구성하세요.
                </p>
              </div>
              <Link href="/dashboard/teams/new">
                <Button disabled={agents.length === 0}>
                  <Plus className="h-4 w-4 mr-2" />
                  {agents.length === 0 ? "에이전트가 필요합니다" : "새 팀"}
                </Button>
              </Link>
            </div>

            {/* 팀 목록 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map((team) => (
                <Card
                  key={team.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">
                        {team.teamName}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4" />
                        {team.members.length}명
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">
                      생성일: {new Date(team.createdAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}

              {/* + 버튼 카드 (에이전트가 있을 때만 표시) */}
              {agents.length > 0 && (
                <Link href="/dashboard/teams/new">
                  <Card className="border-2 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer transition-colors">
                    <CardContent className="p-4 flex items-center justify-center min-h-[120px]">
                      <div className="text-center">
                        <Plus className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">새 팀 추가</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
            </div>

            {agents.length === 0 && (
              <Card>
                <CardContent className="text-center py-12">
                  <Users className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    팀을 만들려면 먼저 에이전트가 필요합니다
                  </h3>
                  <p className="text-gray-600 mb-4">
                    "팀원 만들기" 탭에서 AI 에이전트를 먼저 생성해주세요.
                  </p>
                  <Button onClick={() => setActiveTab("agents")}>
                    <User className="h-4 w-4 mr-2" />
                    팀원 만들기로 이동
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
