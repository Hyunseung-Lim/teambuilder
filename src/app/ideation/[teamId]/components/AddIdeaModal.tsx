interface AddIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: {
    object: string;
    function: string;
    behavior: string;
    structure: string;
  };
  onFormDataChange: (data: {
    object: string;
    function: string;
    behavior: string;
    structure: string;
  }) => void;
  onSubmit: () => void;
  isAutoGenerating: boolean;
  isGeneratingIdea: boolean;
}

export default function AddIdeaModal({
  isOpen,
  onClose,
  formData,
  onFormDataChange,
  onSubmit,
  isAutoGenerating,
  isGeneratingIdea,
}: AddIdeaModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              새 아이디어 추가하기
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
            >
              <span className="text-xl">×</span>
            </button>
          </div>

          <div className="space-y-6">
            {/* Object */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Object *
              </label>
              <textarea
                value={formData.object}
                onChange={(e) =>
                  onFormDataChange({
                    ...formData,
                    object: e.target.value,
                  })
                }
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
                placeholder="아이디어의 핵심 객체를 입력하세요..."
                required
              />
            </div>

            {/* Function */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Function *
              </label>
              <textarea
                value={formData.function}
                onChange={(e) =>
                  onFormDataChange({
                    ...formData,
                    function: e.target.value,
                  })
                }
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="아이디어의 기능을 상세히 설명하세요..."
                required
              />
            </div>

            {/* Behavior */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Behavior
              </label>
              <textarea
                value={formData.behavior}
                onChange={(e) =>
                  onFormDataChange({
                    ...formData,
                    behavior: e.target.value,
                  })
                }
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="아이디어의 동작 방식을 설명하세요..."
              />
            </div>

            {/* Structure */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Structure
              </label>
              <textarea
                value={formData.structure}
                onChange={(e) =>
                  onFormDataChange({
                    ...formData,
                    structure: e.target.value,
                  })
                }
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="아이디어의 구조를 설명하세요..."
              />
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={onSubmit}
                disabled={
                  !formData.object.trim() ||
                  !formData.function.trim() ||
                  isAutoGenerating ||
                  isGeneratingIdea
                }
                className="flex-1 bg-black text-white py-3 px-4 rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
              >
                아이디어 추가하기
              </button>
              <button
                onClick={onClose}
                className="flex-1 bg-gray-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
