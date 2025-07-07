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
  // Helper function to get agent name by ID
  const getAgentName = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.name || "";
  };

  // Create nodes for each team member
  const nodes = team.members.map((member, index) => {
    const memberName = member.isUser 
      ? "나" 
      : getAgentName(member.agentId || "") || `팀원 ${member.id}`;
    
    const node = {
      id: member.isUser ? "나" : member.agentId || `slot-${index}`,
      name: memberName,
      isUser: member.isUser,
      isLeader: member.isLeader,
    };
    
    console.log("노드 생성:", node);
    return node;
  });
  
  console.log("전체 노드:", nodes);

  // Create edges from relationships - using the same logic as review page
  const edges: any[] = [];
  
  console.log("=== MiniRelationshipNetwork 관계 분석 ===");
  console.log("팀 ID:", team.id);
  console.log("팀 관계 데이터:", JSON.stringify(team.relationships, null, 2));
  console.log("팀 멤버 데이터:", JSON.stringify(team.members, null, 2));
  console.log("에이전트 데이터:", JSON.stringify(agents.map(a => ({id: a.id, name: a.name})), null, 2));
  
  if (team.relationships && team.relationships.length > 0) {
    team.relationships.forEach((relationship) => {
      // Skip NULL relationships
      if (relationship.type === "NULL") {
        return;
      }
      
      // Convert from and to to actual member IDs
      let fromId = relationship.from;
      let toId = relationship.to;
      
      console.log("관계 처리 중:", relationship);
      console.log("fromId:", fromId, "toId:", toId);
      
      // from과 to가 agentId인 경우 그대로 사용, A,B,C,D인 경우 매핑 필요
      if (fromId !== "나") {
        // 먼저 agentId로 직접 매칭 시도
        const directMatch = team.members.find(m => !m.isUser && m.agentId === fromId);
        if (directMatch) {
          fromId = directMatch.agentId!;
          console.log("fromId 직접 매핑 완료:", fromId);
        } else {
          // A, B, C, D 같은 임시 ID인 경우 에이전트 이름으로 매핑 시도
          const nameMatch = team.members.find(m => 
            !m.isUser && getAgentName(m.agentId || "") === fromId
          );
          if (nameMatch) {
            fromId = nameMatch.agentId!;
            console.log("fromId 이름 매핑 완료:", fromId);
          } else {
            console.log("fromMember 찾지 못함:", fromId);
          }
        }
      }
      
      if (toId !== "나") {
        // 먼저 agentId로 직접 매칭 시도
        const directMatch = team.members.find(m => !m.isUser && m.agentId === toId);
        if (directMatch) {
          toId = directMatch.agentId!;
          console.log("toId 직접 매핑 완료:", toId);
        } else {
          // A, B, C, D 같은 임시 ID인 경우 에이전트 이름으로 매핑 시도
          const nameMatch = team.members.find(m => 
            !m.isUser && getAgentName(m.agentId || "") === toId
          );
          if (nameMatch) {
            toId = nameMatch.agentId!;
            console.log("toId 이름 매핑 완료:", toId);
          } else {
            console.log("toMember 찾지 못함:", toId);
          }
        }
      }
      
      // Add edge if both nodes exist
      const fromNode = nodes.find(n => n.id === fromId);
      const toNode = nodes.find(n => n.id === toId);
      
      console.log("fromNode:", fromNode, "toNode:", toNode);
      
      if (fromNode && toNode) {
        const edge = {
          from: fromId,
          to: toId,
          type: relationship.type,
          color: RELATIONSHIP_TYPES[relationship.type]?.color || "#9ca3af",
          isHierarchical: relationship.type === "SUPERVISOR",
        };
        console.log("엣지 추가:", edge);
        edges.push(edge);
      } else {
        console.log("노드를 찾지 못해 엣지 추가 실패");
      }
    });
  }

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