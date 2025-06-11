"use client";

import { useState, useEffect, useRef } from "react";
import { createTeamAction } from "@/actions/team.actions";
import {
  getUserAgentsAction,
  createAgentAction,
} from "@/actions/agent.actions";
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
import {
  AIAgent,
  AgentRole,
  TeamMemberSlot,
  Relationship,
  RelationshipType,
} from "@/lib/types";
import { RelationshipGraph } from "@/components/RelationshipGraph";
import {
  User,
  Users,
  Plus,
  Crown,
  ArrowRight,
  CheckCircle,
  X,
} from "lucide-react";

const AVAILABLE_ROLES: AgentRole[] = [
  "아이디어 생성하기",
  "아이디어 평가하기",
  "피드백하기",
  "요청하기",
];

export default function NewTeamPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1); // 1: 팀정보, 2: 역할설계, 3: 팀원생성, 4: 관계설정
  const [existingAgents, setExistingAgents] = useState<AIAgent[]>([]);
  const [activeTab, setActiveTab] = useState<"create" | "import">("create");
  const [currentMemberIndex, setCurrentMemberIndex] = useState(0); // 현재 설정 중인 팀원 인덱스

  // 1단계: 팀 기본 정보
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(4); // 나 + AI 3명 = 총 4명 기본값

  // 2-4단계: 팀원 슬롯
  const [memberSlots, setMemberSlots] = useState<TeamMemberSlot[]>([]);

  // 4단계: 관계 설정
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  // 기존 에이전트 로드
  useEffect(() => {
    async function loadAgents() {
      try {
        const userAgents = await getUserAgentsAction();
        setExistingAgents(userAgents);
      } catch (error) {
        setError("기존 팀원을 불러오는데 실패했습니다.");
      }
    }
    loadAgents();
  }, []);

  // 팀 사이즈가 변경될 때 멤버 슬롯 업데이트
  useEffect(() => {
    const slots: TeamMemberSlot[] = [];
    const letters = ["A", "B", "C", "D", "E"];

    // 첫 번째는 항상 사용자 본인
    slots.push({
      id: "나",
      roles: [],
      isLeader: false, // 기본적으로 리더 없음
      isUser: true,
    });

    // 나머지는 AI 팀원들
    for (let i = 1; i < teamSize; i++) {
      slots.push({
        id: letters[i - 1],
        roles: [],
        isLeader: false,
        isUser: false,
      });
    }
    setMemberSlots(slots);
  }, [teamSize]);

  const updateMemberRole = (memberId: string, role: AgentRole) => {
    setMemberSlots((prev) =>
      prev.map((member) => {
        if (member.id === memberId) {
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

  const setLeader = (memberId: string | null) => {
    setMemberSlots((prev) =>
      prev.map((member) => ({
        ...member,
        isLeader: memberId === member.id,
      }))
    );
  };

  const updateMemberAgent = (
    memberId: string,
    agentData: TeamMemberSlot["agent"]
  ) => {
    setMemberSlots((prev) =>
      prev.map((member) =>
        member.id === memberId ? { ...member, agent: agentData } : member
      )
    );
  };

  // 단계별 진행 가능 여부 체크
  const canProceedToStep2 =
    teamName.trim().length > 0 && teamSize >= 3 && teamSize <= 6;

  // 모든 팀원이 최소 1개 역할을 가지고, 최소 1명은 '아이디어 생성하기' 역할을 가져야 함
  const hasAllRoles = memberSlots.every((member) => member.roles.length > 0);
  const hasIdeaGenerator = memberSlots.some((member) =>
    member.roles.includes("아이디어 생성하기")
  );
  const canProceedToStep3 = hasAllRoles && hasIdeaGenerator;

  const canProceedToStep4 = memberSlots
    .filter((member) => !member.isUser)
    .every((member) => member.agent);

  const canSubmit = true; // 관계 설정은 선택사항

  // AI 팀원들만 필터링
  const aiMembers = memberSlots.filter((member) => !member.isUser);
  const currentMember = aiMembers[currentMemberIndex];
  const isLastMember = currentMemberIndex === aiMembers.length - 1;
  const isFirstMember = currentMemberIndex === 0;

  const goToNextMember = () => {
    if (!isLastMember) {
      setCurrentMemberIndex((prev) => prev + 1);
    }
  };

  const goToPrevMember = () => {
    if (!isFirstMember) {
      setCurrentMemberIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // AI 팀원들만 실제 에이전트로 생성 (사용자 제외)
      const createdAgents: AIAgent[] = [];

      for (const member of memberSlots) {
        if (member.isUser || !member.agent) continue;

        const formData = new FormData();
        formData.append("name", member.agent.name);
        formData.append("age", member.agent.age.toString());
        formData.append("gender", member.agent.gender);
        formData.append("professional", member.agent.professional);
        formData.append("skills", member.agent.skills);
        formData.append("autonomy", member.agent.autonomy.toString());
        formData.append("personality", member.agent.personality);
        formData.append("value", member.agent.value);
        formData.append("designStyle", member.agent.designStyle);

        const createdAgent = await createAgentAction(formData);
        createdAgents.push(createdAgent);
      }

      // 팀 생성 (사용자는 agentId 없이, AI 팀원들만 agentId 포함)
      let agentIndex = 0;
      const teamMembers = memberSlots.map((member) => {
        if (member.isUser) {
          return {
            agentId: null, // 사용자는 agentId 없음
            roles: member.roles,
            isLeader: member.isLeader,
            isUser: true,
          };
        } else {
          return {
            agentId: createdAgents[agentIndex++].id,
            roles: member.roles,
            isLeader: member.isLeader,
            isUser: false,
          };
        }
      });

      const teamFormData = new FormData();
      teamFormData.append("teamName", teamName.trim());
      teamFormData.append("selectedAgents", JSON.stringify(teamMembers));
      teamFormData.append("relationships", JSON.stringify(relationships));

      await createTeamAction(teamFormData);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "팀 생성에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 관계 관리 함수들
  const addRelationship = (
    from: string,
    to: string,
    type: RelationshipType
  ) => {
    setRelationships((prev) => {
      // 같은 방향의 관계가 이미 있으면 타입만 업데이트
      const existingIndex = prev.findIndex(
        (rel) => rel.from === from && rel.to === to
      );
      if (existingIndex >= 0) {
        const newRels = [...prev];
        newRels[existingIndex] = { from, to, type };
        return newRels;
      }
      // 새 관계 추가
      return [...prev, { from, to, type }];
    });
  };

  const removeRelationship = (from: string, to: string) => {
    setRelationships((prev) =>
      prev.filter((rel) => !(rel.from === from && rel.to === to))
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">새 팀 만들기</h1>
        <p className="text-gray-600">
          체계적으로 팀을 설계하고 각 팀원을 생성해보세요.
        </p>
      </div>

      {/* 단계 표시기 */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-2">
          {[
            { num: 1, label: "팀 정보" },
            { num: 2, label: "역할 & 리더" },
            { num: 3, label: "팀원 생성" },
            { num: 4, label: "관계 설정" },
          ].map((stepInfo, index) => (
            <div key={stepInfo.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold ${
                    step >= stepInfo.num
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {step > stepInfo.num ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    stepInfo.num
                  )}
                </div>
                <span className="text-xs text-gray-600 mt-1">
                  {stepInfo.label}
                </span>
              </div>
              {index < 3 && (
                <ArrowRight
                  className={`h-4 w-4 mx-2 ${
                    step > stepInfo.num ? "text-blue-600" : "text-gray-300"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 1단계: 팀 기본 정보 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              1단계: 팀 기본 정보
            </CardTitle>
            <CardDescription>
              팀 이름과 함께할 AI 팀원 수를 정해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="teamName">팀 이름 *</Label>
              <Input
                id="teamName"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="예: 크리에이티브 디자인 팀"
                className="text-lg"
              />
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="teamSize">전체 팀원 구성 *</Label>
                <p className="text-sm text-gray-600 mb-3">
                  나 + AI 팀원으로 구성됩니다
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { total: 3, ai: 2 },
                  { total: 4, ai: 3 },
                  { total: 5, ai: 4 },
                  { total: 6, ai: 5 },
                ].map((config) => (
                  <button
                    key={config.total}
                    type="button"
                    onClick={() => setTeamSize(config.total)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      teamSize === config.total
                        ? "border-blue-500 bg-blue-50 shadow-md"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-gray-900">
                        총 {config.total}명
                      </span>
                      <div
                        className={`w-4 h-4 rounded-full border-2 ${
                          teamSize === config.total
                            ? "border-blue-500 bg-blue-500"
                            : "border-gray-300"
                        }`}
                      >
                        {teamSize === config.total && (
                          <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">
                      나 + AI 팀원 {config.ai}명
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 팀 구조 미리보기 */}
            {teamSize > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                <h4 className="font-semibold text-gray-900 mb-3">
                  팀 구조 미리보기
                </h4>
                <div className="flex gap-3 items-center">
                  {/* 사용자 본인 */}
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                      <User className="h-7 w-7 text-white" />
                    </div>
                    <span className="text-sm font-medium text-gray-900 mt-2">
                      나
                    </span>
                  </div>

                  {/* 플러스 아이콘 */}
                  <Plus className="h-5 w-5 text-gray-400 mx-2" />

                  {/* AI 팀원들 */}
                  {Array.from({ length: teamSize - 1 }, (_, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center shadow-lg">
                        <span className="font-bold text-white text-lg">
                          {String.fromCharCode(65 + i)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 mt-2">
                        팀원 {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-xs text-gray-600">(AI)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => window.history.back()}>
                취소
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canProceedToStep2}>
                다음: 역할 & 리더 설정
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2단계: 역할 설계 & 리더 선택 */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              2단계: 역할 설계 & 리더 선택
            </CardTitle>
            <CardDescription>
              팀원들의 역할을 할당하고 리더를 선택해주세요. (리더는
              선택사항입니다)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* 리더 선택 섹션 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                <Crown className="h-5 w-5 text-yellow-600" />
                리더 선택 (선택사항)
              </h3>
              <div className="flex flex-row gap-3">
                {/* 리더 없음 옵션 */}
                <button
                  type="button"
                  onClick={() => setLeader(null)}
                  className={`p-4 rounded-lg border-2 transition-all bg-white flex-1 ${
                    !memberSlots.some((m) => m.isLeader)
                      ? "border-yellow-500 text-yellow-700"
                      : "border-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-center">
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center mx-auto mb-2">
                      <X className="h-4 w-4 text-gray-600" />
                    </div>
                    <span className="text-sm font-medium">리더 없음</span>
                  </div>
                </button>

                {/* 팀원들 */}
                {memberSlots.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setLeader(member.id)}
                    className={`p-4 border-2 rounded-lg transition-all flex-1 bg-white ${
                      member.isLeader
                        ? "border-yellow-500 text-yellow-700"
                        : "border-white hover:border-gray-300"
                    }`}
                  >
                    <div className="text-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 ${
                          member.isUser ? "bg-green-500" : "bg-blue-500"
                        }`}
                      >
                        {member.isUser ? (
                          <User className="h-4 w-4 text-white" />
                        ) : (
                          <span className="text-white text-sm font-bold">
                            {member.id}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium">
                        {member.isUser ? "나" : `팀원 ${member.id}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 역할 할당 섹션 */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                역할 할당
              </h3>

              {/* 역할 요구사항 안내 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">💡 안내:</span> 아이디어
                  생성하기는 1명 이상이 꼭 맡아야 합니다.
                </p>
              </div>

              <div className="space-y-6">
                {memberSlots.map((member) => (
                  <div
                    key={member.id}
                    className="border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          member.isLeader
                            ? "bg-yellow-500"
                            : member.isUser
                            ? "bg-green-500"
                            : "bg-blue-500"
                        }`}
                      >
                        {member.isLeader && (
                          <Crown className="h-5 w-5 text-white" />
                        )}
                        {!member.isLeader && member.isUser && (
                          <User className="h-5 w-5 text-white" />
                        )}
                        {!member.isLeader && !member.isUser && (
                          <span className="font-bold text-white">
                            {member.id}
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {member.isUser ? "나" : `팀원 ${member.id}`}
                          {member.isLeader && " (리더)"}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {member.roles.length}개 역할 선택됨
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {AVAILABLE_ROLES.map((role) => {
                        const isSelected = member.roles.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => updateMemberRole(member.id, role)}
                            className={`p-3 text-sm rounded-lg border-2 transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
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
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                이전: 팀 정보
              </Button>
              <div className="text-right">
                {!hasIdeaGenerator && (
                  <p className="text-sm text-red-600 mb-2">
                    아이디어 생성하기 역할을 1명 이상 선택해주세요
                  </p>
                )}
                <Button
                  onClick={() => setStep(3)}
                  disabled={!canProceedToStep3}
                >
                  다음: 팀원 생성
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3단계: AI 팀원 생성 */}
      {step === 3 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                3단계: AI 팀원 생성
              </CardTitle>
              <CardDescription>
                새로운 AI 팀원을 생성하거나 기존 팀원을 가져와서 팀을
                구성해주세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 사용자 본인 정보 표시 */}
              {memberSlots
                .filter((member) => member.isUser)
                .map((member) => (
                  <div
                    key={member.id}
                    className="border-2 border-green-200 bg-green-50 rounded-xl p-4 mb-6"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          member.isLeader ? "bg-yellow-500" : "bg-green-500"
                        }`}
                      >
                        {member.isLeader && (
                          <Crown className="h-5 w-5 text-white" />
                        )}
                        {!member.isLeader && (
                          <User className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          나 {member.isLeader && "(리더)"}
                        </h3>
                        <p className="text-sm text-gray-600">
                          역할: {member.roles.join(", ")}
                        </p>
                        <p className="text-sm text-green-700 font-medium mt-1">
                          ✓ 본인 정보는 자동으로 설정됩니다
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

              {/* 진행 상황 표시 */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">
                    AI 팀원 설정 진행상황
                  </h3>
                  <span className="text-sm text-gray-600">
                    {currentMemberIndex + 1} / {aiMembers.length}
                  </span>
                </div>

                {/* 완료된 팀원 요약 */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {aiMembers.map((member, index) => {
                    const isCompleted = !!member.agent;
                    const isCurrent = index === currentMemberIndex;

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => setCurrentMemberIndex(index)}
                        className={`p-2 rounded-lg border-2 transition-all text-left ${
                          isCurrent
                            ? "border-blue-500 bg-blue-50"
                            : isCompleted
                            ? "border-green-200 bg-green-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              member.isLeader
                                ? "bg-yellow-500 text-white"
                                : isCurrent
                                ? "bg-blue-500 text-white"
                                : isCompleted
                                ? "bg-green-500 text-white"
                                : "bg-gray-300 text-gray-600"
                            }`}
                          >
                            {member.isLeader && <Crown className="h-3 w-3" />}
                            {!member.isLeader && member.id}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-gray-900">
                              팀원 {member.id}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {isCompleted ? member.agent?.name : "미설정"}
                            </div>
                          </div>
                          {isCompleted && (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 현재 팀원 설정 */}
              {currentMember && (
                <Card className="border-2 border-blue-200 bg-blue-50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          currentMember.isLeader
                            ? "bg-yellow-500"
                            : "bg-blue-500"
                        }`}
                      >
                        {currentMember.isLeader && (
                          <Crown className="h-6 w-6 text-white" />
                        )}
                        {!currentMember.isLeader && (
                          <span className="font-bold text-white text-lg">
                            {currentMember.id}
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-gray-900">
                          팀원 {currentMember.id}{" "}
                          {currentMember.isLeader && "(리더)"}
                        </h4>
                        <p className="text-gray-600">
                          역할: {currentMember.roles.join(", ")}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="bg-white rounded-lg">
                    {/* 탭 네비게이션 */}
                    <div className="flex border-b border-gray-200 mb-6">
                      <button
                        type="button"
                        onClick={() => setActiveTab("create")}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === "create"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        새로 생성
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("import")}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === "import"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        기존 팀원 선택 ({existingAgents.length})
                      </button>
                    </div>

                    {/* 새 팀원 생성 탭 */}
                    {activeTab === "create" && (
                      <div>
                        <AgentCreateForm
                          roles={currentMember.roles}
                          isLeader={currentMember.isLeader}
                          onSubmit={(agentData) =>
                            updateMemberAgent(currentMember.id, agentData)
                          }
                          initialData={currentMember.agent}
                        />
                      </div>
                    )}

                    {/* 기존 팀원 가져오기 탭 */}
                    {activeTab === "import" && (
                      <div>
                        {existingAgents.length === 0 ? (
                          <div className="text-center py-8">
                            <User className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              아직 생성된 팀원이 없습니다
                            </h3>
                            <p className="text-gray-600 mb-4">
                              새로 생성하거나 다른 팀원을 먼저 만들어주세요.
                            </p>
                            <Button
                              onClick={() => setActiveTab("create")}
                              variant="outline"
                            >
                              새로 생성하기
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-gray-600 mb-4">
                              기존에 생성한 팀원을 선택하여 이 자리에
                              배치하세요.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {existingAgents.map((agent) => {
                                const isSelected =
                                  currentMember.agent &&
                                  currentMember.agent.name === agent.name &&
                                  currentMember.agent.age === agent.age &&
                                  currentMember.agent.professional ===
                                    agent.professional;

                                return (
                                  <button
                                    key={agent.id}
                                    type="button"
                                    onClick={() =>
                                      updateMemberAgent(currentMember.id, {
                                        name: agent.name,
                                        age: agent.age,
                                        gender: agent.gender,
                                        professional: agent.professional,
                                        skills: agent.skills,
                                        autonomy: agent.autonomy,
                                        personality: agent.personality,
                                        value: agent.value,
                                        designStyle: agent.designStyle,
                                      })
                                    }
                                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                                      isSelected
                                        ? "border-blue-500 bg-blue-50"
                                        : "border-gray-200 hover:border-gray-300"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                                        <User className="h-5 w-5 text-white" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <h5 className="font-semibold text-gray-900">
                                          {agent.name}
                                        </h5>
                                        <p className="text-sm text-gray-600">
                                          {agent.professional}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {agent.age}세, {agent.gender}
                                        </p>
                                      </div>
                                      {isSelected && (
                                        <CheckCircle className="h-6 w-6 text-blue-500 flex-shrink-0" />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 팀원 간 이동 버튼 */}
              <div className="flex justify-between items-center py-4">
                <Button
                  variant="outline"
                  onClick={goToPrevMember}
                  disabled={isFirstMember}
                  className="flex items-center gap-2"
                >
                  <ArrowRight className="h-4 w-4 rotate-180" />
                  이전 팀원
                </Button>

                <div className="text-sm text-gray-600">
                  팀원 {currentMember?.id} ({currentMemberIndex + 1}/
                  {aiMembers.length})
                </div>

                <Button
                  variant="outline"
                  onClick={goToNextMember}
                  disabled={isLastMember}
                  className="flex items-center gap-2"
                >
                  다음 팀원
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg mt-6">
                  {error}
                </div>
              )}

              <div className="flex justify-between pt-6 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={isLoading}
                >
                  이전: 역할 설계 & 리더 선택
                </Button>
                <Button
                  onClick={() => setStep(4)}
                  disabled={isLoading || !canProceedToStep4}
                >
                  {canProceedToStep4
                    ? "다음: 관계 설정"
                    : "팀원 생성을 완료해주세요"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 4단계: 관계 설정 */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              4단계: 팀원 관계 설정
            </CardTitle>
            <CardDescription>
              팀원들 간의 관계를 설정해서 더 현실적인 팀 다이나믹을
              만들어보세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RelationshipGraph
              members={memberSlots}
              relationships={relationships}
              onAddRelationship={addRelationship}
              onRemoveRelationship={removeRelationship}
            />

            <div className="flex justify-between pt-6 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => setStep(3)}
                disabled={isLoading}
              >
                이전: 팀원 생성
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading || !canSubmit}>
                {isLoading ? "팀 생성 중..." : "팀 생성 완료"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 팀원별 생성 폼 컴포넌트
function AgentCreateForm({
  roles,
  isLeader,
  onSubmit,
  initialData,
}: {
  roles: AgentRole[];
  isLeader: boolean;
  onSubmit: (data: TeamMemberSlot["agent"]) => void;
  initialData?: TeamMemberSlot["agent"];
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    age: initialData?.age?.toString() || "",
    gender: initialData?.gender || "",
    professional: initialData?.professional || "",
    skills: initialData?.skills || "",
    autonomy: initialData?.autonomy?.toString() || "",
    personality: initialData?.personality || "",
    value: initialData?.value || "",
    designStyle: initialData?.designStyle || "",
  });

  const [isCompleted, setIsCompleted] = useState(!!initialData);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.name ||
      !formData.age ||
      !formData.gender ||
      !formData.professional ||
      !formData.skills ||
      !formData.autonomy
    ) {
      return;
    }

    const agentData = {
      name: formData.name,
      age: parseInt(formData.age),
      gender: formData.gender as any,
      professional: formData.professional,
      skills: formData.skills,
      autonomy: parseInt(formData.autonomy),
      personality: formData.personality,
      value: formData.value,
      designStyle: formData.designStyle,
    };

    onSubmit(agentData);
    setIsCompleted(true);
  };

  if (isCompleted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle className="h-5 w-5" />
          <span className="font-medium">팀원 정보 입력 완료</span>
        </div>
        <div className="mt-2 text-sm text-green-700">
          {formData.name} ({formData.professional})
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsCompleted(false)}
          className="mt-2"
        >
          수정하기
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">이름 *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="예: 김창의"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="age">나이 *</Label>
          <Input
            id="age"
            type="number"
            min="1"
            max="100"
            value={formData.age}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, age: e.target.value }))
            }
            placeholder="28"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="gender">성별 *</Label>
          <Select
            id="gender"
            value={formData.gender}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, gender: e.target.value }))
            }
            required
          >
            <option value="">선택해주세요</option>
            <option value="여자">여자</option>
            <option value="남자">남자</option>
            <option value="정의하지 않음">정의하지 않음</option>
            <option value="알 수 없음">알 수 없음</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="professional">직업/전문성 *</Label>
          <Input
            id="professional"
            value={formData.professional}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, professional: e.target.value }))
            }
            placeholder="예: 크리에이티브 디렉터"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="skills">스킬셋 *</Label>
        <Textarea
          id="skills"
          value={formData.skills}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, skills: e.target.value }))
          }
          placeholder="예: 브랜딩, 컨셉 기획, 팀 리더십, Adobe Creative Suite"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="autonomy">자율성 *</Label>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, autonomy: level.toString() }))
              }
              className={`p-2 text-sm rounded border-2 transition-all ${
                formData.autonomy === level.toString()
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-bold">{level}</div>
              <div className="text-xs">
                {level === 1
                  ? "낮음"
                  : level === 3
                  ? "보통"
                  : level === 5
                  ? "높음"
                  : ""}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="personality">성격</Label>
        <Textarea
          id="personality"
          value={formData.personality}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, personality: e.target.value }))
          }
          placeholder="예: 열정적이고 도전적인 성격으로 새로운 아이디어에 열려있음"
        />
      </div>

      <Button type="submit" className="w-full">
        팀원 생성 완료
      </Button>
    </form>
  );
}
