"use client";

import { useEffect, useMemo, useState } from "react";
import { getToastEventName, type ToastPayload } from "@/lib/social-prototype/toast";

interface ToastRecord {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let idCounter = 1;
    const eventName = getToastEventName();

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      const detail = customEvent.detail;
      if (!detail?.message) return;

      const nextId = idCounter++;
      const tone = detail.tone || "info";
      setToasts((prev) => [...prev, { id: nextId, message: detail.message, tone }].slice(-4));

      const ttl = Math.max(1200, Math.min(8000, detail.durationMs || 3000));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== nextId));
      }, ttl);
    };

    window.addEventListener(eventName, handler as EventListener);
    return () => window.removeEventListener(eventName, handler as EventListener);
  }, []);

  const toneClasses = useMemo(
    () => ({
      info: "border-neutral-300 bg-white text-neutral-700",
      success: "border-green-300 bg-green-50 text-green-800",
      error: "border-red-300 bg-red-50 text-red-800",
    }),
    []
  );

  return (
    <div className="fixed right-3 top-3 z-[120] flex w-[min(92vw,26rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className={`border px-3 py-2 text-xs font-mono shadow-sm ${toneClasses[toast.tone]}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
