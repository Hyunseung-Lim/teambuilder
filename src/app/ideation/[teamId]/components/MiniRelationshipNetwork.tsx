import React from "react";
import { Team, AIAgent, RELATIONSHIP_TYPES } from "@/lib/types";

interface MiniRelationshipNetworkProps {
  team: Team;
  agents: AIAgent[];
  className?: string;
}

export default function MiniRelationshipNetwork({
  team,
  agents,
  className = "",
}: MiniRelationshipNetworkProps) {
  // Create nodes for each team member
  const nodes = team.members.map((member, index) => {
    const memberName = member.isUser 
      ? "나" 
      : agents.find(a => a.id === member.agentId)?.name || `팀원 ${member.id}`;
    
    return {
      id: member.isUser ? "나" : member.agentId || `slot-${index}`,
      name: memberName,
      isUser: member.isUser,
      isLeader: member.isLeader,
    };
  });

  // Create edges from relationships
  const edges = team.relationships
    ?.filter(rel => rel.type !== "NULL")
    .map(rel => {
      // Find the actual member IDs for the relationship
      const fromMember = team.members.find(m => {
        if (m.isUser && rel.from === "나") return true;
        if (!m.isUser) {
          const agent = agents.find(a => a.id === m.agentId);
          return agent && (
            agent.name === rel.from || 
            agent.id === rel.from || 
            rel.from === `${agent.name}봇`
          );
        }
        return false;
      });

      const toMember = team.members.find(m => {
        if (m.isUser && rel.to === "나") return true;
        if (!m.isUser) {
          const agent = agents.find(a => a.id === m.agentId);
          return agent && (
            agent.name === rel.to || 
            agent.id === rel.to || 
            rel.to === `${agent.name}봇`
          );
        }
        return false;
      });

      if (!fromMember || !toMember) return null;

      const fromId = fromMember.isUser ? "나" : fromMember.agentId!;
      const toId = toMember.isUser ? "나" : toMember.agentId!;

      return {
        from: fromId,
        to: toId,
        type: rel.type,
        color: RELATIONSHIP_TYPES[rel.type]?.color || "#9ca3af",
        isHierarchical: rel.type === "SUPERVISOR",
      };
    }).filter(Boolean) || [];

  // Position nodes in a small circle
  const centerX = 75;
  const centerY = 50;
  const radius = 45;
  
  const positionedNodes = nodes.map((node, index) => {
    // Use saved positions if available, otherwise use circular layout
    let x, y;
    if (team.nodePositions && team.nodePositions[node.id]) {
      // Scale down the saved positions to fit the mini view
      x = team.nodePositions[node.id].x * 0.3;
      y = team.nodePositions[node.id].y * 0.25;
    } else {
      // Fallback to circular layout
      const angle = (index * 2 * Math.PI) / nodes.length - Math.PI / 2;
      x = centerX + radius * Math.cos(angle);
      y = centerY + radius * Math.sin(angle);
    }
    
    return { ...node, x, y };
  });

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 ${className}`}>
      <h3 className="text-xs font-medium text-gray-700 mb-2">팀 관계 네트워크</h3>
      <svg width="150" height="100" className="mx-auto">
        <defs>
          <marker
            id="mini-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#374151" />
          </marker>
        </defs>

        {/* Render edges */}
        {edges.map((edge, index) => {
          const fromNode = positionedNodes.find(n => n.id === edge.from);
          const toNode = positionedNodes.find(n => n.id === edge.to);
          
          if (!fromNode || !toNode) return null;

          const dx = toNode.x - fromNode.x;
          const dy = toNode.y - fromNode.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          
          if (length === 0) return null;
          
          const unitX = dx / length;
          const unitY = dy / length;
          const nodeRadius = 8;
          
          const startX = fromNode.x + unitX * nodeRadius;
          const startY = fromNode.y + unitY * nodeRadius;
          const endX = toNode.x - unitX * (nodeRadius + (edge.isHierarchical ? 3 : 0));
          const endY = toNode.y - unitY * (nodeRadius + (edge.isHierarchical ? 3 : 0));

          return (
            <g key={index}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={edge.color}
                strokeWidth={edge.isHierarchical ? 1.5 : 1}
                markerEnd={edge.isHierarchical ? "url(#mini-arrow)" : undefined}
              />
            </g>
          );
        })}

        {/* Render nodes */}
        {positionedNodes.map((node) => (
          <g key={node.id}>
            <circle
              cx={node.x}
              cy={node.y}
              r="8"
              fill={node.isUser ? "#dbeafe" : "#f3e8ff"}
              stroke={node.isLeader ? "#eab308" : (node.isUser ? "#3b82f6" : "#8b5cf6")}
              strokeWidth={node.isLeader ? "2" : "1"}
            />
            <text
              x={node.x}
              y={node.y + 16}
              textAnchor="middle"
              fontSize="8"
              fill="#374151"
              className="select-none"
            >
              {node.name.length > 6 ? `${node.name.slice(0, 5)}...` : node.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}