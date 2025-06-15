import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getChatHistory, addChatMessage } from "@/lib/redis";
import { ChatMessage } from "@/lib/types";

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
      console.log(
        `📨 아이디어 생성 요청 - 에이전트 ${messagePayload.mention}에게 전달`
      );

      // 새로운 에이전트 상태 시스템을 통해 요청 처리
      const requestData = {
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "generate_idea",
        requesterName: sender || session?.user?.email || "팀원",
        payload: {
          message: messagePayload.content,
        },
        timestamp: new Date().toISOString(),
        teamId: teamId,
      };

      // 에이전트 상태 API를 통해 요청 처리
      fetch(
        `${
          process.env.NEXTAUTH_URL || "http://localhost:3000"
        }/api/teams/${teamId}/agent-states`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: messagePayload.mention,
            action: "process_request",
            requestData: requestData,
          }),
        }
      )
        .then(async (response) => {
          if (response.ok) {
            const result = await response.json();
            if (result.queued) {
              console.log(
                `⏳ 에이전트 ${messagePayload.mention} 바쁨 - 큐에 추가됨`
              );
            } else {
              console.log(
                `🔄 에이전트 ${messagePayload.mention} 즉시 처리 시작`
              );
            }
          } else {
            console.error(
              `❌ 에이전트 ${messagePayload.mention} 요청 처리 실패:`,
              response.status
            );
          }
        })
        .catch((error) => {
          console.error(
            `❌ 에이전트 ${messagePayload.mention} 요청 전달 실패:`,
            error
          );
        });
    }

    // Check if it's an evaluation request and trigger the action
    if (
      messageType === "request" &&
      messagePayload.requestType === "evaluate"
    ) {
      console.log(
        `📨 아이디어 평가 요청 - 에이전트 ${messagePayload.mention}에게 전달`
      );

      // 새로운 에이전트 상태 시스템을 통해 요청 처리
      const requestData = {
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: "evaluate_idea",
        requesterName: sender || session?.user?.email || "팀원",
        payload: {
          message: messagePayload.content,
        },
        timestamp: new Date().toISOString(),
        teamId: teamId,
      };

      // 에이전트 상태 API를 통해 요청 처리
      fetch(
        `${
          process.env.NEXTAUTH_URL || "http://localhost:3000"
        }/api/teams/${teamId}/agent-states`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: messagePayload.mention,
            action: "process_request",
            requestData: requestData,
          }),
        }
      )
        .then(async (response) => {
          if (response.ok) {
            const result = await response.json();
            if (result.queued) {
              console.log(
                `⏳ 에이전트 ${messagePayload.mention} 바쁨 - 큐에 추가됨`
              );
            } else {
              console.log(
                `🔄 에이전트 ${messagePayload.mention} 즉시 처리 시작`
              );
            }
          } else {
            console.error(
              `❌ 에이전트 ${messagePayload.mention} 요청 처리 실패:`,
              response.status
            );
          }
        })
        .catch((error) => {
          console.error(
            `❌ 에이전트 ${messagePayload.mention} 요청 전달 실패:`,
            error
          );
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
