"use client";

import { CheckCircle2, Circle, Minus, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import Link from "next/link";
import { HBarChart } from "@/components/charts/HBar";
import type { AssistantBlock } from "@/lib/ai";
import { cn } from "@/lib/utils";

export function AssistantBlocks({ blocks, onNavigate }: { blocks: AssistantBlock[]; onNavigate: () => void }) {
  return (
    <div className="mt-2 space-y-2.5">
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <p key={`text-${index}`} className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink/85">
              {block.text}
            </p>
          );
        }
        if (block.type === "metric") {
          const TrendIcon = block.trend === "up" ? TrendingUp : block.trend === "down" ? TrendingDown : Minus;
          return (
            <div key={`metric-${index}`} className="rounded-[7px] border border-line bg-soft/45 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{block.label}</div>
              <div className="mt-0.5 text-[22px] font-semibold tabular-nums text-navy">{block.value}</div>
              {block.comparison && (
                <div className={cn("mt-1 flex items-center gap-1 text-[11.5px]", block.trend === "up" ? "text-emerald-700" : block.trend === "down" ? "text-red-700" : "text-muted")}>
                  <TrendIcon size={13} /> {block.comparison}
                </div>
              )}
            </div>
          );
        }
        if (block.type === "task_list") {
          return (
            <div key={`tasks-${index}`} className="overflow-hidden rounded-[7px] border border-line bg-white">
              <div className="border-b border-line bg-soft/45 px-3 py-2 text-[11.5px] font-semibold text-ink">{block.title}</div>
              <ul className="divide-y divide-line/70">
                {block.items.map((item, itemIndex) => {
                  const Icon = item.status === "done" ? CheckCircle2 : item.status === "cancelled" ? XCircle : Circle;
                  const content = (
                    <>
                      <Icon size={15} className={cn("mt-0.5 shrink-0", item.status === "done" ? "text-emerald-600" : item.status === "cancelled" ? "text-red-500" : "text-amber-600")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[12.5px] font-medium", item.status === "done" ? "text-muted line-through" : "text-ink")}>{item.title}</span>
                        {item.meta && <span className="block text-[11px] text-muted">{item.meta}</span>}
                      </span>
                    </>
                  );
                  return (
                    <li key={`${item.title}-${itemIndex}`}>
                      {item.href ? (
                        <Link href={item.href} onClick={onNavigate} className="flex items-start gap-2 px-3 py-2 hover:bg-soft/70">
                          {content}
                        </Link>
                      ) : (
                        <div className="flex items-start gap-2 px-3 py-2">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }
        if (block.type === "bar_chart") {
          return (
            <div key={`chart-${index}`} className="rounded-[7px] border border-line bg-white p-3">
              <div className="mb-1 text-[11.5px] font-semibold text-ink">{block.title}</div>
              <HBarChart rows={block.items.map((item, itemIndex) => ({ key: `${index}-${itemIndex}`, ...item }))} labelWidth={76} valueWidth={76} />
            </div>
          );
        }
        return (
          <div key={`table-${index}`} className="overflow-x-auto rounded-[7px] border border-line bg-white">
            {block.title && <div className="border-b border-line bg-soft/45 px-3 py-2 text-[11.5px] font-semibold text-ink">{block.title}</div>}
            <table className="min-w-full text-left text-[11.5px]">
              <thead className="text-muted">
                <tr>{block.columns.map((column) => <th key={column} className="whitespace-nowrap px-2.5 py-2 font-medium">{column}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-2.5 py-2 text-ink">{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
