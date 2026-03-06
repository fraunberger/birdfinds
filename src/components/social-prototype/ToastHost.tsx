"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getToastEventName, type ToastPayload } from "@/lib/social-prototype/toast";

interface ToastRecord {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  href?: string;
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
      setToasts((prev) => [...prev, { id: nextId, message: detail.message, tone, href: detail.href }].slice(-4));

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

  if (toasts.length === 0) return null;

  const dismissOne = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const dismissAll = () => setToasts([]);

  // All toasts share the tone of the first one for the box border/bg
  const firstTone = toasts[0].tone;

  return (
    <div className={`fixed right-3 top-3 z-[120] w-[min(92vw,26rem)] border shadow-sm ${toneClasses[firstTone]}`}>
      <div className="flex items-start justify-between gap-2 px-3 pt-2 pb-1">
        <div className="flex-1 flex flex-col gap-1">
          {toasts.map((toast) =>
            toast.href ? (
              <Link
                key={toast.id}
                href={toast.href}
                onClick={() => dismissOne(toast.id)}
                className="text-xs font-mono hover:opacity-70"
              >
                {toast.message}
              </Link>
            ) : (
              <div key={toast.id} className="text-xs font-mono">
                {toast.message}
              </div>
            )
          )}
        </div>
        <button
          type="button"
          onClick={dismissAll}
          className="flex-shrink-0 text-current opacity-50 hover:opacity-100 leading-none mt-0.5"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
