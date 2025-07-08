import { AgentMemory, AIAgent, ChatMessage, Idea, Team } from "@/lib/types";
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
    const relations: { [agentId: string]: any } = {};
    if (this.team) {
      for (const member of this.team.members) {
        if (member.isUser) {
          const userName = member.userProfile?.name || "나";
          relations["나"] = {
            agentInfo: {
              id: "나",
              name: userName,
              professional: member.userProfile?.professional || "Unknown",
              personality: member.userProfile?.personality || "Collaborative",
              skills: member.userProfile?.skills || "General",
            },
            relationship:
              this.team.relationships.find(
                (r) =>
                  r.from === this.agentInfo.name && r.to === "나"
              )?.type || "PEER",
            interactionHistory: [],
            myOpinion: "A collaborative team member.",
          };
        } else if (member.agentId && member.agentId !== this.agentInfo.id) {
          const fellowAgent = await getAgentById(member.agentId);
          if (fellowAgent) {
            relations[fellowAgent.id] = {
              agentInfo: {
                id: fellowAgent.id,
                name: fellowAgent.name,
                professional: fellowAgent.professional,
                personality: fellowAgent.personality,
                skills: fellowAgent.skills,
              },
              relationship:
                this.team.relationships.find(
                  (r) =>
                    r.from === this.agentInfo.name && r.to === fellowAgent.name
                )?.type || "NULL",
              interactionHistory: [],
              myOpinion: "A neutral colleague.",
            };
          }
        }
      }
    }

    return {
      agentId: this.agentInfo.id,
      shortTerm: {
        lastAction: null,
        activeChat: null,
        feedbackSessionChat: null,
      },
      longTerm: {
        self: "I am a new agent ready to collaborate.",
        relations,
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

    try {
      if (!this.team) {
        throw new Error("Team information not available");
      }

      const teamContext = {
        teamName: this.team.teamName,
        topic: this.team.topic || "General Ideation",
        currentIdeasCount: ideas.length,
        recentMessages: chatHistory.slice(-5),
        teamMembers: this.team.members.map((m) =>
          m.isUser ? "나" : m.agentId || "Unknown"
        ),
        existingIdeas: ideas.map((idea, index) => ({
          ideaNumber: index + 1,
          authorName: idea.author,
          object: idea.content.object,
          function: idea.content.function,
        })),
        sharedMentalModel: this.team.sharedMentalModel,
      };

      const decision = await OpenAIActions.planNextAction(
        this.agentInfo,
        teamContext
      );
      console.log(
        `Agent ${this.agentInfo.name} decided: ${decision.action}`,
        decision.reasoning
      );

      if (decision.action && decision.action !== "wait") {
        const payload = this.createPayloadForAction(decision.action, decision);
        if (this._isPayloadValid(decision.action, payload)) {
          await this.act(decision.action, payload);
        } else {
          console.error(
            `Invalid payload for action ${decision.action}`,
            payload
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

  private createPayloadForAction(action: string, decision: any): any {
    switch (action) {
      case "generate_idea":
        return { context: "Generate a new idea based on the current topic" };
      case "evaluate_idea":
        return { idea: decision.targetIdea || null };
      case "give_feedback":
        return {
          target: decision.target || "team",
          content: "Providing feedback",
        };
      case "make_request":
        return {
          triggerContext: "Making a request based on planning decision",
        };
      default:
        return {};
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
      type: "system",
      payload: { content: `새로운 아이디어를 생성했습니다.` },
    });
    return newIdea;
  }

  private async _evaluateIdea(payload: {
    idea: Idea;
    context?: string;
  }): Promise<Idea | null> {
    if (!payload.idea) return null;

    const evaluationResult = await OpenAIActions.evaluateIdeaAction(
      payload.idea,
      payload.context,
      this.team || undefined
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
      type: "system",
      payload: {
        content: `아이디어를 평가했습니다: ${evaluationResult.comment}`,
      },
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
        type: "give_feedback",
        content: payload.content,
        mention: payload.target,
      },
    });
  }

  private async _request(payload: {
    target: string;
    content: string;
    action?: string;
  }): Promise<ChatMessage> {
    return addChatMessage(this.teamId, {
      sender: this.agentInfo.name,
      type: "make_request",
      payload: {
        type: "make_request",
        content: payload.content,
        mention: payload.target,
        target: payload.target,
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
      type: "system",
      payload: { content: payload.content },
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
      name: member.isUser ? "나" : member.agentId || "Unknown",
      roles: member.roles.map((role) => role.toString()),
      isUser: member.isUser,
      agentId: member.agentId || undefined,
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
      this.memory || undefined,
      this.team.sharedMentalModel
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
        this.memory || undefined,
        payload.originalRequest,
        payload.originalRequester,
        {
          isUser: targetMemberInfo.isUser,
        },
        this.team.sharedMentalModel
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
        this.memory || undefined,
        undefined,
        undefined,
        {
          isUser: targetMemberInfo.isUser,
        },
        this.team.sharedMentalModel
      );
    }

    // 채팅 메시지로 추가
    return addChatMessage(this.teamId, {
      sender: this.agentInfo.name,
      type: "make_request",
      payload: {
        type: "make_request",
        content: requestMessage.message,
        mention: requestAnalysis.targetMember,
        target: requestAnalysis.targetMember,
        action: requestAnalysis.requestType,
      },
    });
  }

  private _isPayloadValid(action: string, payload: any): boolean {
    if (!payload) return false;

    switch (action) {
      case "generate_idea":
        return true; // context is optional
      case "evaluate_idea":
        return (
          payload.idea === null ||
          (typeof payload.idea === "object" && payload.idea !== null)
        );
      case "give_feedback":
      case "make_request":
      case "response":
        return (
          typeof payload.target === "string" ||
          typeof payload.content === "string" ||
          payload.triggerContext !== undefined
        );
      default:
        return false;
    }
  }

  private async updateMemory(action: string, payload: any, result: any) {
    if (this.memory) {
      // Update last action in short-term memory
      this.memory.shortTerm.lastAction = {
        type: action,
        timestamp: new Date().toISOString(),
        payload: payload,
      };

      await updateAgentMemory(this.agentInfo.id, this.memory);
    }
  }
}
