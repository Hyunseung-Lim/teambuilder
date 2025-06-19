import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  debugGetAllTeamKeys,
  debugGetTeamData,
  debugFixTeamOwnerId,
  debugGetUserTeamsSet,
} from "@/lib/redis";

export async function GET() {
  // 개발 환경에서만 동작
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "개발 환경에서만 사용 가능합니다." },
      { status: 403 }
    );
  }

  try {
    const teamKeys = await debugGetAllTeamKeys();
    const teams = [];

    for (const key of teamKeys) {
      const teamData = await debugGetTeamData(key);
      if (teamData) {
        teams.push({
          key,
          teamId: key.replace("team:", ""),
          data: teamData,
        });
      }
    }

    // test@test.com 사용자의 팀 목록도 확인
    const userTeamIds = await debugGetUserTeamsSet("test@test.com");

    return NextResponse.json({
      message: "Redis에 저장된 팀 데이터",
      teams,
      userTeamIds: {
        email: "test@test.com",
        teamIds: userTeamIds,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "팀 데이터 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // 개발 환경에서만 동작
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "개발 환경에서만 사용 가능합니다." },
      { status: 403 }
    );
  }

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const { teamId, action, sharedMentalModel } = await req.json();

    if (action === "updateSharedMentalModel") {
      // 팀에 공유 멘탈 모델 추가
      const { redis, keys } = await import("@/lib/redis");

      if (!teamId || !sharedMentalModel) {
        return NextResponse.json(
          { error: "teamId와 sharedMentalModel이 필요합니다." },
          { status: 400 }
        );
      }

      // 팀 존재 확인
      const teamExists = await redis.exists(keys.team(teamId));
      if (!teamExists) {
        return NextResponse.json(
          { error: "팀을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      // 공유 멘탈 모델 업데이트
      await redis.hset(keys.team(teamId), {
        sharedMentalModel: sharedMentalModel,
      });

      // 업데이트된 팀 정보 조회
      const updatedTeam = await redis.hgetall(keys.team(teamId));

      return NextResponse.json({
        message: `팀 ${teamId}에 공유 멘탈 모델을 추가했습니다.`,
        teamId,
        sharedMentalModel,
        updatedTeam,
      });
    }

    if (action === "fixAllTeams") {
      // 모든 기존 팀을 현재 사용자에게 할당
      const fixedTeams = [];
      const targetTeamIds = [
        "team_R7138ZebS2H-i5yZg6dPW",
        "team_iV2zYX7zbLW6q2A3ZJQWe",
      ];

      for (const id of targetTeamIds) {
        const success = await debugFixTeamOwnerId(id, session.user.email);
        if (success) {
          fixedTeams.push(id);
        }
      }

      return NextResponse.json({
        message: `${fixedTeams.length}개의 팀을 복구했습니다.`,
        fixedTeams,
      });
    }

    if (action === "forceAddTeams") {
      // 사용자의 팀 목록에 강제로 팀 ID들 추가
      const { redis, keys } = await import("@/lib/redis");
      const targetTeamIds = [
        "team_R7138ZebS2H-i5yZg6dPW",
        "team_iV2zYX7zbLW6q2A3ZJQWe",
      ];

      // 기존 목록 삭제하고 다시 추가
      await redis.del(keys.userTeams(session.user.email));

      for (const teamId of targetTeamIds) {
        await redis.sadd(keys.userTeams(session.user.email), teamId);
      }

      // 확인
      const userTeamIds = await redis.smembers(
        keys.userTeams(session.user.email)
      );

      return NextResponse.json({
        message: "팀 목록을 강제로 재설정했습니다.",
        userEmail: session.user.email,
        addedTeamIds: targetTeamIds,
        currentUserTeamIds: userTeamIds,
      });
    }

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId가 필요합니다." },
        { status: 400 }
      );
    }

    const success = await debugFixTeamOwnerId(teamId, session.user.email);

    if (success) {
      return NextResponse.json({
        message: `팀 ${teamId}의 ownerId를 ${session.user.email}로 설정했습니다.`,
      });
    } else {
      return NextResponse.json(
        { error: "팀 복구에 실패했습니다." },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json({ error: "팀 복구 실패" }, { status: 500 });
  }
}
