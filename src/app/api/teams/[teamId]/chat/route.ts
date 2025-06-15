import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getChatHistory, addChatMessage } from "@/lib/redis";
import {
  generateIdeaViaRequest,
  evaluateIdeaViaRequest,
} from "@/actions/ideation.actions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const messages = await getChatHistory(resolvedParams.teamId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("채팅 메시지 조회 오류:", error);
    return NextResponse.json(
      { error: "채팅 메시지를 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const teamId = resolvedParams.teamId;
    const body = await request.json();
    const { sender, payload } = body;

    const messageType = payload?.type || "give_feedback";
    const messagePayload = payload || { content: body.content };

    const newMessage = await addChatMessage(teamId, {
      sender: sender || session.user.email,
      type: messageType,
      payload: messagePayload,
    });

    // Check if it's a generation request and trigger the action
    if (
      messageType === "request" &&
      messagePayload.requestType === "generate"
    ) {
      // Don't wait for the generation to finish, run it in the background
      generateIdeaViaRequest({
        teamId: teamId,
        agentId: messagePayload.mention,
        requestMessage: messagePayload.content,
        topic: "Current Ideation Topic", // Consider passing the actual topic
      }).then((result) => {
        if (result.success) {
          console.log(
            `Successfully generated idea for agent ${messagePayload.mention}`
          );
        } else {
          console.error(
            `Failed to generate idea for agent ${messagePayload.mention}: ${result.error}`
          );
        }
      });
    }

    // Check if it's an evaluation request and trigger the action
    if (
      messageType === "request" &&
      messagePayload.requestType === "evaluate"
    ) {
      // Don't wait for the evaluation to finish, run it in the background
      evaluateIdeaViaRequest({
        teamId: teamId,
        agentId: messagePayload.mention,
        requestMessage: messagePayload.content,
        requesterName: sender || session.user.email || "팀원",
      }).then((result) => {
        if (result.success) {
          console.log(
            `Successfully evaluated idea for agent ${messagePayload.mention}`
          );
        } else {
          console.error(
            `Failed to evaluate idea for agent ${messagePayload.mention}: ${result.error}`
          );
        }
      });
    }

    return NextResponse.json({ message: newMessage });
  } catch (error) {
    console.error("채팅 메시지 전송 오류:", error);
    return NextResponse.json(
      { error: "메시지 전송에 실패했습니다." },
      { status: 500 }
    );
  }
}
