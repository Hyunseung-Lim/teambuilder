import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { deleteTeam } from "@/lib/redis";

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
    await deleteTeam(resolvedParams.teamId, session.user.email);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("팀 삭제 오류:", error);
    return NextResponse.json(
      { error: "팀 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
 