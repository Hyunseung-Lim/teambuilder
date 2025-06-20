import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { deleteTeam, getTeamById, updateTeam } from "@/lib/redis";

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
    const team = await getTeamById(resolvedParams.teamId);

    if (!team) {
      return NextResponse.json(
        { error: "팀을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("팀 조회 오류:", error);
    return NextResponse.json(
      { error: "팀 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const { topic, sharedMentalModel } = body;

    if (!topic && sharedMentalModel === undefined) {
      return NextResponse.json(
        { error: "토픽 또는 공유 멘탈 모델 중 하나는 필요합니다." },
        { status: 400 }
      );
    }

    if (topic && typeof topic !== "string") {
      return NextResponse.json(
        { error: "유효한 토픽이 필요합니다." },
        { status: 400 }
      );
    }

    if (
      sharedMentalModel !== undefined &&
      typeof sharedMentalModel !== "string"
    ) {
      return NextResponse.json(
        { error: "유효한 공유 멘탈 모델이 필요합니다." },
        { status: 400 }
      );
    }

    const team = await getTeamById(resolvedParams.teamId);

    if (!team) {
      return NextResponse.json(
        { error: "팀을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 사용자 ID 조회
    const { getUserByEmail } = await import("@/lib/redis");
    const user = await getUserByEmail(session.user.email);

    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 팀 소유자인지 확인
    if (team.ownerId !== user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 팀 정보 업데이트
    const updateData: any = {};
    if (topic) {
      updateData.topic = topic.trim();
    }
    if (sharedMentalModel !== undefined) {
      updateData.sharedMentalModel = sharedMentalModel.trim();
    }

    await updateTeam(resolvedParams.teamId, updateData);

    return NextResponse.json({ success: true, updated: updateData });
  } catch (error) {
    console.error("팀 업데이트 오류:", error);
    return NextResponse.json(
      { error: "팀 업데이트에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const resolvedParams = await params;

    // 이메일로 사용자 ID 조회
    const { getUserByEmail } = await import("@/lib/redis");
    const user = await getUserByEmail(session.user.email);

    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await deleteTeam(resolvedParams.teamId, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("팀 삭제 오류:", error);
    return NextResponse.json(
      { error: "팀 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
