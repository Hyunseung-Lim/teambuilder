// 사용자 모델
export interface User {
  id: string; // 예: 'user_1a2b3c'
  email: string;
  password: string; // bcrypt로 해시화된 비밀번호
  name: string; // 필수 입력
  createdAt: Date;
}

// AI 에이전트 모델
export interface AIAgent {
  id: string; // 예: 'agent_x1y2z3'
  ownerId: string; // User.id 외래 키
  name: string;
  age: number;
  gender: "여자" | "남자" | "정의하지 않음" | "알 수 없음";
  personality: string; // 성격 (텍스트 설명)
  value: string; // 가치관 (텍스트 설명)
  designStyle: string; // 추구하는 디자인 (텍스트 설명)
  createdAt: Date;
}

// 팀 모델
export interface Team {
  id: string; // 예: 'team_a8b7c6'
  ownerId: string; // User.id 외래 키
  teamName: string;
  members: TeamMember[];
  createdAt: Date;
}

// 팀 멤버 (역할이 부여된 에이전트)
export interface TeamMember {
  agentId: string; // AIAgent.id 외래 키
  roles: AgentRole[];
}

// 에이전트 역할 타입
export type AgentRole =
  | "아이디어 제안하기"
  | "아이디어 디벨롭하기"
  | "아이디어 평가하기"
  | "아이디어 삭제하기"
  | "논의하기"
  | "피드백하기";

// 대화 로그 (미래 기능용)
export interface Conversation {
  id: string;
  teamId: string;
  messages: {
    sender: "user" | string; // 'user' 또는 agentId
    content: string;
    timestamp: Date;
  }[];
}

// 폼 데이터 타입들
export interface CreateAgentData {
  name: string;
  age: number;
  gender: AIAgent["gender"];
  personality: string;
  value: string;
  designStyle: string;
}

export interface CreateTeamData {
  teamName: string;
  members: TeamMember[];
}
