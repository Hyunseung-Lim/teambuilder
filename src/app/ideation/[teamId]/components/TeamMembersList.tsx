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
}

export default function TeamMembersList({
  team,
  agents,
  agentStates,
  timers,
  onAgentClick,
}: TeamMembersListProps) {
  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {team.members.map((member, index) => {
            const agent = member.isUser
              ? null
              : agents.find((a) => a.id === member.agentId);
            const memberName = member.isUser
              ? "나"
              : agent?.name || `팀원 ${member.agentId}`;

            return (
              <div
                key={member.isUser ? "user" : member.agentId || index}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  !member.isUser && member.agentId
                    ? "hover:bg-gray-50 cursor-pointer"
                    : "hover:bg-gray-50"
                }`}
                onClick={() =>
                  !member.isUser &&
                  member.agentId &&
                  onAgentClick(member.agentId)
                }
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    member.isLeader
                      ? "bg-gradient-to-br from-yellow-400 to-orange-500"
                      : member.isUser
                      ? "bg-gradient-to-br from-green-400 to-emerald-500"
                      : "bg-gradient-to-br from-blue-400 to-purple-500"
                  }`}
                >
                  {member.isLeader ? (
                    <Crown className="h-5 w-5 text-white" />
                  ) : (
                    <User className="h-5 w-5 text-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {memberName}
                    </span>
                    {member.isLeader && (
                      <Crown className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                    )}

                    {/* 에이전트 상태 표시 */}
                    {!member.isUser && member.agentId && (
                      <AgentStateIndicator
                        state={agentStates.get(member.agentId)}
                        timer={timers.get(member.agentId)}
                        agentName={memberName}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {member.roles.map((role, roleIndex) => (
                      <span
                        key={roleIndex}
                        className="text-xs px-2 py-1 rounded-lg w-fit font-medium bg-indigo-50 text-indigo-600"
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
    </div>
  );
} 