"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "dark" | "outline" | "ghost" | "ai" | "subtle" | "danger" | "success";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-2",
  dark: "bg-navy text-white hover:bg-navy-2",
  outline: "border border-line bg-white text-ink hover:bg-soft",
  ghost: "text-muted hover:bg-soft hover:text-ink",
  ai: "border border-ai/25 bg-ai-soft text-ai hover:bg-[#e5ebf5]",
  subtle: "bg-soft text-ink hover:bg-soft-2",
  danger: "border border-brand/25 bg-white text-brand hover:bg-brand-soft",
  success: "bg-ok text-white hover:bg-[#106b50]",
};

const SIZES: Record<Size, string> = {
  xs: "h-7 px-2.5 text-[12px] gap-1.5",
  sm: "h-8.5 px-3 text-[12.5px] gap-1.5",
  md: "h-10 px-4 text-[13.5px] gap-2",
  lg: "h-11 px-5 text-[14px] gap-2",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[6px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "outline",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[6px] font-medium whitespace-nowrap transition-colors", VARIANTS[variant], SIZES[size], className)}
    >
      {children}
    </Link>
  );
}

export function IconButton({ className, children, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-grid size-9 shrink-0 place-items-center rounded-[6px] text-muted transition-colors hover:bg-soft hover:text-ink", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

type Tone = "neutral" | "red" | "green" | "amber" | "navy" | "ai" | "outline" | "muted";

const TONES: Record<Tone, string> = {
  neutral: "bg-soft text-ink",
  red: "bg-brand-soft text-brand",
  green: "bg-ok-soft text-ok",
  amber: "bg-warn-soft text-warn",
  navy: "bg-navy text-white",
  ai: "bg-ai-soft text-ai",
  outline: "border border-line text-muted bg-white",
  muted: "bg-soft text-muted",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] leading-[18px] font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" }) {
  return <As className={cn("rounded-[8px] border border-line bg-white", className)}>{children}</As>;
}

export function CardHeader({ title, kicker, action, className }: { title?: ReactNode; kicker?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-3", className)}>
      <div className="min-w-0">
        {title && <h3 className="truncate text-[14.5px] font-semibold text-ink">{title}</h3>}
        {kicker && <div className="label mt-0.5 truncate">{kicker}</div>}
      </div>
      {action}
    </div>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("label", className)}>{children}</div>;
}

export function Avatar({ name, initials, color = "#2b4a78", size = 28, className }: { name: string; initials: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      title={name}
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-medium text-white", className)}
      style={{ width: size, height: size, background: color, fontSize: Math.max(9, size * 0.36) }}
    >
      {initials}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { kicker?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink md:text-[24px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Label({ children, hint, required }: { children: ReactNode; hint?: ReactNode; required?: boolean }) {
  return (
    <span className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px] font-medium text-ink">
      <span>
        {children}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </span>
      {hint && <span className="text-[11.5px] font-normal text-muted">{hint}</span>}
    </span>
  );
}

const fieldBase =
  "rounded-[6px] border border-line bg-white px-3 text-[13.5px] text-ink placeholder:text-muted/60 outline-none transition focus:border-navy-3 focus:ring-[3px] focus:ring-navy-3/10";

const widthOf = (className?: string) => (/(^|\s)(w-|min-w-)/.test(className ?? "") ? "" : "w-full");

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, widthOf(className), "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, widthOf(className), "min-h-20 py-2 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(fieldBase, widthOf(className), "h-10 appearance-none bg-[length:14px] bg-[right_10px_center] bg-no-repeat pr-8", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7484' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, required, children, className }: { label: ReactNode; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <Label hint={hint} required={required}>
        {label}
      </Label>
      {children}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, sub, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-[13.5px]", disabled && "cursor-default opacity-60")}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#0a1d3f]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-ink">{label}</span>
        {sub && <span className="block text-[12px] text-muted">{sub}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-[6px] bg-soft p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors",
            value === o.value ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = "navy", className }: { value: number; tone?: "navy" | "red" | "green" | "amber" | "ai"; className?: string }) {
  const color = { navy: "bg-navy-3", red: "bg-brand", green: "bg-ok", amber: "bg-warn", ai: "bg-ai" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-soft", className)}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-full bg-soft text-muted">{icon}</div>}
      <div className="text-[14px] font-medium text-ink">{title}</div>
      {text && <p className="mt-1 max-w-sm text-[12.5px] text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Número com rótulo. Tom só aparece quando é exceção de verdade. */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "bad" | "good" | "warn";
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const valueColor = tone === "bad" ? "text-brand" : tone === "warn" ? "text-warn" : "text-ink";
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-[8px] border border-line bg-white px-4 py-3.5 text-left transition",
        onClick && "cursor-pointer hover:border-navy-3/30 hover:bg-[#fcfcfc]",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {icon && <span className={cn("text-muted", tone === "bad" && "text-brand", tone === "warn" && "text-warn")}>{icon}</span>}
        <span className="label truncate">{label}</span>
      </div>
      <div className={cn("mt-1.5 text-[24px] leading-none font-semibold tracking-[-0.01em]", valueColor)}>{value}</div>
      {sub && <div className="mt-1.5 truncate text-[12px] text-muted">{sub}</div>}
    </Comp>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}
