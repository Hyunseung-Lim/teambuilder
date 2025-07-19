import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getIdeas, addIdea, getTeamById } from "@/lib/redis";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; ideaId: string }> }
) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const teamId = resolvedParams.teamId;
    const ideaId = parseInt(resolvedParams.ideaId);

    console.log(`🔄 아이디어 업데이트 API 요청 - 팀ID: ${teamId}, 아이디어ID: ${ideaId}`);

    if (isNaN(ideaId)) {
      console.error(`❌ 유효하지 않은 아이디어 ID: ${resolvedParams.ideaId}`);
      return NextResponse.json(
        { error: "유효하지 않은 아이디어 ID입니다." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { content } = body;

    console.log(`📝 아이디어 업데이트 요청 데이터:`, { content });

    if (!content) {
      return NextResponse.json(
        { error: "업데이트할 내용이 필요합니다." },
        { status: 400 }
      );
    }

    // 현재 아이디어 조회
    const ideas = await getIdeas(teamId);
    const targetIdea = ideas.find((idea) => idea.id === ideaId);

    console.log(
      `🔍 아이디어 조회 결과 - 전체: ${ideas.length}개, 대상: ${
        targetIdea ? "Found" : "Not Found"
      }`
    );

    if (!targetIdea) {
      console.error(`❌ 아이디어 ${ideaId} 찾을 수 없음`);
      return NextResponse.json(
        { error: "아이디어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 팀 존재 여부 및 권한 확인
    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json(
        { error: "팀을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 사용자가 팀 멤버인지 확인
    const userMember = team.members.find(member => member.isUser);
    if (!userMember) {
      return NextResponse.json(
        { error: "팀 멤버가 아닙니다." },
        { status: 403 }
      );
    }

    // 아이디어 업데이트 권한 확인
    const hasUpdatePermission = userMember.roles.includes("아이디어 생성하기");
    if (!hasUpdatePermission) {
      return NextResponse.json(
        { error: "아이디어 업데이트 권한이 없습니다." },
        { status: 403 }
      );
    }

    console.log("✅ 아이디어 업데이트 권한 확인 완료");

    // 업데이트된 아이디어를 새로운 아이디어로 추가
    const updatedIdea = await addIdea(teamId, {
      author: "나", // 업데이트한 사용자가 새 아이디어의 작성자
      timestamp: new Date().toISOString(),
      content: {
        object: content.object || "",
        function: content.function || "",
        behavior: content.behavior || "",
        structure: content.structure || "",
      },
      evaluations: [], // 새 아이디어이므로 평가는 비어있음
    });

    console.log("✅ 아이디어 업데이트 성공:", updatedIdea.id);

    return NextResponse.json({
      message: "기존 아이디어를 업데이트하여 새로운 아이디어를 생성했습니다.",
      idea: updatedIdea,
    });

  } catch (error) {
    console.error("아이디어 업데이트 API 오류:", error);
    return NextResponse.json(
      { error: "아이디어 업데이트 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}