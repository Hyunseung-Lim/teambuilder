"use client";

import { useState, useEffect } from "react";
import { createTeamAction } from "@/actions/team.actions";
import { getUserAgentsAction } from "@/actions/agent.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AIAgent, AgentRole, TeamMember } from "@/lib/types";
import { User, Users, Plus } from "lucide-react";

const AGENT_ROLES: AgentRole[] = [
  "아이디어 제안하기",
  "아이디어 디벨롭하기",
  "아이디어 평가하기",
  "아이디어 삭제하기",
  "논의하기",
  "피드백하기",
];

export default function NewTeamPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<TeamMember[]>([]);
  const [teamName, setTeamName] = useState("");
  const [step, setStep] = useState(1); // 1: 에이전트 선택, 2: 역할 부여, 3: 팀 이름

  useEffect(() => {
    async function loadAgents() {
      try {
        const userAgents = await getUserAgentsAction();
        setAgents(userAgents);
      } catch (error) {
        setError("에이전트를 불러오는데 실패했습니다.");
      }
    }
    loadAgents();
  }, []);

  const toggleAgentSelection = (agentId: string) => {
    setSelectedMembers((prev) => {
      const isSelected = prev.some((member) => member.agentId === agentId);
      if (isSelected) {
        return prev.filter((member) => member.agentId !== agentId);
      } else {
        return [...prev, { agentId, roles: [] }];
      }
    });
  };

  const toggleRole = (agentId: string, role: AgentRole) => {
    setSelectedMembers((prev) =>
      prev.map((member) => {
        if (member.agentId === agentId) {
          const hasRole = member.roles.includes(role);
          return {
            ...member,
            roles: hasRole
              ? member.roles.filter((r) => r !== role)
              : [...member.roles, role],
          };
        }
        return member;
      })
    );
  };

  const canProceedToRoles = selectedMembers.length > 0;
  const canProceedToName = selectedMembers.every(
    (member) => member.roles.length > 0
  );

  async function onSubmit() {
    if (!teamName.trim()) {
      setError("팀 이름을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await createTeamAction({
        teamName: teamName.trim(),
        members: selectedMembers,
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "팀 생성에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (agents.length === 0 && !error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="text-center py-12">
            <User className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              에이전트가 없습니다
            </h3>
            <p className="text-gray-600 mb-4">
              팀을 만들기 전에 먼저 AI 에이전트를 생성해주세요.
            </p>
            <Button
              onClick={() => (window.location.href = "/dashboard/agents/new")}
            >
              에이전트 만들기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">새 팀 만들기</h1>
        <p className="text-gray-600">
          AI 에이전트들을 선택하고 역할을 부여하여 팀을 구성해보세요.
        </p>
      </div>

      {/* 단계 표시기 */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-4">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
              step >= 1 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            1
          </div>
          <div
            className={`h-1 w-16 ${step >= 2 ? "bg-gray-900" : "bg-gray-200"}`}
          />
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
              step >= 2 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            2
          </div>
          <div
            className={`h-1 w-16 ${step >= 3 ? "bg-gray-900" : "bg-gray-200"}`}
          />
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
              step >= 3 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600"
            }`}
          >
            3
          </div>
        </div>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>1단계: 에이전트 선택</CardTitle>
            <CardDescription>
              팀에 포함할 AI 에이전트들을 선택해주세요. (
              {selectedMembers.length}명 선택됨)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {agents.map((agent) => {
                const isSelected = selectedMembers.some(
                  (member) => member.agentId === agent.id
                );
                return (
                  <div
                    key={agent.id}
                    className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => toggleAgentSelection(agent.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {agent.name}
                      </h3>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? "border-gray-900 bg-gray-900"
                            : "border-gray-300"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-1">
                      {agent.age}세, {agent.gender}
                    </p>
                    {agent.personality && (
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {agent.personality}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => window.history.back()}>
                취소
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canProceedToRoles}>
                다음: 역할 부여
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>2단계: 역할 부여</CardTitle>
            <CardDescription>
              선택된 각 에이전트에게 역할을 할당해주세요. (각 에이전트는 최소
              1개 역할이 필요합니다)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 mb-6">
              {selectedMembers.map((member) => {
                const agent = agents.find((a) => a.id === member.agentId);
                if (!agent) return null;

                return (
                  <div
                    key={agent.id}
                    className="border border-gray-200 rounded-xl p-4"
                  >
                    <h3 className="font-semibold text-gray-900 mb-3">
                      {agent.name}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {AGENT_ROLES.map((role) => {
                        const isAssigned = member.roles.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            className={`p-3 text-sm rounded-lg border-2 transition-all ${
                              isAssigned
                                ? "border-gray-900 bg-gray-900 text-white"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                            onClick={() => toggleRole(agent.id, role)}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                    {member.roles.length === 0 && (
                      <p className="text-sm text-red-600 mt-2">
                        최소 1개 역할을 선택해주세요
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                이전: 에이전트 선택
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedToName}>
                다음: 팀 이름
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>3단계: 팀 이름</CardTitle>
            <CardDescription>팀의 이름을 정해주세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <Label htmlFor="teamName">팀 이름</Label>
                <Input
                  id="teamName"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="예: 크리에이티브 디자인 팀"
                  disabled={isLoading}
                />
              </div>

              {/* 팀 요약 */}
              <div className="bg-gray-50 p-4 rounded-xl">
                <h4 className="font-semibold text-gray-900 mb-2">
                  팀 구성 요약
                </h4>
                <div className="space-y-2">
                  {selectedMembers.map((member) => {
                    const agent = agents.find((a) => a.id === member.agentId);
                    if (!agent) return null;
                    return (
                      <div
                        key={agent.id}
                        className="flex justify-between text-sm"
                      >
                        <span className="font-medium">{agent.name}</span>
                        <span className="text-gray-600">
                          {member.roles.length}개 역할
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg mb-4">
                {error}
              </div>
            )}

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={isLoading}
              >
                이전: 역할 부여
              </Button>
              <Button
                onClick={onSubmit}
                disabled={isLoading || !teamName.trim()}
              >
                {isLoading ? "팀 생성 중..." : "팀 생성 완료"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
