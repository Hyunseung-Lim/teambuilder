import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getIdeas, updateIdea } from "@/lib/redis";
import { Evaluation } from "@/lib/types";
import { processMemoryUpdate } from "@/lib/memory";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; ideaId: string }> }
) {
  // 시스템 내부 호출 확인 (AI 에이전트의 자율적 평가)
  const isSystemCall =
    request.headers.get("x-system-internal") === "true" ||
    request.headers.get("user-agent") === "TeamBuilder-Internal";

  if (!isSystemCall) {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }
  }

  try {
    const resolvedParams = await params;
    const teamId = resolvedParams.teamId;
    const ideaId = parseInt(resolvedParams.ideaId);

    console.log(`📊 평가 API 요청 - 팀ID: ${teamId}, 아이디어ID: ${ideaId}`);

    if (isNaN(ideaId)) {
      console.error(`❌ 유효하지 않은 아이디어 ID: ${resolvedParams.ideaId}`);
      return NextResponse.json(
        { error: "유효하지 않은 아이디어 ID입니다." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { evaluator, scores, comment } = body;

    console.log(`📋 평가 요청 데이터:`, {
      evaluator,
      scores,
      comment,
      isSystemCall,
    });

    // 입력 검증
    if (!evaluator || !scores) {
      console.error(
        `❌ 필수 데이터 누락 - evaluator: ${evaluator}, scores: ${JSON.stringify(
          scores
        )}`
      );
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
      scores.insightful > 7 ||
      scores.actionable < 1 ||
      scores.actionable > 7 ||
      scores.relevance < 1 ||
      scores.relevance > 7
    ) {
      console.error(`❌ 점수 범위 오류:`, {
        insightful: scores.insightful,
        actionable: scores.actionable,
        relevance: scores.relevance,
      });
      return NextResponse.json(
        { error: "모든 점수는 1-7 사이의 값이어야 합니다." },
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

    // 이미 평가한 사용자인지 확인
    const existingEvaluation = targetIdea.evaluations.find(
      (evaluation) => evaluation.evaluator === evaluator
    );

    console.log(
      `🔄 중복 평가 확인 - 기존 평가: ${existingEvaluation ? "Found" : "None"}`
    );

    if (existingEvaluation) {
      console.error(`❌ ${evaluator}가 이미 아이디어 ${ideaId} 평가함`);
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

    // 메모리 업데이트 - 아이디어 평가 이벤트 기록
    try {
      await processMemoryUpdate({
        type: "IDEA_EVALUATED",
        payload: {
          teamId,
          evaluatorId: evaluator,
          ideaId: ideaId,
          ideaAuthorId: targetIdea.author,
          evaluation: newEvaluation,
          isAutonomous: isSystemCall, // 시스템 호출이면 자율적 평가
        },
      });
      console.log(
        `✅ 평가 완료 후 메모리 업데이트 성공: ${evaluator} -> idea ${ideaId}`
      );
    } catch (memoryError) {
      console.error("❌ 평가 후 메모리 업데이트 실패:", memoryError);
      // 메모리 업데이트 실패는 평가 성공에 영향을 주지 않음
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
