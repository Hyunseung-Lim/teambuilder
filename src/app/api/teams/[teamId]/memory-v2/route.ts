import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  getNewAgentMemory,
  saveNewAgentMemory,
  createNewAgentMemory,
  migrateAllAgentsToNewMemory,
  triggerMemoryUpdate,
  processMemoryConsolidation,
} from "@/lib/memory-v2";
import { getTeamById } from "@/lib/redis";
import { MemoryUpdateLog } from "@/lib/types";

// 새로운 메모리 시스템 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const { teamId } = resolvedParams;
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const action = searchParams.get("action");

    if (action === "migrate") {
      // 팀 전체 메모리 마이그레이션
      await migrateAllAgentsToNewMemory(teamId);
      return NextResponse.json({
        success: true,
        message: `팀 ${teamId}의 모든 에이전트 메모리가 새로운 구조로 마이그레이션되었습니다.`,
      });
    }

    if (action === "status") {
      // 팀의 메모리 마이그레이션 상태 확인
      const team = await getTeamById(teamId);
      if (!team) {
        return NextResponse.json(
          { error: "팀을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const agentIds = team.members
        .filter((member) => !member.isUser && member.agentId)
        .map((member) => member.agentId!);

      const status = await Promise.all(
        agentIds.map(async (id) => {
          const newMemory = await getNewAgentMemory(id);
          const agent = team.members.find((m) => m.agentId === id);
          return {
            agentId: id,
            agentName: agent?.name || "Unknown",
            hasNewMemory: !!newMemory,
            lastUpdate: newMemory?.lastMemoryUpdate || null,
            knowledgePreview:
              newMemory?.longTerm.knowledge?.substring(0, 100) + "..." || null,
          };
        })
      );

      return NextResponse.json({
        teamId,
        totalAgents: agentIds.length,
        migratedAgents: status.filter((s) => s.hasNewMemory).length,
        agents: status,
      });
    }

    if (agentId) {
      // 특정 에이전트의 새로운 메모리 조회
      const memory = await getNewAgentMemory(agentId);
      if (!memory) {
        return NextResponse.json(
          {
            error: "새로운 구조의 메모리를 찾을 수 없습니다.",
            agentId,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        agentId,
        memory,
        structure: "new",
        lastUpdate: memory.lastMemoryUpdate,
      });
    }

    return NextResponse.json(
      {
        error: "agentId 또는 action 파라미터가 필요합니다.",
        availableActions: ["migrate", "status"],
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("새로운 메모리 시스템 조회 실패:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// 새로운 메모리 시스템 업데이트
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const { teamId } = resolvedParams;
    const body = await request.json();
    const { action, agentId, eventType, content, relatedAgentId, updateLogs } =
      body;

    switch (action) {
      case "trigger_update":
        // 단일 이벤트로 메모리 업데이트 트리거
        if (!agentId || !eventType || !content) {
          return NextResponse.json(
            {
              error: "agentId, eventType, content가 필요합니다.",
              required: ["agentId", "eventType", "content"],
              optional: ["relatedAgentId"],
            },
            { status: 400 }
          );
        }

        await triggerMemoryUpdate(
          agentId,
          eventType,
          content,
          relatedAgentId,
          teamId
        );

        return NextResponse.json({
          success: true,
          message: `에이전트 ${agentId}의 메모리가 업데이트되었습니다.`,
          event: { eventType, content, relatedAgentId },
        });

      case "bulk_update":
        // 여러 로그로 메모리 통합 업데이트
        if (!agentId || !updateLogs || !Array.isArray(updateLogs)) {
          return NextResponse.json(
            {
              error: "agentId와 updateLogs 배열이 필요합니다.",
              required: ["agentId", "updateLogs"],
            },
            { status: 400 }
          );
        }

        await processMemoryConsolidation(
          agentId,
          updateLogs as MemoryUpdateLog[],
          teamId
        );

        return NextResponse.json({
          success: true,
          message: `에이전트 ${agentId}의 메모리가 ${updateLogs.length}개 로그로 통합 업데이트되었습니다.`,
          logsProcessed: updateLogs.length,
        });

      case "create_new":
        // 새로운 메모리 강제 생성
        if (!agentId) {
          return NextResponse.json(
            {
              error: "agentId가 필요합니다.",
            },
            { status: 400 }
          );
        }

        const team = await getTeamById(teamId);
        if (!team) {
          return NextResponse.json(
            {
              error: "팀을 찾을 수 없습니다.",
            },
            { status: 404 }
          );
        }

        const newMemory = await createNewAgentMemory(agentId, team);
        await saveNewAgentMemory(agentId, newMemory);

        return NextResponse.json({
          success: true,
          message: `에이전트 ${agentId}의 새로운 메모리가 생성되었습니다.`,
          memory: newMemory,
        });

      default:
        return NextResponse.json(
          {
            error: "알 수 없는 액션입니다.",
            availableActions: ["trigger_update", "bulk_update", "create_new"],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("새로운 메모리 시스템 업데이트 실패:", error);
    return NextResponse.json(
      {
        error: "서버 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
