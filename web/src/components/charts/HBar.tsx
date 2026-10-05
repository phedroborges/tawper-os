"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HBarRow {
  key: string;
  label: string;
  value: number;
  display: string;
  tooltip?: ReactNode;
  /** marcador de referência (ex.: limite da etapa), na mesma escala */
  marker?: number;
  markerLabel?: string;
  color?: string;
  onClick?: () => void;
}

/**
 * Barras horizontais de série única: uma cor, barras finas com ponta arredondada, valor numa
 * coluna alinhada à direita (não colide com o marcador), tooltip no hover/foco e clique para a lista.
 */
export function HBarChart({ rows, max, color = "#123a7b", dark, labelWidth = 128, valueWidth = 96 }: { rows: HBarRow[]; max?: number; color?: string; dark?: boolean; labelWidth?: number; valueWidth?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const top = Math.max(1, max ?? Math.max(...rows.map((r) => Math.max(r.value, r.marker ?? 0))));
  return (
    <div className="space-y-1" role="list">
      {rows.map((r) => {
        const pct = (r.value / top) * 100;
        const Comp = r.onClick ? "button" : "div";
        return (
          <Comp
            key={r.key}
            type={r.onClick ? "button" : undefined}
            role="listitem"
            onClick={r.onClick}
            onMouseEnter={() => setHover(r.key)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(r.key)}
            onBlur={() => setHover(null)}
            className={cn(
              "group relative grid w-full items-center gap-3 rounded-[4px] px-1 py-1.5 text-left outline-none",
              r.onClick && (dark ? "hover:bg-white/[0.05] focus-visible:bg-white/[0.08]" : "hover:bg-soft/70 focus-visible:bg-soft"),
            )}
            style={{ gridTemplateColumns: `${labelWidth}px 1fr ${valueWidth}px` }}
          >
            <span className={cn("truncate text-[12px] font-medium", dark ? "text-white/75" : "text-ink/80")}>{r.label}</span>
            <span className="relative flex h-5 items-center">
              <span className={cn("absolute inset-y-[9px] left-0 right-0", dark ? "bg-white/[0.07]" : "bg-[#eef1f5]")} />
              <span
                className="relative h-3.5 rounded-r-[4px] transition-[width,filter] duration-500 group-hover:brightness-110"
                style={{ width: `${Math.max(pct, r.value > 0 ? 1.5 : 0)}%`, background: r.color ?? color }}
              />
              {r.marker !== undefined && r.marker > 0 && (
                <span className="absolute top-0 bottom-0 w-px" style={{ left: `${(r.marker / top) * 100}%`, background: dark ? "#ffffff66" : "#657087" }} title={r.markerLabel}>
                  <span className={cn("absolute -top-0.5 left-1 text-[9.5px] whitespace-nowrap", dark ? "text-white/50" : "text-muted")}>{hover === r.key ? r.markerLabel : ""}</span>
                </span>
              )}
            </span>
            <span className={cn("text-right text-[12px] font-semibold whitespace-nowrap tabular-nums", dark ? "text-white" : "text-ink")}>{r.display}</span>
            {hover === r.key && r.tooltip && (
              <span
                className={cn(
                  "pointer-events-none absolute top-full z-20 mt-1 rounded-[6px] px-3 py-2 text-[12px] shadow-pop",
                  dark ? "bg-white text-ink" : "bg-navy text-white",
                )}
                style={{ left: labelWidth + 12 }}
              >
                {r.tooltip}
              </span>
            )}
          </Comp>
        );
      })}
    </div>
  );
}
