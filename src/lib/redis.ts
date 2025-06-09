import { Redis } from "@upstash/redis";
import { User, AIAgent, Team } from "./types";
import { nanoid } from "nanoid";

// Upstash Redis 클라이언트 초기화
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 키 생성 헬퍼 함수들
export const keys = {
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email}`,
  agent: (id: string) => `agent:${id}`,
  userAgents: (userId: string) => `user:${userId}:agents`,
  team: (id: string) => `team:${id}`,
  userTeams: (userId: string) => `user:${userId}:teams`,
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

  await redis.hset(keys.user(user.id), user);
  await redis.set(keys.userByEmail(user.email), user.id);

  return user;
}

export async function getUserById(id: string): Promise<User | null> {
  const userData = await redis.hgetall(keys.user(id));
  if (!userData || Object.keys(userData).length === 0) return null;

  return {
    ...userData,
    createdAt: new Date(userData.createdAt as string),
  } as User;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const userId = await redis.get(keys.userByEmail(email));
  if (!userId) return null;

  return getUserById(userId as string);
}

// AI 에이전트 관련 함수들
export async function createAgent(
  agentData: Omit<AIAgent, "id" | "createdAt">
): Promise<AIAgent> {
  const agent: AIAgent = {
    id: `agent_${nanoid()}`,
    ...agentData,
    createdAt: new Date(),
  };

  await redis.hset(keys.agent(agent.id), agent);
  await redis.sadd(keys.userAgents(agent.ownerId), agent.id);

  return agent;
}

export async function getAgentById(id: string): Promise<AIAgent | null> {
  const agentData = await redis.hgetall(keys.agent(id));
  if (!agentData || Object.keys(agentData).length === 0) return null;

  return {
    ...agentData,
    age: Number(agentData.age),
    createdAt: new Date(agentData.createdAt as string),
  } as AIAgent;
}

export async function getUserAgents(userId: string): Promise<AIAgent[]> {
  const agentIds = await redis.smembers(keys.userAgents(userId));
  if (!agentIds || agentIds.length === 0) return [];

  const agents: (AIAgent | null)[] = await Promise.all(
    agentIds.map((id) => getAgentById(id as string))
  );

  return agents.filter((agent): agent is AIAgent => agent !== null);
}

// 팀 관련 함수들
export async function createTeam(
  teamData: Omit<Team, "id" | "createdAt">
): Promise<Team> {
  const team: Team = {
    id: `team_${nanoid()}`,
    ...teamData,
    createdAt: new Date(),
  };

  await redis.hset(keys.team(team.id), {
    ...team,
    members: JSON.stringify(team.members),
  });
  await redis.sadd(keys.userTeams(team.ownerId), team.id);

  return team;
}

export async function getTeamById(id: string): Promise<Team | null> {
  const teamData = await redis.hgetall(keys.team(id));
  if (!teamData || Object.keys(teamData).length === 0) return null;

  return {
    ...teamData,
    members: JSON.parse(teamData.members as string),
    createdAt: new Date(teamData.createdAt as string),
  } as Team;
}

export async function getUserTeams(userId: string): Promise<Team[]> {
  const teamIds = await redis.smembers(keys.userTeams(userId));
  if (!teamIds || teamIds.length === 0) return [];

  const teams: (Team | null)[] = await Promise.all(
    teamIds.map((id) => getTeamById(id as string))
  );

  return teams.filter((team): team is Team => team !== null);
}
