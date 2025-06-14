import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getIdeas, updateIdea } from "@/lib/redis";
import { Evaluation } from "@/lib/types";

export async function POST(
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

    if (isNaN(ideaId)) {
      return NextResponse.json(
        { error: "유효하지 않은 아이디어 ID입니다." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { evaluator, scores, comment } = body;

    // 입력 검증
    if (!evaluator || !scores) {
      return NextResponse.json(
        { error: "평가자와 점수는 필수 입력 사항입니다." },
        { status: 400 }
      );
    }

    if (
      !scores.insightful ||
      !scores.actionable ||
      !scores.relevance ||
      scores.insightful < 1 ||
      scores.insightful > 5 ||
      scores.actionable < 1 ||
      scores.actionable > 5 ||
      scores.relevance < 1 ||
      scores.relevance > 5
    ) {
      return NextResponse.json(
        { error: "모든 점수는 1-5 사이의 값이어야 합니다." },
        { status: 400 }
      );
    }

    // 현재 아이디어 조회
    const ideas = await getIdeas(teamId);
    const targetIdea = ideas.find((idea) => idea.id === ideaId);

    if (!targetIdea) {
      return NextResponse.json(
        { error: "아이디어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 이미 평가한 사용자인지 확인
    const existingEvaluation = targetIdea.evaluations.find(
      (evaluation) => evaluation.evaluator === evaluator
    );

    if (existingEvaluation) {
      return NextResponse.json(
        { error: "이미 이 아이디어를 평가하셨습니다." },
        { status: 400 }
      );
    }

    // 새로운 평가 생성
    const newEvaluation: Evaluation = {
      evaluator,
      timestamp: new Date().toISOString(),
      scores: {
        insightful: scores.insightful,
        actionable: scores.actionable,
        relevance: scores.relevance,
      },
      comment: comment || "",
    };

    // 아이디어에 평가 추가
    const updatedEvaluations = [...targetIdea.evaluations, newEvaluation];
    const updatedIdea = await updateIdea(teamId, ideaId, {
      evaluations: updatedEvaluations,
    });

    if (!updatedIdea) {
      return NextResponse.json(
        { error: "평가 저장에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "평가가 성공적으로 제출되었습니다.",
      evaluation: newEvaluation,
      idea: updatedIdea,
    });
  } catch (error) {
    console.error("아이디어 평가 API 오류:", error);
    return NextResponse.json(
      { error: "평가 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
