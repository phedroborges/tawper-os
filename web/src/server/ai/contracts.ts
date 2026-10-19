import type { DailyBriefing, ExtractedLead, ManagerDigest, QuickProposal } from "../../lib/ai";
import { ACTIVITY_TYPES, MARCAS, PAPEIS, PRENSAS, UFS } from "../../lib/constants";
import type { ActivityType, ConversationSummary, Papel, Prensa, Prioridade } from "../../lib/types";

const CANAIS = ["WhatsApp", "Ligação", "E-mail", "Visita", "Reunião", "Nota"] as const;
const PRIORIDADES: Prioridade[] = ["Alta", "Média", "Baixa"];
export type StageOption = { id: string; nome: string };

function str(value: unknown, fallback = "", max = 600) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, max);
}
function num(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}
function strList(value: unknown, fallback: string[], maxItems: number, maxLen = 240) {
  if (!Array.isArray(value)) return fallback;
  const result = value.map((item) => str(item, "", maxLen)).filter(Boolean).slice(0, maxItems);
  return result.length ? result : fallback;
}
function iso(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(text)) return fallback;
  const day = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== text.slice(0, 10)) return fallback;
  const normalized = text.length === 10 ? `${text}T10:00:00-03:00` : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}
function activityType(value: unknown, fallback: ActivityType) {
  return pick(value, ACTIVITY_TYPES, fallback);
}
function extractedData(value: unknown, fallback: QuickProposal["dadosExtraidos"]) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result: QuickProposal["dadosExtraidos"] = { ...fallback };
  const fleet = typeof source.colhedoras === "number" ? source.colhedoras : NaN;
  if (Number.isInteger(fleet) && fleet >= 1 && fleet <= 999) result.colhedoras = fleet;
  if (source.modelos !== undefined) result.modelos = str(source.modelos, fallback.modelos ?? "", 120);
  if (typeof source.marcaAtual === "string" && MARCAS.includes(source.marcaAtual)) result.marcaAtual = source.marcaAtual;
  if (typeof source.prensa === "string" && PRENSAS.includes(source.prensa as Prensa)) result.prensa = source.prensa as Prensa;
  if (source.concorrente !== undefined) result.concorrente = str(source.concorrente, fallback.concorrente ?? "", 80);
  return result;
}

export function normalizeQuickNote(raw: Record<string, unknown>, fallback: QuickProposal, stages: StageOption[]): QuickProposal {
  const step = raw.proximoPasso && typeof raw.proximoPasso === "object" ? raw.proximoPasso as Record<string, unknown> : {};
  const suggested = raw.etapaSugerida && typeof raw.etapaSugerida === "object" ? raw.etapaSugerida as Record<string, unknown> : null;
  const stage = suggested ? stages.find((item) => item.id === str(suggested.stageId, "", 40)) : undefined;
  const checks = { ...fallback.checks };
  if (raw.checks && typeof raw.checks === "object") for (const [key, value] of Object.entries(raw.checks as Record<string, unknown>)) {
    if (Object.hasOwn(fallback.checks, key) && typeof value === "boolean") checks[key] = value;
  }
  return {
    canal: pick(raw.canal, CANAIS, fallback.canal),
    resultado: str(raw.resultado, fallback.resultado, 160),
    resumo: str(raw.resumo, fallback.resumo, 400),
    contato: str(raw.contato, fallback.contato ?? "", 40) || undefined,
    pendenciaCliente: str(raw.pendenciaCliente, fallback.pendenciaCliente ?? "", 80) || undefined,
    prazoCliente: raw.prazoCliente ? iso(raw.prazoCliente, fallback.prazoCliente ?? "") || undefined : fallback.prazoCliente,
    proximoPasso: normalizeNextStep(step, fallback.proximoPasso),
    etapaSugerida: stage ? { stageId: stage.id, nome: stage.nome, motivo: str(suggested?.motivo, fallback.etapaSugerida?.motivo ?? "Sugerido a partir da conversa.", 180) } : fallback.etapaSugerida,
    checks,
    dadosExtraidos: extractedData(raw.dadosExtraidos, fallback.dadosExtraidos),
    destaques: strList(raw.destaques, fallback.destaques, 12, 40),
    confianca: num(raw.confianca, fallback.confianca, 0.4, 0.98),
    sugereGanho: typeof raw.sugereGanho === "boolean" ? raw.sugereGanho : fallback.sugereGanho,
  };
}

export function normalizeNextStep(raw: Record<string, unknown>, fallback: QuickProposal["proximoPasso"]): QuickProposal["proximoPasso"] {
  return { titulo: str(raw.titulo, fallback.titulo, 140), tipo: activityType(raw.tipo, fallback.tipo), dueAt: iso(raw.dueAt, fallback.dueAt), prioridade: pick(raw.prioridade, PRIORIDADES, fallback.prioridade) };
}

export function normalizeConversationSummary(raw: Record<string, unknown>, fallback: ConversationSummary, stages: StageOption[], now = new Date()): ConversationSummary {
  const stageId = str(raw.etapaSugerida, fallback.etapaSugerida ?? "", 40);
  const stage = stages.some((item) => item.id === stageId) ? stageId : fallback.etapaSugerida;
  const data = extractedData(raw.dadosExtraidos, fallback.dadosExtraidos ?? {});
  return {
    assunto: str(raw.assunto, fallback.assunto, 120), necessidade: str(raw.necessidade, fallback.necessidade, 240),
    objecoes: strList(raw.objecoes, fallback.objecoes, 5, 160), compromissosTawper: strList(raw.compromissosTawper, fallback.compromissosTawper, 4, 160),
    compromissosCliente: strList(raw.compromissosCliente, fallback.compromissosCliente, 4, 160), datas: strList(raw.datas, fallback.datas, 4, 120),
    proximoPasso: str(raw.proximoPasso, fallback.proximoPasso, 160), proximoPassoTipo: activityType(raw.proximoPassoTipo, fallback.proximoPassoTipo),
    proximoPassoDias: num(raw.proximoPassoDias, fallback.proximoPassoDias, 0, 30), confianca: num(raw.confianca, fallback.confianca, 0.4, 0.98),
    etapaSugerida: stage, dadosExtraidos: Object.keys(data).length ? data : undefined, geradoEm: now.toISOString(),
  };
}

export function normalizeRouteIds(raw: unknown, candidates: { id: string }[], fallbackIds: string[]) {
  const allowed = new Set(candidates.map((item) => item.id));
  const source = raw && typeof raw === "object" && Array.isArray((raw as { companyIds?: unknown }).companyIds) ? (raw as { companyIds: unknown[] }).companyIds : [];
  const selected: string[] = [];
  for (const id of source) if (typeof id === "string" && allowed.has(id) && !selected.includes(id) && selected.length < 5) selected.push(id);
  return selected.length >= 2 ? selected : [...new Set(fallbackIds)].filter((id) => allowed.has(id)).slice(0, 4);
}

export function normalizeExtractedLead(raw: Record<string, unknown>, fallback: ExtractedLead): ExtractedLead {
  return { empresa: str(raw.empresa, fallback.empresa, 80), cidade: str(raw.cidade, fallback.cidade, 60), uf: pick(raw.uf, UFS, fallback.uf), contatoNome: str(raw.contatoNome, fallback.contatoNome, 60), papel: pick(raw.papel, PAPEIS, fallback.papel) as Papel, cargo: str(raw.cargo, fallback.cargo, 40), interesse: str(raw.interesse, fallback.interesse, 120), origem: str(raw.origem, fallback.origem, 60), indicacao: str(raw.indicacao, fallback.indicacao ?? "", 80) || undefined, dor: str(raw.dor, fallback.dor ?? "", 80) || undefined };
}

export function normalizeDailyBriefing(raw: { saudacao?: unknown; resumo?: unknown; prioridades?: { companyId?: unknown; texto?: unknown }[] }, fallback: DailyBriefing): DailyBriefing {
  const allowed = new Map(fallback.prioridades.map((item) => [item.companyId, item.texto]));
  const visited = new Set<string>();
  const priorities = (Array.isArray(raw.prioridades) ? raw.prioridades : []).flatMap((item) => {
    const id = str(item?.companyId, "", 80); if (!allowed.has(id) || visited.has(id)) return [];
    visited.add(id);
    return [{ companyId: id, texto: allowed.get(id)! }];
  });
  const seen = new Set(priorities.map((item) => item.companyId));
  for (const item of fallback.prioridades) if (!seen.has(item.companyId)) priorities.push(item);
  return { ...fallback, prioridades: priorities.slice(0, fallback.prioridades.length || 4) };
}

export function normalizeManagerDigest(raw: { linhas?: unknown }, fallback: ManagerDigest): ManagerDigest {
  // Indicadores já são calculados pelo domínio: o modelo pode ordenar, nunca reescrever valores.
  const proposed = strList(raw.linhas, fallback.linhas, 4, 240);
  const canonical = new Set(fallback.linhas);
  const ordered = [...new Set(proposed.filter((line) => canonical.has(line)))];
  return { linhas: [...ordered, ...fallback.linhas.filter((line) => !ordered.includes(line))].slice(0, 4) };
}

const AUDIO_TYPES = new Set(["audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/ogg", "video/webm"]);
export function validateTranscriptionFile(file: { size: number; type: string }) {
  return file.size > 0 && file.size <= 25 * 1024 * 1024 && AUDIO_TYPES.has(file.type.split(";")[0].trim().toLowerCase());
}
export function normalizeTranscript(value: unknown) {
  const transcript = str(value, "", 20_000).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return transcript || null;
}
