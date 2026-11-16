"use client";

import { Eye, EyeOff, GripVertical, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/lib/store";
import type { WidgetGridPrefs, WidgetSize } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface DashboardWidgetDef {
  id: string;
  title: string;
  subtitle?: string;
  defaultSize: WidgetSize;
  allowedSizes?: WidgetSize[];
  headerRight?: ReactNode;
  render: () => ReactNode;
}

const SIZE_LABEL: Record<WidgetSize, string> = {
  sm: "P",
  md: "M",
  lg: "G",
};

const SIZE_SPAN: Record<WidgetSize, string> = {
  sm: "col-span-12 lg:col-span-4",
  md: "col-span-12 lg:col-span-6",
  lg: "col-span-12",
};

function mergePrefs(defs: DashboardWidgetDef[], saved?: WidgetGridPrefs | null): WidgetGridPrefs {
  const validIds = defs.map((d) => d.id);
  const validSet = new Set(validIds);
  const order = [...(saved?.order ?? []).filter((id) => validSet.has(id))];
  for (const id of validIds) {
    if (!order.includes(id)) order.push(id);
  }
  const sizes: Record<string, WidgetSize> = {};
  for (const d of defs) {
    const s = saved?.sizes?.[d.id];
    sizes[d.id] = s && (!d.allowedSizes || d.allowedSizes.includes(s)) ? s : d.defaultSize;
  }
  const hidden = (saved?.hidden ?? []).filter((id) => validSet.has(id));
  return { order, sizes, hidden };
}

export function DraggableWidgetGrid({
  board,
  widgets,
  className,
}: {
  board: "dashboard" | "metas";
  widgets: DashboardWidgetDef[];
  className?: string;
}) {
  const user = useCurrentUser();
  const storageKey = `tawper:grid:${board}:${user.id}`;
  const defaultPrefs = useMemo(() => mergePrefs(widgets, null), [widgets]);

  const [prefs, setPrefs] = useState<WidgetGridPrefs>(() => {
    const fromUser = user.dashboardLayout?.[board];
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) return mergePrefs(widgets, JSON.parse(raw) as WidgetGridPrefs);
      } catch {
        // ignore localStorage error
      }
    }
    return mergePrefs(widgets, fromUser);
  });

  // Sincroniza quando o usuário muda ou carrega do banco sem sobrescrever edições locais recentes
  const userBoardJson = JSON.stringify(user.dashboardLayout?.[board] ?? null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const localRaw = window.localStorage.getItem(storageKey);
        if (localRaw) {
          setPrefs(mergePrefs(widgets, JSON.parse(localRaw) as WidgetGridPrefs));
          return;
        }
      } catch {
        // ignore
      }
      if (user.dashboardLayout?.[board]) {
        setPrefs(mergePrefs(widgets, user.dashboardLayout[board]));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, userBoardJson]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function persist(next: WidgetGridPrefs) {
    setPrefs(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/auth/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board, prefs: next }),
      }).catch(() => undefined);
    }, 450);
  }

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<"before" | "after">("before");

  const defById = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const merged = useMemo(() => mergePrefs(widgets, prefs), [widgets, prefs]);
  const hiddenSet = useMemo(() => new Set(merged.hidden ?? []), [merged.hidden]);
  const visibleIds = useMemo(() => merged.order.filter((id) => !hiddenSet.has(id)), [merged.order, hiddenSet]);
  const hiddenDefs = useMemo(
    () => (merged.hidden ?? []).map((id) => defById.get(id)).filter((d): d is DashboardWidgetDef => Boolean(d)),
    [merged.hidden, defById],
  );

  const isCustomized =
    JSON.stringify(merged.order) !== JSON.stringify(defaultPrefs.order) ||
    JSON.stringify(merged.sizes) !== JSON.stringify(defaultPrefs.sizes) ||
    (merged.hidden?.length ?? 0) > 0;

  function moveWidget(sourceId: string, targetId: string, side: "before" | "after") {
    if (sourceId === targetId) return;
    const nextOrder = merged.order.filter((id) => id !== sourceId);
    const targetIdx = nextOrder.indexOf(targetId);
    if (targetIdx === -1) return;
    const insertAt = side === "after" ? targetIdx + 1 : targetIdx;
    nextOrder.splice(insertAt, 0, sourceId);
    persist({ ...merged, order: nextOrder });
  }

  function cycleSize(id: string) {
    const def = defById.get(id);
    if (!def) return;
    const allowed = def.allowedSizes ?? ["sm", "md", "lg"];
    if (allowed.length <= 1) return;
    const current = merged.sizes?.[id] ?? def.defaultSize;
    const nextSize = allowed[(allowed.indexOf(current) + 1) % allowed.length];
    persist({
      ...merged,
      sizes: { ...(merged.sizes ?? {}), [id]: nextSize },
    });
  }

  function toggleHidden(id: string) {
    const nextHidden = hiddenSet.has(id)
      ? (merged.hidden ?? []).filter((x) => x !== id)
      : [...(merged.hidden ?? []), id];
    persist({ ...merged, hidden: nextHidden });
  }

  function resetAll() {
    persist(defaultPrefs);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-12 gap-4">
        {visibleIds.map((id) => {
          const def = defById.get(id);
          if (!def) return null;
          const size = merged.sizes?.[id] ?? def.defaultSize;
          const allowed = def.allowedSizes ?? ["sm", "md", "lg"];
          const isDragging = draggingId === id;
          const isOver = overId === id && draggingId !== id;

          return (
            <div
              key={id}
              draggable
              onDragStart={(e) => {
                setDraggingId(id);
                setOverId(null);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setOverId(null);
              }}
              onDragOver={(e) => {
                if (!draggingId || draggingId === id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                const isRightHalf = e.clientX - rect.left > rect.width / 2;
                setOverId(id);
                setDropSide(isRightHalf ? "after" : "before");
              }}
              onDragLeave={() => {
                if (overId === id) setOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const src = draggingId || e.dataTransfer.getData("text/plain");
                if (src && src !== id) {
                  moveWidget(src, id, dropSide);
                }
                setDraggingId(null);
                setOverId(null);
              }}
              className={cn(
                SIZE_SPAN[size],
                "group relative flex flex-col rounded-[10px] border border-line bg-white shadow-2xs transition-all duration-150",
                isDragging && "scale-[0.985] opacity-45 ring-2 ring-navy/30 shadow-pop",
                isOver && "ring-2 ring-navy/35",
              )}
            >
              {/* Linha visual de alinhamento ao arrastar */}
              {isOver && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-y-2 z-20 w-1 rounded-full bg-brand shadow-sm",
                    dropSide === "before" ? "-left-2.5" : "-right-2.5",
                  )}
                />
              )}

              {/* Cabeçalho do Widget com os 6 pontinhos no canto superior esquerdo */}
              <div className="flex items-start justify-between gap-2 border-b border-line/70 px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    title="Arraste para mover este bloco"
                    aria-label={`Arrastar ${def.title}`}
                    className="-ml-1 inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-[5px] text-muted/70 transition hover:bg-soft hover:text-ink active:cursor-grabbing"
                  >
                    <GripVertical size={15} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-[13.5px] font-semibold text-ink">{def.title}</h3>
                    {def.subtitle && <p className="truncate text-[11px] text-muted">{def.subtitle}</p>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {def.headerRight}
                  {allowed.length > 1 && (
                    <button
                      type="button"
                      onClick={() => cycleSize(id)}
                      title={`Largura do bloco: ${SIZE_LABEL[size]} (clique para alternar)`}
                      className="rounded-[4px] border border-line bg-soft/60 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted opacity-0 transition group-hover:opacity-100 hover:border-navy/30 hover:text-ink focus:opacity-100"
                    >
                      {SIZE_LABEL[size]}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleHidden(id)}
                    title="Ocultar bloco do meu painel"
                    aria-label={`Ocultar ${def.title}`}
                    className="grid size-6 place-items-center rounded-[4px] text-muted opacity-0 transition group-hover:opacity-100 hover:bg-soft hover:text-brand focus:opacity-100"
                  >
                    <EyeOff size={13} />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4">{def.render()}</div>
            </div>
          );
        })}
      </div>

      {/* Barra discreta para restaurar widgets ocultos ou voltar ao layout padrão */}
      {(hiddenDefs.length > 0 || isCustomized) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-dashed border-line bg-soft/40 px-3.5 py-2 text-[12px] text-muted">
          <div className="flex flex-wrap items-center gap-1.5">
            {hiddenDefs.length > 0 ? (
              <>
                <span>Blocos ocultos:</span>
                {hiddenDefs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleHidden(d.id)}
                    className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-white px-2 py-0.5 text-[11.5px] font-medium text-ink hover:border-navy/40 hover:text-navy"
                  >
                    <Eye size={11} /> {d.title}
                  </button>
                ))}
              </>
            ) : (
              <span>Layout personalizado salvo no seu perfil.</span>
            )}
          </div>
          {isCustomized && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11.5px] font-medium text-muted hover:bg-white hover:text-ink"
            >
              <RotateCcw size={12} /> Restaurar padrão
            </button>
          )}
        </div>
      )}
    </div>
  );
}
