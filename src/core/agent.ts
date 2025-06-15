import {
  AgentMemory,
  AIAgent,
  ChatMessage,
  Idea,
  Team,
  ActionType,
} from "@/lib/types";
import {
  getAgentMemory,
  updateAgentMemory,
  addChatMessage,
  addIdea,
  updateIdea,
  getTeamById,
  getAgentById,
  getChatHistory,
  getIdeas,
} from "@/lib/redis";
import * as OpenAIActions from "@/lib/openai";
import { nanoid } from "nanoid";

export class Agent {
  private agentInfo: AIAgent;
  private memory: AgentMemory | null = null;
  private active: boolean = false;
  private teamId: string;
  private team: Team | null = null;

  constructor(agentInfo: AIAgent, teamId: string) {
    this.agentInfo = agentInfo;
    this.teamId = teamId;
  }

  async initialize() {
    this.team = await getTeamById(this.teamId);
    if (!this.team) {
      throw new Error(`Team with ID ${this.teamId} not found.`);
    }

    const memory = await getAgentMemory(this.agentInfo.id);
    if (memory) {
      this.memory = memory;
    } else {
      // If no memory, create a new one
      this.memory = await this.createNewMemory();
    }
    await updateAgentMemory(this.agentInfo.id, this.memory);
  }

  private async createNewMemory(): Promise<AgentMemory> {
    const relationMemory: { [agentName: string]: any } = {};
    if (this.team) {
      for (const member of this.team.members) {
        if (member.isUser) {
          // TODO: Add user info to relation memory
        } else if (member.agentId && member.agentId !== this.agentInfo.id) {
          const fellowAgent = await getAgentById(member.agentId);
          if (fellowAgent) {
            relationMemory[fellowAgent.name] = {
              staticInfo: fellowAgent,
              relationship:
                this.team.relationships.find(
                  (r) =>
                    r.from === this.agentInfo.name && r.to === fellowAgent.name
                )?.type || "colleague",
              interactionHistory: [],
              myOpinion: "A neutral colleague.",
            };
          }
        }
      }
    }

    return {
      shortTerm: { context: "Session started.", relatedChats: [] },
      longTerm: {
        selfReflection: {
          summary: "I am a new agent.",
          reflections: [],
          actionHistory: [],
        },
        relation: relationMemory,
      },
    };
  }

  async observe(trigger: "idea_change" | "direct_message", data: any) {
    if (!this.active) {
      await this.plan(trigger, data);
    }
  }

  async plan(trigger: string, data: any) {
    this.active = true;
    console.log(`Agent ${this.agentInfo.name} is planning...`, {
      trigger,
      data,
    });

    const chatHistory = await getChatHistory(this.teamId);
    const ideas = await getIdeas(this.teamId);

    const context = {
      agentProfile: this.agentInfo,
      memory: this.memory,
      trigger: { type: trigger, data },
      recentChatHistory: chatHistory.slice(-20), // Get last 20 messages
      availableIdeas: ideas, // Provide all ideas for evaluation context
    };

    try {
      const decision = await OpenAIActions.planNextAction(context);
      console.log(
        `Agent ${this.agentInfo.name} decided: ${decision.action}`,
        decision.reasoning
      );

      if (decision.action && decision.action !== "wait") {
        if (this._isPayloadValid(decision.action, decision.payload)) {
          await this.act(decision.action, decision.payload);
        } else {
          console.error(
            `Invalid payload for action ${decision.action}`,
            decision.payload
          );
        }
      }
    } catch (error) {
      console.error(
        `Error during planning for agent ${this.agentInfo.name}:`,
        error
      );
    } finally {
      this.active = false;
    }
  }

  async act(
    actionType:
      | "generate_idea"
      | "evaluate_idea"
      | "give_feedback"
      | "request"
      | "make_request"
      | "response",
    payload: any
  ) {
    if (
      !this.agentInfo.roles.includes(actionType) &&
      actionType !== "response" &&
      actionType !== "make_request"
    ) {
      console.log(
        `${this.agentInfo.name} cannot perform action: ${actionType} due to its roles.`
      );
      this.active = false;
      return;
    }

    // make_request의 경우 '요청하기' 역할이 있는지 확인
    if (
      actionType === "make_request" &&
      !this.agentInfo.roles.includes("요청하기")
    ) {
      console.log(
        `${this.agentInfo.name} cannot perform make_request: no '요청하기' role.`
      );
      this.active = false;
      return;
    }

    console.log(`Agent ${this.agentInfo.name} is acting on: ${actionType}`);
    let result;

    switch (actionType) {
      case "generate_idea":
        result = await this._generateIdea(payload);
        break;
      case "evaluate_idea":
        result = await this._evaluateIdea(payload);
        break;
      case "give_feedback":
        result = await this._feedback(payload);
        break;
      case "request":
        result = await this._request(payload);
        break;
      case "make_request":
        result = await this._makeRequest(payload);
        break;
      case "response":
        result = await this._response(payload);
        break;
      // TODO: Implement other actions
      default:
        console.log(`Action ${actionType} is not implemented yet.`);
        break;
    }

    await this.updateMemory(actionType, payload, result);
    this.active = false;
  }

  private async _generateIdea(payload: { context?: string }): Promise<Idea> {
    const ideaContent = await OpenAIActions.generateIdeaAction(payload.context);
    const newIdea = await addIdea(this.teamId, {
      author: this.agentInfo.name,
      timestamp: new Date().toISOString(),
      content: ideaContent,
      evaluations: [],
    });
    await addChatMessage(this.teamId, {
      sender: this.agentInfo.name,
      type: "idea_generation",
      payload: { ideaId: newIdea.id },
    });
    return newIdea;
  }

  private async _evaluateIdea(payload: {
    idea: Idea;
    context?: string;
  }): Promise<Idea | null> {
    const evaluationResult = await OpenAIActions.evaluateIdeaAction(
      payload.idea,
      payload.context
    );
    const newEvaluation = {
      evaluator: this.agentInfo.name,
      timestamp: new Date().toISOString(),
      ...evaluationResult,
    };
    const currentEvaluations = payload.idea.evaluations || [];
    const updatedIdea = await updateIdea(this.teamId, payload.idea.id, {
      evaluations: [...currentEvaluations, newEvaluation],
    });
    await addChatMessage(this.teamId, {
      sender: this.agentInfo.name,
      type: "idea_evaluation",
      payload: { ideaId: payload.idea.id, content: evaluationResult.comment },
    });
    return updatedIdea;
  }

  private async _feedback(payload: {
    target: string;
    content: string;
  }): Promise<ChatMessage> {
    return addChatMessage(this.teamId, {
      sender: this.agentInfo.name,
      type: "give_feedback",
      payload: {
        target: payload.target,
        content: payload.content,
      },
    });
  }

  private async _request(payload: {
    target: string;
    content: string;
    action?: ActionType;
  }): Promise<ChatMessage> {
    return addChatMessage(this.teamId, {
      sender: this.agentInfo.name,
      type: "request",
      payload: {
        target: payload.target,
        content: payload.content,
        action: payload.action,
      },
    });
  }

  private async _response(payload: {
    target: string;
    content: string;
  }): Promise<ChatMessage> {
    return addChatMessage(this.teamId, {
      sender: this.agentInfo.name,
      type: "response",
      payload: {
        target: payload.target,
        content: payload.content,
      },
    });
  }

  private async _makeRequest(payload: {
    triggerContext?: string;
    originalRequest?: string;
    originalRequester?: string;
  }): Promise<ChatMessage> {
    if (!this.team) {
      throw new Error("Team information not available");
    }

    // 팀원 정보 준비
    const teamMembers = this.team.members.map((member) => ({
      name: member.isUser ? "나" : member.agentId ? member.agentId : "Unknown",
      roles: member.roles,
      isUser: member.isUser,
      agentId: member.agentId,
    }));

    // 현재 아이디어 정보 가져오기
    const ideas = await getIdeas(this.teamId);
    const currentIdeas = ideas.map((idea, index) => ({
      ideaNumber: index + 1,
      authorName: idea.author,
      object: idea.content.object,
      function: idea.content.function,
    }));

    // 1단계: 요청 사전 분석
    const triggerContext =
      payload.triggerContext ||
      (payload.originalRequest
        ? `${payload.originalRequester}로부터 다음 요청을 받았습니다: "${payload.originalRequest}"`
        : "팀 상황을 분석한 결과 다른 팀원에게 작업을 요청하기로 결정했습니다.");

    const requestAnalysis = await OpenAIActions.preRequestAction(
      triggerContext,
      teamMembers,
      currentIdeas,
      this.agentInfo,
      this.memory
    );

    // 2단계: 요청 실행
    const targetMemberInfo = teamMembers.find(
      (member) => member.name === requestAnalysis.targetMember
    );

    if (!targetMemberInfo) {
      throw new Error(
        `Target member ${requestAnalysis.targetMember} not found`
      );
    }

    // 관계 타입 확인
    const relationship = this.team.relationships.find(
      (rel) =>
        rel.from === this.agentInfo.name &&
        rel.to === requestAnalysis.targetMember
    );

    let requestMessage;

    if (payload.originalRequest && payload.originalRequester) {
      // 요청 전가인 경우
      requestMessage = await OpenAIActions.executeRequestAction(
        requestAnalysis.targetMember,
        requestAnalysis.requestType,
        requestAnalysis.requestStrategy,
        requestAnalysis.contextToProvide,
        targetMemberInfo.roles,
        relationship?.type,
        this.agentInfo,
        this.memory,
        payload.originalRequest,
        payload.originalRequester
      );
    } else {
      // 직접 요청인 경우
      requestMessage = await OpenAIActions.executeRequestAction(
        requestAnalysis.targetMember,
        requestAnalysis.requestType,
        requestAnalysis.requestStrategy,
        requestAnalysis.contextToProvide,
        targetMemberInfo.roles,
        relationship?.type,
        this.agentInfo,
        this.memory
      );
    }

    // 채팅 메시지로 추가
    return addChatMessage(this.teamId, {
      sender: this.agentInfo.name,
      type: "request",
      payload: {
        target: requestAnalysis.targetMember,
        content: requestMessage.message,
        action: requestAnalysis.requestType,
      },
    });
  }

  private _isPayloadValid(action: string, payload: any): boolean {
    if (!payload) return false;

    switch (action) {
      case "generate_idea":
        return typeof payload.context === "string";
      case "evaluate_idea":
        return (
          typeof payload.idea === "object" &&
          payload.idea !== null &&
          typeof payload.idea.id === "number"
        );
      case "give_feedback":
      case "request":
      case "response":
        return (
          typeof payload.target === "string" &&
          typeof payload.content === "string"
        );
      case "make_request":
        return (
          (payload.triggerContext === undefined ||
            typeof payload.triggerContext === "string") &&
          (payload.originalRequest === undefined ||
            typeof payload.originalRequest === "string") &&
          (payload.originalRequester === undefined ||
            typeof payload.originalRequester === "string")
        );
      default:
        return false;
    }
  }

  private async updateMemory(action: string, payload: any, result: any) {
    if (this.memory) {
      // For now, just log the action to self-history
      const historyEntry = {
        timestamp: new Date().toISOString(),
        action: action,
        content: `Action performed with payload: ${JSON.stringify(
          payload
        )}. Resulted in: ${JSON.stringify(result)}`,
      };

      this.memory.longTerm.selfReflection.actionHistory.push(historyEntry);

      await updateAgentMemory(this.agentInfo.id, this.memory);
    }
  }
}
