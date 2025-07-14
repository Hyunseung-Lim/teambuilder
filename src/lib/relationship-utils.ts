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
    return null;
  }
  
  const normalizedFromId = getMemberActualId(fromMember);
  const normalizedToId = getMemberActualId(toMember);
  

  // 자기 자신과의 관계는 없음
  if (normalizedFromId === normalizedToId) {
    return null;
  }

  // 직접 관계 찾기
  const directRelationship = team.relationships.find(
    (rel) => rel.from === normalizedFromId && rel.to === normalizedToId
  );

  if (directRelationship) {
    return directRelationship.type;
  }

  // 역방향 관계 찾기 (상사-부하 관계의 경우)
  const reverseRelationship = team.relationships.find(
    (rel) => rel.from === normalizedToId && rel.to === normalizedFromId
  );

  if (reverseRelationship) {
    // 상사-부하 관계의 경우 역방향에서는 부하가 상사에게 요청하는 것
    if (reverseRelationship.type === "SUPERVISOR") {
      return "SUBORDINATE"; // 역방향에서는 SUBORDINATE로 표시
    }
    
    // 동료 관계는 양방향으로 동일
    if (reverseRelationship.type === "PEER") {
      return "PEER";
    }
    
    // 다른 관계 유형들도 역방향으로 처리
    return reverseRelationship.type;
  }

  // 관계가 없는 경우
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
  const relationshipType = getRelationshipType(fromId, toId, team);
  
  // 명시적 관계가 있는 경우 확인
  if (relationshipType) {
    // 상사-부하 관계(양방향), 동료 관계는 피드백 세션 생성 가능
    const canCreate = relationshipType === "SUPERVISOR" || relationshipType === "SUBORDINATE" || relationshipType === "PEER";
    return canCreate;
  }

  // 명시적 관계가 없는 경우: 관계가 정의되지 않았으므로 피드백 불허용
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
    return false;
  }

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
  const relationshipType = getRelationshipType(fromId, toId, team);
  
  // 명시적 관계가 있는 경우 확인
  if (relationshipType) {
    // 상사-부하 관계(양방향), 동료 관계는 요청 가능
    const canRequest = relationshipType === "SUPERVISOR" || relationshipType === "SUBORDINATE" || relationshipType === "PEER";
    return canRequest;
  }

  // 명시적 관계가 없는 경우: 관계가 정의되지 않았으므로 요청 불허용
  return false;
}

