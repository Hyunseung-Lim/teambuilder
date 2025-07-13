import { Team, RelationshipType } from "@/lib/types";
import { findMemberById, getMemberActualId } from "@/lib/member-utils";

/**
 * 두 팀원 간의 관계 타입을 조회합니다.
 */
export function getRelationshipType(
  fromId: string,
  toId: string,
  team: Team
): RelationshipType | null {
  // 멤버 ID 정규화 (중앙화된 유틸리티 사용)
  const fromMember = findMemberById(team, fromId);
  const toMember = findMemberById(team, toId);
  
  if (!fromMember || !toMember) {
    console.log(`❌ 멤버를 찾을 수 없음: ${fromId} 또는 ${toId}`);
    return null;
  }
  
  const normalizedFromId = getMemberActualId(fromMember);
  const normalizedToId = getMemberActualId(toMember);
  
  console.log(`🔍 관계 조회: ${fromId} (${normalizedFromId}) → ${toId} (${normalizedToId})`);
  console.log(`📊 전체 관계 목록 (${team.relationships.length}개):`, 
    team.relationships.map(rel => `${rel.from} → ${rel.to} (${rel.type})`));

  // 자기 자신과의 관계는 없음
  if (normalizedFromId === normalizedToId) {
    console.log(`❌ 동일한 ID: ${normalizedFromId}`);
    return null;
  }

  // 직접 관계 찾기
  const directRelationship = team.relationships.find(
    (rel) => rel.from === normalizedFromId && rel.to === normalizedToId
  );

  if (directRelationship) {
    console.log(`✅ 직접 관계 발견: ${normalizedFromId} → ${normalizedToId} (${directRelationship.type})`);
    return directRelationship.type;
  }

  // 역방향 관계 찾기 (상사-부하 관계의 경우)
  const reverseRelationship = team.relationships.find(
    (rel) => rel.from === normalizedToId && rel.to === normalizedFromId
  );

  if (reverseRelationship) {
    console.log(`🔄 역방향 관계 발견: ${normalizedToId} → ${normalizedFromId} (${reverseRelationship.type})`);
    
    // 상사-부하 관계의 경우 역방향에서는 부하가 상사에게 요청하는 것
    if (reverseRelationship.type === "SUPERVISOR") {
      console.log(`✅ 역방향 상사-부하 관계 적용: 부하가 상사에게 요청`);
      return "SUBORDINATE"; // 역방향에서는 SUBORDINATE로 표시
    }
    
    // 동료 관계는 양방향으로 동일
    if (reverseRelationship.type === "PEER") {
      console.log(`✅ 동료 관계 적용`);
      return "PEER";
    }
    
    // 다른 관계 유형들도 역방향으로 처리
    console.log(`✅ 역방향 관계 적용: ${reverseRelationship.type}`);
    return reverseRelationship.type;
  }

  // 관계가 없는 경우
  console.log(`❌ 관계 없음: ${normalizedFromId} ↔ ${normalizedToId}`);
  return null;
}

/**
 * 피드백 세션을 생성할 권한이 있는지 확인합니다.
 */
export function canCreateFeedbackSession(
  fromId: string,
  toId: string,
  team: Team
): boolean {
  console.log(`🎯 피드백 세션 권한 확인: ${fromId} → ${toId}`);
  
  const relationshipType = getRelationshipType(fromId, toId, team);
  console.log(`📋 관계 타입: ${relationshipType}`);
  
  // 명시적 관계가 있는 경우 확인
  if (relationshipType) {
    // 상사-부하 관계(양방향), 동료 관계는 피드백 세션 생성 가능
    const canCreate = relationshipType === "SUPERVISOR" || relationshipType === "SUBORDINATE" || relationshipType === "PEER";
    console.log(`${canCreate ? '✅' : '❌'} 피드백 세션 권한 (명시적 관계): ${relationshipType} → ${canCreate ? '가능' : '불가능'}`);
    return canCreate;
  }

  // 명시적 관계가 없는 경우: 관계가 정의되지 않았으므로 피드백 불허용
  console.log(`❌ 피드백 세션 권한: 명시적 관계가 필요함 (관계 없음)`);
  return false;
}

/**
 * 아이디어를 평가할 권한이 있는지 확인합니다.
 */
export function canEvaluateIdea(
  evaluatorId: string,
  ideaAuthorId: string,
  team: Team
): boolean {
  // 자기 자신의 아이디어는 평가할 수 없음
  if (evaluatorId === ideaAuthorId) {
    console.log(`❌ 평가 권한 없음: 자기 자신의 아이디어 (${evaluatorId})`);
    return false;
  }

  const relationshipType = getRelationshipType(evaluatorId, ideaAuthorId, team);
  console.log(`🔍 평가 권한 확인: ${evaluatorId} → ${ideaAuthorId}, 관계: ${relationshipType}`);
  
  // 아이디어 평가는 관계와 상관없이 모든 팀원이 가능하도록 변경
  // (자기 자신 제외)
  return true;
}

/**
 * 요청을 보낼 권한이 있는지 확인합니다.
 */
export function canMakeRequest(
  fromId: string,
  toId: string,
  team: Team
): boolean {
  console.log(`🎯 요청 권한 확인: ${fromId} → ${toId}`);
  
  const relationshipType = getRelationshipType(fromId, toId, team);
  console.log(`📋 관계 타입 결과: ${relationshipType}`);
  
  // 명시적 관계가 있는 경우 확인
  if (relationshipType) {
    // 상사-부하 관계(양방향), 동료 관계는 요청 가능
    const canRequest = relationshipType === "SUPERVISOR" || relationshipType === "SUBORDINATE" || relationshipType === "PEER";
    console.log(`${canRequest ? '✅' : '❌'} 요청 권한 (명시적 관계): ${relationshipType} → ${canRequest ? '가능' : '불가능'}`);
    return canRequest;
  }

  // 명시적 관계가 없는 경우: 관계가 정의되지 않았으므로 요청 불허용
  console.log(`❌ 요청 권한: 명시적 관계가 필요함 (관계 없음)`);
  return false;
}

