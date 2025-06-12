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
      | "feedback"
      | "request"
      | "response",
    payload: any
  ) {
    if (
      !this.agentInfo.roles.includes(actionType) &&
      actionType !== "response"
    ) {
      console.log(
        `${this.agentInfo.name} cannot perform action: ${actionType} due to its roles.`
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
      case "feedback":
        result = await this._feedback(payload);
        break;
      case "request":
        result = await this._request(payload);
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
      type: "feedback",
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
      case "feedback":
      case "request":
      case "response":
        return (
          typeof payload.target === "string" &&
          typeof payload.content === "string"
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
