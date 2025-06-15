import { Queue, Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import {
  AgentState,
  AgentRequest,
  AgentStateInfo,
  PlanDecision,
  Team,
  AIAgent,
} from "./types";
import { getTeamById, getAgentById } from "./redis";
import {
  generateIdeaViaAgent,
  evaluateIdeaViaAgent,
} from "../actions/ideation.actions";

// Redis connection for BullMQ
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

class AgentStateManager {
  private static instance: AgentStateManager;
  private agentStates: Map<string, AgentStateInfo> = new Map();
  private requestQueues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  private constructor() {
    console.log("🤖 AgentStateManager 초기화");
  }

  public static getInstance(): AgentStateManager {
    if (!AgentStateManager.instance) {
      AgentStateManager.instance = new AgentStateManager();
    }
    return AgentStateManager.instance;
  }

  // 에이전트 상태 시스템 초기화
  public async initializeAgent(agentId: string, teamId: string): Promise<void> {
    console.log(`🚀 에이전트 ${agentId} 상태 시스템 초기화`);

    // Request Queue 생성
    const queueName = `agent-requests-${agentId}`;
    const queue = new Queue(queueName, { connection: redis });
    this.requestQueues.set(agentId, queue);

    // Worker 생성 (요청 처리용)
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        return await this.processRequest(agentId, job.data as AgentRequest);
      },
      { connection: redis }
    );

    this.workers.set(agentId, worker);

    // 초기 상태 설정
    const stateInfo: AgentStateInfo = {
      agentId,
      currentState: "idle",
      lastStateChange: new Date().toISOString(),
      isProcessing: false,
      requestQueue: [],
    };

    this.agentStates.set(agentId, stateInfo);
    console.log(`✅ 에이전트 ${agentId} 초기화 완료 - Idle 상태`);
  }

  // 에이전트에게 요청 추가
  public async addRequest(
    agentId: string,
    request: AgentRequest
  ): Promise<void> {
    console.log(`📨 에이전트 ${agentId}에게 요청 추가:`, request.type);

    const queue = this.requestQueues.get(agentId);
    if (!queue) {
      console.error(`❌ 에이전트 ${agentId}의 큐를 찾을 수 없음`);
      return;
    }

    // 큐에 요청 추가
    await queue.add("process-request", request);

    // Idle 상태인 경우 즉시 처리 시작
    const stateInfo = this.agentStates.get(agentId);
    if (
      stateInfo &&
      stateInfo.currentState === "idle" &&
      !stateInfo.isProcessing
    ) {
      console.log(`🔄 에이전트 ${agentId} Idle → Action 상태 전환`);
      this.transitionToAction(agentId);
    }
  }

  // Idle 상태로 전환
  public async transitionToIdle(agentId: string): Promise<void> {
    console.log(`😴 에이전트 ${agentId} → Idle 상태 전환`);

    const stateInfo = this.agentStates.get(agentId);
    if (!stateInfo) return;

    // 기존 타이머 정리
    if (stateInfo.idleTimer) {
      clearTimeout(stateInfo.idleTimer);
    }

    // 상태 업데이트
    stateInfo.currentState = "idle";
    stateInfo.lastStateChange = new Date().toISOString();
    stateInfo.isProcessing = false;

    // 요청 확인 및 대기 타이머 설정
    await this.checkRequestsAndWait(agentId);
  }

  // 요청 확인 및 대기
  private async checkRequestsAndWait(agentId: string): Promise<void> {
    const queue = this.requestQueues.get(agentId);
    const stateInfo = this.agentStates.get(agentId);

    if (!queue || !stateInfo) return;

    // 대기 중인 요청 확인
    const waitingJobs = await queue.getWaiting();

    if (waitingJobs.length > 0) {
      console.log(
        `📋 에이전트 ${agentId}: ${waitingJobs.length}개 요청 대기 중 - Action 상태로 전환`
      );
      this.transitionToAction(agentId);
      return;
    }

    // 요청이 없으면 랜덤 대기 후 Plan 상태로 전환
    const waitTime = Math.random() * 30000 + 60000; // 1분~1분30초
    console.log(
      `⏰ 에이전트 ${agentId}: ${Math.round(
        waitTime / 1000
      )}초 대기 후 Plan 상태로 전환`
    );

    stateInfo.idleTimer = setTimeout(() => {
      this.transitionToPlan(agentId);
    }, waitTime);
  }

  // Plan 상태로 전환
  private async transitionToPlan(agentId: string): Promise<void> {
    console.log(`🧠 에이전트 ${agentId} → Plan 상태 전환`);

    const stateInfo = this.agentStates.get(agentId);
    if (!stateInfo) return;

    stateInfo.currentState = "plan";
    stateInfo.lastStateChange = new Date().toISOString();
    stateInfo.isProcessing = true;

    try {
      // LLM을 통한 계획 수립
      const decision = await this.makePlanDecision(agentId);

      if (decision.shouldAct) {
        console.log(
          `✅ 에이전트 ${agentId} 계획 결정: ${decision.actionType} - ${decision.reasoning}`
        );
        await this.executePlannedAction(agentId, decision);
      } else {
        console.log(
          `💤 에이전트 ${agentId} 계획 결정: 대기 - ${decision.reasoning}`
        );
        await this.transitionToIdle(agentId);
      }
    } catch (error) {
      console.error(`❌ 에이전트 ${agentId} Plan 상태 오류:`, error);
      await this.transitionToIdle(agentId);
    }
  }

  // Action 상태로 전환
  private transitionToAction(agentId: string): void {
    console.log(`⚡ 에이전트 ${agentId} → Action 상태 전환`);

    const stateInfo = this.agentStates.get(agentId);
    if (!stateInfo) return;

    // 기존 타이머 정리
    if (stateInfo.idleTimer) {
      clearTimeout(stateInfo.idleTimer);
      stateInfo.idleTimer = undefined;
    }

    stateInfo.currentState = "action";
    stateInfo.lastStateChange = new Date().toISOString();
    stateInfo.isProcessing = true;
  }

  // 요청 처리 (Worker에서 호출)
  private async processRequest(
    agentId: string,
    request: AgentRequest
  ): Promise<void> {
    console.log(`🔧 에이전트 ${agentId} 요청 처리 시작:`, request.type);

    try {
      if (request.type === "generate_idea") {
        await this.handleGenerateIdeaRequest(agentId, request);
      } else if (request.type === "evaluate_idea") {
        await this.handleEvaluateIdeaRequest(agentId, request);
      }

      console.log(`✅ 에이전트 ${agentId} 요청 처리 완료`);
    } catch (error) {
      console.error(`❌ 에이전트 ${agentId} 요청 처리 실패:`, error);
    } finally {
      // 처리 완료 후 Idle 상태로 복귀
      await this.transitionToIdle(agentId);
    }
  }

  // LLM을 통한 계획 결정
  private async makePlanDecision(agentId: string): Promise<PlanDecision> {
    console.log(`🤔 에이전트 ${agentId} 계획 수립 중...`);

    try {
      const agent = await getAgentById(agentId);
      if (!agent) {
        throw new Error(`에이전트 ${agentId}를 찾을 수 없음`);
      }

      // 에이전트의 역할과 현재 상황을 바탕으로 한 섬세한 프롬프트
      const prompt = await this.buildPlanPrompt(agent);

      // OpenAI API 호출
      const response = await fetch("/api/openai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          prompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`Plan API 호출 실패: ${response.status}`);
      }

      const decision: PlanDecision = await response.json();
      return decision;
    } catch (error) {
      console.error(`❌ 에이전트 ${agentId} 계획 수립 실패:`, error);
      // 실패 시 기본 결정 (대기)
      return {
        shouldAct: false,
        reasoning: "계획 수립 중 오류 발생으로 대기 상태 유지",
      };
    }
  }

  // 계획 프롬프트 구성
  private async buildPlanPrompt(agent: AIAgent): Promise<string> {
    // 에이전트의 팀 정보 가져오기
    const teams = []; // TODO: 에이전트가 속한 팀들 가져오기

    const prompt = `
당신은 ${agent.name}입니다.

## 당신의 정보
- 직업: ${agent.professional}
- 성격: ${agent.personality}
- 스킬: ${agent.skills}
- 가능한 역할: ${agent.roles?.join(", ") || "정보 없음"}

## 현재 상황
현재 아이디에이션 세션이 진행 중이며, 당신은 다음 행동을 결정해야 합니다.

## 가능한 행동
1. **아이디어 생성하기**: 새로운 창의적인 아이디어를 제안
2. **아이디어 평가하기**: 기존 아이디어들을 분석하고 평가
3. **대기하기**: 지금은 특별히 할 일이 없어서 대기

## 결정 기준
- 당신의 역할과 전문성을 고려하세요
- 팀의 현재 상황과 필요를 생각하세요
- 너무 자주 행동하지 말고, 의미 있는 기여를 할 때만 행동하세요
- 창의적이고 가치 있는 기여를 우선시하세요

## 응답 형식
다음 JSON 형식으로만 응답하세요:

{
  "shouldAct": true/false,
  "actionType": "generate_idea" | "evaluate_idea" | null,
  "reasoning": "당신의 결정 이유를 상세히 설명",
  "targetIdeaId": 평가할 아이디어 ID (평가 시에만, 선택사항)
}

## 중요 사항
- 반드시 JSON 형식으로만 응답하세요
- reasoning은 한국어로 작성하세요
- 당신의 성격과 전문성이 드러나도록 결정하세요
- 팀에 실질적인 도움이 될 때만 행동하세요
`;

    return prompt;
  }

  // 계획된 액션 실행
  private async executePlannedAction(
    agentId: string,
    decision: PlanDecision
  ): Promise<void> {
    console.log(
      `🎯 에이전트 ${agentId} 계획된 액션 실행: ${decision.actionType}`
    );

    try {
      if (decision.actionType === "generate_idea") {
        // 자발적 아이디어 생성
        await this.handleSelfInitiatedIdeaGeneration(agentId);
      } else if (decision.actionType === "evaluate_idea") {
        // 자발적 아이디어 평가
        await this.handleSelfInitiatedEvaluation(
          agentId,
          decision.targetIdeaId
        );
      }
    } catch (error) {
      console.error(`❌ 에이전트 ${agentId} 계획된 액션 실행 실패:`, error);
    } finally {
      await this.transitionToIdle(agentId);
    }
  }

  // 아이디어 생성 요청 처리
  private async handleGenerateIdeaRequest(
    agentId: string,
    request: AgentRequest
  ): Promise<void> {
    // TODO: 기존 generateIdeaViaAgent 함수 호출
    console.log(`💡 에이전트 ${agentId} 아이디어 생성 요청 처리`);
  }

  // 아이디어 평가 요청 처리
  private async handleEvaluateIdeaRequest(
    agentId: string,
    request: AgentRequest
  ): Promise<void> {
    console.log(`📊 에이전트 ${agentId} 아이디어 평가 요청 처리`);

    try {
      // 아이디어 리스트 가져오기
      const { getIdeas } = await import("@/lib/redis");
      const { getAgentById } = await import("@/lib/utils");
      const { addChatMessage } = await import("@/lib/redis");
      const { preEvaluationAction, executeEvaluationAction } = await import(
        "@/lib/openai"
      );

      const ideas = await getIdeas(request.teamId);

      if (ideas.length === 0) {
        console.log(`⚠️ 에이전트 ${agentId} 평가할 아이디어가 없음`);
        return;
      }

      // 본인이 만든 아이디어 제외
      const otherIdeas = ideas.filter((idea) => idea.author !== agentId);

      if (otherIdeas.length === 0) {
        console.log(
          `⚠️ 에이전트 ${agentId} 평가할 다른 사람의 아이디어가 없음`
        );
        return;
      }

      // 아이디어 리스트를 적절한 형태로 변환
      const ideaList = otherIdeas.map((idea, index) => ({
        ideaNumber: idea.id,
        authorName: idea.author,
        object: idea.content.object,
        function: idea.content.function,
      }));

      const agentProfile = await getAgentById(agentId);

      // 2단계 평가 프로세스
      // 1단계: 어떤 아이디어를 평가할지 결정
      const preEvaluation = await preEvaluationAction(
        request.payload.message,
        ideaList,
        agentProfile
      );

      const selectedIdea = otherIdeas.find(
        (idea) => idea.id === preEvaluation.selectedIdea.ideaNumber
      );

      if (!selectedIdea) {
        console.log(`⚠️ 에이전트 ${agentId} 선택된 아이디어를 찾을 수 없음`);
        return;
      }

      // 2단계: 실제 평가 수행
      const evaluation = await executeEvaluationAction(
        {
          ...preEvaluation.selectedIdea,
          authorName: selectedIdea.author,
        },
        preEvaluation.evaluationStrategy,
        agentProfile
      );

      // 평가 API 호출
      const response = await fetch(
        `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/teams/${
          request.teamId
        }/ideas/${selectedIdea.id}/evaluate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-system-internal": "true",
          },
          body: JSON.stringify({
            evaluator: agentId,
            scores: {
              insightful: Math.max(
                1,
                Math.min(5, evaluation.scores?.insightful || 3)
              ),
              actionable: Math.max(
                1,
                Math.min(5, evaluation.scores?.actionable || 3)
              ),
              relevance: Math.max(
                1,
                Math.min(5, evaluation.scores?.relevance || 3)
              ),
            },
            comment: evaluation.comment || "요청에 따른 평가",
          }),
        }
      );

      if (response.ok) {
        // 성공 시 채팅 알림
        let ideaAuthorName = selectedIdea.author;
        if (selectedIdea.author === "나") {
          ideaAuthorName = "나";
        } else {
          const authorAgent = await getAgentById(selectedIdea.author);
          ideaAuthorName =
            authorAgent?.name || `에이전트 ${selectedIdea.author}`;
        }

        console.log(
          `📢 에이전트 ${agentId} 요청 기반 평가 완료 채팅 알림 전송 중...`
        );

        await addChatMessage(request.teamId, {
          sender: agentId,
          type: "system",
          payload: {
            content: `${
              request.requesterName
            }의 요청에 따라 ${ideaAuthorName}의 아이디어 "${
              selectedIdea.content.object
            }"를 평가했습니다. 평가 점수: 통찰력 ${Math.max(
              1,
              Math.min(5, evaluation.scores?.insightful || 3)
            )}/5, 실행가능성 ${Math.max(
              1,
              Math.min(5, evaluation.scores?.actionable || 3)
            )}/5, 관련성 ${Math.max(
              1,
              Math.min(5, evaluation.scores?.relevance || 3)
            )}/5`,
          },
        });

        console.log(
          `✅ 에이전트 ${agentId} 요청 기반 평가 완료 채팅 알림 전송 완료`
        );

        console.log(
          `✅ 에이전트 ${agentId} 아이디어 평가 완료:`,
          selectedIdea.content.object
        );
      } else {
        console.error(
          `❌ 에이전트 ${agentId} 요청 기반 평가 API 호출 실패:`,
          response.status,
          await response.text()
        );
      }
    } catch (error) {
      console.error(`❌ 에이전트 ${agentId} 평가 요청 처리 실패:`, error);
    }
  }

  // 자발적 아이디어 생성
  private async handleSelfInitiatedIdeaGeneration(
    agentId: string
  ): Promise<void> {
    console.log(`🌟 에이전트 ${agentId} 자발적 아이디어 생성`);
    // TODO: 자발적 아이디어 생성 로직
  }

  // 자발적 아이디어 평가
  private async handleSelfInitiatedEvaluation(
    agentId: string,
    targetIdeaId?: number
  ): Promise<void> {
    console.log(`🔍 에이전트 ${agentId} 자발적 아이디어 평가`);
    // TODO: 자발적 평가 로직
  }

  // 에이전트 상태 조회
  public getAgentState(agentId: string): AgentStateInfo | undefined {
    return this.agentStates.get(agentId);
  }

  // 모든 에이전트 상태 조회
  public getAllAgentStates(): Map<string, AgentStateInfo> {
    return new Map(this.agentStates);
  }

  // 정리 (서버 종료 시)
  public async cleanup(): Promise<void> {
    console.log("🧹 AgentStateManager 정리 중...");

    // 모든 타이머 정리
    for (const stateInfo of this.agentStates.values()) {
      if (stateInfo.idleTimer) {
        clearTimeout(stateInfo.idleTimer);
      }
    }

    // 모든 워커 종료
    for (const worker of this.workers.values()) {
      await worker.close();
    }

    // 모든 큐 정리
    for (const queue of this.requestQueues.values()) {
      await queue.close();
    }

    console.log("✅ AgentStateManager 정리 완료");
  }
}

export default AgentStateManager;
