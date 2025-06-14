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
  topic?: string; // 아이디에이션 주제
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

// 아이디어 평가
export interface Evaluation {
  evaluator: string; // '나' 또는 agentId
  timestamp: string;
  scores: {
    relevance: number;
    actionable: number;
    insightful: number;
  };
  comment: string;
}

// 아이디어 모델
export interface Idea {
  id: number;
  author: string; // '나' 또는 agentId
  timestamp: string;
  content: {
    object: string;
    function: string;
    behavior: string; // JSON string
    structure: string; // JSON string
  };
  evaluations: Evaluation[];
}

// 채팅 메시지 페이로드
export interface ChatMessagePayload {
  type: "give_feedback" | "make_request";
  content: string;
  mention: string; // agentId
  requestType?: "generate" | "evaluate" | "give_feedback" | null;
  target?: string; // 요청 대상 (make_request용)
  action?: string; // 요청 액션 (make_request용)
  originalRequest?: string; // 원본 요청 메시지 (답글용)
  ideaReference?: {
    ideaId: number;
    ideaTitle: string;
    authorName: string;
  }; // 아이디어 참조 정보 (피드백용)
}

// 시스템 메시지 페이로드
export interface SystemMessagePayload {
  content: string;
}

// 채팅 메시지 모델
export interface ChatMessage {
  id: string | number;
  sender: string; // '나' 또는 agentId
  timestamp: string;
  type: "give_feedback" | "make_request" | "system";
  payload: ChatMessagePayload | SystemMessagePayload | string;
}

// --- 에이전트 메모리 시스템 ---

// Short-term Memory
export interface ShortTermMemory {
  lastAction: {
    type: string;
    timestamp: string;
    payload?: any;
  } | null;
  activeChat: {
    targetAgentId: string;
    messages: ChatMessage[];
  } | null;
}

// Long-term Memory - Self
export interface SelfReflection {
  reflection: string;
  triggeringEvent: string; // 예: "idea_evaluation", "received_feedback"
  relatedIdeaId?: number;
  timestamp: string;
}

// Long-term Memory - Interaction Record
export interface InteractionRecord {
  timestamp: string;
  action: string; // 예: "gave_feedback", "received_request"
  content: string;
}

// Long-term Memory - Relational
export interface RelationalMemory {
  agentInfo: Pick<
    AIAgent,
    "id" | "name" | "professional" | "personality" | "skills"
  >; // Static
  relationship: RelationshipType; // Static
  interactionHistory: InteractionRecord[]; // Dynamic
  myOpinion: string; // Dynamic
}

// Long-term Memory
export interface LongTermMemory {
  self: string; // 단일 문자열로 변경 - 반성적 회고 내용
  relations: Record<string, RelationalMemory>; // key: agentId
}

// Main Agent Memory Structure
export interface AgentMemory {
  agentId: string;
  shortTerm: ShortTermMemory;
  longTerm: LongTermMemory;
}

// AI Agent State System Types
export type AgentState = "idle" | "plan" | "action" | "reflecting";

export interface AgentRequest {
  id: string;
  type: "generate_idea" | "evaluate_idea";
  requesterName: string;
  payload: {
    message: string;
    ideaId?: number; // for evaluation requests
    [key: string]: any;
  };
  timestamp: string;
  teamId: string;
}

export interface AgentStateInfo {
  agentId: string;
  currentState: AgentState;
  lastStateChange: string;
  idleTimer?: NodeJS.Timeout;
  isProcessing: boolean;
  requestQueue: AgentRequest[];
}

export interface PlanDecision {
  shouldAct: boolean;
  actionType?: "generate_idea" | "evaluate_idea";
  reasoning: string;
  targetIdeaId?: number; // for evaluation
}
