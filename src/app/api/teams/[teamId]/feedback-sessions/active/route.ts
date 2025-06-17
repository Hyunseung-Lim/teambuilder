import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { FeedbackSession } from "@/lib/types";

// 활성 피드백 세션만 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    const activeSessionIds = await redis.smembers(
      `team:${teamId}:active_feedback_sessions`
    );
    const sessions: FeedbackSession[] = [];
    const sessionsToCleanup: string[] = [];

    for (const sessionId of activeSessionIds) {
      const sessionData = await redis.get(`feedback_session:${sessionId}`);
      if (sessionData) {
        const session: FeedbackSession =
          typeof sessionData === "string"
            ? JSON.parse(sessionData)
            : sessionData;

        // 세션이 실제로 활성 상태인지 확인
        if (session.status === "active") {
          // 세션이 너무 오래된 경우 (24시간 이상) 자동 종료
          const sessionAge = Date.now() - new Date(session.createdAt).getTime();
          const maxAge = 24 * 60 * 60 * 1000; // 24시간

          if (sessionAge > maxAge) {
            console.log(
              `🧹 오래된 활성 세션 자동 정리: ${sessionId} (${Math.floor(
                sessionAge / (60 * 60 * 1000)
              )}시간 경과)`
            );
            sessionsToCleanup.push(sessionId);
          } else {
            sessions.push(session);
          }
        } else {
          // 이미 종료된 세션이지만 활성 목록에 남아있는 경우
          console.log(
            `🧹 종료된 세션을 활성 목록에서 제거: ${sessionId} (상태: ${session.status})`
          );
          sessionsToCleanup.push(sessionId);
        }
      } else {
        // 세션 데이터가 없는 경우
        console.log(`🧹 데이터가 없는 세션을 활성 목록에서 제거: ${sessionId}`);
        sessionsToCleanup.push(sessionId);
      }
    }

    // 정리가 필요한 세션들을 활성 목록에서 제거
    const activeSessionsKey = `team:${teamId}:active_feedback_sessions`;
    for (const sessionId of sessionsToCleanup) {
      await redis.srem(activeSessionsKey, sessionId);
    }

    if (sessionsToCleanup.length > 0) {
      console.log(
        `✅ ${sessionsToCleanup.length}개의 비활성 세션을 정리했습니다.`
      );
    }

    return NextResponse.json({
      sessions,
      cleanedUp: sessionsToCleanup.length,
    });
  } catch (error) {
    console.error("활성 피드백 세션 조회 실패:", error);
    return NextResponse.json(
      { error: "활성 피드백 세션 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
