"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cores de categoria, em ordem fixa (conferidas para daltonismo com o validador de paleta).
 * A 6ª categoria em diante vira "Outros" em cinza: nunca se inventa cor nova.
 * Vermelho fica de fora: no sistema ele significa atraso e perda.
 */
export const CATEGORY_COLORS = ["#2456a6", "#b86e00", "#0f8a72", "#5b3fa6", "#3f8fd0"];
export const OTHER_COLOR = "#8a93a3";

function Tip({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn("pointer-events-none absolute z-20 rounded-[6px] bg-navy px-3 py-2 text-[12px] whitespace-nowrap text-white shadow-pop", className)} style={style}>
      {children}
    </span>
  );
}

export interface ColumnRow {
  key: string;
  label: string;
  value: number;
  display: string;
  tooltip?: ReactNode;
  onClick?: () => void;
}

/** Colunas de uma série só (uma cor), com linha de referência opcional (ex.: meta do mês). */
export function ColumnChart({ rows, target, targetLabel, color = CATEGORY_COLORS[0], height = 190 }: { rows: ColumnRow[]; target?: number; targetLabel?: string; color?: string; height?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const top = Math.max(1, ...rows.map((r) => r.value), target ?? 0) * 1.12;
  return (
    <div>
      <div className="relative flex items-end gap-[2px] border-b border-line" style={{ height }} role="list">
        {target !== undefined && target > 0 && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#657087]" style={{ bottom: `${(target / top) * 100}%` }}>
            <span className="absolute -top-4 right-0 bg-white pl-1 text-[10.5px] text-muted">{targetLabel}</span>
          </div>
        )}
        {rows.map((r) => {
          const Comp = r.onClick ? "button" : "div";
          return (
            <Comp
              key={r.key}
              type={r.onClick ? "button" : undefined}
              role="listitem"
              aria-label={`${r.label}: ${r.display}`}
              onClick={r.onClick}
              onMouseEnter={() => setHover(r.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r.key)}
              onBlur={() => setHover(null)}
              className={cn("relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none", r.onClick && "cursor-pointer")}
            >
              {rows.length <= 8 && <span className="mb-1 text-[11px] font-semibold whitespace-nowrap text-ink tabular-nums">{r.value > 0 ? r.display : ""}</span>}
              <span
                className={cn("w-full max-w-[46px] rounded-t-[4px] transition-[height,filter] duration-500", hover === r.key && "brightness-110")}
                style={{ height: `${(r.value / top) * 100}%`, minHeight: r.value > 0 ? 3 : 0, background: color }}
              />
              {hover === r.key && <Tip className="bottom-full left-1/2 mb-1 -translate-x-1/2">{r.tooltip ?? `${r.label}: ${r.display}`}</Tip>}
            </Comp>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {rows.map((r) => (
          <span key={r.key} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted">
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  onClick?: () => void;
}

/** Rosca de participação: até 5 fatias e "Outros". A legenda traz valor e percentual, então a cor nunca fala sozinha. */
export function DonutChart({ slices, unit, format = String }: { slices: DonutSlice[]; unit: string; format?: (v: number) => string }) {
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, CATEGORY_COLORS.length);
  const rest = sorted.slice(CATEGORY_COLORS.length).reduce((sum, s) => sum + s.value, 0);
  const parts = [...shown.map((s, i) => ({ ...s, color: CATEGORY_COLORS[i] })), ...(rest > 0 ? [{ key: "__outros", label: "Outros", value: rest, color: OTHER_COLOR, onClick: undefined }] : [])];
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  const GAP = parts.length > 1 ? 3 : 0;
  let offset = 0;
  if (total === 0) return <div className="py-8 text-center text-[12.5px] text-muted">Sem dados no período.</div>;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 140 140" className="size-[150px] shrink-0 -rotate-90" role="img" aria-label={`${format(total)} ${unit} no total`}>
        {parts.map((p) => {
          const len = (p.value / total) * C;
          const el = (
            <circle
              key={p.key}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={p.color}
              strokeWidth={hover === p.key ? 22 : 18}
              strokeDasharray={`${Math.max(len - GAP, 1)} ${C}`}
              strokeDashoffset={-offset}
              className="transition-[stroke-width] duration-200"
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
            />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" transform="rotate(90 70 70)" className="fill-ink text-[20px] font-semibold">
          {format(total)}
        </text>
        <text x="70" y="82" textAnchor="middle" transform="rotate(90 70 70)" className="fill-muted text-[9.5px]">
          {unit}
        </text>
      </svg>
      <ul className="min-w-[170px] flex-1 space-y-0.5">
        {parts.map((p) => {
          const Comp = p.onClick ? "button" : "div";
          return (
            <li key={p.key}>
              <Comp
                type={p.onClick ? "button" : undefined}
                onClick={p.onClick}
                onMouseEnter={() => setHover(p.key)}
                onMouseLeave={() => setHover(null)}
                className={cn("flex w-full items-center gap-2 rounded-[4px] px-1.5 py-1 text-left text-[12.5px]", hover === p.key && "bg-soft", p.onClick && "cursor-pointer")}
              >
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate text-ink">{p.label}</span>
                <span className="font-semibold text-ink tabular-nums">{format(p.value)}</span>
                <span className="w-9 text-right text-muted tabular-nums">{Math.round((p.value / total) * 100)}%</span>
              </Comp>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

/** Linhas no mesmo eixo (nunca dois eixos), com legenda, rótulo no fim de cada série e leitura por coluna no hover. */
export function LineChart({ labels, series, format = String }: { labels: string[]; series: LineSeries[]; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const PAD = { l: 46, r: 16, t: 14, b: 24 };
  const top = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0))) * 1.08;
  const x = (i: number) => PAD.l + (i / Math.max(1, labels.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: s.dashed ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` : s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.name).join(" e ")}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(top * f)} y2={y(top * f)} stroke="#e6e9ee" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(top * f) + 3.5} textAnchor="end" className="fill-muted text-[10.5px]">
                {format(top * f)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text key={l} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted text-[10.5px]">
              {l}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#657087" strokeWidth="1" />}
          {series.map((s) => {
            const pts = s.values.map((v, i) => (v === null ? null : ([x(i), y(v)] as const))).filter((p): p is readonly [number, number] => p !== null);
            const last = pts[pts.length - 1];
            return (
              <g key={s.name}>
                <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
                {last && !s.dashed && <circle cx={last[0]} cy={last[1]} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />}
              </g>
            );
          })}
          {labels.map((l, i) => (
            <rect key={l} x={x(i) - (W - PAD.l - PAD.r) / labels.length / 2} y={PAD.t} width={(W - PAD.l - PAD.r) / labels.length} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        {hover !== null && (
          <Tip className="top-2" style={hover > labels.length / 2 ? { right: `${100 - (x(hover) / W) * 100}%`, marginRight: 12 } : { left: `${(x(hover) / W) * 100}%`, marginLeft: 12 }}>
            <b>{labels[hover]}</b>
            {series.map((s) => (
              <span key={s.name} className="block">
                {s.name}: {s.values[hover] === null ? "—" : format(s.values[hover]!)}
              </span>
            ))}
          </Tip>
        )}
      </div>
    </div>
  );
}
