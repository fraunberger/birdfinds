export type ToastTone = "info" | "success" | "error";

export interface ToastPayload {
  message: string;
  tone?: ToastTone;
  durationMs?: number;
}

const EVENT_NAME = "birdfinds:toast";

export function pushToast(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail: payload }));
}

export function getToastEventName() {
  return EVENT_NAME;
}
