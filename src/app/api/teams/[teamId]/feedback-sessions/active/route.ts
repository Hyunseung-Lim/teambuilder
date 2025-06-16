import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // 팀의 활성 피드백 세션 목록 조회
    const activeSessionsKey = `team:${teamId}:active_feedback_sessions`;
    const sessionIds = await redis.smembers(activeSessionsKey);

    if (sessionIds.length === 0) {
      return NextResponse.json({
        sessionIds: [],
        sessions: [],
        count: 0,
      });
    }

    // 각 세션의 상세 정보 조회
    const sessions = [];
    for (const sessionId of sessionIds) {
      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (sessionData) {
        const session =
          typeof sessionData === "string"
            ? JSON.parse(sessionData)
            : sessionData;
        if (session.status === "active") {
          sessions.push(session);
        } else {
          // 비활성 세션은 목록에서 제거
          await redis.srem(activeSessionsKey, sessionId);
        }
      } else {
        // 존재하지 않는 세션은 목록에서 제거
        await redis.srem(activeSessionsKey, sessionId);
      }
    }

    return NextResponse.json({
      sessionIds: sessions.map((s) => s.id),
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error("활성 피드백 세션 조회 실패:", error);
    return NextResponse.json(
      { error: "활성 피드백 세션 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
