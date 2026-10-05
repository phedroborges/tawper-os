"use client";

import { Check, Info, Sparkles, TriangleAlert, X } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useUI();
  return (
    <div className="pointer-events-none fixed bottom-20 left-4 z-[90] flex w-[330px] max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-5 md:left-[240px]">
      {toasts.slice(-3).map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-[7px] border border-line bg-white p-3 shadow-pop animate-slide-up">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full text-white",
              t.tone === "ok" && "bg-ok",
              t.tone === "ai" && "bg-ai",
              t.tone === "info" && "bg-navy",
              t.tone === "warn" && "bg-warn",
            )}
          >
            {t.tone === "ok" ? <Check size={14} strokeWidth={3} /> : t.tone === "ai" ? <Sparkles size={14} /> : t.tone === "warn" ? <TriangleAlert size={14} /> : <Info size={14} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">{t.text}</div>
            {t.sub && <div className="mt-0.5 text-[12px] text-muted">{t.sub}</div>}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Fechar">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
