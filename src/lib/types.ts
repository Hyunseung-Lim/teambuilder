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
  age?: number;
  gender?: "여자" | "남자" | "정의하지 않음" | "알 수 없음";
  education?: "고졸" | "대졸" | "석사" | "박사" | "기타";
  professional: string;
  skills: string;
  autonomy: number;
  personality?: string;
  value?: string;
  workStyle?: string;
  preferences?: string;
  dislikes?: string;
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
  nodePositions?: { [key: string]: { x: number; y: number } }; // 관계 그래프 노드 위치
  topic?: string; // 아이디에이션 주제
  sharedMentalModel?: string; // 공유 멘탈 모델
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
  PEER: {
    label: "동료",
    color: "#374151", // gray-700
    strokeWidth: 2,
    strokeDasharray: undefined,
    hidden: false,
  },
  SUPERVISOR: {
    label: "상사-부하",
    color: "#111827", // gray-900
    strokeWidth: 2.5,
    strokeDasharray: undefined,
    hidden: false,
  },
  NULL: {
    label: "관계 없음",
    color: "#9ca3af", // gray-400
    strokeWidth: 1,
    strokeDasharray: "2,2",
    hidden: true, // UI에서 숨김
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
    education?: "고졸" | "대졸" | "석사" | "박사" | "기타";
    professional: string;
    skills: string;
    autonomy: number;
    personality?: string;
    value?: string;
    workStyle?: string;
    preferences?: string;
    dislikes?: string;
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
  gender: "여자" | "남자" | "정의하지 않음" | "알 수 없음";
  education?: "고졸" | "대졸" | "석사" | "박사" | "기타";
  professional: string;
  skills: string;
  autonomy: number;
  personality?: string;
  value?: string;
  workStyle?: string;
  preferences?: string;
  dislikes?: string;
  ownerId: string;
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
    novelty: number;
    completeness: number;
    quality: number;
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
  content: string | { message: string; [key: string]: any };
  mention: string; // agentId
  requestType?: "generate" | "evaluate" | "give_feedback" | null;
  target?: string; // 요청 대상 (make_request용)
  action?: string; // 요청 액션 (make_request용)
  originalRequest?: string; // 원본 요청 메시지 (답글용)
  // 기존 ideaReference는 하위 호환성을 위해 유지
  ideaReference?: {
    ideaId: number;
    ideaTitle: string;
    authorName: string;
  };
}

// 시스템 메시지 페이로드
export interface SystemMessagePayload {
  content: string;
}

// 피드백 세션 요약 페이로드
export interface FeedbackSessionSummaryPayload {
  type: "feedback_session_summary";
  sessionId: string;
  participants: string[];
  targetIdea?: any;
  summary: string;
  keyInsights: string[];
  messageCount: number;
  duration: number; // 분 단위
  sessionMessages: FeedbackSessionMessage[]; // 전체 대화 내용
  endedBy?: "user" | "ai"; // 세션을 종료한 주체
}

// 채팅 메시지 모델
export interface ChatMessage {
  id: string | number;
  sender: string; // '나' 또는 agentId
  timestamp: string;
  type:
    | "give_feedback"
    | "make_request"
    | "system"
    | "feedback_session_summary";
  payload:
    | ChatMessagePayload
    | SystemMessagePayload
    | FeedbackSessionSummaryPayload
    | string;
}

// --- 에이전트 메모리 시스템 (새로운 구조) ---

// Short-term Memory - 현재 진행중인 행동들에 대한 temporal 메모리
export interface ShortTermMemory {
  // 최신 액션 기록
  actionHistory: {
    type: string;
    timestamp: string;
    payload?: any;
  } | null;

  // 다른 사람들의 요청 큐
  requestList: Array<{
    id: string;
    requesterId: string;
    requesterName: string;
    requestType: "generate_idea" | "evaluate_idea" | "give_feedback";
    content: string;
    timestamp: string;
  }>;

  // 현재 진행 중인 대화 (피드백 세션 등)
  currentChat: {
    sessionId: string;
    targetAgentId: string;
    targetAgentName: string;
    chatType: "feedback_session" | "general_chat";
    messages: Array<{
      id: string;
      sender: string;
      senderName: string;
      content: string;
      timestamp: string;
    }>;
  } | null;
}

// Long-term Memory - 장기적으로 기억해야하는 정보
export interface NewLongTermMemory {
  // 아이디에이션에 도움이 되는 지식
  knowledge: string;

  // 각 액션별 수행 방향성
  actionPlan: {
    idea_generation: string;
    idea_evaluation: string;
    feedback: string;
    request: string;
    response: string;
    planning: string;
  };

  // 팀원들과의 관계 및 상호작용 정보
  relation: Record<
    string,
    {
      // Static 정보 (바뀌지 않음)
      agentInfo: {
        id: string;
        name: string;
        professional: string;
        personality: string;
        skills: string;
      };
      relationship: RelationshipType; // 팀원들과의 관계

      // Dynamic 정보 (계속 업데이트됨)
      interactionHistory: Array<{
        timestamp: string;
        actionItem: string;
        content: string;
      }>;
      myOpinion: string; // 해당 팀원에 대한 나의 의견 (100자 이하)
    }
  >;
}

// 새로운 에이전트 메모리 구조
export interface NewAgentMemory {
  agentId: string;
  shortTerm: ShortTermMemory;
  longTerm: NewLongTermMemory;
  lastMemoryUpdate: string; // 마지막 메모리 업데이트 시점
}

// 메모리 업데이트를 위한 로그 항목
export interface MemoryUpdateLog {
  timestamp: string;
  type: "feedback" | "request" | "idea_evaluation";
  content: string;
  relatedAgentId?: string;
}

// 기존 타입들 유지 (호환성을 위해)
export interface ShortTermMemoryOld {
  lastAction: {
    type: string;
    timestamp: string;
    payload?: any;
  } | null;
  activeChat: {
    targetAgentId: string;
    messages: ChatMessage[];
  } | null;
  feedbackSessionChat: {
    sessionId: string;
    targetAgentId: string;
    targetAgentName: string;
    messages: {
      id: string;
      sender: string;
      senderName: string;
      content: string;
      timestamp: string;
    }[];
  } | null;
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

// --- 피드백 세션 시스템 ---

// 피드백 세션 상태
export type FeedbackSessionStatus = "active" | "ended" | "completed";

// 피드백 세션 참가자
export interface FeedbackSessionParticipant {
  id: string; // "나" 또는 agentId
  name: string;
  isUser: boolean;
  joinedAt: string;
}

// 피드백 세션 메시지
export interface FeedbackSessionMessage {
  id: string;
  sender: string; // "나" 또는 agentId
  content: string;
  timestamp: string;
  type: "message" | "system";
}

// 피드백 세션 (수정됨)
export interface FeedbackSession {
  id: string;
  teamId: string;
  participants: FeedbackSessionParticipant[];
  messages: FeedbackSessionMessage[];
  status: FeedbackSessionStatus;
  createdAt: string;
  endedAt?: string;
  endedBy?: "user" | "ai"; // 세션을 종료한 주체
  initiatedBy: string; // 세션을 시작한 사람
  feedbackContext?: {
    category: string;
    description?: string;
  };
  targetIdea?: any;
  summary?: FeedbackSessionSummary;
  lastActivityAt?: string;
}

// 피드백 세션 요약
export interface FeedbackSessionSummary {
  sessionId: string;
  summary: string;
  keyPoints: string[];
  participants: string[];
  duration: number; // 세션 지속 시간 (분)
  createdAt: string;
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

// Main Agent Memory Structure (기존)
export interface AgentMemory {
  agentId: string;
  shortTerm: ShortTermMemoryOld;
  longTerm: LongTermMemory;
}
