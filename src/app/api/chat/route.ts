import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 1. Get message from user
    const body = await request.json();
    const { teamId, userId, message } = body;

    // 2. Save user message to Redis chat history
    // TODO: await addChatMessage(...)

    // 3. Trigger observation for all relevant agents
    // TODO: Loop through team members and call agent.observe(...)
    // This could be done by calling the /api/agent/trigger endpoint for each agent.

    // For now, just return a success message
    return NextResponse.json({ success: true, message: "Chat received." });
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
