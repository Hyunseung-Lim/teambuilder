import { AgentMemory } from "@/lib/types";

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  agentMemory: AgentMemory | null;
}

export default function MemoryModal({
  isOpen,
  onClose,
  agentName,
  agentMemory,
}: MemoryModalProps) {
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

          {/* Raw JSON Display */}
          <div>
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto max-h-[70vh] overflow-y-auto font-mono whitespace-pre-wrap">
              {JSON.stringify(agentMemory, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
