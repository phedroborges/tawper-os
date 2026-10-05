"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AIBadge({ className, label = "IA" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] text-ai", className)}>
      <Sparkles size={11} />
      {label}
    </span>
  );
}

export function AIThinking({ steps, className }: { steps: string[]; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= steps.length - 1) return;
    const t = setTimeout(() => setI((v) => v + 1), 520);
    return () => clearTimeout(t);
  }, [i, steps.length]);
  return (
    <div className={cn("rounded-[8px] border border-line bg-soft/40 p-4", className)}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-ai">
        <Sparkles size={15} className="animate-pulse" />
        Tawper IA analisando
        <span className="flex gap-1">
          {[0, 1, 2].map((d) => (
            <span key={d} className="size-1.5 rounded-full bg-ai animate-pulse-dot" style={{ animationDelay: `${d * 0.18}s` }} />
          ))}
        </span>
      </div>
      <ul className="mt-2.5 space-y-1">
        {steps.map((s, idx) => (
          <li key={s} className={cn("flex items-center gap-2 text-[12.5px] transition-opacity", idx <= i ? "text-ink/80 opacity-100" : "opacity-0")}>
            <span className={cn("size-1.5 rounded-full", idx < i ? "bg-ok" : "bg-ai")} />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Espera simulada para dar a sensação de processamento da IA. */
export function useAIRun<T>(delay = 1600) {
  const [state, setState] = useState<{ running: boolean; result?: T }>({ running: false });
  const run = (fn: () => T) => {
    setState({ running: true });
    setTimeout(() => setState({ running: false, result: fn() }), delay);
  };
  const reset = () => setState({ running: false });
  return { ...state, run, reset, set: (result: T) => setState({ running: false, result }) };
}

export function AIPanel({ title, children, className, action, footer }: { title: ReactNode; children: ReactNode; className?: string; action?: ReactNode; footer?: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-[8px] border border-line bg-white", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-ink">
          <Sparkles size={15} className="text-ai" />
          <span className="truncate">{title}</span>
        </div>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
      {footer && <div className="border-t border-line/70 bg-soft/40 px-4 py-2.5">{footer}</div>}
    </div>
  );
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-soft">
        <span className="block h-full rounded-full bg-ai" style={{ width: `${pct}%` }} />
      </span>
      confiança {pct}%
    </span>
  );
}

/** Destaca no texto original os trechos que a IA reconheceu. */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const esc = terms.filter(Boolean).sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${esc.join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        esc.some((t) => new RegExp(`^${t}$`, "i").test(p)) ? (
          <mark key={i} className="ai-mark">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
