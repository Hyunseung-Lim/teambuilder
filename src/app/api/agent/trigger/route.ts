import { NextRequest, NextResponse } from "next/server";
import { getTeamById, getAgentById } from "@/lib/redis";
import { Agent } from "@/core/agent";
// We'll need functions to get agent and team info from Redis
// import { getAgentInfo, getTeamInfo } from '@/lib/redis';

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
          const agent = new Agent(agentInfo, teamId);
          await agent.initialize();
          // We don't wait for observe to finish, let them run in background
          agent.observe(trigger, data);
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
