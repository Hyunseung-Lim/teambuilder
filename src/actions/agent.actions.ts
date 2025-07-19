"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { createAgent, getUserAgents, getAgentById } from "@/lib/redis";
import { CreateAgentData } from "@/lib/types";

export async function createAgentAction(formData: FormData) {
  // NextAuth 기본 방식으로 세션 가져오기
  const session = await getServerSession();

  if (!session?.user?.email) {
    throw new Error("인증이 필요합니다.");
  }

  const ageValue = formData.get("age") as string;
  const agentData: CreateAgentData = {
    name: formData.get("name") as string,
    age: ageValue ? parseInt(ageValue) : undefined,
    gender: (formData.get("gender") as any) || undefined,
    education: (formData.get("education") as any) || undefined,
    professional: (formData.get("professional") as string) || undefined,
    skills: (formData.get("skills") as string) || undefined,
    personality: (formData.get("personality") as string) || undefined,
    value: (formData.get("value") as string) || undefined,
    workStyle: (formData.get("workStyle") as string) || undefined,
    preferences: (formData.get("preferences") as string) || undefined,
    dislikes: (formData.get("dislikes") as string) || undefined,
    ownerId: session.user.email, // 이메일을 ID로 사용
  };

  // 유효성 검사 - 이름만 필수
  if (!agentData.name) {
    throw new Error(`팀원 생성 정보가 부족합니다. (3단계)\n누락된 정보: 이름`);
  }

  // 나이가 입력된 경우에만 범위 검사
  if (agentData.age !== undefined && (agentData.age < 1 || agentData.age > 100)) {
    throw new Error("나이는 1-100 사이의 값이어야 합니다.");
  }

  try {
    const createdAgent = await createAgent({
      ...agentData,
      updatedAt: new Date(),
      userId: session.user.email, // 이메일을 ID로 사용
    } as any);

    revalidatePath("/");
    return createdAgent;
  } catch (error) {
    console.error("에이전트 생성 오류:", error);
    throw new Error("에이전트 생성에 실패했습니다.");
  }
}

export async function getUserAgentsAction() {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return [];
  }

  try {
    return await getUserAgents(session.user.email);
  } catch (error) {
    console.error("에이전트 조회 오류:", error);
    return [];
  }
}

export async function getAgentByIdAction(agentId: string) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return null;
  }

  try {
    return await getAgentById(agentId);
  } catch (error) {
    console.error("에이전트 조회 오류:", error);
    return null;
  }
}
