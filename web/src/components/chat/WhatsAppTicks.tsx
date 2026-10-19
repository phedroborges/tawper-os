import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estados visuais iguais ao WhatsApp: relógio, 1 visto, 2 vistos cinza, 2 vistos azuis. */
export type MessageReceipt = "pending" | "sent" | "delivered" | "read";

const LABELS: Record<MessageReceipt, string> = {
  pending: "Enviando",
  sent: "Mensagem enviada",
  delivered: "Mensagem recebida",
  read: "Mensagem lida",
};

export function outgoingReceipt(message: { id: string; out?: boolean; receipt?: MessageReceipt | null }): MessageReceipt | undefined {
  if (message.out === false) return undefined;
  if (message.id.startsWith("local-")) return "pending";
  return message.receipt ?? "sent";
}

export function WhatsAppTicks({ receipt, className }: { receipt?: MessageReceipt | null; className?: string }) {
  if (!receipt) return null;
  const label = LABELS[receipt];
  if (receipt === "pending") {
    return (
      <span className={cn("inline-flex", className)} title={label} aria-label={label}>
        <Clock size={12} strokeWidth={2.2} className="text-[#667781]" />
      </span>
    );
  }
  const color = receipt === "read" ? "#53bdeb" : "#667781";
  const double = receipt === "delivered" || receipt === "read";
  return (
    <span className={cn("inline-flex shrink-0", className)} title={label} aria-label={label}>
      <svg viewBox="0 0 16 15" width="16" height="15" aria-hidden className="-my-0.5">
        {double ? (
          <path
            fill={color}
            d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.24.213.642.196.868-.039l6.272-8.048a.366.366 0 0 0-.063-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.242.236.646.246.889.02l6.272-8.048a.365.365 0 0 0-.063-.51z"
          />
        ) : (
          <path
            fill={color}
            d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.242.236.646.246.889.02L11.39 4.369a.366.366 0 0 0-.48-.053z"
          />
        )}
      </svg>
    </span>
  );
}
