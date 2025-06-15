"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import {
  createTeam,
  getUserTeams,
  getTeamById,
  deleteTeam,
  getUserByEmail,
} from "@/lib/redis";
import { AgentRole, Relationship } from "@/lib/types";

export async function createTeamAction(formData: FormData) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    throw new Error("인증이 필요합니다.");
  }

  const teamName = formData.get("teamName") as string;
  const topic = formData.get("topic") as string;
  const selectedAgents = JSON.parse(formData.get("selectedAgents") as string);
  const relationships = JSON.parse(
    (formData.get("relationships") as string) || "[]"
  );

  if (!teamName || !topic || selectedAgents.length === 0) {
    throw new Error("팀 이름, 주제, 에이전트를 모두 입력해주세요.");
  }

  // 각 멤버가 최소 하나의 역할을 가지는지 확인
  for (const member of selectedAgents) {
    if (!member.roles || member.roles.length === 0) {
      throw new Error("모든 팀원에게 최소 하나의 역할을 할당해주세요.");
    }
  }

  try {
    const user = await getUserByEmail(session.user.email);
    if (!user) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    // 팀 생성
    const team = await createTeam({
      teamName,
      topic,
      members: selectedAgents,
      relationships,
      ownerId: user.id,
    });

    console.log("✅ 팀 생성 완료:", team.id);

    // 새로운 에이전트 상태 시스템은 자동으로 초기화됨 (agent-states API에서 처리)
    console.log("✅ 에이전트 상태 시스템은 첫 요청 시 자동 초기화됩니다");

    revalidatePath("/");
    redirect("/");
    return team;
  } catch (error) {
    // Next.js redirect는 정상 동작이므로 다시 throw
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    console.error("팀 생성 오류:", error);
    throw new Error("팀 생성에 실패했습니다.");
  }
}

export async function getTeamAction(teamId: string) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    throw new Error("인증이 필요합니다.");
  }

  try {
    const user = await getUserByEmail(session.user.email);
    if (!user) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    const team = await getTeamById(teamId);
    if (!team || team.ownerId !== user.id) {
      throw new Error("팀을 찾을 수 없거나 접근 권한이 없습니다.");
    }
    return team;
  } catch (error) {
    console.error("팀 조회 오류:", error);
    throw new Error("팀 정보를 가져오는데 실패했습니다.");
  }
}

export async function getUserTeamsAction() {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return [];
  }

  try {
    // 이메일로 사용자 정보를 먼저 조회
    const user = await getUserByEmail(session.user.email);
    if (!user) {
      console.error("사용자를 찾을 수 없습니다:", session.user.email);
      return [];
    }

    // 사용자 ID로 팀 목록 조회
    return await getUserTeams(user.id);
  } catch (error) {
    console.error("팀 조회 오류:", error);
    return [];
  }
}

export async function deleteTeamAction(teamId: string) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    throw new Error("인증이 필요합니다.");
  }

  try {
    const user = await getUserByEmail(session.user.email);
    if (!user) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    await deleteTeam(teamId, user.id);
    revalidatePath("/");
  } catch (error) {
    console.error("팀 삭제 오류:", error);
    throw new Error("팀 삭제에 실패했습니다.");
  }
}
