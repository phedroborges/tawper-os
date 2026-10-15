"use server";

import type { AssistantAnswer, CopilotResult, DailyBriefing, ExtractedLead, ManagerDigest, QuickProposal } from "@/lib/ai";
import { ACTIVITY_TYPES, MARCAS, PAPEIS, PRENSAS, UFS } from "@/lib/constants";
import type { ActivityType, Canal, ConversationSummary, Papel, Prensa, Prioridade } from "@/lib/types";
import { askJSON, type ChatTurn } from "./openai";

const TAWPER = `Você é o copiloto comercial da Tawper, fabricante de mangueiras hidráulicas para usinas de cana no Brasil.
Regras:
- Responda sempre em português do Brasil, de forma concreta e curta.
- Use SOMENTE os dados fornecidos. Não invente número, nome, cidade, valor, data, compromisso ou ID.
- Se faltar informação, diga o que falta. Nunca complete com chute.
- Nada no CRM muda sem um humano confirmar.
- Responda APENAS um objeto JSON válido, sem markdown e sem texto fora do JSON.`;

const CANAIS: Canal[] = ["WhatsApp", "Ligação", "E-mail", "Visita", "Reunião", "Nota"];
const PRIORIDADES: Prioridade[] = ["Alta", "Média", "Baixa"];

function dump(v: unknown) {
  return JSON.stringify(v);
}

function str(v: unknown, fallback = "", max = 600) {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  if (!t) return fallback;
  return t.length > max ? t.slice(0, max) : t;
}

function num(v: unknown, fallback: number, min: number, max: number) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(v: unknown, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function strList(v: unknown, fallback: string[], maxItems: number, maxLen = 240) {
  if (!Array.isArray(v)) return fallback;
  const out = v.map((x) => str(x, "", maxLen)).filter(Boolean).slice(0, maxItems);
  return out.length ? out : fallback;
}

function asIso(v: unknown, fallback: string) {
  if (typeof v !== "string" || !v.trim()) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
    const d = new Date(`${v.trim()}T10:00:00`);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function asTipo(v: unknown, fallback: ActivityType): ActivityType {
  return pick(v, ACTIVITY_TYPES, fallback);
}

type StageOpt = { id: string; nome: string };

function asEtapa(v: unknown, stages: StageOpt[], fallback?: QuickProposal["etapaSugerida"]) {
  if (!v || typeof v !== "object") return fallback;
  const raw = v as { stageId?: unknown; nome?: unknown; motivo?: unknown };
  const id = str(raw.stageId, "", 40);
  const st = stages.find((s) => s.id === id);
  if (!st) return fallback;
  return { stageId: st.id, nome: st.nome, motivo: str(raw.motivo, fallback?.motivo ?? "Sugerido a partir da conversa.", 180) };
}

function asDados(v: unknown, fallback: QuickProposal["dadosExtraidos"]): QuickProposal["dadosExtraidos"] {
  const src = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: QuickProposal["dadosExtraidos"] = { ...fallback };
  if (src.colhedoras !== undefined) {
    const n = num(src.colhedoras, fallback.colhedoras ?? 0, 1, 999);
    if (n) out.colhedoras = n;
  }
  if (src.modelos !== undefined) {
    const t = str(src.modelos, fallback.modelos ?? "", 120);
    if (t) out.modelos = t;
  }
  if (typeof src.marcaAtual === "string" && (MARCAS as readonly string[]).includes(src.marcaAtual)) {
    out.marcaAtual = src.marcaAtual;
  }
  if (typeof src.prensa === "string" && (PRENSAS as readonly string[]).includes(src.prensa)) {
    out.prensa = src.prensa as Prensa;
  }
  if (src.concorrente !== undefined) {
    const t = str(src.concorrente, fallback.concorrente ?? "", 80);
    if (t) out.concorrente = t;
  }
  return out;
}

function asChecks(v: unknown, fallback: Record<string, boolean>) {
  if (!v || typeof v !== "object") return fallback;
  const out: Record<string, boolean> = { ...fallback };
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (/^[a-z0-9_]{2,40}$/.test(k) && typeof val === "boolean") out[k] = val;
  }
  return out;
}

const INTERNAL_HREFS = new Set(["/gestao", "/meu-dia", "/rotas", "/carteira", "/conversas"]);

function asAssistantItems(raw: unknown, fallback: AssistantAnswer["itens"], allowed: Set<string>) {
  const src = Array.isArray(raw) ? raw : fallback;
  if (!src?.length) return fallback;
  const items: NonNullable<AssistantAnswer["itens"]> = [];
  for (const it of src.slice(0, 10)) {
    if (!it || typeof it !== "object") continue;
    const row = it as { label?: unknown; meta?: unknown; href?: unknown; companyId?: unknown };
    const label = str(row.label, "", 80);
    if (!label) continue;
    const companyId = str(row.companyId, "", 80);
    let href: string | undefined;
    if (companyId && allowed.has(companyId)) href = `/empresas/${companyId}`;
    else if (typeof row.href === "string" && row.href.startsWith("/")) {
      const path = row.href.split("?")[0];
      const m = path.match(/^\/empresas\/([A-Za-z0-9-]+)$/);
      if (m && allowed.has(m[1])) href = `/empresas/${m[1]}`;
      else if (INTERNAL_HREFS.has(path)) href = path;
    }
    if (!href) continue;
    items.push({ label, meta: str(row.meta, "", 140) || undefined, href });
  }
  return items.length ? items : fallback;
}

export async function aiAssistant(input: {
  question: string;
  history?: ChatTurn[];
  portfolio: unknown;
  fallback: AssistantAnswer;
  allowedCompanyIds: string[];
}): Promise<AssistantAnswer> {
  const allowed = new Set(input.allowedCompanyIds);
  const raw = await askJSON<{ texto?: unknown; itens?: unknown }>({
    system: `${TAWPER}
Você responde perguntas livres sobre a carteira comercial. Cite contas pelo nome e use o id exatamente como veio no contexto.
JSON: { "texto": string, "itens": [{ "label": string, "meta": string, "companyId": string }] }
"itens" é opcional. Só use companyId que exista no contexto. Sem inventar contas.`,
    user: `Pergunta: ${str(input.question, "", 400)}\n\nCarteira:\n${dump(input.portfolio)}\n\nRascunho das regras locais (pode reescrever, sem contradizer os fatos):\n${dump(input.fallback)}`,
    history: (input.history ?? []).slice(-6),
    maxTokens: 800,
    temperature: 0.35,
  });
  if (!raw) return input.fallback;
  return {
    texto: str(raw.texto, input.fallback.texto, 1200),
    itens: asAssistantItems(raw.itens, input.fallback.itens, allowed),
  };
}

export async function aiCopilot(input: { context: unknown; fallback: CopilotResult }): Promise<CopilotResult> {
  const raw = await askJSON<{
    titulo?: unknown;
    texto?: unknown;
    diagnostico?: unknown;
    hipoteses?: unknown;
    acoes?: { titulo?: unknown; tipo?: unknown; prazoDias?: unknown }[];
    perguntas?: unknown;
    rascunho?: unknown;
    objetivo?: unknown;
    barreira?: unknown;
    estrategia?: unknown;
    resultadoEsperado?: unknown;
    base?: unknown;
    faltantes?: unknown;
  }>({
    system: `${TAWPER}
Você é o copiloto estratégico. Com o contexto da conta, produza um plano acionável.
JSON: {
  "titulo": string,
  "texto": string,
  "diagnostico": string,
  "hipoteses": string[],
  "acoes": [{ "titulo": string, "tipo": "Ligação"|"WhatsApp"|"E-mail"|"Visita"|"Reunião"|"Cotação"|"Homologação"|"Cadastro"|"Suporte"|"Outro", "prazoDias": number }],
  "perguntas": string[],
  "rascunho": string,
  "objetivo": string,
  "barreira": string,
  "estrategia": string,
  "resultadoEsperado": string,
  "base": string[],
  "faltantes": string[]
}
2 a 4 ações. "tipo" só dos valores listados. "rascunho" é mensagem curta de WhatsApp, sem inventar nome de contato que não esteja no contexto.
"faltantes" lista o que o cadastro não tem. "base" lista os fatos usados.`,
    user: `Contexto da conta:\n${dump(input.context)}\n\nRascunho das regras locais:\n${dump(input.fallback)}`,
    maxTokens: 1600,
    temperature: 0.4,
  });
  if (!raw) return input.fallback;
  const fb = input.fallback;
  const acoesRaw = Array.isArray(raw.acoes) ? raw.acoes : [];
  const acoes = (acoesRaw.length ? acoesRaw : fb.detalhes.acoes).slice(0, 4).map((a, i) => {
    const src = a && typeof a === "object" ? a : {};
    const prev = fb.detalhes.acoes[i] ?? fb.detalhes.acoes[0];
    return {
      titulo: str((src as { titulo?: unknown }).titulo, prev?.titulo ?? "Follow-up com o cliente", 120),
      tipo: asTipo((src as { tipo?: unknown }).tipo, prev?.tipo ?? "WhatsApp"),
      prazoDias: num((src as { prazoDias?: unknown }).prazoDias, prev?.prazoDias ?? 2, 0, 30),
    };
  });
  return {
    titulo: str(raw.titulo ?? raw.objetivo, fb.titulo, 140),
    texto: str(raw.texto ?? raw.estrategia, fb.texto, 500),
    detalhes: {
      diagnostico: str(raw.diagnostico, fb.detalhes.diagnostico, 500),
      hipoteses: strList(raw.hipoteses, fb.detalhes.hipoteses, 5, 220),
      acoes,
      perguntas: strList(raw.perguntas, fb.detalhes.perguntas, 5, 180),
      rascunho: str(raw.rascunho, fb.detalhes.rascunho, 500),
      objetivo: str(raw.objetivo, fb.detalhes.objetivo, 220),
      barreira: str(raw.barreira, fb.detalhes.barreira, 220),
      estrategia: str(raw.estrategia, fb.detalhes.estrategia, 500),
      resultadoEsperado: str(raw.resultadoEsperado, fb.detalhes.resultadoEsperado, 220),
    },
    base: strList(raw.base, fb.base, 8, 180),
    faltantes: strList(raw.faltantes, fb.faltantes, 6, 180),
  };
}

export async function aiQuickNote(input: {
  note: string;
  context: unknown;
  stages: StageOpt[];
  fallback: QuickProposal;
}): Promise<QuickProposal> {
  const raw = await askJSON<Record<string, unknown>>({
    system: `${TAWPER}
Você interpreta o registro livre do vendedor e devolve o mesmo JSON estruturado.
JSON: {
  "canal": "WhatsApp"|"Ligação"|"E-mail"|"Visita"|"Reunião"|"Nota",
  "resultado": string,
  "resumo": string,
  "contato": string,
  "pendenciaCliente": string,
  "proximoPasso": { "titulo": string, "tipo": "Ligação"|"WhatsApp"|"E-mail"|"Visita"|"Reunião"|"Cotação"|"Homologação"|"Cadastro"|"Suporte"|"Outro", "dueAt": string (ISO ou YYYY-MM-DD), "prioridade": "Alta"|"Média"|"Baixa" },
  "prazoCliente": string (ISO ou YYYY-MM-DD),
  "etapaSugerida": { "stageId": string, "nome": string, "motivo": string } | null,
  "checks": { [id: string]: boolean },
  "dadosExtraidos": { "colhedoras": number, "modelos": string, "marcaAtual": string, "prensa": string, "concorrente": string },
  "destaques": string[],
  "confianca": number,
  "sugereGanho": boolean
}
"stageId" só pode ser um dos ids enviados em etapasDoFunil. Não sugira etapa se o texto não justificar avanço. Não extraia frota de frases como "testar em 2 colhedoras".`,
    user: `Anotação do vendedor:\n${str(input.note, "", 2000)}\n\nEtapas do funil atual:\n${dump(input.stages)}\n\nContexto da conta:\n${dump(input.context)}\n\nRascunho das regras locais:\n${dump(input.fallback)}`,
    maxTokens: 900,
    temperature: 0.2,
  });
  if (!raw) return input.fallback;
  const fb = input.fallback;
  const passo = raw.proximoPasso && typeof raw.proximoPasso === "object" ? (raw.proximoPasso as Record<string, unknown>) : {};
  return {
    canal: pick(raw.canal, CANAIS, fb.canal),
    resultado: str(raw.resultado, fb.resultado, 160),
    resumo: str(raw.resumo, fb.resumo, 400),
    contato: str(raw.contato, fb.contato ?? "", 40) || undefined,
    pendenciaCliente: str(raw.pendenciaCliente, fb.pendenciaCliente ?? "", 80) || undefined,
    prazoCliente: raw.prazoCliente ? asIso(raw.prazoCliente, fb.prazoCliente ?? "") || undefined : fb.prazoCliente,
    proximoPasso: {
      titulo: str(passo.titulo, fb.proximoPasso.titulo, 140),
      tipo: asTipo(passo.tipo, fb.proximoPasso.tipo),
      dueAt: asIso(passo.dueAt, fb.proximoPasso.dueAt),
      prioridade: pick(passo.prioridade, PRIORIDADES, fb.proximoPasso.prioridade),
    },
    etapaSugerida: asEtapa(raw.etapaSugerida, input.stages, fb.etapaSugerida),
    checks: asChecks(raw.checks, fb.checks),
    dadosExtraidos: asDados(raw.dadosExtraidos, fb.dadosExtraidos),
    destaques: strList(raw.destaques, fb.destaques, 12, 40),
    confianca: num(raw.confianca, fb.confianca, 0.4, 0.98),
    sugereGanho: bool(raw.sugereGanho, fb.sugereGanho),
  };
}

export async function aiNextStep(input: {
  resultado: string;
  context: unknown;
  fallback: QuickProposal["proximoPasso"];
}): Promise<QuickProposal["proximoPasso"]> {
  const raw = await askJSON<{ titulo?: unknown; tipo?: unknown; dueAt?: unknown; prioridade?: unknown }>({
    system: `${TAWPER}
Sugira o próximo passo comercial. JSON: { "titulo": string, "tipo": "Ligação"|"WhatsApp"|"E-mail"|"Visita"|"Reunião"|"Cotação"|"Homologação"|"Cadastro"|"Suporte"|"Outro", "dueAt": string, "prioridade": "Alta"|"Média"|"Baixa" }.`,
    user: `Resultado registrado:\n${str(input.resultado, "", 1500)}\n\nContexto:\n${dump(input.context)}\n\nRascunho:\n${dump(input.fallback)}`,
    maxTokens: 400,
    temperature: 0.25,
  });
  if (!raw) return input.fallback;
  return {
    titulo: str(raw.titulo, input.fallback.titulo, 140),
    tipo: asTipo(raw.tipo, input.fallback.tipo),
    dueAt: asIso(raw.dueAt, input.fallback.dueAt),
    prioridade: pick(raw.prioridade, PRIORIDADES, input.fallback.prioridade),
  };
}

export async function aiSummarize(input: {
  messages: { from: string; text: string; at?: string }[];
  context: unknown;
  stages: StageOpt[];
  fallback: ConversationSummary;
}): Promise<ConversationSummary> {
  const raw = await askJSON<Record<string, unknown>>({
    system: `${TAWPER}
Resuma a conversa de WhatsApp. JSON: {
  "assunto": string,
  "necessidade": string,
  "objecoes": string[],
  "compromissosTawper": string[],
  "compromissosCliente": string[],
  "datas": string[],
  "proximoPasso": string,
  "proximoPassoTipo": "Ligação"|"WhatsApp"|"E-mail"|"Visita"|"Reunião"|"Cotação"|"Homologação"|"Cadastro"|"Suporte"|"Outro",
  "proximoPassoDias": number,
  "confianca": number,
  "etapaSugerida": string,
  "dadosExtraidos": { "colhedoras": number, "modelos": string, "marcaAtual": string, "prensa": string, "concorrente": string }
}
"etapaSugerida" é o id da etapa (ou omita). Só extraia o que o cliente disse de fato.`,
    user: `Mensagens:\n${dump(input.messages.slice(-40))}\n\nEtapas:\n${dump(input.stages)}\n\nContexto da conta:\n${dump(input.context)}\n\nRascunho:\n${dump(input.fallback)}`,
    maxTokens: 1100,
    temperature: 0.25,
  });
  if (!raw) return input.fallback;
  const fb = input.fallback;
  const etapaId = str(raw.etapaSugerida, fb.etapaSugerida ?? "", 40);
  const etapa = input.stages.some((s) => s.id === etapaId) ? etapaId : fb.etapaSugerida;
  const dados = asDados(raw.dadosExtraidos, fb.dadosExtraidos ?? {});
  return {
    assunto: str(raw.assunto, fb.assunto, 120),
    necessidade: str(raw.necessidade, fb.necessidade, 240),
    objecoes: strList(raw.objecoes, fb.objecoes, 5, 160),
    compromissosTawper: strList(raw.compromissosTawper, fb.compromissosTawper, 4, 160),
    compromissosCliente: strList(raw.compromissosCliente, fb.compromissosCliente, 4, 160),
    datas: strList(raw.datas, fb.datas, 4, 120),
    proximoPasso: str(raw.proximoPasso, fb.proximoPasso, 160),
    proximoPassoTipo: asTipo(raw.proximoPassoTipo, fb.proximoPassoTipo),
    proximoPassoDias: num(raw.proximoPassoDias, fb.proximoPassoDias, 0, 30),
    confianca: num(raw.confianca, fb.confianca, 0.4, 0.98),
    etapaSugerida: etapa,
    dadosExtraidos: Object.keys(dados).length ? dados : undefined,
    geradoEm: new Date().toISOString(),
  };
}

export async function aiRoute(input: {
  regiao: string;
  candidates: { id: string; nome: string; cidade?: string; score: number; motivos: string[]; etapa?: string }[];
  fallbackIds: string[];
}): Promise<string[]> {
  const allowed = new Set(input.candidates.map((c) => c.id));
  const raw = await askJSON<{ companyIds?: unknown }>({
    system: `${TAWPER}
Monte uma rota de visitas para o dia, 3 a 5 paradas. Priorize urgência, atraso, potencial e etapa que pede visita. Evite contas sem motivo.
JSON: { "companyIds": string[] } com ids exatamente iguais aos dos candidatos, sem repetir.`,
    user: `Região: ${str(input.regiao, "", 60)}\nCandidatos:\n${dump(input.candidates)}\nRascunho (ordem das regras locais):\n${dump(input.fallbackIds)}`,
    maxTokens: 400,
    temperature: 0.2,
  });
  const ids = Array.isArray(raw?.companyIds) ? raw.companyIds : [];
  const picked: string[] = [];
  for (const id of ids) {
    if (typeof id === "string" && allowed.has(id) && !picked.includes(id)) picked.push(id);
    if (picked.length >= 5) break;
  }
  return picked.length >= 2 ? picked : input.fallbackIds.filter((id) => allowed.has(id)).slice(0, 4);
}

export async function aiExtractLead(input: {
  contatoNome: string;
  telefone: string;
  messages: { from: string; text: string }[];
  fallback: ExtractedLead;
}): Promise<ExtractedLead> {
  const raw = await askJSON<Record<string, unknown>>({
    system: `${TAWPER}
Extraia o cadastro mínimo de um lead a partir das mensagens do WhatsApp. Não invente empresa ou cidade.
JSON: {
  "empresa": string,
  "cidade": string,
  "uf": "SP"|"MG"|"GO"|"MS"|"PR"|"MT",
  "contatoNome": string,
  "papel": "Decisor"|"Comprador"|"Técnico"|"Mecânico"|"Influenciador"|"Outro",
  "cargo": string,
  "interesse": string,
  "origem": string,
  "indicacao": string,
  "dor": string
}`,
    user: `Contato: ${str(input.contatoNome, "", 80)} · ${str(input.telefone, "", 20)}\nMensagens:\n${dump(input.messages.slice(-30))}\n\nRascunho:\n${dump(input.fallback)}`,
    maxTokens: 500,
    temperature: 0.15,
  });
  if (!raw) return input.fallback;
  const fb = input.fallback;
  return {
    empresa: str(raw.empresa, fb.empresa, 80),
    cidade: str(raw.cidade, fb.cidade, 60),
    uf: pick(raw.uf, UFS, fb.uf || "SP"),
    contatoNome: str(raw.contatoNome, fb.contatoNome, 60),
    papel: pick(raw.papel, PAPEIS, fb.papel) as Papel,
    cargo: str(raw.cargo, fb.cargo, 40),
    interesse: str(raw.interesse, fb.interesse, 120),
    origem: str(raw.origem, fb.origem, 60),
    indicacao: str(raw.indicacao, fb.indicacao ?? "", 80) || undefined,
    dor: str(raw.dor, fb.dor ?? "", 80) || undefined,
  };
}

export async function aiBriefing(input: { fallback: DailyBriefing }): Promise<DailyBriefing> {
  const allowed = new Set(input.fallback.prioridades.map((p) => p.companyId));
  const raw = await askJSON<{ saudacao?: unknown; resumo?: unknown; prioridades?: { companyId?: unknown; texto?: unknown }[] }>({
    system: `${TAWPER}
Reescreva o briefing do dia com tom direto, sem mudar os fatos nem os companyId.
JSON: { "saudacao": string, "resumo": string, "prioridades": [{ "companyId": string, "texto": string }] }`,
    user: dump(input.fallback),
    maxTokens: 700,
    temperature: 0.35,
  });
  if (!raw) return input.fallback;
  const map = new Map(input.fallback.prioridades.map((p) => [p.companyId, p.texto]));
  const prioridades = (Array.isArray(raw.prioridades) ? raw.prioridades : [])
    .map((p) => {
      const id = str(p?.companyId, "", 80);
      if (!id || !allowed.has(id)) return null;
      return { companyId: id, texto: str(p?.texto, map.get(id) ?? "", 240) };
    })
    .filter((p): p is { companyId: string; texto: string } => Boolean(p));
  const seen = new Set(prioridades.map((p) => p.companyId));
  for (const p of input.fallback.prioridades) {
    if (!seen.has(p.companyId)) prioridades.push(p);
  }
  return {
    ...input.fallback,
    saudacao: str(raw.saudacao, input.fallback.saudacao, 80),
    resumo: str(raw.resumo, input.fallback.resumo, 400),
    prioridades: prioridades.slice(0, input.fallback.prioridades.length || 4),
  };
}

export async function aiDigest(input: { fallback: ManagerDigest }): Promise<ManagerDigest> {
  const raw = await askJSON<{ linhas?: unknown }>({
    system: `${TAWPER}
Reescreva o resumo gerencial da semana em 2 a 4 frases, sem inventar indicador.
JSON: { "linhas": string[] }`,
    user: dump(input.fallback),
    maxTokens: 400,
    temperature: 0.3,
  });
  const linhas = strList(raw?.linhas, input.fallback.linhas, 4, 240);
  return { linhas: linhas.length ? linhas : input.fallback.linhas };
}
