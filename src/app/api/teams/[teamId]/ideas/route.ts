import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  getIdeas,
  addIdea,
  addChatMessage,
  getTeamById,
  getAgentById,
} from "@/lib/redis";
import {
  generateIdeaAction,
  preIdeationAction,
  executeIdeationAction,
} from "@/lib/openai";

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
    const ideas = await getIdeas(resolvedParams.teamId);
    return NextResponse.json({ ideas });
  } catch (error) {
    console.error("아이디어 조회 오류:", error);
    return NextResponse.json(
      { error: "아이디어를 불러오는데 실패했습니다." },
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
    const { action, author, content, topic } = body;

    if (action === "generate") {
      // OpenAI API를 사용해서 실제 아이디어 생성
      try {
        let agentProfile = null;

        // 작성자가 "나"가 아닌 경우 에이전트 프로필 가져오기
        if (author !== "나") {
          agentProfile = await getAgentById(author);
        }

        const generatedContent = await generateIdeaAction(
          topic || "Carbon Emission Reduction",
          agentProfile
        );

        const newIdea = await addIdea(teamId, {
          author: author || session.user.email,
          timestamp: new Date().toISOString(),
          content: {
            object: generatedContent.object || "생성된 아이디어",
            function: generatedContent.function || "기능 설명",
            behavior:
              typeof generatedContent.behavior === "object"
                ? JSON.stringify(generatedContent.behavior)
                : generatedContent.behavior || "동작 설명",
            structure:
              typeof generatedContent.structure === "object"
                ? JSON.stringify(generatedContent.structure)
                : generatedContent.structure || "구조 설명",
          },
          evaluations: [],
        });

        // 시스템 메시지로 아이디어 생성 알림
        await addChatMessage(teamId, {
          sender: author || session.user.email,
          type: "system",
          payload: {
            content: "새로운 아이디어를 생성했습니다",
          },
        });

        return NextResponse.json({ idea: newIdea });
      } catch (error) {
        console.error("AI 아이디어 생성 오류:", error);
        // 실패시 기본 아이디어로 대체
        const newIdea = await addIdea(teamId, {
          author: author || session.user.email,
          timestamp: new Date().toISOString(),
          content: {
            object: "AI 기반 환경 보호 솔루션",
            function:
              "사용자의 일상 활동을 분석하여 개인화된 환경 보호 제안을 제공하는 AI 시스템",
            behavior:
              "사용자 데이터를 학습하고 실시간으로 환경 친화적인 행동을 권장합니다",
            structure:
              "AI 엔진, 데이터 분석 모듈, 사용자 인터페이스, 추천 시스템으로 구성",
          },
          evaluations: [],
        });

        return NextResponse.json({ idea: newIdea });
      }
    }

    if (action === "add") {
      // 사용자가 수동으로 추가하는 아이디어
      const newIdea = await addIdea(teamId, {
        author: author || session.user.email,
        timestamp: new Date().toISOString(),
        content: {
          object: content.object || "",
          function: content.function || "",
          behavior: content.behavior || "",
          structure: content.structure || "",
        },
        evaluations: [],
      });

      return NextResponse.json({ idea: newIdea });
    }

    if (action === "auto_generate") {
      // AI 에이전트들이 자동으로 아이디어 생성
      try {
        const team = await getTeamById(teamId);
        if (!team) {
          return NextResponse.json(
            { error: "팀을 찾을 수 없습니다." },
            { status: 404 }
          );
        }

        // 현재 아이디어 개수 확인
        const existingIdeas = await getIdeas(teamId);

        // "아이디어 생성하기" 롤을 가진 AI 에이전트들 찾기
        const ideaGenerators = team.members.filter(
          (member) =>
            !member.isUser && member.roles.includes("아이디어 생성하기")
        );

        // 실제로 생성할 에이전트들 (이미 아이디어가 있는 에이전트 제외)
        const agentsToGenerate = ideaGenerators.filter((member) => {
          if (!member.agentId) return false;
          const agentHasIdea = existingIdeas.some(
            (idea) => idea.author === member.agentId
          );
          return !agentHasIdea;
        });

        const generatingAgentIds = agentsToGenerate
          .map((member) => member.agentId)
          .filter((agentId): agentId is string => agentId !== null);

        // 각 에이전트의 아이디어 생성을 병렬로 실행
        const generationPromises = agentsToGenerate.map(async (member) => {
          if (!member.agentId) {
            return null;
          }

          try {
            const agentProfile = await getAgentById(member.agentId);

            // 아이디어 생성 시작 메시지
            await addChatMessage(teamId, {
              sender: member.agentId,
              type: "system",
              payload: {
                content: "아이디어를 생성중입니다...",
              },
            });

            const generatedContent = await generateIdeaAction(
              topic || "Carbon Emission Reduction",
              agentProfile
            );

            const newIdea = await addIdea(teamId, {
              author: member.agentId,
              timestamp: new Date().toISOString(),
              content: {
                object: generatedContent.object || "생성된 아이디어",
                function: generatedContent.function || "기능 설명",
                behavior:
                  typeof generatedContent.behavior === "object"
                    ? JSON.stringify(generatedContent.behavior)
                    : generatedContent.behavior || "동작 설명",
                structure:
                  typeof generatedContent.structure === "object"
                    ? JSON.stringify(generatedContent.structure)
                    : generatedContent.structure || "구조 설명",
              },
              evaluations: [],
            });

            // 시스템 메시지로 아이디어 생성 완료 알림
            await addChatMessage(teamId, {
              sender: member.agentId,
              type: "system",
              payload: {
                content: "새로운 아이디어를 생성했습니다",
              },
            });

            return newIdea;
          } catch (error) {
            console.error(`${member.agentId} 아이디어 생성 오류:`, error);

            // 오류 발생 시 메시지
            await addChatMessage(teamId, {
              sender: member.agentId,
              type: "system",
              payload: {
                content: "아이디어 생성 중 오류가 발생했습니다",
              },
            });

            return null;
          }
        });

        // 모든 생성 작업이 완료될 때까지 기다리지 않고 즉시 응답
        // 백그라운드에서 생성 작업 계속 진행
        Promise.allSettled(generationPromises).then((results) => {
          console.log("모든 아이디어 생성 작업 완료:", results.length);
        });

        return NextResponse.json({
          message: "아이디어 생성을 시작했습니다",
          agentCount: generatingAgentIds.length,
          generatingAgentIds,
        });
      } catch (error) {
        console.error("자동 아이디어 생성 오류:", error);
        return NextResponse.json(
          { error: "자동 아이디어 생성에 실패했습니다." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: "잘못된 액션입니다." }, { status: 400 });
  } catch (error) {
    console.error("아이디어 API 오류:", error);
    return NextResponse.json(
      { error: "아이디어 API 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
