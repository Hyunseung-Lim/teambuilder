import { NextRequest, NextResponse } from "next/server";
import {
  getTeamById,
  addIdea,
  getAgentMemory,
  updateAgentMemory,
} from "@/lib/redis";
import { generateIdea } from "@/lib/openai";

export async function POST(
  request: NextRequest,
  { params }: { params: { teamId: string; agentId: string } }
) {
  try {
    const { teamId, agentId } = params;
    const body = await request.json();
    const { trigger, topic, teamContext } = body;

    console.log(`🎯 에이전트 ${agentId} 아이디어 생성 요청:`, {
      trigger,
      topic,
    });

    // 팀 정보 가져오기
    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // 에이전트가 팀에 속해있는지 확인
    const teamMember = team.members.find(
      (member) => !member.isUser && member.agentId === agentId
    );
    if (!teamMember) {
      return NextResponse.json({ error: "Agent not in team" }, { status: 403 });
    }

    // 에이전트가 아이디어 생성 역할을 가지고 있는지 확인
    if (!teamMember.roles.includes("아이디어 생성하기")) {
      return NextResponse.json(
        {
          error: "Agent does not have idea generation role",
        },
        { status: 403 }
      );
    }

    // 에이전트 메모리 가져오기
    const agentMemory = await getAgentMemory(agentId);

    // 아이디어 생성 요청
    const ideaResult = await generateIdea({
      agentId,
      topic: topic || team.topic || "",
      teamContext: {
        teamName: team.teamName,
        topic: topic || team.topic || "",
        memberCount: team.members.length,
        ...teamContext,
      },
      trigger: trigger || "manual",
      memory: agentMemory,
    });

    if (!ideaResult.success || !ideaResult.idea) {
      console.error(
        `❌ 에이전트 ${agentId} 아이디어 생성 실패:`,
        ideaResult.error
      );
      return NextResponse.json(
        {
          error: ideaResult.error || "Failed to generate idea",
        },
        { status: 500 }
      );
    }

    // 아이디어를 팀에 추가
    const savedIdea = await addIdea(teamId, {
      author: agentId,
      timestamp: new Date().toISOString(),
      content: ideaResult.idea,
      evaluations: [],
    });

    console.log(`✅ 에이전트 ${agentId} 아이디어 생성 완료:`, savedIdea.id);

    // 메모리 업데이트 (생성된 아이디어 기록)
    if (agentMemory && ideaResult.updatedMemory) {
      await updateAgentMemory(agentId, ideaResult.updatedMemory);
    }

    return NextResponse.json({
      success: true,
      idea: savedIdea,
      message: `아이디어가 성공적으로 생성되었습니다.`,
    });
  } catch (error) {
    console.error("아이디어 생성 API 오류:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
