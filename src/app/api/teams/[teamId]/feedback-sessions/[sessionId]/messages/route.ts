import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { FeedbackSession, FeedbackSessionMessage } from "@/lib/types";
import { processMemoryUpdate } from "@/lib/memory";

// 피드백 세션 메시지 전송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; sessionId: string }> }
) {
  try {
    const { teamId, sessionId } = await params;
    const body = await request.json();
    const { sender, content, type = "message" } = body;

    // 세션 존재 확인
    const sessionData = await redis.get(`feedback_session:${sessionId}`);
    if (!sessionData) {
      return NextResponse.json(
        { error: "세션을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const session: FeedbackSession =
      typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;

    // 세션이 활성 상태인지 확인
    if (session.status !== "active") {
      return NextResponse.json(
        { error: "비활성 세션입니다." },
        { status: 400 }
      );
    }

    // 발송자가 세션 참가자인지 확인
    const isParticipant = session.participants.some((p) => {
      // "나", "user", 또는 실제 sender ID와 일치하는지 확인
      return (
        p.id === sender ||
        (sender === "나" && (p.id === "나" || p.id === "user" || p.isUser)) ||
        (sender === "user" && (p.id === "나" || p.id === "user" || p.isUser))
      );
    });

    if (!isParticipant) {
      console.log("❌ 세션 참가자 확인 실패:", {
        sender,
        participants: session.participants.map((p) => ({
          id: p.id,
          name: p.name,
          isUser: p.isUser,
        })),
      });
      return NextResponse.json(
        { error: "세션 참가자가 아닙니다." },
        { status: 403 }
      );
    }

    // 새 메시지 생성
    const newMessage: FeedbackSessionMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender,
      content,
      timestamp: new Date().toISOString(),
      type,
    };

    // 세션에 메시지 추가
    session.messages.push(newMessage);

    // Redis에 업데이트된 세션 저장
    await redis.set(`feedback_session:${sessionId}`, JSON.stringify(session), {
      ex: 3600 * 24,
    });

    // 메모리 업데이트 - 각 참가자의 short-term memory에 활성 채팅 정보 저장
    for (const participant of session.participants) {
      try {
        await processMemoryUpdate({
          type: "FEEDBACK_SESSION_MESSAGE",
          payload: {
            teamId,
            sessionId,
            participantId: participant.id,
            message: newMessage,
            otherParticipants: session.participants.filter(
              (p) => p.id !== participant.id
            ),
          },
        });
      } catch (memoryError) {
        console.error(`메모리 업데이트 실패 (${participant.id}):`, memoryError);
      }
    }

    console.log(`📨 피드백 세션 메시지 전송 완료: ${sessionId}`);

    return NextResponse.json({
      success: true,
      message: newMessage,
      session,
    });
  } catch (error) {
    console.error("피드백 세션 메시지 전송 실패:", error);
    return NextResponse.json(
      { error: "메시지 전송에 실패했습니다." },
      { status: 500 }
    );
  }
}

// 피드백 세션 메시지 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // 세션 존재 확인
    const sessionData = await redis.get(`feedback_session:${sessionId}`);
    if (!sessionData) {
      return NextResponse.json(
        { error: "세션을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const session: FeedbackSession =
      typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;

    return NextResponse.json({
      messages: session.messages,
      session,
    });
  } catch (error) {
    console.error("피드백 세션 메시지 조회 실패:", error);
    return NextResponse.json(
      { error: "메시지 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
