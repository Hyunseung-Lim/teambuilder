"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { createTeam, getUserTeams } from "@/lib/redis";
import { AgentRole, Relationship } from "@/lib/types";

export async function createTeamAction(formData: FormData) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    throw new Error("인증이 필요합니다.");
  }

  const teamName = formData.get("teamName") as string;
  const selectedAgents = JSON.parse(formData.get("selectedAgents") as string);
  const relationships = JSON.parse(
    (formData.get("relationships") as string) || "[]"
  );

  if (!teamName || selectedAgents.length === 0) {
    throw new Error("팀 이름과 에이전트를 선택해주세요.");
  }

  // 각 멤버가 최소 하나의 역할을 가지는지 확인
  for (const member of selectedAgents) {
    if (!member.roles || member.roles.length === 0) {
      throw new Error("모든 팀원에게 최소 하나의 역할을 할당해주세요.");
    }
  }

  try {
    await createTeam({
      teamName,
      members: selectedAgents,
      relationships,
      ownerId: session.user.email,
    });

    revalidatePath("/");
    redirect("/");
  } catch (error) {
    // Next.js redirect는 정상 동작이므로 다시 throw
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    console.error("팀 생성 오류:", error);
    throw new Error("팀 생성에 실패했습니다.");
  }
}

export async function getUserTeamsAction() {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return [];
  }

  try {
    return await getUserTeams(session.user.email);
  } catch (error) {
    console.error("팀 조회 오류:", error);
    return [];
  }
}
