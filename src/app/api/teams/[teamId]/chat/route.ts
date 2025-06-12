import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getChatHistory, addChatMessage } from "@/lib/redis";

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
    const body = await request.json();
    console.log("채팅 메시지 추가 시작:", {
      teamId: resolvedParams.teamId,
      message: body,
    });

    const { sender, payload } = body;

    // 새로운 payload 구조와 기존 구조 모두 지원
    const messageType = payload?.type || "feedback";
    const messagePayload = payload || { content: body.content };

    const newMessage = await addChatMessage(resolvedParams.teamId, {
      sender: sender || session.user.email,
      type: messageType,
      payload: messagePayload,
    });

    console.log("생성된 채팅 메시지:", newMessage);
    return NextResponse.json({ message: newMessage });
  } catch (error) {
    console.error("채팅 메시지 전송 오류:", error);
    return NextResponse.json(
      { error: "메시지 전송에 실패했습니다." },
      { status: 500 }
    );
  }
}
