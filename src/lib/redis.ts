import { Redis } from "@upstash/redis";
import {
  User,
  AIAgent,
  Team,
  Idea,
  ChatMessage,
  AgentMemory,
  RelationalMemory,
} from "./types";
import { nanoid } from "nanoid";

if (
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN
) {
  throw new Error("Redis connection variables are not set.");
}

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 키 생성 헬퍼 함수들
export const keys = {
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email}`,
  agent: (id: string) => `agent:${id}`,
  userAgents: (userId: string) => `user:${userId}:agents`,
  team: (id: string) => `team:${id}`,
  userTeams: (userId: string) => `user:${userId}:teams`,
  ideas: (teamId: string) => `team:${teamId}:ideas`,
  ideaCounter: (teamId: string) => `team:${teamId}:ideas:counter`,
  chatHistory: (teamId: string) => `team:${teamId}:chat`,
  agentMemory: (agentId: string) => `agent:${agentId}:memory`,
  chatCounter: (teamId: string) => `team:${teamId}:chat:counter`,
};

// 사용자 관련 함수들
export async function createUser(
  userData: Omit<User, "id" | "createdAt">
): Promise<User> {
  const user: User = {
    id: `user_${nanoid()}`,
    ...userData,
    createdAt: new Date(),
  };
  await redis.hset(keys.user(user.id), {
    ...user,
    createdAt: user.createdAt.toISOString(),
  });
  await redis.set(keys.userByEmail(user.email), user.id);
  return user;
}

export async function getUserById(id: string): Promise<User | null> {
  const userData = await redis.hgetall<User>(keys.user(id));
  if (!userData || !userData.createdAt) return null;
  return { ...userData, createdAt: new Date(userData.createdAt) };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const userId = await redis.get<string>(keys.userByEmail(email));
  if (!userId) return null;
  return getUserById(userId);
}

// AI 에이전트 관련 함수들
export async function createAgent(
  agentData: Omit<AIAgent, "id" | "createdAt"> & { ownerId: string }
): Promise<AIAgent> {
  const agent: AIAgent = {
    id: `agent_${nanoid()}`,
    ...agentData,
    createdAt: new Date().toISOString(),
  };

  // 안전하게 저장할 객체 생성 - 모든 값을 문자열로 변환
  const safeAgent: { [key: string]: string } = {};

  // 필수 필드들은 항상 포함 - 모두 문자열로 변환
  safeAgent.id = String(agent.id);
  safeAgent.name = String(agent.name || "");
  safeAgent.age = String(agent.age || 0);
  safeAgent.gender = String(agent.gender || "기타");
  safeAgent.professional = String(agent.professional || "");
  safeAgent.skills = String(agent.skills || "");
  safeAgent.autonomy = String(agent.autonomy || 3);
  safeAgent.createdAt = String(agent.createdAt);

  // roles 배열을 JSON으로 안전하게 직렬화
  try {
    safeAgent.roles = JSON.stringify(
      Array.isArray(agent.roles) ? agent.roles : []
    );
  } catch (error) {
    console.error("Roles 직렬화 오류:", error);
    safeAgent.roles = JSON.stringify([]);
  }

  // 선택적 필드들은 값이 있을 때만 포함
  if (agent.personality && String(agent.personality).trim() !== "") {
    safeAgent.personality = String(agent.personality);
  }
  if (agent.value && String(agent.value).trim() !== "") {
    safeAgent.value = String(agent.value);
  }
  if (agent.designStyle && String(agent.designStyle).trim() !== "") {
    safeAgent.designStyle = String(agent.designStyle);
  }

  console.log("🔧 저장할 에이전트 데이터:", safeAgent);

  await redis.hset(keys.agent(agent.id), safeAgent);

  if (agentData.ownerId) {
    await redis.sadd(keys.userAgents(agentData.ownerId), agent.id);
  }

  console.log("✅ 에이전트 저장 완료:", agent.id);
  return agent;
}

export async function getAgentById(id: string): Promise<AIAgent | null> {
  const agentData = await redis.hgetall<AIAgent & { roles: string }>(
    keys.agent(id)
  );
  if (!agentData || !agentData.id) return null;

  // 안전하게 데이터 변환
  let roles = [];
  try {
    if (typeof agentData.roles === "string") {
      roles = JSON.parse(agentData.roles);
    } else if (Array.isArray(agentData.roles)) {
      roles = agentData.roles;
    }
  } catch (error) {
    console.error("Roles 파싱 오류:", error);
    roles = [];
  }

  return {
    ...agentData,
    age: Number(agentData.age) || 0,
    autonomy: Number(agentData.autonomy) || 3,
    roles,
  };
}

export async function getUserAgents(userId: string): Promise<AIAgent[]> {
  const agentIds = await redis.smembers(keys.userAgents(userId));
  const agents = await Promise.all(agentIds.map((id) => getAgentById(id)));
  return agents.filter((agent): agent is AIAgent => agent !== null);
}

// 팀 관련 함수들
export async function createTeam(
  teamData: Omit<Team, "id" | "createdAt"> & { ownerId: string }
): Promise<Team> {
  const teamId = `team_${nanoid()}`;
  const { teamName, members, ownerId } = teamData;

  const newTeam = {
    id: teamId,
    ownerId: ownerId,
    teamName,
    members,
    relationships: [], // 관계 정보는 팀 생성 후 설정
    createdAt: new Date(),
  };

  await redis.hset(keys.team(teamId), newTeam);
  await redis.sadd(keys.userTeams(ownerId), teamId);

  // 각 에이전트의 메모리 초기화
  for (const member of members) {
    if (!member.isUser && member.agentId) {
      await initializeAgentMemory(member.agentId, newTeam as Team);
    }
  }

  return newTeam as Team;
}

export async function getTeamById(id: string): Promise<Team | null> {
  const teamData = (await redis.hgetall(keys.team(id))) as any;
  if (!teamData) return null;

  // ownerId가 배열 형태로 잘못 저장된 경우 복구
  let ownerId = teamData.ownerId;
  if (typeof ownerId === "object" && ownerId !== null) {
    // 배열 형태로 저장된 경우 문자열로 합치기
    ownerId = Object.values(ownerId).join("");
  }

  // members와 relationships도 안전하게 파싱
  let members = [];
  let relationships = [];

  try {
    if (typeof teamData.members === "string") {
      members = JSON.parse(teamData.members);
    } else if (Array.isArray(teamData.members)) {
      members = teamData.members;
    }
  } catch (error) {
    console.error("Members 파싱 오류:", error);
    members = [];
  }

  try {
    if (typeof teamData.relationships === "string") {
      relationships = JSON.parse(teamData.relationships);
    } else if (Array.isArray(teamData.relationships)) {
      relationships = teamData.relationships;
    }
  } catch (error) {
    console.error("Relationships 파싱 오류:", error);
    relationships = [];
  }

  return {
    ...teamData,
    ownerId: ownerId as string,
    members,
    relationships,
    topic: teamData.topic || undefined,
  };
}

export async function updateTeam(
  teamId: string,
  teamData: Partial<Team>
): Promise<void> {
  const existingTeam = await getTeamById(teamId);
  if (!existingTeam) {
    throw new Error("Team not found");
  }

  // 업데이트할 데이터 준비
  const updateData: { [key: string]: string } = {};

  if (teamData.teamName) {
    updateData.teamName = teamData.teamName;
  }

  if (teamData.topic !== undefined) {
    updateData.topic = teamData.topic;
  }

  if (teamData.members) {
    updateData.members = JSON.stringify(teamData.members);
  }

  if (teamData.relationships) {
    updateData.relationships = JSON.stringify(teamData.relationships);
  }

  // Redis에 업데이트
  if (Object.keys(updateData).length > 0) {
    await redis.hset(keys.team(teamId), updateData);
  }
}

export async function getUserTeams(userId: string): Promise<Team[]> {
  console.log("🔍 getUserTeams 호출됨:", userId);

  const teamIds = await redis.smembers(keys.userTeams(userId));
  console.log("🔍 사용자의 팀 ID 목록:", teamIds);

  const teams = await Promise.all(teamIds.map((id) => getTeamById(id)));
  console.log("🔍 불러온 팀들:", teams);

  const filteredTeams = teams.filter((team): team is Team => team !== null);
  console.log("🔍 필터링된 팀들:", filteredTeams);

  return filteredTeams;
}

// 팀 삭제 함수 (에이전트는 보존)
export async function deleteTeam(
  teamId: string,
  ownerId: string
): Promise<void> {
  const team = (await getTeamById(teamId)) as Team & { ownerId?: string };
  if (!team || team.ownerId !== ownerId) {
    throw new Error("Team not found or user not authorized to delete.");
  }
  await redis.del(keys.team(teamId));
  await redis.srem(keys.userTeams(ownerId), teamId);
}

// --- Idea Database Functions ---

export async function getIdeas(teamId: string): Promise<Idea[]> {
  const ideasJson = await redis.lrange(keys.ideas(teamId), 0, -1);
  return ideasJson
    .map((idea: string | object) => {
      try {
        // Redis가 이미 파싱된 객체를 반환하는 경우
        if (typeof idea === "object" && idea !== null) {
          // 유효한 Idea 객체인지 확인
          const ideaObj = idea as any;
          if (ideaObj.id && ideaObj.author && ideaObj.content) {
            return ideaObj as Idea;
          } else {
            console.warn("유효하지 않은 아이디어 객체:", idea);
            return null;
          }
        }

        // 문자열인 경우 파싱
        if (typeof idea === "string") {
          // "[object Object]" 형태의 손상된 데이터 체크
          if (idea === "[object Object]" || !idea) {
            console.warn("손상된 아이디어 데이터 스킵:", idea);
            return null;
          }
          return JSON.parse(idea);
        }

        console.warn("알 수 없는 타입의 아이디어 데이터:", typeof idea, idea);
        return null;
      } catch (error) {
        console.warn("아이디어 처리 실패:", idea, error);
        return null;
      }
    })
    .filter((idea): idea is Idea => idea !== null);
}

export async function addIdea(
  teamId: string,
  idea: Omit<Idea, "id">
): Promise<Idea> {
  console.log("아이디어 추가 시작:", { teamId, idea });

  // ID 생성
  const id = await redis.incr(keys.ideaCounter(teamId));

  const newIdea: Idea = {
    id,
    ...idea,
  };

  console.log("생성된 아이디어:", newIdea);

  // 안전한 JSON 직렬화
  try {
    const ideaJson = JSON.stringify(newIdea);
    console.log("직렬화된 아이디어 JSON:", ideaJson);

    await redis.lpush(keys.ideas(teamId), ideaJson);
    console.log("Redis에 아이디어 저장 완료");

    return newIdea;
  } catch (error) {
    console.error("아이디어 저장 중 오류:", error);
    throw new Error("아이디어 저장에 실패했습니다");
  }
}

export async function updateIdea(
  teamId: string,
  ideaId: number,
  updates: Partial<Idea>
): Promise<Idea | null> {
  const ideas = await getIdeas(teamId);
  const ideaIndex = ideas.findIndex((idea) => idea.id === ideaId);
  if (ideaIndex === -1) return null;
  const updatedIdea = { ...ideas[ideaIndex], ...updates };
  await redis.lset(keys.ideas(teamId), ideaIndex, JSON.stringify(updatedIdea));
  return updatedIdea;
}

// --- Chat Database Functions ---

export async function getChatHistory(
  teamId: string,
  count: number = 50
): Promise<ChatMessage[]> {
  const historyJson = await redis.lrange(keys.chatHistory(teamId), -count, -1);
  return historyJson
    .map((msg: string | object) => {
      try {
        // Redis가 이미 파싱된 객체를 반환하는 경우
        if (typeof msg === "object" && msg !== null) {
          // 유효한 ChatMessage 객체인지 확인
          const chatMsg = msg as any;
          if (chatMsg.sender && chatMsg.type && chatMsg.timestamp) {
            return chatMsg as ChatMessage;
          } else {
            console.warn("유효하지 않은 채팅 메시지 객체:", msg);
            return null;
          }
        }

        // 문자열인 경우 파싱
        if (typeof msg === "string") {
          // "[object Object]" 형태의 손상된 데이터 체크
          if (msg === "[object Object]" || !msg) {
            console.warn("손상된 채팅 메시지 데이터 스킵:", msg);
            return null;
          }
          return JSON.parse(msg);
        }

        console.warn("알 수 없는 타입의 채팅 메시지 데이터:", typeof msg, msg);
        return null;
      } catch (error) {
        console.warn("채팅 메시지 처리 실패:", msg, error);
        return null;
      }
    })
    .filter((msg): msg is ChatMessage => msg !== null);
}

export async function addChatMessage(
  teamId: string,
  message: Omit<ChatMessage, "id" | "timestamp">
): Promise<ChatMessage> {
  console.log("채팅 메시지 추가 시작:", { teamId, message });

  // ID 생성
  const id = await redis.incr(keys.chatCounter(teamId));

  const newMessage: ChatMessage = {
    id,
    timestamp: new Date().toISOString(),
    ...message,
  };

  console.log("생성된 채팅 메시지:", newMessage);

  // 안전한 JSON 직렬화
  try {
    const messageJson = JSON.stringify(newMessage);
    console.log("직렬화된 채팅 메시지 JSON:", messageJson);

    await redis.rpush(keys.chatHistory(teamId), messageJson);
    console.log("Redis에 채팅 메시지 저장 완료");

    return newMessage;
  } catch (error) {
    console.error("채팅 메시지 저장 중 오류:", error);
    throw new Error("채팅 메시지 저장에 실패했습니다");
  }
}

// --- Agent Memory Functions ---

export async function getAgentMemory(
  agentId: string
): Promise<AgentMemory | null> {
  const memoryJson = await redis.get<string>(keys.agentMemory(agentId));
  if (!memoryJson) return null;

  try {
    return JSON.parse(memoryJson);
  } catch (error) {
    console.warn(`손상된 메모리 데이터 발견 (${agentId}):`, memoryJson);
    // 손상된 데이터 삭제
    await redis.del(keys.agentMemory(agentId));
    return null;
  }
}

export async function updateAgentMemory(
  agentId: string,
  memory: AgentMemory
): Promise<void> {
  await redis.set(keys.agentMemory(agentId), JSON.stringify(memory));
}

// 디버깅용 함수들 (개발 환경에서만 사용)
export async function debugGetAllTeamKeys(): Promise<string[]> {
  const stream = redis.scanStream({
    match: "team:*",
  });

  const keys: string[] = [];
  for await (const key of stream) {
    keys.push(key);
  }
  return keys;
}

export async function debugGetTeamData(teamKey: string): Promise<any> {
  try {
    return await redis.hgetall(teamKey);
  } catch (error) {
    console.error(`팀 데이터 조회 오류 (${teamKey}):`, error);
    return null;
  }
}

export async function debugGetUserTeamsSet(
  userEmail: string
): Promise<string[]> {
  try {
    return await redis.smembers(keys.userTeams(userEmail));
  } catch (error) {
    console.error(`사용자 팀 목록 조회 오류 (${userEmail}):`, error);
    return [];
  }
}

export async function debugFixTeamOwnerId(
  teamId: string,
  ownerId: string
): Promise<boolean> {
  try {
    const teamData = await redis.hgetall(keys.team(teamId));
    if (!teamData) return false;

    // ownerId 필드 추가
    await redis.hset(keys.team(teamId), "ownerId", ownerId);

    // 사용자의 팀 목록에도 추가
    await redis.sadd(keys.userTeams(ownerId), teamId);

    return true;
  } catch (error) {
    console.error(`팀 복구 오류 (${teamId}):`, error);
    return false;
  }
}

// 손상된 데이터 정리 함수
export async function cleanupCorruptedData(teamId: string) {
  try {
    console.log(`팀 ${teamId}의 손상된 데이터 정리 시작`);

    // 아이디어 정리
    const ideas = await redis.lrange(keys.ideas(teamId), 0, -1);
    const validIdeas = ideas.filter((idea) => {
      try {
        // 이미 객체인 경우
        if (typeof idea === "object" && idea !== null) {
          const ideaObj = idea as any;
          return ideaObj.id && ideaObj.author && ideaObj.content;
        }

        // 문자열인 경우
        if (typeof idea === "string") {
          if (idea === "[object Object]" || !idea) {
            return false;
          }
          JSON.parse(idea);
          return true;
        }

        return false;
      } catch {
        return false;
      }
    });

    // 손상된 아이디어가 있으면 정리
    if (validIdeas.length !== ideas.length) {
      await redis.del(keys.ideas(teamId));
      if (validIdeas.length > 0) {
        const validIdeasJson = validIdeas.map((idea) =>
          typeof idea === "string" ? idea : JSON.stringify(idea)
        );
        await redis.lpush(keys.ideas(teamId), ...validIdeasJson);
      }
      console.log(
        `아이디어 정리 완료: ${ideas.length} -> ${validIdeas.length}`
      );
    }

    // 채팅 메시지 정리
    const messages = await redis.lrange(keys.chatHistory(teamId), 0, -1);
    const validMessages = messages.filter((msg) => {
      try {
        // 이미 객체인 경우
        if (typeof msg === "object" && msg !== null) {
          const chatMsg = msg as any;
          return chatMsg.sender && chatMsg.type && chatMsg.timestamp;
        }

        // 문자열인 경우
        if (typeof msg === "string") {
          if (msg === "[object Object]" || !msg) {
            return false;
          }
          JSON.parse(msg);
          return true;
        }

        return false;
      } catch {
        return false;
      }
    });

    // 손상된 메시지가 있으면 정리
    if (validMessages.length !== messages.length) {
      await redis.del(keys.chatHistory(teamId));
      if (validMessages.length > 0) {
        const validMessagesJson = validMessages.map((msg) =>
          typeof msg === "string" ? msg : JSON.stringify(msg)
        );
        await redis.rpush(keys.chatHistory(teamId), ...validMessagesJson);
      }
      console.log(
        `채팅 메시지 정리 완료: ${messages.length} -> ${validMessages.length}`
      );
    }

    console.log(`팀 ${teamId} 데이터 정리 완료`);
  } catch (error) {
    console.error(`팀 ${teamId} 데이터 정리 중 오류:`, error);
  }
}

export async function initializeAgentMemory(
  agentId: string,
  team: Team
): Promise<AgentMemory> {
  console.log(`에이전트 ${agentId}의 메모리를 초기화합니다.`);

  // 자신을 제외한 팀원 정보로 관계 메모리 초기화
  const relations: Record<string, RelationalMemory> = {};
  const agentProfile = await getAgentById(agentId);

  for (const member of team.members) {
    // 자기 자신은 제외
    if (member.agentId === agentId) continue;

    let otherAgentId: string;
    let otherAgentName: string;
    let otherAgentProfile: any;

    if (member.isUser) {
      // TODO: 사용자의 프로필 정보를 어떻게 가져올지 정의 필요
      // 우선은 '나'로 하드코딩
      otherAgentId = "나";
      otherAgentName = "나";
      otherAgentProfile = {
        id: "나",
        name: "나",
        professional: "팀 리더",
        personality: "알 수 없음",
        skills: "리더십",
      };
    } else {
      otherAgentId = member.agentId!;
      const otherAgent = await getAgentById(otherAgentId);
      if (!otherAgent) continue;

      otherAgentName = otherAgent.name;
      otherAgentProfile = {
        id: otherAgent.id,
        name: otherAgent.name,
        professional: otherAgent.professional,
        personality: otherAgent.personality,
        skills: otherAgent.skills,
      };
    }

    // 두 사람 간의 관계 찾기
    const relationship = team.relationships.find(
      (rel) =>
        (rel.from === agentProfile?.name && rel.to === otherAgentName) ||
        (rel.from === otherAgentName && rel.to === agentProfile?.name)
    );

    relations[otherAgentId] = {
      agentInfo: otherAgentProfile,
      relationship: relationship ? relationship.type : "AWKWARD", // 기본값
      interactionHistory: [],
      myOpinion: "아직 상호작용이 없어 의견이 없습니다.", // 초기 의견
    };
  }

  const initialMemory: AgentMemory = {
    agentId,
    shortTerm: {
      lastAction: null,
      activeChat: null,
    },
    longTerm: {
      self: [],
      relations,
    },
  };

  await updateAgentMemory(agentId, initialMemory);
  console.log(`에이전트 ${agentId}의 메모리 초기화 완료.`);

  return initialMemory;
}
