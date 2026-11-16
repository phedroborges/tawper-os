"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface DotMatrixRow {
  key: string;
  label: string;
  total?: number;
  cells: {
    key: string;
    value: number;
    label: string;
  }[];
}

/**
 * Matriz de pontinhos (Dot-Matrix / Heatmap) inspirada no painel modular:
 * ideal para visualizar ritmo diário por vendedor, dias da semana ou canais.
 */
export function DotMatrixChart({
  rows,
  colLabels,
  tone = "navy",
  emptyText = "Sem registros no período.",
}: {
  rows: DotMatrixRow[];
  colLabels?: string[];
  tone?: "navy" | "ok" | "brand";
  emptyText?: string;
}) {
  const [hovered, setHovered] = useState<{ row: string; cell: string; label: string; value: number } | null>(null);
  if (rows.length === 0) {
    return <div className="py-6 text-center text-[12.5px] text-muted">{emptyText}</div>;
  }

  const maxVal = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.value)));

  const levelClass = (value: number) => {
    if (value <= 0) return "bg-soft-2/80 dark:bg-white/10";
    const ratio = value / maxVal;
    if (tone === "ok") {
      if (ratio >= 0.75) return "bg-ok";
      if (ratio >= 0.4) return "bg-ok/65";
      return "bg-ok/30";
    }
    if (tone === "brand") {
      if (ratio >= 0.75) return "bg-brand";
      if (ratio >= 0.4) return "bg-brand/65";
      return "bg-brand/30";
    }
    if (ratio >= 0.75) return "bg-navy";
    if (ratio >= 0.4) return "bg-navy-3/70";
    return "bg-navy-3/30";
  };

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5 overflow-x-auto pb-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className="w-24 shrink-0 truncate text-[12px] font-medium text-ink" title={r.label}>
              {r.label}
            </span>
            <div className="flex flex-1 items-center gap-[3px]">
              {r.cells.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onMouseEnter={() => setHovered({ row: r.label, cell: c.key, label: c.label, value: c.value })}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered({ row: r.label, cell: c.key, label: c.label, value: c.value })}
                  onBlur={() => setHovered(null)}
                  aria-label={`${r.label} · ${c.label}: ${c.value}`}
                  className={cn(
                    "h-3.5 min-w-[8px] flex-1 rounded-[3px] transition-transform hover:scale-110 focus:ring-2 focus:ring-navy/40 focus:outline-none",
                    levelClass(c.value),
                  )}
                />
              ))}
            </div>
            {typeof r.total === "number" && (
              <span className="w-8 shrink-0 text-right text-[11.5px] font-semibold text-muted tabular-nums">
                {r.total}
              </span>
            )}
          </div>
        ))}
      </div>

      {colLabels && colLabels.length > 0 && (
        <div className="flex items-center gap-2.5 pl-[106px] pr-10 text-[10.5px] text-muted">
          <div className="flex flex-1 justify-between">
            {colLabels.map((lbl, idx) => (
              <span key={`${lbl}-${idx}`}>{lbl}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-[11px] text-muted">
        <span className="min-h-[16px]">
          {hovered ? (
            <>
              <strong className="font-semibold text-ink">{hovered.row}</strong> · {hovered.label}:{" "}
              <strong className="font-semibold text-ink tabular-nums">{hovered.value}</strong>
            </>
          ) : (
            "Passe o mouse sobre os quadrados para ver os detalhes por dia"
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          <span>Menos</span>
          <span className="size-2.5 rounded-[2px] bg-soft-2/80" />
          <span className="size-2.5 rounded-[2px] bg-navy-3/30" />
          <span className="size-2.5 rounded-[2px] bg-navy-3/70" />
          <span className="size-2.5 rounded-[2px] bg-navy" />
          <span>Mais</span>
        </span>
      </div>
    </div>
  );
}

export interface PillBarItem {
  key: string;
  label: string;
  value: number;
  display: string;
  highlight?: boolean;
}

/**
 * Mini barras verticais em formato de pílula arredondada.
 * Destaca o período atual ou os períodos com meta batida.
 */
export function PillSparkBars({
  items,
  height = 72,
  tone = "navy",
}: {
  items: PillBarItem[];
  height?: number;
  tone?: "navy" | "ok" | "brand";
}) {
  const [hover, setHover] = useState<PillBarItem | null>(null);
  if (items.length === 0) return <div className="py-4 text-center text-[12px] text-muted">Sem dados.</div>;
  const max = Math.max(1, ...items.map((i) => i.value));
  const activeColor = tone === "ok" ? "bg-ok" : tone === "brand" ? "bg-brand" : "bg-navy-3";

  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-1.5" style={{ height }}>
        {items.map((item) => {
          const pct = item.value > 0 ? Math.max(14, Math.round((item.value / max) * 100)) : 10;
          return (
            <button
              key={item.key}
              type="button"
              onMouseEnter={() => setHover(item)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(item)}
              onBlur={() => setHover(null)}
              aria-label={`${item.label}: ${item.display}`}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none"
            >
              <span
                className={cn(
                  "w-full max-w-[16px] rounded-full transition-all duration-300 group-hover:brightness-110",
                  item.highlight ? activeColor : item.value > 0 ? "bg-navy/25 dark:bg-white/25" : "bg-soft-2 dark:bg-white/10",
                )}
                style={{ height: `${pct}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{hover ? `${hover.label}: ` : items[0]?.label}</span>
        <span className="font-semibold text-ink tabular-nums">{hover ? hover.display : items[items.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export interface ProportionalRow {
  key: string;
  label: string;
  sub?: string;
  value: number;
  display: string;
  dotColor?: string;
  onClick?: () => void;
}

/**
 * Lista limpa com bolinha de status, barra proporcional fina e valor tabular à direita.
 */
export function ProportionalBarList({
  rows,
  emptyText = "Sem dados no período.",
}: {
  rows: ProportionalRow[];
  emptyText?: string;
}) {
  if (rows.length === 0) return <div className="py-6 text-center text-[12.5px] text-muted">{emptyText}</div>;
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const pct = r.value > 0 ? Math.max(3, Math.round((r.value / max) * 100)) : 0;
        const inner = (
          <div className="flex items-center gap-3 text-[12.5px]">
            <span className="size-2 shrink-0 rounded-full" style={{ background: r.dotColor ?? "#29387f" }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-ink">{r.label}</span>
                {r.sub && <span className="shrink-0 text-[11px] text-muted">{r.sub}</span>}
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-soft">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: r.dotColor ?? "#29387f" }}
                />
              </div>
            </div>
            <span className="w-20 shrink-0 text-right font-semibold text-ink tabular-nums">{r.display}</span>
          </div>
        );

        if (r.onClick) {
          return (
            <button
              key={r.key}
              type="button"
              onClick={r.onClick}
              className="block w-full rounded-[6px] px-1.5 py-1 text-left transition hover:bg-soft/60"
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={r.key} className="px-1.5 py-0.5">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export interface SegmentedMixItem {
  key: string;
  label: string;
  value: number;
  display?: string;
  color: string;
}

/**
 * Barra contínua segmentada horizontal com legenda e percentuais abaixo.
 */
export function SegmentedMixBar({
  items,
  emptyText = "Sem dados.",
}: {
  items: SegmentedMixItem[];
  emptyText?: string;
}) {
  const valid = items.filter((i) => i.value > 0);
  const total = valid.reduce((sum, i) => sum + i.value, 0);
  if (total === 0) return <div className="py-4 text-center text-[12px] text-muted">{emptyText}</div>;

  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-soft">
        {valid.map((item) => (
          <div
            key={item.key}
            title={`${item.label}: ${item.display ?? item.value} (${Math.round((item.value / total) * 100)}%)`}
            style={{ width: `${(item.value / total) * 100}%`, background: item.color }}
            className="h-full transition-all duration-500"
          />
        ))}
      </div>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {valid.map((item) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <div key={item.key} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex min-w-0 items-center gap-1.5 text-muted">
                <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">
                {item.display ?? item.value} <span className="font-normal text-muted">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
