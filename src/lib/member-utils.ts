import { Team, TeamMember, AIAgent, TeamMemberSlot } from "@/lib/types";

/**
 * 멤버 식별 및 관계 관리를 위한 유틸리티 함수들
 */

/**
 * 팀에서 멤버를 찾는 통합 함수
 */
export function findMemberById(team: Team, id: string): TeamMember | null {
  // 1. 직접 ID 매치 (사용자의 경우 "나")
  if (id === "나") {
    return team.members.find(m => m.isUser) || null;
  }

  // 2. agentId 매치 (null 체크 포함)
  const byAgentId = team.members.find(m => !m.isUser && m.agentId && m.agentId === id);
  if (byAgentId) return byAgentId;

  // 3. 사용자 이름 매치 (userProfile.name이 있는 경우만)
  const byUserName = team.members.find(m => m.isUser && m.userProfile?.name && m.userProfile.name === id);
  if (byUserName) return byUserName;

  // 4. 슬롯 ID 매치 (A, B, C, D 등) - 안전한 인덱스 체크
  if (id.match(/^[A-Z]$/)) {
    const memberIndex = id.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
    const aiMembers = team.members.filter(m => !m.isUser);
    if (memberIndex >= 0 && memberIndex < aiMembers.length) {
      return aiMembers[memberIndex];
    }
  }

  return null;
}

/**
 * 멤버의 실제 ID를 반환 (관계 저장용)
 */
export function getMemberActualId(member: TeamMember): string {
  if (member.isUser) {
    return "나";
  }
  
  // agentId가 없는 경우 슬롯 기반 임시 ID 생성
  if (!member.agentId) {
    // AI 멤버들 중에서 현재 멤버의 인덱스 찾기 (팀 컨텍스트 필요)
    console.warn('Member has no agentId, using fallback ID generation');
    return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
  
  return member.agentId;
}

/**
 * 멤버의 표시용 이름을 반환 (TeamMember 또는 TeamMemberSlot 모두 지원)
 */
export function getMemberDisplayName(member: TeamMember | TeamMemberSlot, agents?: AIAgent[]): string {
  if (member.isUser) {
    return (member as TeamMember).userProfile?.name || "나";
  }
  
  // AI 멤버의 경우 에이전트 이름 검색
  if (agents && member.agentId) {
    const agent = agents.find(a => a.id === member.agentId);
    if (agent?.name) {
      return agent.name;
    }
  }
  
  // 폴백: 기본 이름 반환
  const fallbackId = 'id' in member ? member.id : 'AI';
  return `팀원 ${fallbackId}`;
}

/**
 * 슬롯 ID에서 실제 ID로 매핑
 */
export function mapSlotIdToActualId(team: Team, slotId: string): string {
  const member = findMemberById(team, slotId);
  return member ? getMemberActualId(member) : slotId;
}

/**
 * 실제 ID에서 표시용 이름으로 매핑
 */
export function mapActualIdToDisplayName(team: Team, actualId: string, agents?: AIAgent[]): string {
  const member = findMemberById(team, actualId);
  return member ? getMemberDisplayName(member, agents) : actualId;
}

/**
 * 에이전트 ID를 실제 에이전트 이름으로 변환
 */
export async function resolveAgentIdToName(agentId: string): Promise<string> {
  if (agentId === "나") {
    return "나";
  }
  
  try {
    const { getAgentById } = await import("@/lib/redis");
    const agent = await getAgentById(agentId);
    return agent?.name || agentId;
  } catch (error) {
    console.warn(`Failed to resolve agent name for ID ${agentId}:`, error);
    return agentId;
  }
}

/**
 * 여러 에이전트 ID들을 이름으로 변환하는 유틸리티
 */
export async function resolveMultipleAgentIds(agentIds: string[]): Promise<{ [agentId: string]: string }> {
  const nameMap: { [agentId: string]: string } = {};
  
  await Promise.all(
    agentIds.map(async (agentId) => {
      nameMap[agentId] = await resolveAgentIdToName(agentId);
    })
  );
  
  return nameMap;
}

/**
 * 관계 생성을 위한 ID 매핑 헬퍼
 */
export function createMemberIdMapping(teamMembers: any[]): { [slotId: string]: string } {
  const mapping: { [slotId: string]: string } = {};
  
  // AI 멤버들을 먼저 필터링하여 인덱스 안정성 확보
  const aiMembers = teamMembers.filter(m => !m.isUser);
  
  teamMembers.forEach((member) => {
    if (member.isUser) {
      mapping["나"] = "나";
      // 사용자 슬롯 ID는 "나"로만 매핑 (중복 매핑 방지)
      if (member.id !== "나") {
        mapping[member.id] = "나";
      }
    } else {
      // agentId가 없는 경우 처리 개선
      const actualId = member.agentId || `slot_${member.id}`;
      
      // 슬롯 ID -> 실제 ID 매핑 (중복 방지)
      if (member.id && member.id !== actualId) {
        mapping[member.id] = actualId;
      }
      
      // A, B, C, D 슬롯 매핑 (안정적인 인덱스 사용)
      const letters = ["A", "B", "C", "D", "E", "F"];
      const aiMemberIndex = aiMembers.indexOf(member);
      if (aiMemberIndex >= 0 && aiMemberIndex < letters.length) {
        mapping[letters[aiMemberIndex]] = actualId;
      }
    }
  });
  
  return mapping;
}