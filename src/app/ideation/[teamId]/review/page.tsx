"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare, Lightbulb, Clock, Users, Network, Crown, User, X, Star } from "lucide-react";
import { Team, Idea, ChatMessage } from "@/lib/types";
import { getAgentByIdAction } from "@/actions/agent.actions";

interface ActionLog {
  timestamp: string;
  agentName: string;
  action: string;
  target?: string;
  description: string;
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;
  
  const [team, setTeam] = useState<Team | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentNames, setAgentNames] = useState<{ [key: string]: string }>({});
  const [agentProfiles, setAgentProfiles] = useState<{ [key: string]: any }>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showFeedbackMode, setShowFeedbackMode] = useState(false);
  const [showRequestMode, setShowRequestMode] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [showIdeaDetail, setShowIdeaDetail] = useState(false);

  useEffect(() => {
    const loadReviewData = async () => {
      try {
        // 팀 정보 로드
        const teamResponse = await fetch(`/api/teams/${teamId}`);
        if (teamResponse.ok) {
          const teamData = await teamResponse.json();
          setTeam(teamData.team);
          
          // 에이전트 이름 및 프로필 로드
          const nameMap: { [key: string]: string } = {};
          const profileMap: { [key: string]: any } = {};
          for (const member of teamData.team.members) {
            if (!member.isUser && member.agentId) {
              try {
                const agent = await getAgentByIdAction(member.agentId);
                if (agent) {
                  nameMap[member.agentId] = agent.name;
                  profileMap[member.agentId] = agent;
                } else {
                  nameMap[member.agentId] = `에이전트 ${member.agentId.slice(0, 8)}`;
                }
              } catch (err) {
                console.error(`에이전트 ${member.agentId} 정보 로드 실패:`, err);
                nameMap[member.agentId] = `에이전트 ${member.agentId.slice(0, 8)}`;
              }
            }
          }
          setAgentNames(nameMap);
          setAgentProfiles(profileMap);
        }

        // 아이디어 목록 로드
        const ideasResponse = await fetch(`/api/teams/${teamId}/ideas`);
        if (ideasResponse.ok) {
          const ideasData = await ideasResponse.json();
          setIdeas(ideasData.ideas || []);
        }

        // 채팅 메시지 저장 (나중에 에이전트 이름과 함께 처리)
        const chatResponse = await fetch(`/api/teams/${teamId}/chat`);
        if (chatResponse.ok) {
          const chatData = await chatResponse.json();
          setChatMessages(chatData.messages || []);
        }
      } catch (err) {
        console.error("리뷰 데이터 로딩 실패:", err);
        setError("리뷰 데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };

    if (teamId) {
      loadReviewData();
    }
  }, [teamId]);

  // 에이전트 이름이 로드된 후 액션 로그 추출
  useEffect(() => {
    if (chatMessages.length > 0 && Object.keys(agentNames).length > 0) {
      const logs = extractActionLogs(chatMessages);
      setActionLogs(logs);
    }
  }, [chatMessages, agentNames]);

  const extractActionLogs = (messages: ChatMessage[]): ActionLog[] => {
    const logs: ActionLog[] = [];
    
    messages.forEach((message) => {
      if (message.type === "system" && message.payload && typeof message.payload === "object") {
        const content = message.payload.content;
        if (typeof content === "string") {
          let actionType = "";
          let description = content;
          
          if (content.includes("아이디어를 생성")) {
            actionType = "아이디어 생성";
          } else if (content.includes("아이디어를 평가")) {
            actionType = "아이디어 평가";
          } else if (content.includes("피드백")) {
            actionType = "피드백 제공";
          } else if (content.includes("요청")) {
            actionType = "요청하기";
          } else {
            actionType = "기타 활동";
          }

          logs.push({
            timestamp: message.timestamp,
            agentName: getAgentName(message.sender),
            action: actionType,
            description: description,
          });
        }
      } else if (message.type === "feedback_session_summary") {
        // 피드백 세션 참여자 정보 추출
        let feedbackGiver = "";
        let feedbackReceiver = "";
        let messageCount = 0;
        
        if (message.payload && typeof message.payload === "object") {
          const payload = message.payload as any;
          
          
          // 메시지 수 추출
          if (payload.messageCount) {
            messageCount = payload.messageCount;
          } else if (payload.turnCount) {
            messageCount = payload.turnCount;
          }
          
          // 피드백 제공자와 수신자 식별
          if (payload.from && payload.to) {
            feedbackGiver = getAgentName(payload.from);
            feedbackReceiver = getAgentName(payload.to);
          } else if (payload.sender && payload.receiver) {
            feedbackGiver = getAgentName(payload.sender);
            feedbackReceiver = getAgentName(payload.receiver);
          } else if (payload.participants && Array.isArray(payload.participants)) {
            // participants에서 첫 번째를 제공자로 간주
            if (payload.participants.length >= 2) {
              feedbackGiver = getAgentName(payload.participants[0]);
              feedbackReceiver = getAgentName(payload.participants[1]);
            }
          }
          
          // message.sender를 피드백 제공자로 사용 (fallback)
          if (!feedbackGiver && message.sender) {
            feedbackGiver = getAgentName(message.sender);
            
            // 다른 참여자를 찾기
            if (team?.members) {
              for (const member of team.members) {
                const memberName = member.isUser ? "나" : getAgentName(member.agentId || "");
                const memberId = member.isUser ? "나" : member.agentId;
                
                if (memberId !== message.sender && memberName !== feedbackGiver) {
                  feedbackReceiver = memberName;
                  break;
                }
              }
            }
          }
        }
        
        // 로그 항목 생성
        let actionDescription = "";
        let displayName = "";
        
        if (feedbackGiver && feedbackReceiver) {
          displayName = `${feedbackGiver} → ${feedbackReceiver}`;
          if (messageCount > 0) {
            displayName += ` (${messageCount})`;
          }
          actionDescription = `${feedbackGiver}와 ${feedbackReceiver}이 피드백을 진행했습니다.`;
          if (messageCount > 0) {
            actionDescription += ` (${messageCount}개 메시지)`;
          }
        } else {
          displayName = "피드백 세션";
          actionDescription = "AI 피드백 세션이 완료되었습니다.";
        }
        
        logs.push({
          timestamp: message.timestamp,
          agentName: displayName,
          action: "피드백 세션 완료",
          description: actionDescription,
        });
      }
    });

    return logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  };

  const getAgentName = (senderId: string): string => {
    if (senderId === "나") return "나";
    
    // 먼저 agentNames에서 찾기
    if (agentNames[senderId]) return agentNames[senderId];
    
    // agentProfiles에서 직접 찾기
    if (agentProfiles[senderId]?.name) return agentProfiles[senderId].name;
    
    // 팀 멤버에서 찾기
    if (team) {
      const member = team.members.find((m) => m.agentId === senderId);
      if (member && !member.isUser) {
        return `에이전트 ${senderId.slice(0, 8)}`;
      }
    }
    
    return senderId;
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateAverageRating = (idea: Idea): number | null => {
    if (!idea.evaluations || idea.evaluations.length === 0) {
      return null;
    }
    
    const totalScores = idea.evaluations.reduce((sum, evaluation) => {
      return sum + evaluation.scores.novelty + evaluation.scores.completeness + evaluation.scores.quality;
    }, 0);
    
    const totalEvaluations = idea.evaluations.length * 3;
    return Math.round((totalScores / totalEvaluations) * 10) / 10;
  };

  const getRelationshipToMember = (fromMemberId: string, toMemberId: string): string => {
    if (!team) return "";
    
    const fromMember = team.members.find((m) => 
      (m.isUser && fromMemberId === "나") || (!m.isUser && m.agentId === fromMemberId)
    );
    
    if (!fromMember?.relationships) return "";
    
    const relationship = fromMember.relationships.find((rel) => 
      (rel.targetIsUser && toMemberId === "나") || (!rel.targetIsUser && rel.targetAgentId === toMemberId)
    );
    
    if (!relationship || relationship.type === "NULL") return "";
    
    switch (relationship.type) {
      case "PEER":
        return "동료";
      case "SUPERIOR_SUBORDINATE":
        return "상사";
      default:
        return "";
    }
  };

  const getRelationshipFromMember = (fromMemberId: string, toMemberId: string): string => {
    if (!team) return "";
    
    const toMember = team.members.find((m) => 
      (m.isUser && toMemberId === "나") || (!m.isUser && m.agentId === toMemberId)
    );
    
    if (!toMember?.relationships) return "";
    
    const relationship = toMember.relationships.find((rel) => 
      (rel.targetIsUser && fromMemberId === "나") || (!rel.targetIsUser && rel.targetAgentId === fromMemberId)
    );
    
    if (!relationship || relationship.type === "NULL") return "";
    
    switch (relationship.type) {
      case "PEER":
        return "동료";
      case "SUPERIOR_SUBORDINATE":
        return "부하";
      default:
        return "";
    }
  };

  const getMemberRelationships = (member: any): string[] => {
    if (!team) return [];
    
    const memberId = member.isUser ? "나" : member.agentId;
    const relationships: string[] = [];
    
    team.members.forEach((otherMember) => {
      if (otherMember === member) return;
      
      const otherMemberId = otherMember.isUser ? "나" : otherMember.agentId;
      const otherMemberName = otherMember.isUser ? "나" : getAgentName(otherMember.agentId || "");
      
      const relationToOther = getRelationshipToMember(memberId, otherMemberId);
      const relationFromOther = getRelationshipFromMember(memberId, otherMemberId);
      
      if (relationToOther) {
        relationships.push(`${otherMemberName}의 ${relationToOther}`);
      } else if (relationFromOther) {
        relationships.push(`${otherMemberName}의 ${relationFromOther}`);
      }
    });
    
    return relationships;
  };

  const generateFeedbackData = () => {
    if (!chatMessages || chatMessages.length === 0) return {};
    
    const feedbackCounts: { [key: string]: number } = {};
    
    
    chatMessages.forEach((message, index) => {
      // 피드백 세션 완료 메시지 - 활동 타임라인과 동일한 로직 사용
      if (message.type === "feedback_session_summary") {
        
        let feedbackGiver = "";
        let feedbackReceiver = "";
        let messageCount = 0;
        
        if (message.payload && typeof message.payload === "object") {
          const payload = message.payload as any;
          
          // 메시지 수 추출
          if (payload.messageCount) {
            messageCount = payload.messageCount;
          } else if (payload.turnCount) {
            messageCount = payload.turnCount;
          }
          
          // 피드백 제공자와 수신자 식별 (활동 타임라인과 동일한 로직)
          if (payload.from && payload.to) {
            feedbackGiver = payload.from;
            feedbackReceiver = payload.to;
          } else if (payload.sender && payload.receiver) {
            feedbackGiver = payload.sender;
            feedbackReceiver = payload.receiver;
          } else if (payload.participants && Array.isArray(payload.participants)) {
            // participants에서 첫 번째를 제공자로 간주
            if (payload.participants.length >= 2) {
              feedbackGiver = payload.participants[0];
              feedbackReceiver = payload.participants[1];
            }
          }
          
          // message.sender를 피드백 제공자로 사용 (fallback)
          if (!feedbackGiver && message.sender) {
            feedbackGiver = message.sender;
            
            // 다른 참여자를 찾기
            if (team?.members) {
              for (const member of team.members) {
                const memberId = member.isUser ? "나" : member.agentId;
                
                if (memberId && memberId !== message.sender) {
                  feedbackReceiver = memberId;
                  break;
                }
              }
            }
          }
          
          // 피드백 관계 추가
          if (feedbackGiver && feedbackReceiver && feedbackGiver !== feedbackReceiver) {
            const key = `${feedbackGiver}->${feedbackReceiver}`;
            // 메시지 수를 가중치로 사용, 최소 1
            const weight = Math.max(messageCount || 1, 1);
            feedbackCounts[key] = (feedbackCounts[key] || 0) + weight;
            
          }
        }
      }
      
      // 직접 피드백 메시지들도 확인
      if (message.type === "give_feedback" || 
          message.type === "feedback") {
        const sender = message.sender;
        const mention = message.payload?.mention || message.payload?.target || message.payload?.to;
        
        if (sender && mention && sender !== mention) {
          const key = `${sender}->${mention}`;
          feedbackCounts[key] = (feedbackCounts[key] || 0) + 1;
        }
      }
      
      // 시스템 메시지에서 피드백 관련 활동 추출 (backup)
      if (message.type === "system" && message.payload && typeof message.payload === "object") {
        const content = message.payload.content;
        if (typeof content === "string" && content.includes("피드백")) {
          const sender = message.sender;
          
          // 피드백을 제공한 사람 (sender)과 받은 사람을 찾기
          team?.members.forEach((targetMember) => {
            const targetName = targetMember.isUser ? "나" : getAgentName(targetMember.agentId || "");
            const targetId = targetMember.isUser ? "나" : targetMember.agentId;
            
            // 메시지 내용에 타겟 멤버 이름이 포함되어 있고, 보낸 사람과 다른 경우
            if (content.includes(targetName) && 
                targetName !== getAgentName(sender) && 
                targetId && sender) {
              
              const key = `${sender}->${targetId}`;
              feedbackCounts[key] = (feedbackCounts[key] || 0) + 1;
            }
          });
        }
      }
    });
    
    // 실제 데이터가 없으면 활동 로그를 기반으로 피드백 데이터 생성
    if (Object.keys(feedbackCounts).length === 0) {
      
      // 이미 추출된 액션 로그에서 피드백 활동 찾기
      const logs = extractActionLogs(chatMessages);
      logs.forEach(log => {
        if (log.action === "피드백 제공" && log.agentName && log.agentName !== "시스템") {
          // 모든 다른 팀 멤버에게 피드백을 제공했다고 가정
          team?.members.forEach(member => {
            const memberId = member.isUser ? "나" : member.agentId;
            const memberName = member.isUser ? "나" : getAgentName(member.agentId || "");
            
            // 피드백 제공자와 다른 멤버인 경우
            if (memberId && log.agentName !== memberName) {
              // 피드백 제공자의 실제 ID 찾기
              let providerId = "";
              if (log.agentName === "나") {
                providerId = "나";
              } else {
                const providerMember = team.members.find(m => 
                  !m.isUser && getAgentName(m.agentId || "") === log.agentName
                );
                if (providerMember?.agentId) {
                  providerId = providerMember.agentId;
                }
              }
              
              if (providerId) {
                const key = `${providerId}->${memberId}`;
                feedbackCounts[key] = (feedbackCounts[key] || 0) + 1;
              }
            }
          });
        }
      });
    }
    
    // 여전히 데이터가 없으면 최소한의 테스트 데이터 생성
    if (Object.keys(feedbackCounts).length === 0 && team?.members && team.members.length > 1) {
      
      // 첫 번째 에이전트가 두 번째 멤버에게 피드백을 제공했다고 가정
      const firstAgent = team.members.find(m => !m.isUser)?.agentId;
      const secondMember = team.members.find(m => m !== team.members.find(mem => !mem.isUser && mem.agentId === firstAgent));
      const secondId = secondMember?.isUser ? "나" : secondMember?.agentId;
      
      if (firstAgent && secondId) {
        feedbackCounts[`${firstAgent}->${secondId}`] = 3;
      }
    }
    
    return feedbackCounts;
  };

  const generateRequestData = () => {
    if (!chatMessages || chatMessages.length === 0) return {};
    
    const requestCounts: { [key: string]: number } = {};
    
    chatMessages.forEach((message) => {
      if (message.type === "make_request") {
        const sender = message.sender;
        const mention = message.payload?.mention;
        
        if (sender && mention && sender !== mention) {
          const key = `${sender}->${mention}`;
          requestCounts[key] = (requestCounts[key] || 0) + 1;
        }
      }
    });
    
    return requestCounts;
  };

  const generateNetworkData = () => {
    if (!team) return { nodes: [], edges: [] };
    
    const nodes = team.members.map((member, index) => ({
      id: member.isUser ? "나" : member.agentId!,
      name: member.isUser ? "나" : getAgentName(member.agentId || ""),
      isUser: member.isUser,
      isLeader: member.isLeader,
      x: 0,
      y: 0,
    }));

    const edges: any[] = [];
    
    if (showFeedbackMode || showRequestMode) {
      // 피드백 모드
      if (showFeedbackMode) {
        const feedbackCounts = generateFeedbackData();
        
        
        Object.entries(feedbackCounts).forEach(([key, count]) => {
          const [fromId, toId] = key.split('->');
          
          // ID 정리: "(숫자)" 패턴 제거하고 실제 에이전트 ID로 변환
          let cleanFromId = fromId;
          let cleanToId = toId;
          
          // "(숫자)" 패턴 제거 (예: "지피티 (4)" -> "지피티")
          cleanToId = cleanToId.replace(/\s*\(\d+\)$/, '');
          cleanFromId = cleanFromId.replace(/\s*\(\d+\)$/, '');
          
          // 실제 팀 멤버 ID로 변환 - 개선된 매칭 로직
          const fromMember = team?.members.find(m => {
            const memberName = m.isUser ? "나" : getAgentName(m.agentId || "");
            
            if (m.isUser && (cleanFromId === "나" || fromId === "나")) {
              return true;
            }
            if (!m.isUser && m.agentId === cleanFromId) {
              return true;
            }
            if (!m.isUser && memberName === cleanFromId) {
              return true;
            }
            // 부분 매칭: "지피티"가 "지피티 (4)"에 포함되는 경우
            if (!m.isUser && memberName.includes(cleanFromId) && cleanFromId.length > 2) {
              return true;
            }
            // 역방향 부분 매칭: "지피티 (4)"에서 "지피티" 추출해서 비교
            if (!m.isUser && memberName.replace(/\s*\(\d+\)$/, '') === cleanFromId) {
              return true;
            }
            return false;
          });
          
          const toMember = team?.members.find(m => {
            const memberName = m.isUser ? "나" : getAgentName(m.agentId || "");
            
            if (m.isUser && (cleanToId === "나" || toId === "나")) {
              return true;
            }
            if (!m.isUser && m.agentId === cleanToId) {
              return true;
            }
            if (!m.isUser && memberName === cleanToId) {
              return true;
            }
            // 부분 매칭: "지피티"가 "지피티 (4)"에 포함되는 경우
            if (!m.isUser && memberName.includes(cleanToId) && cleanToId.length > 2) {
              return true;
            }
            // 역방향 부분 매칭: "지피티 (4)"에서 "지피티" 추출해서 비교
            if (!m.isUser && memberName.replace(/\s*\(\d+\)$/, '') === cleanToId) {
              return true;
            }
            return false;
          });
          
          const finalFromId = fromMember?.isUser ? "나" : fromMember?.agentId;
          const finalToId = toMember?.isUser ? "나" : toMember?.agentId;
          
          
          // 특별 처리: toMember가 없으면 유사한 이름의 모든 멤버에게 화살표 생성
          if (finalFromId && !finalToId && cleanToId.length > 2) {
            team?.members.forEach(m => {
              if (!m.isUser) {
                const memberName = getAgentName(m.agentId || "");
                const cleanMemberName = memberName.replace(/\s*\(\d+\)$/, '');
                
                if (cleanMemberName === cleanToId || memberName.includes(cleanToId)) {
                  let strokeWidth;
                  if (count <= 2) {
                    strokeWidth = 1;
                  } else if (count <= 5) {
                    strokeWidth = 2;
                  } else if (count <= 10) {
                    strokeWidth = 3;
                  } else if (count <= 20) {
                    strokeWidth = 4;
                  } else if (count <= 35) {
                    strokeWidth = 5;
                  } else if (count <= 50) {
                    strokeWidth = 6;
                  } else {
                    strokeWidth = Math.min(8, Math.floor(count / 10));
                  }
                  
                  edges.push({
                    from: finalFromId,
                    to: m.agentId,
                    type: "FEEDBACK",
                    isHierarchical: true,
                    strokeWidth: strokeWidth,
                    feedbackCount: count,
                    color: "#7C3AED"
                  });
                }
              }
            });
          }
          
          // 유효한 ID가 있는 경우에만 엣지 생성
          else if (finalFromId && finalToId && finalFromId !== finalToId) {
            // 피드백 횟수에 따른 선 굵기 계산
            let strokeWidth;
            if (count <= 2) {
              strokeWidth = 1;
            } else if (count <= 5) {
              strokeWidth = 2;
            } else if (count <= 10) {
              strokeWidth = 3;
            } else if (count <= 20) {
              strokeWidth = 4;
            } else if (count <= 35) {
              strokeWidth = 5;
            } else if (count <= 50) {
              strokeWidth = 6;
            } else {
              strokeWidth = Math.min(8, Math.floor(count / 10));
            }
            
            edges.push({
              from: finalFromId,
              to: finalToId,
              type: "FEEDBACK",
              isHierarchical: true, // 피드백은 방향성이 있음
              strokeWidth: strokeWidth,
              feedbackCount: count,
              color: "#7C3AED" // 보라색 (피드백)
            });
            
          } else {
          }
        });
        
      }

      // 요청 모드
      if (showRequestMode) {
        const requestCounts = generateRequestData();
        console.log("요청 데이터:", requestCounts);
        
        Object.entries(requestCounts).forEach(([key, count]) => {
          console.log(`요청 화살표: ${key}, 횟수: ${count}`);
          const [fromId, toId] = key.split('->');
          
          // ID 정리 (괄호 제거)
          const cleanFromId = fromId.replace(/\s*\(\d+\)$/, '');
          const cleanToId = toId.replace(/\s*\(\d+\)$/, '');
          
          console.log(`ID 정리: ${fromId} -> ${cleanFromId}, ${toId} -> ${cleanToId}`);
          
          // 팀 멤버와 매칭하여 실제 ID 찾기
          const fromMember = team?.members.find(m => {
            const memberName = m.isUser ? "나" : getAgentName(m.agentId || "");
            
            if (m.isUser && (cleanFromId === "나" || fromId === "나")) {
              return true;
            }
            if (!m.isUser && m.agentId === cleanFromId) {
              return true;
            }
            if (!m.isUser && memberName === cleanFromId) {
              return true;
            }
            // 부분 매칭: "지피티"가 "지피티 (2)"에 포함되는 경우
            if (!m.isUser && memberName.includes(cleanFromId) && cleanFromId.length > 2) {
              return true;
            }
            // 역방향 부분 매칭: "지피티 (2)"에서 "지피티" 추출해서 비교
            if (!m.isUser && memberName.replace(/\s*\(\d+\)$/, '') === cleanFromId) {
              return true;
            }
            return false;
          });
          
          const toMember = team?.members.find(m => {
            const memberName = m.isUser ? "나" : getAgentName(m.agentId || "");
            
            if (m.isUser && (cleanToId === "나" || toId === "나")) {
              return true;
            }
            if (!m.isUser && m.agentId === cleanToId) {
              return true;
            }
            if (!m.isUser && memberName === cleanToId) {
              return true;
            }
            // 부분 매칭: "지피티"가 "지피티 (2)"에 포함되는 경우
            if (!m.isUser && memberName.includes(cleanToId) && cleanToId.length > 2) {
              return true;
            }
            // 역방향 부분 매칭: "지피티 (2)"에서 "지피티" 추출해서 비교
            if (!m.isUser && memberName.replace(/\s*\(\d+\)$/, '') === cleanToId) {
              return true;
            }
            return false;
          });
          
          const finalFromId = fromMember?.isUser ? "나" : fromMember?.agentId;
          const finalToId = toMember?.isUser ? "나" : toMember?.agentId;
          
          console.log(`매칭 결과: ${fromId} -> ${finalFromId}, ${toId} -> ${finalToId}`);
          
          // 유효한 ID가 있는 경우에만 엣지 생성
          if (finalFromId && finalToId && finalFromId !== finalToId) {
            // 요청 횟수에 따른 선 굵기 계산 (1-8 범위)
            let strokeWidth;
            if (count <= 2) {
              strokeWidth = 1;
            } else if (count <= 5) {
              strokeWidth = 2;
            } else if (count <= 10) {
              strokeWidth = 3;
            } else if (count <= 20) {
              strokeWidth = 4;
            } else if (count <= 35) {
              strokeWidth = 5;
            } else if (count <= 50) {
              strokeWidth = 6;
            } else {
              strokeWidth = Math.min(8, Math.floor(count / 10));
            }
            
            edges.push({
              from: finalFromId,
              to: finalToId,
              type: "REQUEST",
              isHierarchical: true, // 요청은 방향성이 있음
              strokeWidth: strokeWidth,
              requestCount: count,
              color: "#EA580C" // 주황색 (요청)
            });
            
            console.log(`요청 엣지 생성 성공: ${finalFromId} -> ${finalToId}, 굵기: ${strokeWidth}, 횟수: ${count}`);
          } else {
            console.log(`요청 엣지 생성 실패: 유효하지 않은 ID - ${finalFromId} -> ${finalToId}`);
          }
        });
      }
      
    } else {
      // 관계 모드: 기존 팀 관계 표시
      if (team.relationships && team.relationships.length > 0) {
        team.relationships.forEach((relationship) => {
          // NULL 관계는 스킵
          if (relationship.type === "NULL") {
            return;
          }
          
          // from과 to를 실제 멤버 ID로 변환 (팀빌딩 변경 형식에 맞게)
          let fromId = relationship.from;
          let toId = relationship.to;
          
          // "나"는 그대로 두고, 에이전트는 ID로 변환
          if (fromId !== "나") {
            // 먼저 agentId로 직접 매칭 시도
            const directMatch = team.members.find(m => !m.isUser && m.agentId === fromId);
            if (directMatch) {
              fromId = directMatch.agentId!;
            } else {
              // A, B, C, D 같은 임시 ID인 경우 에이전트 이름으로 매핑 시도
              const nameMatch = team.members.find(m => 
                !m.isUser && getAgentName(m.agentId || "") === fromId
              );
              if (nameMatch) {
                fromId = nameMatch.agentId!;
              }
            }
          }
          
          if (toId !== "나") {
            // 먼저 agentId로 직접 매칭 시도
            const directMatch = team.members.find(m => !m.isUser && m.agentId === toId);
            if (directMatch) {
              toId = directMatch.agentId!;
            } else {
              // A, B, C, D 같은 임시 ID인 경우 에이전트 이름으로 매핑 시도
              const nameMatch = team.members.find(m => 
                !m.isUser && getAgentName(m.agentId || "") === toId
              );
              if (nameMatch) {
                toId = nameMatch.agentId!;
              }
            }
          }
          
          // 관계 타입에 따른 엣지 생성
          let isHierarchical;
          if (relationship.type === "PEER") {
            isHierarchical = false;
          } else if (relationship.type === "SUPERVISOR" || relationship.type === "SUPERIOR_SUBORDINATE") {
            isHierarchical = true;
          } else {
            return;
          }
          
          edges.push({
            from: fromId,
            to: toId,
            type: relationship.type,
            isHierarchical: isHierarchical
          });
        });
      }
    }

    // 관계가 없다면 모든 팀원을 동료 관계로 연결 (피드백/요청 모드가 아닐 때만)
    if (!showFeedbackMode && !showRequestMode && edges.length === 0 && nodes.length > 1) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          edges.push({
            from: nodes[i].id,
            to: nodes[j].id,
            type: "PEER",
            isHierarchical: false
          });
        }
      }
    }

    // Position nodes using saved positions or circle layout as fallback
    const centerX = 200;
    const centerY = 200;
    const radius = 120;
    
    nodes.forEach((node, index) => {
      // Use saved position if available
      if (team.nodePositions && team.nodePositions[node.id]) {
        node.x = team.nodePositions[node.id].x;
        node.y = team.nodePositions[node.id].y;
      } else {
        // Fallback to circular layout
        const angle = (index * 2 * Math.PI) / nodes.length;
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
      }
    });

    return { nodes, edges };
  };

  const openIdeaDetail = (idea: Idea) => {
    setSelectedIdea(idea);
    setShowIdeaDetail(true);
  };

  const closeIdeaDetail = () => {
    setSelectedIdea(null);
    setShowIdeaDetail(false);
  };

  const IdeaDetailModal = () => {
    if (!showIdeaDetail || !selectedIdea) return null;

    const averageRating = calculateAverageRating(selectedIdea);

    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.08)' }} onClick={closeIdeaDetail}></div>
        <div className="relative z-10 flex items-center justify-center h-full p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[95vh] overflow-y-auto border border-gray-200">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Lightbulb className="h-6 w-6 text-yellow-500" />
              <h2 className="text-xl font-semibold text-gray-900">아이디어 상세</h2>
            </div>
            <button
              onClick={closeIdeaDetail}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 space-y-6">
            {/* 기본 정보 */}
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-6">
              <span>작성자: {getAgentName(selectedIdea.author)}</span>
              <span>생성일: {formatTimestamp(selectedIdea.timestamp)}</span>
              {averageRating && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500 fill-current" />
                  <span>평균 {averageRating}점</span>
                </div>
              )}
            </div>

            {/* 아이디어 상세 내용 */}
            <div className="space-y-3">
              {(() => {
                // content가 문자열인 경우 JSON 파싱 시도
                let contentObj = selectedIdea.content;
                if (typeof selectedIdea.content === 'string') {
                  try {
                    contentObj = JSON.parse(selectedIdea.content);
                  } catch (e) {
                    contentObj = selectedIdea.content;
                  }
                }

                // 아이디에이션 세션과 동일한 스타일로 렌더링
                return Object.entries(contentObj)
                  .filter(([key, value]) => value && value.toString().trim() !== '')
                  .map(([key, value]) => {
                    return (
                      <div key={key} className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          {key}
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-3">
                          {(() => {
                            // 문자열인 경우 JSON 파싱 시도
                            if (typeof value === 'string') {
                              try {
                                const parsed = JSON.parse(value);
                                if (typeof parsed === 'object' && parsed !== null) {
                                  return (
                                    <div className="space-y-4">
                                      {Object.entries(parsed).map(([subKey, subValue]) => (
                                        <div key={subKey}>
                                          <div className="font-medium text-gray-800 mb-1">{subKey}</div>
                                          <div className="text-gray-600 text-sm">{String(subValue)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }
                                return <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>;
                              } catch {
                                return <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>;
                              }
                            } else if (typeof value === 'object' && value !== null) {
                              return (
                                <div className="space-y-4">
                                  {Object.entries(value).map(([subKey, subValue]) => (
                                    <div key={subKey}>
                                      <div className="font-medium text-gray-800 mb-1">{subKey}</div>
                                      <div className="text-gray-600 text-sm">{String(subValue)}</div>
                                    </div>
                                  ))}
                                </div>
                              );
                            } else {
                              return <p className="text-sm text-gray-800 whitespace-pre-wrap">{value.toString()}</p>;
                            }
                          })()}
                        </div>
                      </div>
                    );
                  });
              })()}
            </div>

            {/* 평가 내역 */}
            {selectedIdea.evaluations && selectedIdea.evaluations.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">평가 내역</h4>
                <div className="space-y-3">
                  {selectedIdea.evaluations.map((evaluation, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">
                          {getAgentName(evaluation.evaluator)}
                        </span>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>참신성: {evaluation.scores.novelty}</span>
                          <span>완성도: {evaluation.scores.completeness}</span>
                          <span>품질: {evaluation.scores.quality}</span>
                        </div>
                      </div>
                      {evaluation.feedback && (
                        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                          {evaluation.feedback}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 아이디어 태그/카테고리 (있다면) */}
            {selectedIdea.content.category && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">카테고리</h4>
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                  {selectedIdea.content.category}
                </span>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    );
  };

  const NetworkGraph = () => {
    const { nodes, edges } = generateNetworkData();
    
    if (nodes.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          팀 데이터를 불러오는 중...
        </div>
      );
    }

    return (
      <div className="relative w-full">
        <svg width="100%" height="400" viewBox="0 0 400 400" className="border border-gray-200 rounded bg-gray-50">
          {/* SVG Definitions for arrow markers */}
          <defs>
            {/* Black arrow for relationships - 소두 버전 */}
            <marker
              id="arrowhead-black"
              markerWidth="6"
              markerHeight="4"
              refX="5"
              refY="2"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <polygon
                points="0 0, 6 2, 0 4"
                fill="#000000"
                stroke="#000000"
                strokeWidth="1"
              />
            </marker>
            {/* Purple arrow for feedback - 소두 버전 */}
            <marker
              id="arrowhead-purple"
              markerWidth="6"
              markerHeight="4"
              refX="5"
              refY="2"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <polygon
                points="0 0, 6 2, 0 4"
                fill="#7C3AED"
                stroke="#7C3AED"
                strokeWidth="1"
              />
            </marker>
            {/* Orange arrow for requests - 소두 버전 */}
            <marker
              id="arrowhead-orange"
              markerWidth="6"
              markerHeight="4"
              refX="5"
              refY="2"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <polygon
                points="0 0, 6 2, 0 4"
                fill="#EA580C"
                stroke="#EA580C"
                strokeWidth="1"
              />
            </marker>
          </defs>
          
          {/* Edges */}
          {edges.map((edge, index) => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            
            if (!fromNode || !toNode) return null;
            
            // Calculate arrow positioning for hierarchical relationships
            const dx = toNode.x - fromNode.x;
            const dy = toNode.y - fromNode.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const unitX = dx / length;
            const unitY = dy / length;
            
            // Adjust line endpoints to not overlap with circles
            const fromNodeRadius = 16;
            const toNodeRadius = 16;
            const startX = fromNode.x + unitX * fromNodeRadius;
            const startY = fromNode.y + unitY * fromNodeRadius;
            const endX = toNode.x - unitX * toNodeRadius;
            const endY = toNode.y - unitY * toNodeRadius;
            
            // Determine color and marker based on edge type
            let strokeColor = "#000000";
            let markerId = "arrowhead-black";
            
            if (edge.color) {
              strokeColor = edge.color;
              if (edge.type === "FEEDBACK") {
                markerId = "arrowhead-purple";
              } else if (edge.type === "REQUEST") {
                markerId = "arrowhead-orange";
              }
            }
            
            return (
              <g key={index}>
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={strokeColor}
                  strokeWidth={edge.strokeWidth || "1"}
                  markerEnd={edge.isHierarchical ? `url(#${markerId})` : "none"}
                />
              </g>
            );
          })}
          
          {/* Nodes */}
          {nodes.map((node) => {
            // 역할 기반 테두리 색상 결정
            let strokeColor = "white";
            let strokeWidth = "2";
            
            if (showFeedbackMode || showRequestMode) {
              const member = team?.members.find(m => 
                (m.isUser && node.id === "나") || (!m.isUser && m.agentId === node.id)
              );
              
              if (member) {
                // 정확한 역할 이름으로 확인
                const hasFeedbackRole = member.roles.includes("피드백하기");
                const hasRequestRole = member.roles.includes("요청하기");
                
                if (showFeedbackMode && hasFeedbackRole) {
                  strokeColor = "#7C3AED"; // 보라색 (피드백)
                  strokeWidth = "3";
                } else if (showRequestMode && hasRequestRole) {
                  strokeColor = "#EA580C"; // 주황색 (요청)
                  strokeWidth = "3";
                }
              }
            }
            
            return (
              <g key={node.id}>
                {/* 배경 원 */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="18"
                  fill={node.isLeader ? "#EAB308" : (node.isUser ? "#3B82F6" : "#8B5CF6")}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                />
                
                {/* User 아이콘 */}
                <foreignObject 
                  x={node.x - 8} 
                  y={node.y - 8} 
                  width="16" 
                  height="16"
                >
                  <User className="h-4 w-4 text-white" />
                </foreignObject>
                
                {/* 리더 표시 (왕관) */}
                {node.isLeader && (
                  <foreignObject 
                    x={node.x + 8} 
                    y={node.y - 12} 
                    width="12" 
                    height="12"
                  >
                    <Crown className="h-3 w-3 text-yellow-300" />
                  </foreignObject>
                )}
                
                <text
                  x={node.x}
                  y={node.y + 30}
                  fontSize="11"
                  fill="#374151"
                  textAnchor="middle"
                  className="font-medium"
                >
                  {node.name.length > 8 ? node.name.slice(0, 6) + "..." : node.name}
                </text>
              </g>
            );
          })}
        </svg>
        
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">리뷰 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => router.push("/dashboard/teams")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            팀 선택으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.push(`/ideation/${teamId}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              아이디에이션으로
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push("/")}
            >
              메인 화면으로
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {team?.teamName} - 세션 리뷰
              </h1>
              <p className="text-sm text-gray-600">
                아이디에이션 세션의 활동 내역과 결과를 확인하세요
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {team?.members.length}명
            </div>
            <div className="flex items-center gap-1">
              <Lightbulb className="h-4 w-4" />
              {ideas.length}개 아이디어
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {actionLogs.length}개 활동
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* 요약 통계 */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">세션 요약</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-600">{team?.members.length || 0}</div>
              <div className="text-sm text-gray-600">참여 팀원</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{ideas.length}</div>
              <div className="text-sm text-gray-600">총 아이디어</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">
                {ideas.reduce((sum, idea) => sum + (idea.evaluations?.length || 0), 0)}
              </div>
              <div className="text-sm text-gray-600">총 평가</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-violet-600">
                {actionLogs.filter(log => log.action.includes("피드백")).length}
              </div>
              <div className="text-sm text-gray-600">피드백 활동</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {(() => {
                  // 채팅 메시지에서 요청 횟수 계산
                  let requestCount = 0;
                  chatMessages.forEach(message => {
                    if (message.type === "make_request") {
                      requestCount++;
                    }
                  });
                  return requestCount;
                })()}
              </div>
              <div className="text-sm text-gray-600">요청 활동</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 왼쪽: 팀 정보 */}
          <div className="space-y-6">
            {/* 팀 기본 정보 */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">팀 정보</h2>
              </div>
              
              {team && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">{team.teamName}</h3>
                    <p className="text-sm text-gray-600">
                      생성일: {new Date(team.createdAt).toLocaleDateString()}
                    </p>
                    {team.topic && (
                      <p className="text-sm text-gray-600 mt-2">
                        <span className="font-medium">주제:</span> {team.topic}
                      </p>
                    )}
                    {team.sharedMentalModel && (
                      <p className="text-sm text-gray-600 mt-2">
                        <span className="font-medium">공유 멘탈 모델:</span> {team.sharedMentalModel}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 팀원 정보 */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-semibold text-gray-900">팀원 구성</h2>
              </div>
              
              <div className="space-y-4">
                {team?.members.map((member, index) => {
                  const agentProfile = member.agentId ? agentProfiles[member.agentId] : null;
                  const relationships = getMemberRelationships(member);
                  
                  return (
                    <div key={index} className="p-4 rounded-lg border border-gray-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">
                            {member.isUser ? "나" : getAgentName(member.agentId || "")}
                          </h3>
                          {member.isLeader && (
                            <Crown className="h-4 w-4 text-yellow-600" />
                          )}
                        </div>
                      </div>
                      
                      {/* Demographics */}
                      {!member.isUser && agentProfile && (
                        <div className="mb-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <span><strong>나이:</strong> {agentProfile.age}세</span>
                            <span><strong>성별:</strong> {agentProfile.gender}</span>
                            <span><strong>전문분야:</strong> {agentProfile.professional}</span>
                            <span><strong>학력:</strong> {agentProfile.education || "미정"}</span>
                          </div>
                          
                          {agentProfile.skills && (
                            <div className="mb-2">
                              <strong>스킬:</strong> {agentProfile.skills}
                            </div>
                          )}
                          
                          {agentProfile.personality && (
                            <div className="mb-2">
                              <strong>성격:</strong> {agentProfile.personality}
                            </div>
                          )}
                          
                          {agentProfile.value && (
                            <div className="mb-2">
                              <strong>가치관:</strong> {agentProfile.value}
                            </div>
                          )}
                          
                          {agentProfile.workStyle && (
                            <div className="mb-2">
                              <strong>업무 방식:</strong> {agentProfile.workStyle}
                            </div>
                          )}
                          
                          {agentProfile.preferences && (
                            <div className="mb-2">
                              <strong>선호하는 것:</strong> {agentProfile.preferences}
                            </div>
                          )}
                          
                          {agentProfile.dislikes && (
                            <div className="mb-2">
                              <strong>싫어하는 것:</strong> {agentProfile.dislikes}
                            </div>
                          )}
                          
                          {agentProfile.autonomy && (
                            <div className="flex items-center justify-between">
                              <span><strong>자율성:</strong></span>
                              <div className="flex items-center gap-1">
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map((level) => (
                                    <div
                                      key={level}
                                      className={`w-2 h-2 rounded-full ${
                                        level <= agentProfile.autonomy
                                          ? "bg-blue-500"
                                          : "bg-gray-300"
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="font-medium ml-1">{agentProfile.autonomy}/5</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Relationships */}
                      {relationships.length > 0 && (
                        <div className="mb-3">
                          <p className="text-sm font-medium text-gray-700 mb-1">관계:</p>
                          <div className="flex flex-wrap gap-1">
                            {relationships.map((relationship, relIndex) => (
                              <span
                                key={relIndex}
                                className="text-sm bg-blue-50 text-blue-700 px-2 py-1 rounded"
                              >
                                {relationship}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* 역할별 활동 통계 */}
                      <div className="mt-3 p-3 bg-blue-50 rounded text-sm">
                        <div className="font-medium text-gray-700 mb-2">역할별 활동 현황</div>
                        <div className="grid grid-cols-2 gap-3">
                          {(() => {
                            const memberId = member.isUser ? "나" : member.agentId;
                            const memberName = member.isUser ? "나" : getAgentName(member.agentId || "");
                            
                            // 활동 통계 계산
                            const ideaCount = ideas.filter(idea => idea.author === memberId).length;
                            let evaluationCount = 0;
                            ideas.forEach(idea => {
                              if (idea.evaluations) {
                                evaluationCount += idea.evaluations.filter(evaluation => evaluation.evaluator === memberId).length;
                              }
                            });
                            // 피드백 카운트 계산 - 여러 방법을 통해 정확한 카운트 수집
                            let feedbackCount = 0;
                            
                            // 디버깅: 현재 멤버의 데이터 확인
                            console.log(`=== ${memberName} 피드백 카운트 디버깅 ===`);
                            console.log("memberId:", memberId);
                            console.log("memberName:", memberName);
                            
                            // 1. 액션 로그에서 피드백 활동 카운트
                            const actionLogFeedbacks = actionLogs.filter(log => 
                              log.action.includes("피드백") && log.agentName === memberName
                            );
                            feedbackCount += actionLogFeedbacks.length;
                            console.log("액션 로그 피드백:", actionLogFeedbacks.length, actionLogFeedbacks);
                            
                            // 2. 채팅 메시지에서 직접 피드백 활동 카운트
                            const directFeedbacks = chatMessages.filter(message => 
                              (message.type === "give_feedback" || message.type === "feedback") && 
                              message.sender === memberId
                            );
                            feedbackCount += directFeedbacks.length;
                            console.log("직접 피드백 메시지:", directFeedbacks.length, directFeedbacks);
                            
                            // 3. 피드백 세션 참여 카운트 (세션 요약에서)
                            let sessionFeedbacks = 0;
                            chatMessages.forEach(message => {
                              if (message.type === "feedback_session_summary" && message.payload) {
                                const payload = message.payload as any;
                                console.log("피드백 세션 요약 payload:", payload);
                                console.log("참여자 배열:", payload.participants);
                                
                                // participants 배열에서 현재 멤버 확인
                                if (payload.participants && Array.isArray(payload.participants)) {
                                  // 각 참여자의 ID 확인
                                  payload.participants.forEach((participant: any, index: number) => {
                                    console.log(`참여자 ${index}:`, participant);
                                    
                                    // 참여자가 현재 멤버와 일치하는지 확인
                                    const participantId = typeof participant === 'string' ? participant : participant.id;
                                    const participantName = typeof participant === 'string' ? participant : participant.name;
                                    
                                    console.log(`비교 - memberId: ${memberId}, memberName: ${memberName}`);
                                    console.log(`참여자 - participantId: ${participantId}, participantName: ${participantName}`);
                                    
                                    if (participantId === memberId || participantName === memberName || 
                                        participantId === memberName || participantName === memberId) {
                                      sessionFeedbacks += 0.5; // 세션당 0.5씩 카운트 (피드백 주고받기)
                                      console.log(`매칭 성공! 현재 sessionFeedbacks: ${sessionFeedbacks}`);
                                    }
                                  });
                                }
                                
                                // 기존 방식도 유지 (혹시 다른 형태의 데이터가 있을 경우)
                                if (payload.from === memberId || payload.sender === memberId ||
                                    (payload.participants && Array.isArray(payload.participants) && 
                                     payload.participants[0] === memberId)) {
                                  sessionFeedbacks += 0.5;
                                }
                              }
                            });
                            feedbackCount += Math.round(sessionFeedbacks);
                            console.log("세션 피드백:", sessionFeedbacks, "반올림:", Math.round(sessionFeedbacks));
                            
                            // 4. 모든 채팅 메시지 타입 확인
                            const messageTypes = [...new Set(chatMessages.map(m => m.type))];
                            console.log("모든 메시지 타입:", messageTypes);
                            
                            // 5. 피드백 관련 메시지 모두 확인
                            const feedbackRelatedMessages = chatMessages.filter(message => 
                              message.type && (
                                message.type.includes("feedback") || 
                                message.type.includes("피드백") ||
                                (message.payload && JSON.stringify(message.payload).includes("피드백"))
                              )
                            );
                            console.log("피드백 관련 메시지:", feedbackRelatedMessages.length, feedbackRelatedMessages);
                            
                            console.log("총 피드백 카운트:", feedbackCount);
                            console.log("=== 디버깅 끝 ===");
                            const requestCount = chatMessages.filter(message => 
                              message.type === "make_request" && message.sender === memberId
                            ).length;
                            
                            // 역할별 매핑 - 팀 빌딩 시 설정한 정확한 워딩 사용
                            const roleActivityMap = {
                              "아이디어 생성하기": { count: ideaCount, color: "text-blue-600" },
                              "아이디어 평가하기": { count: evaluationCount, color: "text-emerald-600" },
                              "피드백하기": { count: feedbackCount, color: "text-violet-600" },
                              "요청하기": { count: requestCount, color: "text-orange-600" }
                            };
                            
                            return Object.entries(roleActivityMap).map(([roleKey, activity]) => {
                              const hasRole = member.roles.includes(roleKey);
                              
                              
                              const displayName = roleKey.replace("하기", "");
                              
                              return (
                                <div key={roleKey} className={`flex justify-between items-center p-2 rounded ${
                                  hasRole ? "bg-white border border-blue-200" : "bg-gray-100"
                                }`}>
                                  <span className={hasRole ? "font-medium text-gray-800" : "text-gray-500"}>
                                    {displayName}:
                                  </span>
                                  <span className={`font-medium ${hasRole ? activity.color : "text-gray-400"}`}>
                                    {activity.count}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                      
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 오른쪽: 네트워크 그래프 및 활동 로그 */}
          <div className="space-y-6">
            {/* 팀 관계 네트워크 */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-purple-600" />
                  <h2 className="text-lg font-semibold text-gray-900">팀 관계 네트워크</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showFeedbackMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setShowFeedbackMode(!showFeedbackMode);
                      if (!showFeedbackMode) setShowRequestMode(false);
                    }}
                  >
                    피드백
                  </Button>
                  <Button
                    variant={showRequestMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setShowRequestMode(!showRequestMode);
                      if (!showRequestMode) setShowFeedbackMode(false);
                    }}
                  >
                    요청
                  </Button>
                </div>
              </div>
              
              <NetworkGraph />
            </div>
            {/* 활동 로그 */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Clock className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">활동 타임라인</h2>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {actionLogs.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">활동 기록이 없습니다.</p>
                ) : (
                  actionLogs.map((log, index) => (
                    <div key={index} className="flex gap-3 p-3 rounded-lg bg-gray-50">
                      <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{log.agentName}</span>
                          <span className="text-xs text-gray-500">{formatTimestamp(log.timestamp)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mb-1">{log.action}</p>
                        <p className="text-xs text-gray-600">{log.description}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 아이디어 목록 */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Lightbulb className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-semibold text-gray-900">생성된 아이디어</h2>
              </div>
              
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {ideas.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">생성된 아이디어가 없습니다.</p>
                ) : (
                  ideas.map((idea, index) => {
                    const averageRating = calculateAverageRating(idea);
                    return (
                      <div 
                        key={idea.id} 
                        className="p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => openIdeaDetail(idea)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                            #{index + 1} {idea.content.object}
                          </h3>
                          {averageRating && (
                            <div className="flex items-center gap-1 text-sm">
                              <span className="text-yellow-500">★</span>
                              <span className="text-gray-600">{averageRating}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {idea.content.function}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>작성자: {getAgentName(idea.author)}</span>
                          <span>평가: {idea.evaluations?.length || 0}개</span>
                          <span>{formatTimestamp(idea.timestamp)}</span>
                          <span className="text-blue-500 font-medium">클릭하여 상세보기 →</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 아이디어 상세 모달 */}
      <IdeaDetailModal />
    </div>
  );
}