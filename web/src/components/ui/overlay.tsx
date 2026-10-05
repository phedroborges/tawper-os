"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
}

export function Modal({
  onClose,
  title,
  kicker,
  children,
  footer,
  size = "md",
  icon,
}: {
  onClose: () => void;
  title: ReactNode;
  kicker?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
}) {
  useEscape(onClose);
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/35 p-0 animate-fade-in sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[12px] bg-white shadow-pop animate-slide-up sm:rounded-[10px]", width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {icon && <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-soft text-navy">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 className="text-[16.5px] leading-snug font-semibold text-ink">{title}</h2>
            {kicker && <div className="label mt-0.5">{kicker}</div>}
          </div>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-[5px] text-muted hover:bg-soft hover:text-ink" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-soft/30 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, title, kicker, children, width = 420, dark }: { onClose: () => void; title: ReactNode; kicker?: ReactNode; children: ReactNode; width?: number; dark?: boolean }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-ink/25 animate-fade-in" onMouseDown={onClose}>
      <aside
        className={cn("flex h-full w-full flex-col shadow-pop animate-slide-left", dark ? "navy-flat text-white" : "bg-white")}
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={cn("flex items-start gap-3 border-b px-5 py-4", dark ? "border-white/10" : "border-line")}>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16.5px] font-semibold">{title}</h2>
            {kicker && <div className={cn("label mt-0.5", dark && "text-white/50")}>{kicker}</div>}
          </div>
          <button type="button" onClick={onClose} className={cn("grid size-8 place-items-center rounded-[5px]", dark ? "text-white/70 hover:bg-white/10" : "text-muted hover:bg-soft")} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

export function Popover({ trigger, children, align = "right", className }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger(open)}</div>
      {open && (
        <div className={cn("absolute top-full z-[60] mt-2 rounded-[7px] border border-line bg-white shadow-pop animate-fade-in", align === "right" ? "right-0" : "left-0", className)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger, sub }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; sub?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-soft", danger ? "text-brand" : "text-ink")}
    >
      {icon && <span className="mt-0.5 text-muted">{icon}</span>}
      <span>
        <span className="font-medium">{children}</span>
        {sub && <span className="block text-[11.5px] text-muted">{sub}</span>}
      </span>
    </button>
  );
}
