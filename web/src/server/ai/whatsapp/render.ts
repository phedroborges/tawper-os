import type { AssistantAnswer, AssistantBlock } from "@/lib/ai";

function clean(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[`~]/g, "")
    .trim();
}
function bar(value: number, max: number) {
  if (max <= 0 || value <= 0) return "▱▱▱▱▱▱▱▱";
  const filled = Math.max(1, Math.round((value / max) * 8));
  return `${"▰".repeat(filled)}${"▱".repeat(8 - filled)}`;
}

function renderBlock(block: AssistantBlock) {
  if (block.type === "text") return clean(block.text);
  if (block.type === "metric") {
    const trend = block.trend === "up" ? "↗" : block.trend === "down" ? "↘" : "→";
    return [`📊 ${clean(block.label)}: ${clean(block.value)}`, block.comparison ? `${trend} ${clean(block.comparison)}` : ""].filter(Boolean).join("\n");
  }
  if (block.type === "task_list") {
    return [
      `📋 ${clean(block.title)}`,
      ...block.items.map((item) => {
        const icon = item.status === "done" ? "✅" : item.status === "cancelled" ? "🚫" : "⬜";
        return `${icon} ${clean(item.title)}${item.meta ? ` — ${clean(item.meta)}` : ""}`;
      }),
    ].join("\n");
  }
  if (block.type === "bar_chart") {
    const max = Math.max(0, ...block.items.map((item) => item.value));
    return [`📈 ${clean(block.title)}`, ...block.items.map((item) => `${bar(item.value, max)} ${clean(item.label)}: ${clean(item.display)}`)].join("\n");
  }
  return [
    block.title ? `📑 ${clean(block.title)}` : "📑 Resultado",
    ...block.rows.map((row) => row.map((value, index) => `${clean(block.columns[index] ?? "")}: ${clean(value)}`).join(" | ")),
  ].join("\n");
}

export function renderWhatsAppAnswer(answer: AssistantAnswer, maxLength = 3900) {
  const parts = [clean(answer.texto)];
  for (const block of answer.blocos ?? []) {
    const rendered = renderBlock(block);
    if (rendered && rendered !== parts[0]) parts.push(rendered);
  }
  if (answer.itens?.length) {
    parts.push(["🏢 Contas relacionadas", ...answer.itens.map((item) => `• ${clean(item.label)}${item.meta ? ` — ${clean(item.meta)}` : ""}`)].join("\n"));
  }
  const varias = (answer.acoes ?? []).filter((item) => item.status === "awaiting_confirmation");
  if (varias.length > 1) {
    // Cada ação aparece com o que vai acontecer (empresa e valor ou motivo): a primeira linha do resumo, não o rótulo curto "Confirmar venda".
    const itens = varias.map((item, index) => `${index + 1}. ${clean((item.summary ?? "").split("\n")[0] || item.confirmationText || item.title)}`).join("\n");
    parts.push(`⚠️ Confirmar ${varias.length} ações:\n${itens}\nResponda somente *CONFIRMAR* para executar todas ou *CANCELAR* para descartar todas. A confirmação expira em 15 minutos.`);
  } else if (answer.acao?.status === "awaiting_confirmation") {
    parts.push(`⚠️ ${clean(answer.acao.confirmationText ?? "Confirmar ação")}\nResponda somente *CONFIRMAR* para executar ou *CANCELAR* para descartar. A confirmação expira em 15 minutos.`);
  }
  const text = parts.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 48)).trimEnd()}\n\n… resposta encurtada para o WhatsApp.`;
}
