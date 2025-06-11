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
  id: string;
  name: string;
  age: number;
  gender: "여자" | "남자" | "정의하지 않음" | "알 수 없음";
  professional: string;
  skills: string;
  autonomy: number;
  personality?: string;
  value?: string;
  designStyle?: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

// 팀 모델
export interface Team {
  id: string; // 예: 'team_a8b7c6'
  ownerId: string; // User.id 외래 키
  teamName: string;
  members: TeamMember[];
  relationships: Relationship[];
  createdAt: Date;
}

// 팀 멤버 (역할이 부여된 에이전트)
export interface TeamMember {
  agentId: string | null; // AIAgent.id 외래 키 또는 사용자일 경우 null
  roles: AgentRole[];
  isLeader: boolean;
  isUser: boolean;
}

// 에이전트 역할 타입
export type AgentRole =
  | "아이디어 생성하기"
  | "아이디어 평가하기"
  | "피드백하기"
  | "요청하기";

// 관계 타입 정의
export const RELATIONSHIP_TYPES = {
  FRIEND: {
    label: "친구",
    color: "#374151", // gray-700
    strokeWidth: 2,
    strokeDasharray: undefined,
  },
  AWKWARD: {
    label: "어색한 사이",
    color: "#6b7280", // gray-500
    strokeDasharray: "5,5",
    strokeWidth: 1.5,
  },
  SUPERVISOR: {
    label: "상사",
    color: "#111827", // gray-900
    strokeWidth: 2.5,
    strokeDasharray: undefined,
  },
} as const;

export type RelationshipType = keyof typeof RELATIONSHIP_TYPES;

export interface Relationship {
  from: string;
  to: string;
  type: RelationshipType;
}

export interface TeamMemberSlot {
  id: string; // A, B, C, D, E, F 또는 '나'
  agentId?: string | null; // 기존 에이전트의 ID (신규 생성 시에는 없음)
  roles: AgentRole[];
  isLeader: boolean;
  isUser: boolean; // 사용자 본인인지 여부
  agent?: {
    name: string;
    age?: number;
    gender?: "여자" | "남자" | "정의하지 않음" | "알 수 없음";
    professional: string;
    skills: string;
    autonomy: number;
    personality?: string;
    value?: string;
    designStyle?: string;
  };
}

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
  professional: string;
  skills: string;
  autonomy: number;
  personality?: string;
  value?: string;
  designStyle?: string;
}

export interface CreateTeamData {
  teamName: string;
  members: TeamMember[];
}
