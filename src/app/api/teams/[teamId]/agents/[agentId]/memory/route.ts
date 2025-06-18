import { NextResponse } from "next/server";
import {
  getAgentMemory,
  getTeamById,
  initializeAgentMemory,
  updateAgentMemory,
} from "@/lib/redis";
import { getNewAgentMemory } from "@/lib/memory-v2";
import { AIAgent } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string; agentId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { teamId, agentId } = resolvedParams;

    if (!teamId || !agentId) {
      return NextResponse.json(
        { error: "Team ID and Agent ID are required" },
        { status: 400 }
      );
    }

    let memory = await getAgentMemory(agentId);
    let memoryV2 = await getNewAgentMemory(agentId);

    // v1 메모리가 없으면 즉시 생성
    if (!memory) {
      console.log(`💡 Memory not found for agent ${agentId}. Initializing...`);
      const team = await getTeamById(teamId);
      if (!team) {
        return NextResponse.json(
          { error: "Team not found to initialize memory" },
          { status: 404 }
        );
      }

      const agentProfile = team.members.find((m) => m.agentId === agentId);
      if (!agentProfile) {
        return NextResponse.json(
          { error: "Agent not found in team" },
          { status: 404 }
        );
      }

      const newMemory = await initializeAgentMemory(agentId, team);
      await updateAgentMemory(agentId, newMemory);
      console.log(`✅ Memory initialized and saved for agent ${agentId}.`);
      memory = newMemory;
    }

    return NextResponse.json({
      memoryV1: memory,
      memoryV2: memoryV2,
    });
  } catch (error) {
    console.error(`Error fetching agent memory:`, error);
    return NextResponse.json(
      { error: "Failed to fetch agent memory" },
      { status: 500 }
    );
  }
}
