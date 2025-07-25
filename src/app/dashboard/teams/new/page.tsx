"use client";

import { useState, useEffect } from "react";
import { createTeamAction, getUserTeamsAction } from "@/actions/team.actions";
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
  Team,
} from "@/lib/types";
import { createMemberIdMapping } from "@/lib/member-utils";
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

const PROFESSION_OPTIONS = [
  "프로덕트 매니저",
  "UX/UI 디자이너",
  "소프트웨어 엔지니어",
  "데이터 분석가",
  "마케팅 전문가",
  "비즈니스 분석가",
  "그래픽 디자이너",
  "콘텐츠 전략가",
  "프로젝트 매니저",
  "연구원"
];

const SKILL_OPTIONS = [
  "창의 기획",
  "브레인스토밍",
  "문제 해결 분석",
  "디자인 씽킹 방법론",
  "기획 및 전략 수립",
  "컨셉 설계",
  "콘텐츠 스토리텔링",
  "시각화 및 인포그래픽",
  "프로젝트 관리",
  "데이터 분석",
  "UI/UX 디자인",
  "사용자 리서치",
  "프로토타이핑",
  "팀 리더십",
  "커뮤니케이션",
  "프레젠테이션"
];

const MAJOR_OPTIONS = [
  "컴퓨터공학",
  "산업디자인",
  "경영학",
  "심리학",
  "마케팅학",
  "시각디자인",
  "정보시스템",
  "통계학",
  "언론정보학",
  "UI/UX디자인",
  "그래픽디자인",
  "제품디자인"
];

export default function NewTeamPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0: 팀 생성 방식 선택, 1: 팀정보, 2: 관계설정, 3: 역할설계, 4: 팀원생성, 5: 공유 멘탈 모델
  const [existingAgents, setExistingAgents] = useState<AIAgent[]>([]);
  const [existingTeams, setExistingTeams] = useState<Team[]>([]);
  const [useTemplate, setUseTemplate] = useState(false); // 기존 팀 템플릿 사용 여부
  const [activeTab, setActiveTab] = useState<"create" | "import">("create");
  const [currentMemberIndex, setCurrentMemberIndex] = useState(0); // 현재 설정 중인 팀원 인덱스

  // 1단계: 팀 기본 정보
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(4); // 나 + AI 3명 = 총 4명 기본값
  const [topic, setTopic] = useState(""); // 아이디에이션 주제 추가

  // 2-4단계: 팀원 슬롯
  const [memberSlots, setMemberSlots] = useState<TeamMemberSlot[]>([]);

  // 2단계: 관계 설정
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [nodePositions, setNodePositions] = useState<{
    [key: string]: { x: number; y: number };
  }>({});

  // 5단계: 공유 멘탈 모델
  const [sharedMentalModel, setSharedMentalModel] = useState("");

  // 기존 에이전트 및 팀 로드
  useEffect(() => {
    async function loadData() {
      try {
        const [userAgents, userTeams] = await Promise.all([
          getUserAgentsAction(),
          getUserTeamsAction(),
        ]);
        setExistingAgents(userAgents);
        setExistingTeams(userTeams);
      } catch (error) {
        setError("기존 데이터를 불러오는데 실패했습니다.");
      }
    }
    loadData();
  }, []);

  // 팀 사이즈가 변경될 때 멤버 슬롯 업데이트
  useEffect(() => {
    setMemberSlots((prevSlots) => {
      const newSlots: TeamMemberSlot[] = [];
      const letters = ["A", "B", "C", "D", "E"];

      // 1. 사용자 슬롯은 항상 존재하며 정보 유지
      const userSlot = prevSlots.find((s) => s.isUser) || {
        id: "나",
        roles: [],
        isLeader: false,
        isUser: true,
      };
      newSlots.push(userSlot);

      // 2. AI 팀원 슬롯 조절
      for (let i = 1; i < teamSize; i++) {
        const id = letters[i - 1];
        const existingSlot = prevSlots.find((s) => s.id === id);
        if (existingSlot) {
          // 기존 정보 유지
          newSlots.push(existingSlot);
        } else {
          // 새 슬롯 추가
          newSlots.push({
            id,
            roles: [],
            isLeader: false,
            isUser: false,
          });
        }
      }

      // 3. 리더가 팀 크기 밖으로 벗어난 경우 리더 초기화
      const leaderExistsInNewSlots = newSlots.some((s) => s.isLeader);
      if (!leaderExistsInNewSlots) {
        return newSlots.map((s) => ({ ...s, isLeader: false }));
      }

      return newSlots;
    });
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
    agentData: TeamMemberSlot["agent"],
    agentId?: string | null
  ) => {
    setMemberSlots((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? { ...member, agent: agentData, agentId: agentId || null }
          : member
      )
    );
  };

  // 템플릿 적용 함수
  const applyTemplate = async (template: Team) => {
    try {
      setTeamName(`${template.teamName} (복사본)`);
      setTopic(template.topic || "");
      setTeamSize(template.members.length);
      setSharedMentalModel(template.sharedMentalModel || "");

      // 팀원 슬롯 복사 및 ID 매핑 생성
      const templateSlots: TeamMemberSlot[] = [];
      const memberIdMapping: { [oldId: string]: string } = {}; // 원본 ID -> 새 ID 매핑
      
      for (const member of template.members) {
        if (member.isUser) {
          templateSlots.push({
            id: "나",
            roles: member.roles,
            isLeader: member.isLeader,
            isUser: true,
            agent: member.userProfile ? { ...member.userProfile } : undefined, // 사용자 프로필 정보 복사
          });
          // 사용자의 경우 원본에서도 "나"였을 가능성이 높지만 안전하게 매핑
          memberIdMapping[member.agentId || "나"] = "나";
        } else {
          // AI 멤버의 경우 해당 에이전트 정보 찾기
          const agent = existingAgents.find(a => a.id === member.agentId);
          const letters = ["A", "B", "C", "D", "E"];
          const aiMemberIndex = templateSlots.filter(s => !s.isUser).length;
          const newId = letters[aiMemberIndex];
          
          templateSlots.push({
            id: newId,
            roles: member.roles,
            isLeader: member.isLeader,
            isUser: false,
            agent: agent ? { ...agent } : undefined,
            agentId: agent?.id || null,
          });
          
          // ID 매핑 저장 (agentId와 기존 관계에서 사용된 식별자들을 모두 매핑)
          if (member.agentId) {
            memberIdMapping[member.agentId] = newId;
          }
          // 기존 관계에서 사용된 다른 식별자들도 매핑 (예: 에이전트 이름 등)
          if (agent) {
            memberIdMapping[agent.name] = newId;
            memberIdMapping[`${agent.name}봇`] = newId;
          }
        }
      }
      
      // 관계 데이터 매핑 업데이트
      const mappedRelationships = (template.relationships || []).map(rel => ({
        ...rel,
        from: memberIdMapping[rel.from] || rel.from,
        to: memberIdMapping[rel.to] || rel.to,
      }));
      
      // 노드 위치 매핑 업데이트
      const mappedNodePositions: { [key: string]: { x: number; y: number } } = {};
      if (template.nodePositions) {
        Object.entries(template.nodePositions).forEach(([oldId, position]) => {
          const newId = memberIdMapping[oldId] || oldId;
          mappedNodePositions[newId] = position;
        });
      }
      
      setMemberSlots(templateSlots);
      setRelationships(mappedRelationships);
      setNodePositions(mappedNodePositions);
      setStep(1); // 팀 정보 단계로 이동
    } catch (error) {
      setError("템플릿 적용에 실패했습니다.");
    }
  };

  // 단계별 진행 가능 여부 체크
  const canProceedToStep2 =
    teamName.trim().length > 0 &&
    topic.trim().length > 0 &&
    teamSize >= 3 &&
    teamSize <= 6;

  // 모든 팀원이 최소 1개 역할을 가지고, 최소 1명은 '아이디어 생성하기' 역할을 가져야 함
  const hasAllRoles = memberSlots.every((member) => member.roles.length > 0);
  const hasIdeaGenerator = memberSlots.some((member) =>
    member.roles.includes("아이디어 생성하기")
  );
  const canProceedToStep3 = hasAllRoles && hasIdeaGenerator;

  const canProceedToStep4 = memberSlots
    .filter((member) => !member.isUser)
    .every((member) => member.agent);


  const canSubmit = sharedMentalModel.trim().length > 0; // 공유 멘탈 모델은 필수

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
      // 1. 새로 생성해야 할 AI 에이전트들을 먼저 생성
      const newAgentPromises = memberSlots
        .filter((member) => !member.isUser && !member.agentId && member.agent)
        .map((member) => {
          const formData = new FormData();
          // member.agent의 모든 속성을 formData에 추가
          Object.entries(member.agent!).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
              formData.append(key, String(value));
            }
          });
          return createAgentAction(formData).then((newAgent) => ({
            slotId: member.id,
            agentId: newAgent.id,
          }));
        });

      const newlyCreatedAgents = await Promise.all(newAgentPromises);

      // 2. 생성된 ID를 memberSlots에 다시 매핑
      const finalMemberSlots = memberSlots.map((slot) => {
        const newlyCreated = newlyCreatedAgents.find(
          (a) => a.slotId === slot.id
        );
        if (newlyCreated) {
          return { ...slot, agentId: newlyCreated.agentId };
        }
        return slot;
      });

      // 3. 최종 팀 멤버 데이터 구성 - 모든 슬롯 포함 (중복 허용)
      const teamMembers = finalMemberSlots.map((member) => ({
        agentId: member.isUser ? null : member.agentId,
        roles: member.roles,
        isLeader: member.isLeader,
        isUser: member.isUser,
        userProfile: member.isUser ? member.agent : undefined, // 사용자 프로필 정보 포함
      }));

      // 3.5. 관계 데이터를 실제 agentId로 매핑 (중앙화된 유틸리티 사용)
      const finalIdMapping = createMemberIdMapping(finalMemberSlots);

      const finalRelationships = relationships.map(rel => ({
        ...rel,
        from: finalIdMapping[rel.from] || rel.from,
        to: finalIdMapping[rel.to] || rel.to,
      }));

      // 4. 팀 생성 액션 호출

      const teamFormData = new FormData();
      teamFormData.append("teamName", teamName.trim());
      teamFormData.append("topic", topic.trim());
      teamFormData.append("members", JSON.stringify(teamMembers));
      teamFormData.append("relationships", JSON.stringify(finalRelationships));
      teamFormData.append("nodePositions", JSON.stringify(nodePositions));
      teamFormData.append("sharedMentalModel", sharedMentalModel.trim());

      const result = await createTeamAction(teamFormData);

      // 성공 응답 확인 및 리디렉션
      if (result.success && result.teamId) {
        window.location.href = "/";
      } else {
        throw new Error(result.error || "팀 생성에 실패했습니다.");
      }
    } catch (error) {
      // 실제 에러인 경우에만 에러 상태를 설정합니다.
      setError(
        error instanceof Error ? error.message : "팀 생성에 실패했습니다."
      );
      setIsLoading(false);
    }
  };

  // 관계 관리 함수들
  const addRelationship = (
    from: string,
    to: string,
    type: RelationshipType
  ) => {
    // member.id를 agentId 또는 "나"로 변환 (일관성 유지)
    const fromMember = memberSlots.find((m) => m.id === from);
    const toMember = memberSlots.find((m) => m.id === to);

    const fromId = fromMember?.isUser
      ? "나"
      : fromMember?.agentId || from; // agentId가 있으면 사용, 없으면 원래 ID(A,B,C,D)
    const toId = toMember?.isUser ? "나" : toMember?.agentId || to;

    setRelationships((prev) => {
      // 같은 방향의 관계가 이미 있으면 타입만 업데이트
      const existingIndex = prev.findIndex(
        (rel) => rel.from === fromId && rel.to === toId
      );
      if (existingIndex >= 0) {
        const newRels = [...prev];
        newRels[existingIndex] = { from: fromId, to: toId, type };
        return newRels;
      }
      // 새 관계 추가
      return [...prev, { from: fromId, to: toId, type }];
    });
  };

  const removeRelationship = (from: string, to: string) => {
    // 관계 데이터에서 직접 전달받은 ID를 사용 (템플릿에서 온 관계는 이미 올바른 형태)
    setRelationships((prev) =>
      prev.filter((rel) => !(rel.from === from && rel.to === to))
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">팀 만들기</h1>
        <p className="text-gray-600">
          {step === 0 
            ? "새로운 팀을 만들거나 기존 팀을 템플릿으로 사용하여 팀을 생성해보세요."
            : "체계적으로 팀을 설계하고 각 팀원을 생성해보세요."
          }
        </p>
      </div>

      {/* 단계 표시기 */}
      {step > 0 && (
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-2">
          {[
            { num: 1, label: "팀 정보" },
            { num: 2, label: "관계 설정" },
            { num: 3, label: "역할 & 리더" },
            { num: 4, label: "팀원 생성" },
            { num: 5, label: "공유 멘탈 모델" },
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
              {index < 4 && (
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
      )}

      {/* 0단계: 팀 생성 방식 선택 */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              팀 생성 방식 선택
            </CardTitle>
            <CardDescription>
              새로운 팀을 만들거나 기존 팀을 템플릿으로 사용하여 팀을 생성할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 새 팀 만들기 */}
              <button
                onClick={() => {
                  setUseTemplate(false);
                  setStep(1);
                }}
                className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all text-left"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                    <Plus className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">새 팀 만들기</h3>
                    <p className="text-sm text-gray-600">처음부터 새로운 팀 구성</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700">
                  팀 이름, 구성원, 역할 등을 직접 설정하여 완전히 새로운 팀을 만듭니다.
                </p>
              </button>

              {/* 기존 팀 템플릿 사용 */}
              <button
                onClick={() => {
                  setUseTemplate(true);
                }}
                disabled={existingTeams.length === 0}
                className={`p-6 border-2 rounded-xl transition-all text-left ${
                  existingTeams.length === 0
                    ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-50"
                    : "border-gray-200 hover:border-blue-300 hover:shadow-md"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">기존 팀 템플릿 사용</h3>
                    <p className="text-sm text-gray-600">
                      기존 팀을 기반으로 생성 ({existingTeams.length}개 팀 사용 가능)
                    </p>
                  </div>
                </div>
                <p className="text-sm text-gray-700">
                  기존에 만든 팀의 구성을 복사하여 새로운 팀을 빠르게 만듭니다.
                </p>
              </button>
            </div>

            {/* 기존 팀 목록 (템플릿 사용 선택 시) */}
            {useTemplate && existingTeams.length > 0 && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-4">템플릿으로 사용할 팀 선택</h4>
                <div className="grid grid-cols-1 gap-3">
                  {existingTeams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => applyTemplate(team)}
                      className="p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-semibold text-gray-900">{team.teamName}</h5>
                          <p className="text-sm text-gray-600 mt-1">{team.topic}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            팀원 {team.members.length}명 • 역할 {team.members.reduce((acc, m) => acc + m.roles.length, 0)}개
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => window.history.back()}>
                취소
              </Button>
              {!useTemplate && (
                <span className="text-sm text-gray-500 px-4 py-2">
                  생성 방식을 선택해주세요
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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

            <div className="space-y-2">
              <Label htmlFor="topic">아이디에이션 주제 *</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="예: Carbon Emission Reduction, 미래의 교육 시스템"
                className="text-lg"
              />
              <p className="text-sm text-gray-600">
                팀이 함께 토론하고 아이디어를 생성할 주제를 입력해주세요
              </p>
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
              <Button variant="outline" onClick={() => setStep(0)}>
                이전: 생성 방식 선택
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canProceedToStep2}>
                다음: 관계 설정
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3단계: 역할 설계 & 리더 선택 */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              3단계: 역할 설계 & 리더 선택
            </CardTitle>
            <CardDescription>
              팀원들의 역할을 할당하고 리더를 선택해주세요. (리더는
              선택사항입니다)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* 팀 관계 네트워크 미리보기 */}
            {relationships.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-2">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2 px-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  설정된 팀 관계
                </h3>
                <div className="scale-90 origin-top">
                  <RelationshipGraph
                    members={memberSlots}
                    relationships={relationships}
                    onAddRelationship={() => {}} // 읽기 전용
                    agents={existingAgents}
                    onRemoveRelationship={() => {}} // 읽기 전용
                    readOnly={true}
                    initialNodePositions={nodePositions}
                  />
                </div>
              </div>
            )}

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
              <Button variant="outline" onClick={() => setStep(2)}>
                이전: 관계 설정
              </Button>
              <div className="text-right">
                {!hasIdeaGenerator && (
                  <p className="text-sm text-red-600 mb-2">
                    아이디어 생성하기 역할을 1명 이상 선택해주세요
                  </p>
                )}
                <Button
                  onClick={() => setStep(4)}
                  disabled={!canProceedToStep3}
                >
                  다음: 팀원 생성
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4단계: AI 팀원 생성 */}
      {step === 4 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                4단계: AI 팀원 생성
              </CardTitle>
              <CardDescription>
                새로운 AI 팀원을 생성하거나 기존 팀원을 가져와서 팀을
                구성해주세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 팀 관계 네트워크 미리보기 */}
              {relationships.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2 mb-6">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2 px-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    설정된 팀 관계
                  </h3>
                  <div className="scale-90 origin-top">
                    <RelationshipGraph
                      members={memberSlots}
                      relationships={relationships}
                      onAddRelationship={() => {}} // 읽기 전용
                      agents={existingAgents}
                      onRemoveRelationship={() => {}} // 읽기 전용
                      readOnly={true}
                      initialNodePositions={nodePositions}
                    />
                  </div>
                </div>
              )}

              {/* 사용자 본인 정보 입력 */}
              {memberSlots
                .filter((member) => member.isUser)
                .map((member) => (
                  <div
                    key={member.id}
                    className="border-2 border-green-200 bg-green-50 rounded-xl p-4 mb-6"
                  >
                    <div className="flex items-center gap-3 mb-4">
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
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">
                          나 {member.isLeader && "(리더)"}
                        </h3>
                        <p className="text-sm text-gray-600">
                          역할: {member.roles.join(", ")}
                        </p>
                      </div>
                    </div>

                    {/* 사용자 정보 입력 폼 */}
                    <UserInfoForm
                      initialData={member.agent}
                      onSubmit={(agentData) =>
                        updateMemberAgent(member.id, agentData, null)
                      }
                    />
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
                            updateMemberAgent(currentMember.id, agentData, null)
                          }
                          initialData={currentMember.agent}
                          memberKey={currentMember.id}
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

                                // Check if this agent is already used by another member
                                const usedByMember = memberSlots.find(
                                  (member) =>
                                    member.id !== currentMember.id &&
                                    member.agentId === agent.id
                                );
                                const isUsedByOtherMember = !!usedByMember;

                                return (
                                  <button
                                    key={agent.id}
                                    type="button"
                                    onClick={() =>
                                      !isUsedByOtherMember &&
                                      updateMemberAgent(
                                        currentMember.id,
                                        { ...agent },
                                        agent.id
                                      )
                                    }
                                    disabled={isUsedByOtherMember}
                                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                                      isUsedByOtherMember
                                        ? "border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed"
                                        : isSelected
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
                                        {isUsedByOtherMember && (
                                          <p className="text-xs text-red-500 mt-1">
                                            이미 {usedByMember?.isUser ? "나" : usedByMember?.id}에서 사용 중
                                          </p>
                                        )}
                                      </div>
                                      {isSelected && !isUsedByOtherMember && (
                                        <CheckCircle className="h-6 w-6 text-blue-500 flex-shrink-0" />
                                      )}
                                      {isUsedByOtherMember && (
                                        <X className="h-6 w-6 text-red-400 flex-shrink-0" />
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
                  <div className="whitespace-pre-line">{error}</div>
                </div>
              )}

              <div className="flex justify-between pt-6 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => setStep(3)}
                  disabled={isLoading}
                >
                  이전: 역할 설계 & 리더 선택
                </Button>
                <Button
                  onClick={() => setStep(5)}
                  disabled={isLoading || !canProceedToStep4}
                >
                  {canProceedToStep4
                    ? "다음: 공유 멘탈 모델"
                    : "팀원 생성을 완료해주세요"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2단계: 관계 설정 */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              2단계: 팀원 관계 설정
            </CardTitle>
            <CardDescription>
              팀원들 간의 관계를 설정해서 더 현실적인 팀 다이나믹을
              만들어보세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
              <p className="font-semibold mb-2">💡 사용법</p>
              <ul className="list-disc list-inside text-xs text-blue-700 mt-1 leading-normal">
                <li>"관계 연결하기" 버튼을 눌러 관계 설정을 시작하세요.</li>
                <li>노드를 클릭하여 관계를 만들고, 관계 종류를 선택하세요.</li>
                <li>생성된 관계선을 클릭하면 해당 관계가 삭제됩니다.</li>
                <li>노드를 드래그하여 위치를 자유롭게 바꿀 수 있습니다.</li>
              </ul>
            </div>
            <RelationshipGraph
              members={memberSlots}
              relationships={relationships}
              onAddRelationship={addRelationship}
              onRemoveRelationship={removeRelationship}
              initialNodePositions={nodePositions}
              onNodePositionChange={setNodePositions}
              agents={existingAgents}
            />

            <div className="flex justify-between pt-6 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={isLoading}
              >
                이전: 팀 정보
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={isLoading}
              >
                다음: 역할 & 리더
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5단계: 공유 멘탈 모델 */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              5단계: 공유 멘탈 모델
            </CardTitle>
            <CardDescription>
              팀의 공유 멘탈 모델을 설정해주세요. 이는 팀원들의 AI 에이전트에게
              반영됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
              <p className="font-semibold mb-2">💡 공유 멘탈 모델이란?</p>
              <p>
                공유 멘탈 모델(Shared Mental Model)은 팀 구성원들이 특정 과제나
                상황에 대해 유사한 지식, 신념, 가정을 공유하여 팀 활동의
                효율성을 높이는 개념입니다.
                <br />
                <br />
                아래에 팀이 공유하면 좋을 업무 관련 지식(과업을 수행하기 위한
                절차 및 전략, 업무에 대한 팀의 목표)과 팀 관련 지식(팀의
                갖추어야할 태도나 신념, 팀 동료에 대한 지식)을 작성해주세요.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sharedMentalModel">공유 멘탈 모델 *</Label>
              <Textarea
                id="sharedMentalModel"
                value={sharedMentalModel}
                onChange={(e) => setSharedMentalModel(e.target.value)}
                placeholder="예: 우리 팀은 사용자 중심의 혁신적인 아이디어를 추구합니다. 모든 구성원은 열린 소통을 통해 창의적인 사고를 공유하며, 실패를 두려워하지 않고 도전하는 문화를 지향합니다..."
                className="min-h-[200px]"
              />
              <p className="text-sm text-gray-600">
                팀의 목표, 가치관, 업무 방식, 팀 문화 등을 자유롭게
                작성해주세요.
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg">
                <div className="whitespace-pre-line">{error}</div>
              </div>
            )}

            <div className="flex justify-between pt-6 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => setStep(4)}
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

// 사용자 정보 입력 폼 컴포넌트 (자율성 제외)
function UserInfoForm({
  onSubmit,
  initialData,
}: {
  onSubmit: (data: TeamMemberSlot["agent"]) => void;
  initialData?: TeamMemberSlot["agent"];
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    age: initialData?.age?.toString() || "",
    gender: initialData?.gender || "",
    nationality: initialData?.nationality || "",
    major: initialData?.major || "",
    education: initialData?.education || "",
    professional: initialData?.professional || "",
    skills: initialData?.skills || "",
    personality: initialData?.personality || "",
    workStyle: initialData?.workStyle || "",
    preferences: initialData?.preferences || "",
    dislikes: initialData?.dislikes || "",
  });

  const [isCustomProfessional, setIsCustomProfessional] = useState(
    initialData?.professional ? !PROFESSION_OPTIONS.includes(initialData.professional) : false
  );
  const [isCustomMajor, setIsCustomMajor] = useState(
    initialData?.major ? !MAJOR_OPTIONS.includes(initialData.major) : false
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState("");
  const [isCompleted, setIsCompleted] = useState(!!initialData);

  // initialData가 변경될 때 폼 데이터 업데이트
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        age: initialData.age?.toString() || "",
        gender: initialData.gender || "",
        nationality: initialData.nationality || "",
        major: initialData.major || "",
        education: initialData.education || "",
        professional: initialData.professional || "",
        skills: initialData.skills || "",
        personality: initialData.personality || "",
        workStyle: initialData.workStyle || "",
        preferences: initialData.preferences || "",
        dislikes: initialData.dislikes || "",
      });
      
      // 기존 스킬 파싱
      if (initialData.skills) {
        const skillsArray = initialData.skills.split(",").map(s => s.trim()).filter(s => s);
        const predefinedSkills = skillsArray.filter(skill => SKILL_OPTIONS.includes(skill));
        const customSkillsArray = skillsArray.filter(skill => !SKILL_OPTIONS.includes(skill));
        
        setSelectedSkills(predefinedSkills);
        setCustomSkills(customSkillsArray);
      }
      
      setIsCompleted(true);
    }
  }, [initialData]);

  // 스킬 배열을 문자열로 변환하여 formData 업데이트
  useEffect(() => {
    const allSkills = [...selectedSkills, ...customSkills];
    setFormData(prev => ({ ...prev, skills: allSkills.join(", ") }));
  }, [selectedSkills, customSkills]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill) 
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const addCustomSkill = () => {
    if (newSkillInput.trim() && !customSkills.includes(newSkillInput.trim()) && !SKILL_OPTIONS.includes(newSkillInput.trim())) {
      setCustomSkills(prev => [...prev, newSkillInput.trim()]);
      setNewSkillInput("");
    }
  };

  const removeCustomSkill = (skill: string) => {
    setCustomSkills(prev => prev.filter(s => s !== skill));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      return;
    }

    const validGenders = [
      "여자",
      "남자",
      "정의하지 않음",
      "알 수 없음",
    ] as const;
    const genderValue =
      formData.gender && validGenders.includes(formData.gender as any)
        ? (formData.gender as (typeof validGenders)[number])
        : undefined;

    const agentData = {
      name: formData.name,
      age: formData.age ? parseInt(formData.age) : undefined,
      gender: genderValue,
      nationality: formData.nationality || undefined,
      major: formData.major || undefined,
      education: formData.education as
        | "고졸"
        | "대졸"
        | "석사"
        | "박사"
        | "기타"
        | undefined,
      professional: formData.professional,
      skills: formData.skills,
      personality: formData.personality || "",
      workStyle: formData.workStyle || "",
      preferences: formData.preferences || "",
      dislikes: formData.dislikes || "",
    };

    onSubmit(agentData);
    setIsCompleted(true);
  };

  if (isCompleted) {
    return (
      <div className="bg-white border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle className="h-5 w-5" />
          <span className="font-medium">내 정보 입력 완료</span>
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
          <Label htmlFor="user-name">이름 *</Label>
          <Input
            id="user-name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="예: 김민수"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-age">나이</Label>
          <Input
            id="user-age"
            type="number"
            min="1"
            max="100"
            value={formData.age}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, age: e.target.value }))
            }
            placeholder="28"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="user-gender">성별</Label>
          <Select
            id="user-gender"
            value={formData.gender}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, gender: e.target.value }))
            }
          >
            <option value="">선택해주세요</option>
            <option value="여자">여자</option>
            <option value="남자">남자</option>
            <option value="정의하지 않음">정의하지 않음</option>
            <option value="알 수 없음">알 수 없음</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-nationality">국적</Label>
          <Input
            id="user-nationality"
            value={formData.nationality}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, nationality: e.target.value }))
            }
            placeholder="예: 한국, 미국, 일본"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="user-major">전공</Label>
          <div className="space-y-2">
            <Select
              id="user-major"
              value={isCustomMajor ? "직접입력" : formData.major}
              onChange={(e) => {
                if (e.target.value === "직접입력") {
                  setIsCustomMajor(true);
                  setFormData((prev) => ({ ...prev, major: "" }));
                } else {
                  setIsCustomMajor(false);
                  setFormData((prev) => ({ ...prev, major: e.target.value }));
                }
              }}
            >
              <option value="">선택해주세요</option>
              {MAJOR_OPTIONS.map((major) => (
                <option key={major} value={major}>
                  {major}
                </option>
              ))}
              <option value="직접입력">직접 입력</option>
            </Select>
            {isCustomMajor && (
              <Input
                id="user-major-custom"
                value={formData.major}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, major: e.target.value }))
                }
                placeholder="전공을 직접 입력해주세요"
                autoFocus
              />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-education">교육 수준</Label>
          <Select
            id="user-education"
            value={formData.education}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, education: e.target.value }))
            }
          >
            <option value="">선택해주세요</option>
            <option value="고졸">고등학교 졸업</option>
            <option value="대졸">대학교 졸업</option>
            <option value="석사">석사 학위</option>
            <option value="박사">박사 학위</option>
            <option value="기타">기타</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-professional">직업/전문성</Label>
        <div className="space-y-2">
          <Select
            id="user-professional"
            value={isCustomProfessional ? "직접입력" : formData.professional}
            onChange={(e) => {
              if (e.target.value === "직접입력") {
                setIsCustomProfessional(true);
                setFormData((prev) => ({ ...prev, professional: "" }));
              } else {
                setIsCustomProfessional(false);
                setFormData((prev) => ({ ...prev, professional: e.target.value }));
              }
            }}
          >
            <option value="">선택해주세요</option>
            {PROFESSION_OPTIONS.map((profession) => (
              <option key={profession} value={profession}>
                {profession}
              </option>
            ))}
            <option value="직접입력">직접 입력</option>
          </Select>
          {isCustomProfessional && (
            <Input
              id="user-professional-custom"
              value={formData.professional}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, professional: e.target.value }))
              }
              placeholder="직업/전문성을 직접 입력해주세요"
              autoFocus
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-skills">스킬셋</Label>
        <div className="space-y-4">
          {/* 미리 정의된 스킬 옵션들 */}
          <div>
            <p className="text-sm text-gray-600 mb-3">아래 스킬 중에서 선택하세요 (클릭하여 선택/해제)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SKILL_OPTIONS.map((skill) => {
                const isSelected = selectedSkills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleSkill(skill);
                    }}
                    className={`p-2 text-sm rounded-lg border-2 transition-all text-left relative ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {skill}
                    {isSelected && (
                      <span className="absolute top-1 right-1 text-blue-500 text-xs">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 커스텀 스킬 추가 */}
          <div>
            <p className="text-sm text-gray-600 mb-2">또는 직접 스킬을 추가하세요</p>
            <div className="flex gap-2">
              <Input
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                placeholder="새로운 스킬 입력"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomSkill();
                  }
                }}
              />
              <Button
                type="button"
                onClick={addCustomSkill}
                variant="outline"
                size="sm"
              >
                추가
              </Button>
            </div>
          </div>

          {/* 선택된 스킬들 표시 */}
          {(selectedSkills.length > 0 || customSkills.length > 0) && (
            <div>
              <p className="text-sm text-gray-600 mb-2">선택된 스킬:</p>
              <div className="flex flex-wrap gap-2">
                {selectedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {customSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeCustomSkill(skill)}
                      className="text-green-600 hover:text-green-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-personality">성격</Label>
        <Textarea
          id="user-personality"
          value={formData.personality}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, personality: e.target.value }))
          }
          placeholder="예: 체계적이고 분석적인 성격으로 문제 해결을 좋아함"
        />
      </div>


      <div className="space-y-2">
        <Label htmlFor="user-workStyle">업무 방식(스타일)</Label>
        <Textarea
          id="user-workStyle"
          value={formData.workStyle}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, workStyle: e.target.value }))
          }
          placeholder="예: 체계적이고 계획적인 업무 방식을 선호함"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-preferences">선호하는 것</Label>
        <Textarea
          id="user-preferences"
          value={formData.preferences}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, preferences: e.target.value }))
          }
          placeholder="예: 미니멀하면서도 감각적인 디자인, 협업적인 환경"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-dislikes">싫어하는 것</Label>
        <Textarea
          id="user-dislikes"
          value={formData.dislikes}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, dislikes: e.target.value }))
          }
          placeholder="예: 지나치게 복잡한 인터페이스, 비효율적인 프로세스"
        />
      </div>

      <Button type="submit" className="w-full">
        <CheckCircle className="h-4 w-4 mr-2" />내 정보 저장
      </Button>
    </form>
  );
}

// 팀원별 생성 폼 컴포넌트
function AgentCreateForm({
  roles,
  isLeader,
  onSubmit,
  initialData,
  memberKey, // 폼 초기화 문제 해결을 위한 키
}: {
  roles: AgentRole[];
  isLeader: boolean;
  onSubmit: (data: TeamMemberSlot["agent"], agentId: string | null) => void;
  initialData?: TeamMemberSlot["agent"];
  memberKey?: string; // 멤버 식별을 위한 키
}) {
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    gender: "",
    nationality: "",
    major: "",
    education: "",
    professional: "",
    skills: "",
    personality: "",
    workStyle: "",
    preferences: "",
    dislikes: "",
  });

  const [isCustomProfessional, setIsCustomProfessional] = useState(false);
  const [isCustomMajor, setIsCustomMajor] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);

  // memberKey나 initialData가 변경될 때만 폼 데이터 업데이트
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        age: initialData.age?.toString() || "",
        gender: initialData.gender || "",
        nationality: initialData.nationality || "",
        major: initialData.major || "",
        education: initialData.education || "",
        professional: initialData.professional || "",
        skills: initialData.skills || "",
        personality: initialData.personality || "",
        workStyle: initialData.workStyle || "",
        preferences: initialData.preferences || "",
        dislikes: initialData.dislikes || "",
      });
      setIsCustomProfessional(initialData.professional ? !PROFESSION_OPTIONS.includes(initialData.professional) : false);
      setIsCustomMajor(initialData.major ? !MAJOR_OPTIONS.includes(initialData.major) : false);
      
      // 기존 스킬 파싱
      if (initialData.skills) {
        const skillsArray = initialData.skills.split(",").map(s => s.trim()).filter(s => s);
        const predefinedSkills = skillsArray.filter(skill => SKILL_OPTIONS.includes(skill));
        const customSkillsArray = skillsArray.filter(skill => !SKILL_OPTIONS.includes(skill));
        
        setSelectedSkills(predefinedSkills);
        setCustomSkills(customSkillsArray);
      }
      
      setIsCompleted(true);
    } else {
      // 새로운 멤버로 변경될 때 폼 초기화
      setFormData({
        name: "",
        age: "",
        gender: "",
        nationality: "",
        major: "",
        education: "",
        professional: "",
        skills: "",
        personality: "",
        workStyle: "",
        preferences: "",
        dislikes: "",
      });
      setIsCustomProfessional(false);
      setIsCustomMajor(false);
      setSelectedSkills([]);
      setCustomSkills([]);
      setNewSkillInput("");
      setIsCompleted(false);
    }
  }, [memberKey, initialData]);

  // 스킬 배열을 문자열로 변환하여 formData 업데이트
  useEffect(() => {
    const allSkills = [...selectedSkills, ...customSkills];
    setFormData(prev => ({ ...prev, skills: allSkills.join(", ") }));
  }, [selectedSkills, customSkills]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill) 
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  };

  const addCustomSkill = () => {
    if (newSkillInput.trim() && !customSkills.includes(newSkillInput.trim()) && !SKILL_OPTIONS.includes(newSkillInput.trim())) {
      setCustomSkills(prev => [...prev, newSkillInput.trim()]);
      setNewSkillInput("");
    }
  };

  const removeCustomSkill = (skill: string) => {
    setCustomSkills(prev => prev.filter(s => s !== skill));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      return;
    }

    const validGenders = [
      "여자",
      "남자",
      "정의하지 않음",
      "알 수 없음",
    ] as const;
    const genderValue =
      formData.gender && validGenders.includes(formData.gender as any)
        ? (formData.gender as (typeof validGenders)[number])
        : undefined;

    const agentData = {
      name: formData.name,
      age: formData.age ? parseInt(formData.age) : undefined,
      gender: genderValue,
      nationality: formData.nationality || undefined,
      major: formData.major || undefined,
      education: formData.education as
        | "고졸"
        | "대졸"
        | "석사"
        | "박사"
        | "기타"
        | undefined,
      professional: formData.professional,
      skills: formData.skills,
      personality: formData.personality || "",
      workStyle: formData.workStyle || "",
      preferences: formData.preferences || "",
      dislikes: formData.dislikes || "",
    };

    onSubmit(agentData, null);
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
          <Label htmlFor={`name-${memberKey}`}>이름 *</Label>
          <Input
            id={`name-${memberKey}`}
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="예: 김창의"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`age-${memberKey}`}>나이</Label>
          <Input
            id={`age-${memberKey}`}
            type="number"
            min="1"
            max="100"
            value={formData.age}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, age: e.target.value }))
            }
            placeholder="28"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`gender-${memberKey}`}>성별</Label>
          <Select
            id={`gender-${memberKey}`}
            value={formData.gender}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, gender: e.target.value }))
            }
          >
            <option value="">선택해주세요</option>
            <option value="여자">여자</option>
            <option value="남자">남자</option>
            <option value="정의하지 않음">정의하지 않음</option>
            <option value="알 수 없음">알 수 없음</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`nationality-${memberKey}`}>국적</Label>
          <Input
            id={`nationality-${memberKey}`}
            value={formData.nationality}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, nationality: e.target.value }))
            }
            placeholder="예: 한국, 미국, 일본"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`major-${memberKey}`}>전공</Label>
          <div className="space-y-2">
            <Select
              id={`major-${memberKey}`}
              value={isCustomMajor ? "직접입력" : formData.major}
              onChange={(e) => {
                if (e.target.value === "직접입력") {
                  setIsCustomMajor(true);
                  setFormData((prev) => ({ ...prev, major: "" }));
                } else {
                  setIsCustomMajor(false);
                  setFormData((prev) => ({ ...prev, major: e.target.value }));
                }
              }}
            >
              <option value="">선택해주세요</option>
              {MAJOR_OPTIONS.map((major) => (
                <option key={major} value={major}>
                  {major}
                </option>
              ))}
              <option value="직접입력">직접 입력</option>
            </Select>
            {isCustomMajor && (
              <Input
                id={`major-custom-${memberKey}`}
                value={formData.major}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, major: e.target.value }))
                }
                placeholder="전공을 직접 입력해주세요"
                autoFocus
              />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`education-${memberKey}`}>교육 수준</Label>
          <Select
            id={`education-${memberKey}`}
            value={formData.education}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, education: e.target.value }))
            }
          >
            <option value="">선택해주세요</option>
            <option value="고졸">고등학교 졸업</option>
            <option value="대졸">대학교 졸업</option>
            <option value="석사">석사 학위</option>
            <option value="박사">박사 학위</option>
            <option value="기타">기타</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`professional-${memberKey}`}>직업/전문성</Label>
        <div className="space-y-2">
          <Select
            id={`professional-${memberKey}`}
            value={isCustomProfessional ? "직접입력" : formData.professional}
            onChange={(e) => {
              if (e.target.value === "직접입력") {
                setIsCustomProfessional(true);
                setFormData((prev) => ({ ...prev, professional: "" }));
              } else {
                setIsCustomProfessional(false);
                setFormData((prev) => ({ ...prev, professional: e.target.value }));
              }
            }}
          >
            <option value="">선택해주세요</option>
            {PROFESSION_OPTIONS.map((profession) => (
              <option key={profession} value={profession}>
                {profession}
              </option>
            ))}
            <option value="직접입력">직접 입력</option>
          </Select>
          {isCustomProfessional && (
            <Input
              id={`professional-custom-${memberKey}`}
              value={formData.professional}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, professional: e.target.value }))
              }
              placeholder="직업/전문성을 직접 입력해주세요"
              autoFocus
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`skills-${memberKey}`}>스킬셋</Label>
        <div className="space-y-4">
          {/* 미리 정의된 스킬 옵션들 */}
          <div>
            <p className="text-sm text-gray-600 mb-3">아래 스킬 중에서 선택하세요 (클릭하여 선택/해제)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SKILL_OPTIONS.map((skill) => {
                const isSelected = selectedSkills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleSkill(skill);
                    }}
                    className={`p-2 text-sm rounded-lg border-2 transition-all text-left relative ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {skill}
                    {isSelected && (
                      <span className="absolute top-1 right-1 text-blue-500 text-xs">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 커스텀 스킬 추가 */}
          <div>
            <p className="text-sm text-gray-600 mb-2">또는 직접 스킬을 추가하세요</p>
            <div className="flex gap-2">
              <Input
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                placeholder="새로운 스킬 입력"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomSkill();
                  }
                }}
              />
              <Button
                type="button"
                onClick={addCustomSkill}
                variant="outline"
                size="sm"
              >
                추가
              </Button>
            </div>
          </div>

          {/* 선택된 스킬들 표시 */}
          {(selectedSkills.length > 0 || customSkills.length > 0) && (
            <div>
              <p className="text-sm text-gray-600 mb-2">선택된 스킬:</p>
              <div className="flex flex-wrap gap-2">
                {selectedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {customSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeCustomSkill(skill)}
                      className="text-green-600 hover:text-green-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`personality-${memberKey}`}>성격</Label>
        <Textarea
          id={`personality-${memberKey}`}
          value={formData.personality}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, personality: e.target.value }))
          }
          placeholder="예: 열정적이고 도전적인 성격으로 새로운 아이디어에 열려있음"
        />
      </div>


      <div className="space-y-2">
        <Label htmlFor={`workStyle-${memberKey}`}>업무 방식(스타일)</Label>
        <Textarea
          id={`workStyle-${memberKey}`}
          value={formData.workStyle}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, workStyle: e.target.value }))
          }
          placeholder="예: 체계적이고 계획적인 업무 방식을 선호함"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`preferences-${memberKey}`}>선호하는 것</Label>
        <Textarea
          id={`preferences-${memberKey}`}
          value={formData.preferences}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, preferences: e.target.value }))
          }
          placeholder="예: 미니멀하면서도 감각적인 디자인, 협업적인 환경"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`dislikes-${memberKey}`}>싫어하는 것</Label>
        <Textarea
          id={`dislikes-${memberKey}`}
          value={formData.dislikes}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, dislikes: e.target.value }))
          }
          placeholder="예: 지나치게 복잡한 인터페이스, 비효율적인 프로세스"
        />
      </div>

      <Button type="submit" className="w-full">
        <CheckCircle className="h-4 w-4 mr-2" />
        팀원 정보 저장
      </Button>
    </form>
  );
}
