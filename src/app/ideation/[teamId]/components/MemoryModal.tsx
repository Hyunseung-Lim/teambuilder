import { AgentMemory } from "@/lib/types";
import { useState } from "react";

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  agentMemory: AgentMemory | null;
  agentMemoryV2?: any | null;
}

export default function MemoryModal({
  isOpen,
  onClose,
  agentName,
  agentMemory,
  agentMemoryV2,
}: MemoryModalProps) {
  const [activeTab, setActiveTab] = useState<"v1" | "v2">("v2");

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              🧠 Memory of {agentName}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
            >
              <span className="text-xl">×</span>
            </button>
          </div>

          {/* 탭 네비게이션 */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab("v2")}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "v2"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Memory v2 (Raw JSON)
            </button>
            <button
              onClick={() => setActiveTab("v1")}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "v1"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Memory v1 (Legacy)
            </button>
          </div>

          {/* 탭 컨텐츠 */}
          {activeTab === "v2" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Memory v2 (Raw JSON)
              </h3>
              {agentMemoryV2 ? (
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto max-h-[60vh] overflow-y-auto font-mono whitespace-pre-wrap">
                  {JSON.stringify(agentMemoryV2, null, 2)}
                </pre>
              ) : (
                <div className="bg-gray-50 p-4 rounded text-center text-gray-500">
                  v2 메모리가 없습니다
                </div>
              )}
            </div>
          )}

          {activeTab === "v1" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Memory v1 (Legacy)
              </h3>
              {agentMemory ? (
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto max-h-[60vh] overflow-y-auto font-mono whitespace-pre-wrap">
                  {JSON.stringify(agentMemory, null, 2)}
                </pre>
              ) : (
                <div className="bg-gray-50 p-4 rounded text-center text-gray-500">
                  v1 메모리가 없습니다
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
