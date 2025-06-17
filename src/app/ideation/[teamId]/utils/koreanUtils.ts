// 한국어 조사 선택 함수
export function getKoreanParticle(
  name: string,
  hasConsonant: string,
  noConsonant: string
): string {
  if (!name) {
    console.log("이름이 없어서 hasConsonant 반환:", hasConsonant);
    return hasConsonant;
  }

  const lastChar = name.charAt(name.length - 1);
  const lastCharCode = lastChar.charCodeAt(0);

  if (lastCharCode >= 0xac00 && lastCharCode <= 0xd7a3) {
    // 받침 있는지 확인 (유니코드 계산)
    const hasJongseong = (lastCharCode - 0xac00) % 28 !== 0;
    const result = hasJongseong ? hasConsonant : noConsonant;
    return result;
  }

  // 한글이 아닌 경우 기본값
  console.log("한글이 아님, hasConsonant 반환:", hasConsonant);
  return hasConsonant;
}

// 타임스탬프 포맷팅 함수
export const formatTimestamp = (timestamp: string) => {
  const now = new Date();
  const messageTime = new Date(timestamp);
  const diffInMinutes = Math.floor(
    (now.getTime() - messageTime.getTime()) / (1000 * 60)
  );

  if (diffInMinutes < 1) return "방금 전";
  if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}시간 전`;
  return `${Math.floor(diffInMinutes / 1440)}일 전`;
};
