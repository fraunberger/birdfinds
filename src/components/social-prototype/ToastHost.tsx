"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getToastEventName, type ToastPayload } from "@/lib/social-prototype/toast";

interface ToastRecord {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  href?: string;
}

const toneClasses = {
  info: "border-neutral-300 bg-white text-neutral-700",
  success: "border-green-300 bg-green-50 text-green-800",
  error: "border-red-300 bg-red-50 text-red-800",
};

export function ToastHost() {
  const [toast, setToast] = useState<ToastRecord | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let idCounter = 1;
    let timerId: number | null = null;
    const eventName = getToastEventName();

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ToastPayload>;
      const detail = customEvent.detail;
      if (!detail?.message) return;

      if (timerId !== null) window.clearTimeout(timerId);

      const nextId = idCounter++;
      setToast({ id: nextId, message: detail.message, tone: detail.tone || "info", href: detail.href });

      const ttl = Math.max(1200, Math.min(8000, detail.durationMs || 3000));
      timerId = window.setTimeout(() => setToast(null), ttl);
    };

    window.addEventListener(eventName, handler as EventListener);
    return () => {
      window.removeEventListener(eventName, handler as EventListener);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  if (!toast) return null;

  return (
    <div className={`fixed right-3 top-3 z-[120] w-[min(92vw,26rem)] border shadow-sm ${toneClasses[toast.tone]}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        {toast.href ? (
          <Link href={toast.href} onClick={() => setToast(null)} className="text-xs font-mono hover:opacity-70 flex-1">
            {toast.message}
          </Link>
        ) : (
          <span className="text-xs font-mono flex-1">{toast.message}</span>
        )}
        <button
          type="button"
          onClick={() => setToast(null)}
          className="flex-shrink-0 text-current opacity-50 hover:opacity-100 leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
