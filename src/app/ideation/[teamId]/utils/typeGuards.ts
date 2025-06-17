import {
  SystemMessagePayload,
  ChatMessagePayload,
  FeedbackSessionSummaryPayload,
} from "@/lib/types";

// 타입 가드 함수들
export const isSystemMessagePayload = (
  payload: any
): payload is SystemMessagePayload => {
  return (
    payload &&
    typeof payload === "object" &&
    "content" in payload &&
    typeof payload.content === "string"
  );
};

export const isChatMessagePayload = (
  payload: any
): payload is ChatMessagePayload => {
  return (
    payload &&
    typeof payload === "object" &&
    "type" in payload &&
    "content" in payload &&
    typeof payload.content === "string"
  );
};

export const isFeedbackSessionSummaryPayload = (
  payload: any
): payload is FeedbackSessionSummaryPayload => {
  return (
    payload &&
    typeof payload === "object" &&
    "summary" in payload &&
    "participants" in payload
  );
};
