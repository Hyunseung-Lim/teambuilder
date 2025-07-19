import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getIdeas, updateIdea, getTeamById } from "@/lib/redis";
import { Evaluation } from "@/lib/types";
import { triggerMemoryUpdate } from "@/lib/memory-v2";
import { canEvaluateIdea } from "@/lib/relationship-utils";

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
      !scores.novelty ||
      !scores.completeness ||
      !scores.quality ||
      scores.novelty < 1 ||
      scores.novelty > 7 ||
      scores.completeness < 1 ||
      scores.completeness > 7 ||
      scores.quality < 1 ||
      scores.quality > 7
    ) {
      console.error(`❌ 점수 범위 오류:`, {
        novelty: scores.novelty,
        completeness: scores.completeness,
        quality: scores.quality,
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

    // 관계 기반 평가 권한 확인
    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json(
        { error: "팀을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const hasEvaluationPermission = canEvaluateIdea(evaluator, targetIdea.author, team);
    if (!hasEvaluationPermission) {
      return NextResponse.json(
        { 
          error: "아이디어를 평가할 권한이 없습니다. 관계가 연결된 팀원의 아이디어만 평가할 수 있습니다.",
          relationshipRequired: true 
        },
        { status: 403 }
      );
    }

    console.log("✅ 관계 기반 아이디어 평가 권한 확인 완료");

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
        novelty: scores.novelty,
        completeness: scores.completeness,
        quality: scores.quality,
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

    // v2 메모리 업데이트 - 평가자를 위한 업데이트 (AI 에이전트만)
    if (evaluator !== "나") {
      try {
        await triggerMemoryUpdate(
          evaluator,
          "idea_evaluation",
          `I evaluated an idea (ID: ${ideaId}) with scores: novelty=${newEvaluation.scores.novelty}, completeness=${newEvaluation.scores.completeness}, quality=${newEvaluation.scores.quality}. Comment: ${newEvaluation.comment || 'No comment'}`,
          targetIdea.author !== "나" ? targetIdea.author : undefined,
          teamId
        );
        console.log(
          `✅ 평가자 ${evaluator} v2 메모리 업데이트 성공 -> idea ${ideaId}`
        );
      } catch (memoryError) {
        console.error("❌ 평가자 메모리 업데이트 실패:", memoryError);
      }
    } else {
      console.log(`🙋‍♂️ 사용자 평가 - 메모리 업데이트 건너뜀`);
    }

    // v2 메모리 업데이트 - 아이디어 작성자를 위한 업데이트 (자기 아이디어가 아닌 경우만)
    if (targetIdea.author !== evaluator && targetIdea.author !== "나") {
      try {
        await triggerMemoryUpdate(
          targetIdea.author,
          "feedback",
          `My idea (ID: ${ideaId}) was evaluated by ${evaluator} with scores: novelty=${newEvaluation.scores.novelty}, completeness=${newEvaluation.scores.completeness}, quality=${newEvaluation.scores.quality}. Comment: ${newEvaluation.comment || 'No comment'}`,
          evaluator,
          teamId
        );
        console.log(
          `✅ 아이디어 작성자 ${targetIdea.author} v2 메모리 업데이트 성공 -> idea ${ideaId}`
        );
      } catch (memoryError) {
        console.error("❌ 아이디어 작성자 메모리 업데이트 실패:", memoryError);
      }
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
