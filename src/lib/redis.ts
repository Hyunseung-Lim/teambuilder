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
  const userData = (await redis.hgetall(keys.user(id))) as Record<string, any>;
  if (!userData || !userData.createdAt) return null;
  return { ...userData, createdAt: new Date(userData.createdAt) } as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const userId = await redis.get<string>(keys.userByEmail(email));
  if (!userId) return null;
  return getUserById(userId);
}

// 중복된 이름에 번호를 붙이는 헬퍼 함수
async function generateUniqueAgentName(
  baseName: string,
  ownerId: string
): Promise<string> {
  // 현재 사용자의 모든 에이전트 가져오기
  const existingAgents = await getUserAgents(ownerId);
  const existingNames = existingAgents.map(agent => agent.name.toLowerCase());
  
  // 기본 이름이 중복되지 않으면 그대로 반환
  if (!existingNames.includes(baseName.toLowerCase())) {
    return baseName;
  }
  
  // 중복되는 경우 번호를 찾아서 붙이기
  let counter = 1;
  let uniqueName = `${baseName} (${counter})`;
  
  while (existingNames.includes(uniqueName.toLowerCase())) {
    counter++;
    uniqueName = `${baseName} (${counter})`;
  }
  
  return uniqueName;
}

// AI 에이전트 관련 함수들
export async function createAgent(
  agentData: Omit<AIAgent, "id" | "createdAt"> & { ownerId: string }
): Promise<AIAgent> {
  const agentId = `agent_${nanoid()}`;
  const {
    name,
    age,
    gender,
    nationality,
    major,
    education,
    professional,
    skills,
    personality,
    value,
    workStyle,
    preferences,
    dislikes,
    ownerId,
  } = agentData;

  // 중복 이름 확인 및 고유 이름 생성
  const uniqueName = await generateUniqueAgentName(name, ownerId);

  const newAgent = {
    id: agentId,
    name: uniqueName,
    age: age?.toString() || "",
    gender: gender || "",
    nationality: nationality || "",
    major: major || "",
    education: education || "",
    professional,
    skills,
    personality: personality || "",
    value: value || "",
    workStyle: workStyle || "",
    preferences: preferences || "",
    dislikes: dislikes || "",
    createdAt: new Date().toISOString(),
    userId: ownerId,
  };

  await redis.hset(keys.agent(agentId), newAgent);
  await redis.sadd(keys.userAgents(ownerId), agentId);

  return {
    id: agentId,
    name: uniqueName,
    age,
    gender,
    nationality,
    major,
    education,
    professional,
    skills,
    personality,
    value,
    workStyle,
    preferences,
    dislikes,
    createdAt: new Date(),
    userId: ownerId,
  } as AIAgent;
}

export async function getAgentById(id: string): Promise<AIAgent | null> {
  const agentData = (await redis.hgetall(keys.agent(id))) as Record<
    string,
    any
  > & { roles: string };
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
    createdAt: agentData.createdAt, // 문자열로 유지
    roles: roles, // 파싱된 roles 배열 추가
  } as unknown as AIAgent;
}

export async function getUserAgents(userId: string): Promise<AIAgent[]> {
  const agentIds = await redis.smembers(keys.userAgents(userId));
  const agents = await Promise.all(agentIds.map((id) => getAgentById(id)));
  return agents.filter((agent): agent is AIAgent => agent !== null);
}

// 에이전트 페르소나 요약 업데이트
export async function updateAgentPersonaSummary(
  agentId: string, 
  personaSummary: string
): Promise<void> {
  await redis.hset(keys.agent(agentId), {
    personaSummary: personaSummary,
    updatedAt: new Date().toISOString(),
  });
}

// 팀 관련 함수들
export async function createTeam(
  teamData: Omit<Team, "id" | "createdAt"> & { ownerId: string }
): Promise<Team> {
  const teamId = `team_${nanoid()}`;
  const {
    teamName,
    topic,
    members,
    relationships,
    nodePositions,
    sharedMentalModel,
    ownerId,
  } = teamData;

  console.log("=== createTeam in redis.ts ===");
  console.log("팀 ID:", teamId);
  console.log("relationships (저장 전):", JSON.stringify(relationships, null, 2));
  console.log("nodePositions (저장 전):", JSON.stringify(nodePositions, null, 2));
  console.log("members (저장 전):", JSON.stringify(members, null, 2));

  // Generate individual persona summaries for each AI agent using GPT-4o
  try {
    const { generateAgentPersonaSummary } = await import("@/lib/openai");
    
    for (const member of members || []) {
      if (!member.isUser && member.agentId) {
        try {
          const agentProfile = await getAgentById(member.agentId);
          if (agentProfile) {
            // Generate persona summary for this agent
            const personaSummary = await generateAgentPersonaSummary(
              {
                name: agentProfile.name,
                skills: agentProfile.skills,
                personality: agentProfile.personality,
                workStyle: agentProfile.workStyle,
                preferences: agentProfile.preferences,
                dislikes: agentProfile.dislikes,
                professional: agentProfile.professional,
                age: agentProfile.age,
                gender: agentProfile.gender,
                value: agentProfile.value,
              },
              {
                teamName: teamName || "",
                topic: topic,
                sharedMentalModel: sharedMentalModel,
              }
            );
            
            // Update agent with persona summary
            await updateAgentPersonaSummary(member.agentId, personaSummary);
            console.log(`🤖 ${agentProfile.name} 페르소나 요약 생성 완료:`, personaSummary.substring(0, 100) + "...");
          }
        } catch (error) {
          console.warn("에이전트 페르소나 요약 생성 실패:", member.agentId, error);
        }
      }
    }
  } catch (error) {
    console.error("페르소나 요약 생성 실패:", error);
  }

  const newTeam = {
    id: teamId,
    ownerId: ownerId,
    teamName: teamName || "",
    topic: topic || "",
    members: JSON.stringify(members || []),
    relationships: JSON.stringify(relationships || []),
    nodePositions: JSON.stringify(nodePositions || {}),
    sharedMentalModel: sharedMentalModel || "",
    createdAt: new Date().toISOString(),
  };

  console.log("=== Redis 저장용 데이터 ===");
  console.log("relationships (문자열):", newTeam.relationships);
  console.log("nodePositions (문자열):", newTeam.nodePositions);

  await redis.hset(keys.team(teamId), newTeam);
  await redis.sadd(keys.userTeams(ownerId), teamId);

  // 각 에이전트의 메모리 초기화
  for (const member of members || []) {
    if (!member.isUser && member.agentId) {
      await initializeAgentMemory(member.agentId, {
        id: teamId,
        ownerId,
        teamName: teamName || "",
        topic: topic || "",
        members: members || [],
        relationships: relationships || [],
        sharedMentalModel,
        createdAt: new Date(),
      } as Team);
    }
  }

  const returnTeam = {
    id: teamId,
    ownerId,
    teamName: teamName || "",
    topic: topic || "",
    members: members || [],
    relationships: relationships || [],
    nodePositions: nodePositions || {},
    sharedMentalModel,
    createdAt: new Date(),
  } as Team;

  return returnTeam;
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

  // 기존 팀의 경우 owner 필드를 ownerId로 매핑
  if (!ownerId && teamData.owner) {
    ownerId = teamData.owner;
  }

  // members, relationships, nodePositions 안전하게 파싱
  let members = [];
  let relationships = [];
  let nodePositions = {};

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

  try {
    if (typeof teamData.nodePositions === "string") {
      nodePositions = JSON.parse(teamData.nodePositions);
    } else if (typeof teamData.nodePositions === "object" && teamData.nodePositions !== null) {
      nodePositions = teamData.nodePositions;
    }
  } catch (error) {
    console.error("NodePositions 파싱 오류:", error);
    nodePositions = {};
  }

  return {
    ...teamData,
    ownerId: ownerId as string,
    members,
    relationships,
    nodePositions,
    sharedMentalModel: teamData.sharedMentalModel || undefined,
    teamSummary: teamData.teamSummary || undefined,
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

  if (teamData.sharedMentalModel !== undefined) {
    updateData.sharedMentalModel = teamData.sharedMentalModel;

    // 공유 멘탈 모델이 업데이트되면 팀의 모든 에이전트 메모리에도 반영
    if (existingTeam.members) {
      await updateAgentsSharedMentalModel(
        existingTeam.members,
        teamData.sharedMentalModel
      );
    }
  }

  // Redis에 업데이트
  if (Object.keys(updateData).length > 0) {
    await redis.hset(keys.team(teamId), updateData);
  }
}

// 팀의 모든 에이전트 메모리에 공유 멘탈 모델 업데이트
async function updateAgentsSharedMentalModel(
  members: any[],
  sharedMentalModel: string
): Promise<void> {
  console.log("=== 팀 에이전트들의 메모리에 공유 멘탈 모델 업데이트 시작 ===");

  for (const member of members) {
    if (!member.isUser && member.agentId) {
      try {
        console.log(`에이전트 ${member.agentId}의 메모리 업데이트 시작`);

        // v2 메모리 시스템 먼저 시도
        try {
          const { getNewAgentMemory, saveNewAgentMemory } = await import(
            "./memory-v2"
          );
          const newMemory = await getNewAgentMemory(member.agentId);

          if (newMemory) {
            console.log(`v2 메모리 발견, 업데이트 진행: ${member.agentId}`);

            // 기존 공유 멘탈 모델 섹션이 있다면 제거 (더 이상 knowledge에 저장하지 않음)
            let updatedKnowledge = newMemory.longTerm.knowledge.replace(
              /\n\n=== 팀의 공유 멘탈 모델 ===\n[\s\S]*?(?=\n\n|$)/,
              ""
            );

            // 공유 멘탈 모델은 더 이상 knowledge에 추가하지 않음 (별도 관리)
            newMemory.longTerm.knowledge = updatedKnowledge;
            newMemory.lastMemoryUpdate = new Date().toISOString();

            await saveNewAgentMemory(member.agentId, newMemory);
            console.log(`✅ v2 메모리 업데이트 완료: ${member.agentId}`);
            continue;
          }
        } catch (error) {
          console.error(`v2 메모리 업데이트 실패: ${member.agentId}`, error);
        }

        // 기존 메모리 시스템 폴백
        const existingMemory = await getAgentMemory(member.agentId);
        if (existingMemory) {
          console.log(`기존 메모리 시스템으로 업데이트: ${member.agentId}`);

          // 기존 공유 멘탈 모델 정보 제거 후 새로 추가
          let updatedSelf = existingMemory.longTerm.self
            .replace(/우리 팀의 공유 멘탈 모델:[\s\S]*?(?=\.|$)/, "")
            .trim();

          if (sharedMentalModel) {
            updatedSelf = `${updatedSelf}. 우리 팀의 공유 멘탈 모델: ${sharedMentalModel}`;
          }

          existingMemory.longTerm.self = updatedSelf;
          await updateAgentMemory(member.agentId, existingMemory);
          console.log(`✅ 기존 메모리 업데이트 완료: ${member.agentId}`);
        }
      } catch (error) {
        console.error(
          `에이전트 ${member.agentId} 메모리 업데이트 실패:`,
          error
        );
      }
    }
  }

  console.log("=== 팀 에이전트들의 메모리 업데이트 완료 ===");
}

export async function getUserTeams(userId: string): Promise<Team[]> {
  // console.log("🔍 getUserTeams 호출됨:", userId);

  const teamIds = await redis.smembers(keys.userTeams(userId));
  // console.log("🔍 사용자의 팀 ID 목록:", teamIds);

  const teams = await Promise.all(teamIds.map((id) => getTeamById(id)));
  // console.log("🔍 불러온 팀들:", teams);

  const filteredTeams = teams.filter((team): team is Team => team !== null);
  // console.log("🔍 필터링된 팀들:", filteredTeams);

  return filteredTeams;
}

// 팀 삭제 함수 (에이전트는 보존)
export async function deleteTeam(
  teamId: string,
  ownerId: string
): Promise<void> {
  const team = (await getTeamById(teamId)) as Team & { ownerId?: string };

  // console.log("🔍 팀 삭제 디버깅:");
  // console.log("  - 요청된 teamId:", teamId);
  // console.log("  - 요청된 ownerId:", ownerId);
  // console.log("  - 팀 존재 여부:", !!team);
  // console.log("  - 팀 정보:", team);
  // console.log("  - 팀의 ownerId:", team?.ownerId);
  // console.log("  - ownerId 비교 결과:", team?.ownerId === ownerId);

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
  console.log(`🧠 에이전트 ${agentId} 메모리 조회 시작 (v2 우선)`);

  // 1. 먼저 v2 메모리 시스템 확인
  try {
    const { getNewAgentMemory } = await import("./memory-v2");
    const newMemory = await getNewAgentMemory(agentId);

    if (newMemory) {
      console.log(`✅ v2 메모리 발견: ${agentId}`);

      // v2 메모리를 기존 AgentMemory 형식으로 변환하여 반환 (하위 호환성)
      const compatibilityMemory: AgentMemory = {
        agentId,
        shortTerm: {
          lastAction: newMemory.shortTerm.actionHistory,
          activeChat: null, // v2에서는 사용하지 않음
          feedbackSessionChat: newMemory.shortTerm.currentChat
            ? {
                sessionId: newMemory.shortTerm.currentChat.sessionId,
                targetAgentId: newMemory.shortTerm.currentChat.targetAgentId,
                targetAgentName:
                  newMemory.shortTerm.currentChat.targetAgentName,
                messages: newMemory.shortTerm.currentChat.messages,
              }
            : null,
        },
        longTerm: {
          self: newMemory.longTerm.knowledge, // knowledge를 self로 매핑
          relations: Object.entries(newMemory.longTerm.relation).reduce(
            (acc, [key, rel]) => {
              acc[key] = {
                agentInfo: rel.agentInfo,
                relationship: rel.relationship,
                interactionHistory: rel.interactionHistory.map((item) => ({
                  action: item.actionItem,
                  content: item.content,
                  timestamp: item.timestamp,
                })),
                myOpinion: rel.myOpinion,
              };
              return acc;
            },
            {} as any
          ),
        },
      };

      return compatibilityMemory;
    }
  } catch (error) {
    console.error(`❌ v2 메모리 조회 실패: ${agentId}`, error);
  }

  // 2. v2 메모리가 없으면 기존 메모리 확인
  console.log(`🔄 기존 메모리 시스템으로 폴백: ${agentId}`);
  const memoryData = await redis.get(keys.agentMemory(agentId));
  if (!memoryData) {
    console.log(`❌ 기존 메모리도 없음: ${agentId}`);
    return null;
  }

  try {
    // Redis가 이미 파싱된 객체를 반환하는 경우 처리
    if (typeof memoryData === "object" && memoryData !== null) {
      console.log(
        `🔧 에이전트 ${agentId} 기존 메모리가 이미 객체 형태로 반환됨`
      );
      // 유효한 AgentMemory 구조인지 더 정확하게 확인
      const memory = memoryData as any;

      // 필수 필드 존재 여부 확인
      const hasValidStructure =
        memory.agentId &&
        memory.shortTerm &&
        memory.longTerm &&
        typeof memory.shortTerm === "object" &&
        typeof memory.longTerm === "object" &&
        memory.longTerm.self !== undefined &&
        memory.longTerm.relations !== undefined;

      if (hasValidStructure) {
        console.log(`✅ 유효한 기존 메모리 구조 확인: ${agentId}`);
        return memory as AgentMemory;
      } else {
        console.warn(`❌ 유효하지 않은 기존 메모리 구조 (${agentId}):`, {
          hasAgentId: !!memory.agentId,
          hasShortTerm: !!memory.shortTerm,
          hasLongTerm: !!memory.longTerm,
          shortTermType: typeof memory.shortTerm,
          longTermType: typeof memory.longTerm,
          hasSelf: memory.longTerm?.self !== undefined,
          hasRelations: memory.longTerm?.relations !== undefined,
        });
        // 손상된 데이터만 삭제
        await redis.del(keys.agentMemory(agentId));
        return null;
      }
    }

    // 문자열인 경우 JSON 파싱
    if (typeof memoryData === "string") {
      const parsedMemory = JSON.parse(memoryData);
      console.log(`📝 에이전트 ${agentId} 기존 메모리 JSON 파싱 성공`);
      return parsedMemory;
    }

    console.warn(
      `알 수 없는 기존 메모리 데이터 타입 (${agentId}):`,
      typeof memoryData
    );
    return null;
  } catch (error) {
    console.warn(
      `손상된 기존 메모리 데이터 발견 (${agentId}) - 파싱 오류:`,
      error
    );
    console.error("기존 메모리 파싱 상세 오류:", error);
    // JSON 파싱 실패한 경우만 삭제
    await redis.del(keys.agentMemory(agentId));
    return null;
  }
}

export async function updateAgentMemory(
  agentId: string,
  memory: AgentMemory
): Promise<void> {
  console.log(`=== 에이전트 ${agentId} 메모리 저장 시작 (v2 우선) ===`);
  console.log(
    `메모리 크기: self="${memory.longTerm.self.substring(
      0,
      50
    )}...", relations=${Object.keys(memory.longTerm.relations).length}`
  );

  // v2 메모리 시스템이 있으면 업데이트 시도
  try {
    const { getNewAgentMemory, saveNewAgentMemory } = await import(
      "./memory-v2"
    );
    const existingV2Memory = await getNewAgentMemory(agentId);

    if (existingV2Memory) {
      console.log(`🔄 v2 메모리 존재, v2로 업데이트 진행: ${agentId}`);

      // 기존 AgentMemory를 v2 형식으로 변환
      const updatedV2Memory = {
        ...existingV2Memory,
        shortTerm: {
          ...existingV2Memory.shortTerm,
          actionHistory: memory.shortTerm.lastAction,
          currentChat: memory.shortTerm.feedbackSessionChat
            ? {
                sessionId: memory.shortTerm.feedbackSessionChat.sessionId,
                targetAgentId:
                  memory.shortTerm.feedbackSessionChat.targetAgentId,
                targetAgentName:
                  memory.shortTerm.feedbackSessionChat.targetAgentName,
                chatType: "feedback_session" as const,
                messages: memory.shortTerm.feedbackSessionChat.messages || [],
              }
            : existingV2Memory.shortTerm.currentChat,
        },
        longTerm: {
          ...existingV2Memory.longTerm,
          knowledge:
            typeof memory.longTerm.self === "string"
              ? memory.longTerm.self
              : existingV2Memory.longTerm.knowledge,
          relation: Object.entries(memory.longTerm.relations).reduce(
            (acc, [key, rel]) => {
              acc[key] = {
                agentInfo: rel.agentInfo,
                relationship: rel.relationship,
                interactionHistory: rel.interactionHistory.map((item) => ({
                  timestamp: item.timestamp,
                  actionItem: item.action,
                  content: item.content,
                })),
                myOpinion: rel.myOpinion,
              };
              return acc;
            },
            {} as any
          ),
        },
        lastMemoryUpdate: new Date().toISOString(),
      };

      await saveNewAgentMemory(agentId, updatedV2Memory);
      console.log(`✅ v2 메모리 업데이트 완료: ${agentId}`);
      return;
    }
  } catch (error) {
    console.error(
      `❌ v2 메모리 업데이트 실패, 기존 방식으로 폴백: ${agentId}`,
      error
    );
  }

  // v2 메모리가 없거나 실패한 경우 기존 방식 사용
  console.log(`🔄 기존 메모리 시스템으로 저장: ${agentId}`);

  try {
    const memoryJson = JSON.stringify(memory);
    console.log(`JSON 문자열 길이: ${memoryJson.length} bytes`);

    await redis.set(keys.agentMemory(agentId), memoryJson);
    console.log(`✅ 기존 Redis 저장 완료: ${keys.agentMemory(agentId)}`);

    // 저장 후 바로 확인하여 검증
    const savedMemory = await redis.get(keys.agentMemory(agentId));
    if (savedMemory) {
      console.log(`✅ 기존 저장 검증 성공: 데이터 존재 확인됨`);
    } else {
      console.error(`❌ 기존 저장 검증 실패: 데이터가 저장되지 않았음`);
    }
  } catch (error) {
    console.error(`❌ 기존 메모리 저장 중 오류:`, error);
    throw error;
  }

  console.log(`=== 에이전트 ${agentId} 메모리 저장 완료 ===`);
}

// 디버깅용 함수들 (개발 환경에서만 사용)
export async function debugGetAllTeamKeys(): Promise<string[]> {
  // scanStream 대신 keys 사용
  const keys = await redis.keys("team:*");
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
    await redis.hset(keys.team(teamId), { ownerId });

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
  console.log(
    `=== 에이전트 ${agentId}의 메모리 초기화 시작 (v2 시스템 사용) ===`
  );
  console.log(
    "팀 정보:",
    JSON.stringify({
      teamName: team.teamName,
      topic: team.topic,
      memberCount: team.members.length,
    })
  );
  console.log("공유 멘탈 모델 정보:");
  console.log("- 존재 여부:", !!team.sharedMentalModel);
  console.log("- 길이:", team.sharedMentalModel?.length || 0);
  console.log(
    "- 내용 미리보기:",
    team.sharedMentalModel?.substring(0, 50) + "..."
  );

  // v2 메모리 시스템 사용
  const { createNewAgentMemory, saveNewAgentMemory } = await import(
    "./memory-v2"
  );

  try {
    // 새로운 v2 메모리 구조로 생성 (공유 멘탈 모델 포함)
    const newMemory = await createNewAgentMemory(agentId, team);

    // 공유 멘탈 모델은 별도로 관리하므로 knowledge에 추가하지 않음
    console.log(`✅ 에이전트 ${agentId}의 메모리 생성 완료 (공유 멘탈 모델은 별도 관리)`);
    if (team.sharedMentalModel) {
      console.log(`- 팀의 공유 멘탈 모델 존재: ${team.sharedMentalModel.length}자`);
    }

    await saveNewAgentMemory(agentId, newMemory);

    console.log(`✅ 에이전트 ${agentId}의 v2 메모리 초기화 완료`);

    // 기존 형식과 호환성을 위해 기본 AgentMemory 형태로 반환
    // (하지만 실제로는 v2 메모리가 Redis에 저장됨)
    const compatibilityMemory: AgentMemory = {
      agentId,
      shortTerm: {
        lastAction: null,
        activeChat: null,
        feedbackSessionChat: null,
      },
      longTerm: {
        self: team.sharedMentalModel
          ? `팀에 새로 합류했습니다. 우리 팀의 공유 멘탈 모델: ${team.sharedMentalModel}`
          : "팀에 새로 합류했습니다. v2 메모리 시스템을 사용하여 더 스마트하게 학습하고 협력하겠습니다.",
        relations: {},
      },
    };

    return compatibilityMemory;
  } catch (error) {
    console.error(`❌ v2 메모리 초기화 실패, 기존 방식으로 폴백:`, error);

    // v2 실패 시 기존 방식 사용
    return await initializeAgentMemoryLegacy(agentId, team);
  }
}

// 기존 메모리 초기화 함수를 별도 함수로 분리 (폴백용)
async function initializeAgentMemoryLegacy(
  agentId: string,
  team: Team
): Promise<AgentMemory> {
  console.log(`=== 에이전트 ${agentId}의 기존 메모리 초기화 (폴백) ===`);
  console.log("공유 멘탈 모델 폴백 처리:");
  console.log("- 존재 여부:", !!team.sharedMentalModel);
  console.log("- 길이:", team.sharedMentalModel?.length || 0);

  // 자신을 제외한 팀원 정보로 관계 메모리 초기화
  const relations: Record<string, RelationalMemory> = {};
  const agentProfile = await getAgentById(agentId);
  console.log(
    "에이전트 프로필:",
    JSON.stringify({ id: agentProfile?.id, name: agentProfile?.name }, null, 2)
  );

  if (!agentProfile) {
    console.error(`에이전트 프로필을 찾을 수 없음: ${agentId}`);
    throw new Error(`에이전트 프로필을 찾을 수 없습니다: ${agentId}`);
  }

  for (const member of team.members) {
    // 자기 자신은 제외
    if (member.agentId === agentId) {
      console.log("자기 자신 제외:", member);
      continue;
    }

    let otherAgentId: string;
    let otherAgentName: string;
    let otherAgentProfile: any;

    if (member.isUser) {
      // 사용자의 경우
      otherAgentId = "나";
      otherAgentName = "나";
      // Check if user is actually the leader
      const userRole = member.isLeader ? "팀 리더" : "팀원";
      const userSkills = member.isLeader ? "리더십" : "협업";
      otherAgentProfile = {
        id: "나",
        name: "나",
        professional: userRole,
        personality: "알 수 없음",
        skills: userSkills,
      };
      console.log("사용자 멤버 처리:", otherAgentProfile);
    } else {
      otherAgentId = member.agentId!;
      const otherAgent = await getAgentById(otherAgentId);
      if (!otherAgent) {
        console.log("다른 에이전트 정보를 찾을 수 없음:", otherAgentId);
        continue;
      }

      otherAgentName = otherAgent.name;
      otherAgentProfile = {
        id: otherAgent.id,
        name: otherAgent.name,
        professional: otherAgent.professional,
        personality: otherAgent.personality,
        skills: otherAgent.skills,
      };
      console.log("다른 에이전트 처리:", otherAgentProfile);
    }

    // 두 사람 간의 관계 찾기 - 이름으로 매칭
    const relationship = team.relationships.find(
      (rel) =>
        (rel.from === agentProfile.name && rel.to === otherAgentName) ||
        (rel.from === otherAgentName && rel.to === agentProfile.name)
    );
    console.log(
      `${agentProfile.name} <-> ${otherAgentName} 관계:`,
      relationship
    );

    // relations의 키를 에이전트 이름으로 사용 (ID 대신)
    // 단, 사용자는 "나"로, 에이전트는 ID로 키를 사용
    const relationKey = member.isUser ? "나" : otherAgentId;

    relations[relationKey] = {
      agentInfo: otherAgentProfile,
      relationship: relationship ? relationship.type : "NULL", // 기본값
      interactionHistory: [],
      myOpinion: "아직 상호작용이 없어 의견이 없습니다.", // 초기 의견
    };
    console.log(`관계 추가: ${relationKey}`, relations[relationKey]);
  }

  const initialSelf = team.sharedMentalModel
    ? `팀에 새로 합류했습니다. 우리 팀의 공유 멘탈 모델: ${team.sharedMentalModel}. 앞으로 팀원들과 좋은 관계를 맺고 협력하여 좋은 결과를 만들어가고 싶습니다.`
    : "팀에 새로 합류했습니다. 앞으로 팀원들과 좋은 관계를 맺고 협력하여 좋은 결과를 만들어가고 싶습니다.";

  console.log("기존 메모리 self 섹션 길이:", initialSelf.length);

  const initialMemory: AgentMemory = {
    agentId,
    shortTerm: {
      lastAction: null,
      activeChat: null,
      feedbackSessionChat: null,
    },
    longTerm: {
      self: initialSelf,
      relations,
    },
  };

  console.log(
    "초기 메모리 구조:",
    JSON.stringify(
      {
        agentId,
        selfLength: initialSelf.length,
        relationCount: Object.keys(relations).length,
      },
      null,
      2
    )
  );
  await updateAgentMemory(agentId, initialMemory);
  console.log(`=== 에이전트 ${agentId}의 기존 메모리 초기화 완료 ===`);

  return initialMemory;
}
