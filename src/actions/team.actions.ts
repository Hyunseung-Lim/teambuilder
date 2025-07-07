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

  try {
    // 폼 데이터 파싱
    const teamName = formData.get("teamName") as string;
    const topic = formData.get("topic") as string;
    const members = JSON.parse(formData.get("members") as string);
    const relationships = JSON.parse(formData.get("relationships") as string);
    const nodePositions = JSON.parse(formData.get("nodePositions") as string || "{}");
    const sharedMentalModel = formData.get("sharedMentalModel") as string;

    console.log("=== createTeamAction에서 받은 데이터 ===");
    console.log("relationships:", JSON.stringify(relationships, null, 2));
    console.log("nodePositions:", JSON.stringify(nodePositions, null, 2));

    if (!teamName || !topic || !members || !relationships) {
      const missingItems = [];
      if (!teamName) missingItems.push("팀 이름 (1단계)");
      if (!topic) missingItems.push("아이디에이션 주제 (1단계)");
      if (!members) missingItems.push("팀원 정보 (3단계)");
      if (!relationships) missingItems.push("팀원 관계 (4단계)");
      
      return { 
        success: false, 
        error: `필수 정보가 누락되었습니다.\n누락된 정보: ${missingItems.join(", ")}` 
      };
    }

    // 각 멤버가 최소 하나의 역할을 가지는지 확인
    for (const member of members) {
      if (!member.roles || member.roles.length === 0) {
        throw new Error("모든 팀원에게 최소 하나의 역할을 할당해주세요. (2단계에서 역할 설정)");
      }
    }

    const user = await getUserByEmail(session.user.email);
    if (!user) {
      throw new Error("사용자를 찾을 수 없습니다.");
    }

    // 팀 생성
    const team = await createTeam({
      teamName,
      topic,
      members,
      relationships,
      nodePositions,
      sharedMentalModel,
      ownerId: user.id,
    });

    revalidatePath("/dashboard/teams");
    return { success: true, teamId: team.id };
  } catch (error) {
    return { success: false, error: "팀 생성에 실패했습니다." };
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
