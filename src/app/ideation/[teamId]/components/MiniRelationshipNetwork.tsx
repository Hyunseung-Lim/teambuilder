import React from "react";
import { Team, AIAgent, RELATIONSHIP_TYPES } from "@/lib/types";
import { findMemberById, getMemberActualId, getMemberDisplayName } from "@/lib/member-utils";

interface MiniRelationshipNetworkProps {
  team: Team;
  agents: AIAgent[];
  className?: string;
  useOriginalLayout?: boolean;
}

export default function MiniRelationshipNetwork({
  team,
  agents,
  className = "",
  useOriginalLayout = false,
}: MiniRelationshipNetworkProps) {
  // Helper function to get agent name by ID
  const getAgentName = (agentId: string) => {
    return agents.find(a => a.id === agentId)?.name || "";
  };

  // Create nodes for each team member using centralized utilities
  const nodes = team.members.map((member, index) => {
    const actualId = getMemberActualId(member);
    const displayName = member.isUser 
      ? getMemberDisplayName(member, agents)
      : getAgentName(member.agentId || "") || getMemberDisplayName(member, agents);
    
    const node = {
      id: actualId,
      name: displayName,
      isUser: member.isUser,
      isLeader: member.isLeader,
    };
    
    return node;
  });

  // Create edges from relationships - using the same logic as review page
  const edges: any[] = [];
  

  if (team.relationships && team.relationships.length > 0) {
    team.relationships.forEach((relationship) => {
      // Skip NULL relationships
      if (relationship.type === "NULL") {
        return;
      }
      
      // Convert from and to to actual member IDs using centralized utilities
      const fromMember = findMemberById(team, relationship.from);
      const toMember = findMemberById(team, relationship.to);
      
      if (!fromMember || !toMember) {
        return; // Skip invalid relationships
      }
      
      const fromId = getMemberActualId(fromMember);
      const toId = getMemberActualId(toMember);
      
      // Add edge if both nodes exist
      const fromNode = nodes.find(n => n.id === fromId);
      const toNode = nodes.find(n => n.id === toId);
      
      
      if (fromNode && toNode) {
        const edge = {
          from: fromId,
          to: toId,
          type: relationship.type,
          color: RELATIONSHIP_TYPES[relationship.type]?.color || "#9ca3af",
          isHierarchical: relationship.type === "SUPERVISOR" || relationship.type === "SUPERIOR_SUBORDINATE",
        };
        edges.push(edge);
      }
    });
  }

  // Position nodes in a small circle
  const centerX = 95;
  const centerY = 75;
  const radius = 60;
  
  // 첫 번째 패스: 원본 위치 수집
  const originalPositions = [];
  
  nodes.forEach((node, index) => {
    let positionFound = false;
    let originalX, originalY;
    
    if (team.nodePositions && team.nodePositions[node.id]) {
      originalX = team.nodePositions[node.id].x;
      originalY = team.nodePositions[node.id].y;
      positionFound = true;
    } else if (team.nodePositions) {
      // agentId가 아닌 A, B, C, D 형태로 저장된 경우 확인
      const nonUserMembers = team.members.filter(m => !m.isUser);
      const memberIndex = nonUserMembers.findIndex(m => m.agentId === node.id);
      
      if (memberIndex >= 0) {
        const tempKey = String.fromCharCode(65 + memberIndex);
        if (team.nodePositions[tempKey]) {
          originalX = team.nodePositions[tempKey].x;
          originalY = team.nodePositions[tempKey].y;
          positionFound = true;
        }
      }
    }
    
    if (positionFound && !useOriginalLayout) {
      originalPositions.push({ node, x: originalX, y: originalY });
    } else {
      // 기본 원형 배치 (원형 배치 모드이거나 저장된 위치가 없는 경우)
      const angle = (index * 2 * Math.PI) / nodes.length - Math.PI / 2;
      originalPositions.push({ 
        node, 
        x: centerX + radius * Math.cos(angle), 
        y: centerY + radius * Math.sin(angle) 
      });
    }
  });
  
  // 미니뷰 정규화 (리뷰 페이지와 동일한 로직을 미니뷰에 적용)
  if (originalPositions.length > 0) {
    const minX = Math.min(...originalPositions.map(p => p.x));
    const maxX = Math.max(...originalPositions.map(p => p.x));
    const minY = Math.min(...originalPositions.map(p => p.y));
    const maxY = Math.max(...originalPositions.map(p => p.y));
    
    const originalWidth = maxX - minX;
    const originalHeight = maxY - minY;
    
    // 미니뷰 목표 영역 (노드 이름 표시 공간 고려)
    const targetWidth = 170; // 190 - 20
    const targetHeight = 135; // 160 - 25 (하단 이름 공간 확보)
    
    // 스케일 계산
    const scaleX = originalWidth > 0 ? targetWidth / originalWidth : 1;
    const scaleY = originalHeight > 0 ? targetHeight / originalHeight : 1;
    const scale = Math.min(scaleX, scaleY, 1);
    
    // 정규화된 위치 적용
    originalPositions.forEach(({node, x, y}) => {
      const scaledX = (x - minX) * scale;
      const scaledY = (y - minY) * scale;
      
      // 미니뷰 중앙 배치
      node.x = scaledX + (190 - originalWidth * scale) / 2;
      node.y = scaledY + (160 - originalHeight * scale) / 2;
      
      // 경계 체크 (하단에 이름 공간 확보)
      node.x = Math.max(10, Math.min(180, node.x));
      node.y = Math.max(15, Math.min(135, node.y));
    });
  }
  
  const positionedNodes = originalPositions.map(({node}) => node);

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg px-3 py-4 mb-4 ${className}`}>
      <svg width="190" height="160" className="mx-auto">
        <defs>
          <marker
            id="mini-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
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
          
          const startX = fromNode.x + unitX * (nodeRadius + 2);
          const startY = fromNode.y + unitY * (nodeRadius + 2);
          const endX = toNode.x - unitX * (nodeRadius + (edge.isHierarchical ? 6 : 3));
          const endY = toNode.y - unitY * (nodeRadius + (edge.isHierarchical ? 6 : 3));

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