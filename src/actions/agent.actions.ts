"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { createAgent, getUserAgents } from "@/lib/redis";
import { CreateAgentData } from "@/lib/types";

// API route에서 authOptions를 가져와야 합니다
async function getAuthOptions() {
  const { authOptions } = await import("@/app/api/auth/[...nextauth]/route");
  return authOptions;
}

export async function createAgentAction(formData: FormData) {
  // NextAuth 기본 방식으로 세션 가져오기
  const session = await getServerSession();

  if (!session?.user?.email) {
    throw new Error("인증이 필요합니다.");
  }

  const agentData: CreateAgentData = {
    name: formData.get("name") as string,
    age: parseInt(formData.get("age") as string),
    gender: formData.get("gender") as any,
    professional: formData.get("professional") as string,
    skills: formData.get("skills") as string,
    autonomy: parseInt(formData.get("autonomy") as string),
    personality: formData.get("personality") as string,
    value: formData.get("value") as string,
    designStyle: formData.get("designStyle") as string,
  };

  // 유효성 검사
  if (
    !agentData.name ||
    !agentData.age ||
    !agentData.gender ||
    !agentData.professional ||
    !agentData.skills ||
    !agentData.autonomy
  ) {
    throw new Error("필수 정보를 모두 입력해주세요.");
  }

  if (agentData.age < 1 || agentData.age > 100) {
    throw new Error("나이는 1-100 사이의 값이어야 합니다.");
  }

  if (agentData.autonomy < 1 || agentData.autonomy > 5) {
    throw new Error("자율성은 1-5 사이의 값이어야 합니다.");
  }

  try {
    const createdAgent = await createAgent({
      ...agentData,
      ownerId: session.user.email, // 이메일을 ID로 사용
    });

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
