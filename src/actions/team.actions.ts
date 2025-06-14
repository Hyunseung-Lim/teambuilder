"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { createTeam, getUserTeams, getTeamById, deleteTeam } from "@/lib/redis";
import { AgentRole, Relationship } from "@/lib/types";
import AgentStateManager from "@/lib/agent-state-manager";

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
      createdBy: user.id,
    });

    console.log("✅ 팀 생성 완료:", team.id);

    // 에이전트 상태 시스템 초기화
    const stateManager = AgentStateManager.getInstance();

    for (const member of selectedAgents) {
      if (!member.isUser && member.agentId) {
        console.log(`🚀 에이전트 ${member.agentId} 상태 시스템 초기화 중...`);
        await stateManager.initializeAgent(member.agentId, team.id);
      }
    }

    console.log("✅ 모든 에이전트 상태 시스템 초기화 완료");

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
    const team = await getTeamById(teamId);
    if (!team || team.ownerId !== session.user.email) {
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
    return await getUserTeams(session.user.email);
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
    await deleteTeam(teamId, session.user.email);
    revalidatePath("/");
  } catch (error) {
    console.error("팀 삭제 오류:", error);
    throw new Error("팀 삭제에 실패했습니다.");
  }
}
