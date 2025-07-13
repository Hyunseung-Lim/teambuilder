import { NextRequest, NextResponse } from "next/server";
import { getTeamById, getAgentById } from "@/lib/redis";
import { updateAgentStateTimer } from "@/lib/agent-state-manager";

export async function POST(req: NextRequest) {
  try {
    const { teamId, trigger, data } = await req.json();

    if (!teamId || !trigger) {
      return NextResponse.json(
        { message: "teamId and trigger are required" },
        { status: 400 }
      );
    }

    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json({ message: "Team not found" }, { status: 404 });
    }

    const agentPromises = team.members
      .filter((member) => !member.isUser && member.agentId)
      .map(async (member) => {
        const agentInfo = await getAgentById(member.agentId!);
        if (agentInfo) {
          // Trigger agent state update instead of legacy Agent class
          await updateAgentStateTimer(teamId, member.agentId!, agentInfo);
        }
      });

    await Promise.all(agentPromises);

    return NextResponse.json({
      message: "Agents triggered successfully",
      teamId,
    });
  } catch (error) {
    console.error("Error triggering agents:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
