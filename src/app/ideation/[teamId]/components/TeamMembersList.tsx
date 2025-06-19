import { User, Crown } from "lucide-react";
import { Team, AIAgent } from "@/lib/types";
import { AgentStateInfo } from "../hooks/useAgentStates";
import AgentStateIndicator from "./AgentStateIndicator";

interface TeamMembersListProps {
  team: Team;
  agents: AIAgent[];
  agentStates: Map<string, AgentStateInfo>;
  timers: Map<string, number>;
  onAgentClick: (agentId: string) => void;
  isConnected?: boolean;
}

export default function TeamMembersList({
  team,
  agents,
  agentStates,
  timers,
  onAgentClick,
  isConnected = true,
}: TeamMembersListProps) {
  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">팀 멤버</h2>
        {!isConnected && (
          <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
            연결 재시도 중
          </div>
        )}
      </div>
      <div className="space-y-2">
        {team.members.map((member, index) => {
          const agent = member.isUser
            ? null
            : agents.find((a) => a.id === member.agentId);
          const memberName = member.isUser
            ? "나"
            : agent?.name || `에이전트 ${member.agentId}`;

          return (
            <div
              key={index}
              className={`flex items-center gap-2 p-2 rounded hover:bg-gray-50 ${
                member.agentId ? "cursor-pointer" : ""
              }`}
              onClick={() => {
                if (member.agentId) {
                  onAgentClick(member.agentId);
                }
              }}
            >
              <div className="flex-shrink-0">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    member.isUser ? "bg-blue-100" : "bg-purple-100"
                  }`}
                >
                  <User
                    className={`h-3 w-3 ${
                      member.isUser ? "text-blue-600" : "text-purple-600"
                    }`}
                  />
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {memberName}
                  </span>
                  {member.isLeader && (
                    <Crown className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                  )}
                </div>

                {/* 에이전트 상태 표시 */}
                {!member.isUser && member.agentId && (
                  <div className="mt-1">
                    <AgentStateIndicator
                      state={agentStates.get(member.agentId)}
                      timer={timers.get(member.agentId)}
                      agentName={memberName}
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-1 mt-1">
                  {member.roles.map((role, roleIndex) => (
                    <span
                      key={roleIndex}
                      className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
