// IA SIMULADA. Nada aqui chama um modelo de linguagem: são regras e modelos de texto que imitam o
// comportamento esperado dos agentes descritos na especificação (seção 9). A interface das funções
// foi pensada para ser trocada por chamadas reais a um LLM depois.

import { FUNNELS, getStage, stageIndex } from "./constants";
import { addDays, dayDiff, daysSince, fmtDateShort, greeting, nextWeekday, startOfDay, weekdayName } from "./dates";
import {
  alertsOf,
  computeMetrics,
  daysInStage,
  isStagnant,
  lastInteractionAt,
  nextStepOf,
  openDealOf,
  pendingOf,
  qualityOf,
  quoteExpiresAt,
  sellerStats,
  stageOf,
  type Data,
} from "./selectors";
import type {
  ActivityType,
  Canal,
  Company,
  Contact,
  Conversation,
  ConversationSummary,
  CopilotDetail,
  Deal,
  Persona,
  Prensa,
  Prioridade,
  User,
} from "./types";
import { money, normalize } from "./utils";

// ---------------------------------------------------------------------------
// Utilidades de leitura de texto
// ---------------------------------------------------------------------------
const has = (t: string, re: RegExp) => re.test(t);

const WEEKDAY_RES: { re: RegExp; dow: number }[] = [
  { re: /\bdomingo\b/, dow: 0 },
  { re: /\bsegunda\b/, dow: 1 },
  { re: /\bterca\b/, dow: 2 },
  { re: /\bquarta\b/, dow: 3 },
  { re: /\bquinta\b/, dow: 4 },
  { re: /\bsexta\b/, dow: 5 },
  { re: /\bsabado\b/, dow: 6 },
];

function skipWeekend(d: Date) {
  const x = new Date(d);
  if (x.getDay() === 6) x.setDate(x.getDate() + 2);
  if (x.getDay() === 0) x.setDate(x.getDate() + 1);
  return x;
}

/** Interpreta prazos em português ("até sexta", "cobrar segunda", "amanhã", "dia 15"). */
export function inferDue(textRaw: string, now = new Date(), clientMode = true): { date: Date; clientDeadline?: Date; explicit: boolean } {
  const t = normalize(textRaw);
  const found: { idx: number; dow: number }[] = [];
  WEEKDAY_RES.forEach(({ re, dow }) => {
    const m = new RegExp(re.source, "g");
    let r: RegExpExecArray | null;
    while ((r = m.exec(t))) found.push({ idx: r.index, dow });
  });
  found.sort((a, b) => a.idx - b.idx);

  if (found.length >= 2) {
    const first = nextWeekday(now, found[0].dow);
    const second = nextWeekday(first, found[1].dow);
    return { date: second, clientDeadline: first, explicit: true };
  }
  if (found.length === 1) {
    const d = nextWeekday(now, found[0].dow);
    const before = t.slice(Math.max(0, found[0].idx - 8), found[0].idx);
    if (clientMode && /ate\s*$/.test(before) && !/cobrar|retornar|ligar/.test(t.slice(found[0].idx))) {
      // prazo do cliente: o próximo passo é verificar no dia útil seguinte
      return { date: skipWeekend(addDays(d, 1)), clientDeadline: d, explicit: true };
    }
    return { date: d, explicit: true };
  }
  if (/depois de amanha/.test(t)) return { date: skipWeekend(addDays(startOfDay(now), 2)), explicit: true };
  if (/\bamanha\b/.test(t)) return { date: skipWeekend(addDays(startOfDay(now), 1)), explicit: true };
  if (/\bhoje\b/.test(t)) return { date: startOfDay(now), explicit: true };
  if (/semana que vem|proxima semana/.test(t)) return { date: nextWeekday(now, 1), explicit: true };
  if (/mes que vem|proximo mes/.test(t)) return { date: skipWeekend(addDays(startOfDay(now), 30)), explicit: true };
  const emDias = t.match(/em (\d{1,2}) dias?/);
  if (emDias) return { date: skipWeekend(addDays(startOfDay(now), Number(emDias[1]))), explicit: true };
  const dia = t.match(/\bdia (\d{1,2})\b/);
  if (dia) {
    const n = Number(dia[1]);
    const d = new Date(now.getFullYear(), now.getMonth(), n);
    if (d < startOfDay(now)) d.setMonth(d.getMonth() + 1);
    return { date: skipWeekend(d), explicit: true };
  }
  return { date: skipWeekend(addDays(startOfDay(now), 2)), explicit: false };
}

const BRANDS = ["Parker", "Gates", "Manuli", "Continental", "Eaton", "Semperit", "Tawper"];

/** Extrai dados técnicos citados em texto livre (colhedoras, modelos, marca, prensa). */
export function extractTechData(textRaw: string) {
  const t = normalize(textRaw);
  const out: Partial<Pick<Company, "colhedoras" | "modelos" | "marcaAtual" | "prensa" | "concorrente">> = {};
  // só é tamanho de frota quando o texto afirma posse ("temos 14 colhedoras", "frota de 30 máquinas");
  // "testar em 2 colhedoras" não é frota.
  const n = t.match(/(?:temos|tem|sao|possui|possuimos|possuem|frota de|total de|somos)\s+(\d{1,3})\s*(colhedoras?|maquinas?|colheitadeiras?)/);
  if (n) out.colhedoras = Number(n[1]);
  const models = textRaw.match(/\b(\d{1,2}\s*)?(John Deere\s*)?(CH\s?570|CH\s?950|A\s?8800|A\s?9000|A\s?8000)\b/gi);
  if (models?.length) out.modelos = models.map((m) => m.trim()).join(" e ");
  const brand = BRANDS.find((b) => t.includes(b.toLowerCase()) && b !== "Tawper");
  if (brand && /(compra|usa|usamos|compramos|fornecedor|padrao|marca|hoje)/.test(t)) out.marcaAtual = brand;
  if (/prensa (e )?(nossa|propria)|nossa prensa|prensa propria/.test(t)) out.prensa = "Própria";
  else if (/comodato/.test(t) && brand) {
    out.prensa = "Comodato concorrente";
    out.concorrente = brand;
  } else if (/nao (temos|tem) prensa|sem prensa|compra(mos)? montada/.test(t)) out.prensa = "Não possui";
  return out;
}

function findContact(textRaw: string, contacts: Contact[]) {
  const t = normalize(textRaw);
  const c = contacts.find((x) => {
    const first = normalize(x.nome.split(" ")[0]);
    return first.length > 2 && new RegExp(`\\b${first}\\b`).test(t);
  });
  if (c) return c.nome.split(" ")[0];
  const m = textRaw.match(/\bcom (?:o |a )?([A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]+)/);
  return m?.[1];
}

// ---------------------------------------------------------------------------
// Registro conversacional (seção 7.3)
// ---------------------------------------------------------------------------
export interface QuickProposal {
  canal: Canal;
  resultado: string;
  resumo: string;
  contato?: string;
  pendenciaCliente?: string;
  proximoPasso: { titulo: string; tipo: ActivityType; dueAt: string; prioridade: Prioridade };
  prazoCliente?: string;
  etapaSugerida?: { stageId: string; nome: string; motivo: string };
  checks: Record<string, boolean>;
  dadosExtraidos: ReturnType<typeof extractTechData>;
  destaques: string[];
  confianca: number;
  sugereGanho: boolean;
}

const PENDENCIAS: { re: RegExp; label: string; verificar: string }[] = [
  { re: /medidas?/, label: "Envio das medidas", verificar: "Verificar recebimento das medidas" },
  { re: /pedido de compra|\bpc\b|ordem de compra/, label: "Envio do pedido de compra", verificar: "Confirmar recebimento do pedido de compra" },
  { re: /lista/, label: "Envio da lista de itens", verificar: "Verificar recebimento da lista" },
  { re: /documentos?|documentacao|ficha/, label: "Envio da documentação", verificar: "Verificar documentação cadastral" },
  { re: /laudo|resultado do teste/, label: "Resultado do teste", verificar: "Verificar resultado do teste" },
  { re: /aprovac|aprovar/, label: "Aprovação interna", verificar: "Verificar aprovação interna" },
  { re: /retorno|retornar|responder|resposta/, label: "Retorno do cliente", verificar: "Cobrar retorno" },
];

function highlightTerms(textRaw: string) {
  const terms = [
    /\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(-feira)?\b/gi,
    /\b(amanh[ãa]|hoje|semana que vem|pr[óo]xima semana|dia \d{1,2})\b/gi,
    /\b(medidas?|or[çc]amento|proposta|cota[çc][ãa]o|teste|homologa[çc][ãa]o|pedido|visita|reuni[ãa]o|cadastro|documenta[çc][ãa]o|apresenta[çc][ãa]o|cat[áa]logo|desconto|prensa)\b/gi,
    /\b\d{1,3}\s*(colhedoras?|m|metros|kits?)\b/gi,
  ];
  const out = new Set<string>();
  terms.forEach((re) => (textRaw.match(re) ?? []).forEach((m) => out.add(m)));
  return Array.from(out);
}

interface StageHint {
  re: RegExp;
  stageId: string;
  motivo: string;
  checks?: { re: RegExp; id: string }[];
}

const ACQ_HINTS: StageHint[] = [
  { re: /fechou|fechamos|fechado|aprovou o pedido|mandou o pedido|pedido de compra|comprou/, stageId: "ganho", motivo: "O cliente confirmou a compra." },
  { re: /desconto|contraproposta|condicao de pagamento|28\/56|negocia/, stageId: "negociacao", motivo: "Há negociação de condições comerciais." },
  {
    re: /orcamento|proposta|cotacao|cotar|preco/,
    stageId: "orcamento",
    motivo: "O cliente pediu um orçamento.",
    checks: [{ re: /pedi(u|ram)|quer|querem|solicit|mandar|enviar|precisa/, id: "solicitacao_orcamento" }],
  },
  {
    re: /aprovou o teste|teste aprovado|aprovado tecnicamente|passou no teste|sem vazamento|laudo/,
    stageId: "aprovado",
    motivo: "O teste foi aprovado tecnicamente.",
    checks: [
      { re: /./, id: "aprovacao_tecnica" },
      { re: /./, id: "teste_instalado" },
      { re: /./, id: "medidas" },
    ],
  },
  {
    re: /medida|teste|testar|amostra|homolog|instal/,
    stageId: "homologacao",
    motivo: "A conversa entrou em teste/homologação do produto.",
    checks: [
      { re: /(recebi|chegaram|chegou|mandou|enviou) (as )?medidas|medidas (chegaram|recebidas)/, id: "medidas" },
      { re: /instalamos|instalado|instalei|montamos o teste|teste instalado/, id: "teste_instalado" },
    ],
  },
  { re: /cadastro|ficha cadastral|documentacao/, stageId: "cadastro", motivo: "Documentação cadastral em andamento.", checks: [{ re: /enviei|mandei/, id: "documentacao_enviada" }, { re: /cadastro (foi )?aprovado|aprovou o cadastro/, id: "cadastro_aprovado" }] },
  {
    re: /apresentei|apresentacao|catalogo|conheceu a tawper/,
    stageId: "apresentacao",
    motivo: "A Tawper foi apresentada ao cliente.",
    checks: [{ re: /apresentei|apresentacao (feita|realizada)|mostrei/, id: "apresentacao_realizada" }, { re: /gostou|interesse|querem testar|quer testar|pediu teste/, id: "interesse_tecnico" }],
  },
];

const REC_HINTS: StageHint[] = [
  { re: /fechou|aprovou o pedido|mandou o pedido|pedido de compra/, stageId: "recompra", motivo: "O cliente confirmou a recompra." },
  { re: /orcamento|cotacao|lista|reposicao/, stageId: "orcamento_r", motivo: "Nova demanda para orçar." },
  { re: /reforma|entressafra|estoque|safra que vem|proxima safra/, stageId: "previsao", motivo: "Demanda futura mapeada.", checks: [{ re: /./, id: "demanda_mapeada" }] },
  { re: /vazamento|vazando|defeito|problema|suporte|estourou/, stageId: "suporte", motivo: "Chamado técnico aberto." },
  {
    re: /chegou|entregue|recebeu|recebemos|montamos|aplicado|gostou/,
    stageId: "posvenda",
    motivo: "Entrega e aplicação confirmadas.",
    checks: [{ re: /chegou|entregue|receb|montamos|aplicad/, id: "entrega_confirmada" }, { re: /gostou|elogi|aprovaram|satisfeit/, id: "feedback" }],
  },
];

export function inferStage(textRaw: string, deal?: Deal) {
  const t = normalize(textRaw);
  if (!deal) return { checks: {} as Record<string, boolean> };
  const hints = deal.funnel === "aquisicao" ? ACQ_HINTS : REC_HINTS;
  const curIdx = stageIndex(deal.funnel, deal.stageId);
  const checks: Record<string, boolean> = {};
  let sugestao: { stageId: string; nome: string; motivo: string } | undefined;
  hints.forEach((h) => {
    if (!has(t, h.re)) return;
    h.checks?.forEach((c) => {
      if (has(t, c.re)) checks[c.id] = true;
    });
    const idx = stageIndex(deal.funnel, h.stageId);
    if (!sugestao && idx > curIdx) sugestao = { stageId: h.stageId, nome: getStage(deal.funnel, h.stageId).nome, motivo: h.motivo };
  });
  return { etapa: sugestao, checks };
}

export function parseQuickNote(textRaw: string, ctx: { company: Company; deal?: Deal; contacts: Contact[]; now?: Date }): QuickProposal {
  const now = ctx.now ?? new Date();
  const t = normalize(textRaw);
  const contato = findContact(textRaw, ctx.contacts);

  let canal: Canal = "Nota";
  if (has(t, /visit|estive (na|no)|passei (na|no)/)) canal = "Visita";
  else if (has(t, /reuniao|reunimos/)) canal = "Reunião";
  else if (has(t, /liguei|ligacao|telefon/)) canal = "Ligação";
  else if (has(t, /whats|mensagem|zap/)) canal = "WhatsApp";
  else if (has(t, /e-?mail/)) canal = "E-mail";
  else if (has(t, /falei|conversei/)) canal = "Ligação";

  let resultado = "Interação registrada";
  if (has(t, /nao atendeu|sem resposta|caixa postal|nao respondeu|nao consegui falar/)) resultado = "Sem contato — nova tentativa necessária";
  else if (canal === "Visita") resultado = "Visita realizada";
  else if (canal === "Reunião") resultado = "Reunião realizada";
  else if (has(t, /teste aprovado|aprovou o teste|aprovado tecnicamente/)) resultado = has(t, /orcamento|cotacao|proposta/) ? "Teste aprovado e pedido de orçamento" : "Aprovação técnica recebida";
  else if (has(t, /pedi(u|ram)|solicit/) && has(t, /orcamento|cotacao|proposta/)) resultado = "Pedido de orçamento recebido";
  else if (has(t, /falei|conversei|liguei|atendeu|combinamos|disse|falou/)) resultado = "Contato realizado";
  else if (has(t, /mandei|enviei/)) resultado = "Material enviado";

  const clientCommit = has(t, /\b(vai|vao|ira|irao|enviara|mandara|ficou de|promete|manda|envia|passa)\b/);
  const pend = clientCommit ? PENDENCIAS.find((p) => has(t, p.re)) : undefined;
  const due = inferDue(textRaw, now, Boolean(pend));

  let titulo: string;
  let tipo: ActivityType;
  if (resultado.startsWith("Sem contato")) {
    titulo = `Nova tentativa de contato${contato ? ` com ${contato}` : ""}`;
    tipo = has(t, /whats/) ? "WhatsApp" : "Ligação";
  } else if (pend) {
    titulo = `${pend.verificar}${contato ? ` e cobrar ${contato}` : " e cobrar"}`;
    tipo = has(t, /ligar/) ? "Ligação" : "WhatsApp";
  } else if (has(t, /orcamento|proposta|cotacao/)) {
    titulo = "Montar e enviar orçamento";
    tipo = "Cotação";
  } else if (has(t, /(levantar|tirar|pegar|coletar) (as )?medidas|medir as mangueiras/)) {
    titulo = "Levantar medidas das mangueiras nas colhedoras";
    tipo = "Visita";
  } else if (has(t, /teste|testar|amostra|kit de teste/)) {
    titulo = "Preparar e enviar kit de teste";
    tipo = "Homologação";
  } else if (has(t, /visitar|nova visita|voltar la|agendar visita/)) {
    titulo = `Visita a ${ctx.company.nome}`;
    tipo = "Visita";
  } else if (has(t, /reuniao/)) {
    titulo = `Reunião com ${contato ?? "o cliente"}`;
    tipo = "Reunião";
  } else {
    titulo = `Follow-up com ${contato ?? ctx.company.nome}`;
    tipo = has(t, /ligar/) ? "Ligação" : "WhatsApp";
  }
  if (has(t, /por whats|pelo whats|no whats/)) tipo = "WhatsApp";
  if (has(t, /\bligar\b/) && !pend) tipo = "Ligação";

  const hour = has(t, /cedo|manha/) ? 9 : has(t, /tarde/) ? 14 : 10;
  const dueAt = new Date(due.date);
  dueAt.setHours(hour, 0, 0, 0);

  const { etapa, checks } = inferStage(textRaw, ctx.deal);
  const dados = extractTechData(textRaw);
  const sugereGanho = etapa?.stageId === "ganho" || etapa?.stageId === "recompra";

  const features = [contato, pend, due.explicit, etapa, Object.keys(checks).length, Object.keys(dados).length].filter(Boolean).length;
  const resumo = `${resultado}${contato ? ` com ${contato}` : ""}.${pend ? ` Pendência do cliente: ${pend.label.toLowerCase()}${due.clientDeadline ? ` até ${weekdayName(due.clientDeadline.toISOString())}` : ""}.` : ""}`;

  return {
    canal,
    resultado,
    resumo,
    contato,
    pendenciaCliente: pend?.label,
    prazoCliente: due.clientDeadline?.toISOString(),
    proximoPasso: { titulo, tipo, dueAt: dueAt.toISOString(), prioridade: pend || etapa ? "Alta" : "Média" },
    etapaSugerida: etapa,
    checks,
    dadosExtraidos: dados,
    destaques: highlightTerms(textRaw).concat(contato ? [contato] : []),
    confianca: Math.min(0.96, 0.58 + features * 0.07),
    sugereGanho,
  };
}

export const QUICK_EXAMPLES = [
  "Falei com João. Ele enviará as medidas até sexta. Cobrar na segunda se não enviar.",
  "Visitei a usina, apresentei a linha 4SH pro pessoal da manutenção. Gostaram e querem testar em 2 colhedoras. Levantar as medidas até quinta.",
  "Liguei pro comprador, não atendeu. Tentar de novo amanhã cedo pelo WhatsApp.",
  "Teste aprovado, sem vazamento depois de 400h. Pediram orçamento de 10 kits para o corte de base.",
];

// ---------------------------------------------------------------------------
// Cliente simulado do WhatsApp
// ---------------------------------------------------------------------------
export function personaFor(conv: Conversation, company?: Company, contact?: Contact): Persona {
  if (conv.persona) return conv.persona;
  return {
    empresa: company?.nome ?? "a empresa",
    cidade: company?.cidade ?? "aqui",
    uf: company?.uf ?? "SP",
    colhedoras: company?.colhedoras ?? 12,
    modelos: company?.modelos ?? "John Deere CH570",
    marca: company?.marcaAtual && company.marcaAtual !== "Tawper" ? company.marcaAtual : "Parker",
    prensa: company?.prensa ?? "Própria",
    mecanico: "Marcos",
    papel: contact?.papel ?? "Comprador",
    cargo: contact?.cargo ?? "Comprador",
  };
}

function prensaFala(p: Prensa, marca: string) {
  if (p === "Própria") return "a prensa é nossa mesmo";
  if (p === "Comodato concorrente") return `a prensa é da ${marca} em comodato`;
  if (p === "Comodato Tawper") return "a prensa é a de vocês em comodato";
  return "a gente não tem prensa, compra a mangueira já montada";
}

/** Resposta do cliente simulado, com base na última mensagem do vendedor. */
export function clientReply(sellerText: string, persona: Persona, ctx: { temOrcamentoEnviado?: boolean; now?: Date } = {}) {
  const t = normalize(sellerText);
  const firstModel = persona.modelos.split(" e ")[0].replace(/^\d+\s*/, "");
  if (has(t, /colhedora|maquina|frota|quantas|modelo/))
    return `Temos ${persona.colhedoras} colhedoras: ${persona.modelos}. Hoje a gente compra da ${persona.marca} e ${prensaFala(persona.prensa, persona.marca)}. O que mais estoura é o corte de base.`;
  if (has(t, /medida|bitola|comprimento/)) return `Vou pedir pro ${persona.mecanico} da manutenção levantar as medidas das mangueiras do corte de base. Te mando até sexta 👍`;
  if (has(t, /pedido|fechar|fechado|aprovad|podemos seguir|seguir com/))
    return "Aprovado por aqui ✅ Vou gerar o pedido de compra e te mando o PC ainda hoje.";
  if (has(t, /desconto|condicao|pagamento|28|prazo de pagamento/)) return "Se fizer 28/56 dias fica mais fácil aprovar aqui com a diretoria.";
  if (has(t, /orcamento|proposta|cotacao|preco|valor/))
    return ctx.temOrcamentoEnviado
      ? "Recebi o orçamento, obrigado. Vou analisar com a diretoria e te dou um retorno até o fim da semana."
      : `Pode mandar sim. Pensa em ${Math.min(persona.colhedoras, 10)} kits pro corte de base e umas mangueiras 4SH de reserva.`;
  if (has(t, /visita|passar ai|ir ate|conhecer|vou ai|pessoalmente/))
    return `Pode vir sim! Terça de manhã o ${persona.mecanico} da manutenção vai estar aqui. É só perguntar por mim na portaria.`;
  if (has(t, /teste|amostra|homolog|testar/)) return `Topamos testar. Pode ser em 2 ${firstModel} da frente 1, que é onde mais estoura.`;
  if (has(t, /cadastro|ficha|documento/)) return "Manda a ficha cadastral pro meu e-mail que eu passo pro financeiro liberar.";
  if (has(t, /catalogo|apresenta/)) return `Recebi, obrigado! Vou mostrar pro ${persona.mecanico} da manutenção.`;
  if (has(t, /entrega|prazo/)) return `Qual o prazo de entrega aqui pra ${persona.cidade}?`;
  if (has(t, /treinamento|academy|curso|mecanicos/)) return "Treinamento pros mecânicos seria ótimo, o pessoal aqui troca muito terminal.";
  if (has(t, /obrigad|valeu/)) return "Nós que agradecemos! Qualquer coisa te chamo aqui.";
  if (has(t, /atendemos|trabalhamos|temos sim|atende sim/))
    return `Que bom! Temos ${persona.colhedoras} colhedoras (${persona.modelos}). Compramos da ${persona.marca} hoje, mas tá estourando muito. Vocês fazem kit pronto?`;
  if (has(t, /bom dia|boa tarde|boa noite|\bola\b|\boi\b|tudo bem/)) return `${greeting(ctx.now)}! Tudo certo por aqui. Pode falar.`;
  return "Entendi. Vou ver aqui com o pessoal e te retorno.";
}

// ---------------------------------------------------------------------------
// Leitura de uma conversa sem vínculo → cadastro sugerido
// ---------------------------------------------------------------------------
export function extractLead(conv: Conversation) {
  const text = conv.messages.filter((m) => m.from === "cliente").map((m) => m.text).join(" ");
  const p = conv.persona;
  const COMPANY = /\b(Usina|Grupo|Agr[íi]cola|Destilaria|Fazenda|CTT)\s+([A-ZÁÉÍÓÚ][\wÀ-ú]*(?:\s+(?:do|da|de|dos|das|[A-ZÁÉÍÓÚ][\wÀ-ú]*))*)/;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const own = sentences.find((st) => /\b(sou|trabalho|aqui (da|na|do))\b/i.test(st) && COMPANY.test(st));
  const empresaMatch = (own ?? sentences.filter((st) => !/contato de voc[eê]s|indica/i.test(st)).join(" ")).match(COMPANY) ?? text.match(COMPANY);
  const cidadeMatch = text.match(/aqui em ([A-ZÁÉÍÓÚ][\wÀ-ú]+(?:\s+[A-ZÁÉÍÓÚ][\wÀ-ú]+)*)/);
  const papel = /comprador|compras|suprimentos/i.test(text) ? "Comprador" : /mec[aâ]nic|manuten/i.test(text) ? "Técnico" : /dono|propriet|diretor/i.test(text) ? "Decisor" : p?.papel ?? "Outro";
  const indic = text.match(/contato de voc[eê]s com o ([A-ZÁÉÍÓÚ][\wÀ-ú]+), da ([^.]+)\./);
  const interesse = /john deere/i.test(text) ? "Mangueiras hidráulicas para colhedoras John Deere" : /case/i.test(text) ? "Mangueiras hidráulicas para colhedoras Case" : "Mangueiras hidráulicas";
  return {
    empresa: empresaMatch ? `${empresaMatch[1]} ${empresaMatch[2]}`.replace(/[.,]$/, "") : p?.empresa ?? "",
    cidade: cidadeMatch?.[1] ?? p?.cidade ?? "",
    uf: p?.uf ?? "SP",
    contatoNome: conv.contatoNome,
    papel: papel as Contact["papel"],
    cargo: papel === "Comprador" ? "Comprador" : papel === "Técnico" ? "Manutenção" : "",
    interesse,
    origem: indic ? "Indicação de cliente" : "WhatsApp",
    indicacao: indic ? `${indic[1]} (${indic[2]})` : p?.indicacao,
    dor: /estouro|estoura/i.test(text) ? "Estouro de mangueiras na safra" : undefined,
  };
}

// ---------------------------------------------------------------------------
// Resumo de conversa (seção 9.3)
// ---------------------------------------------------------------------------
export function summarizeConversation(conv: Conversation, deal?: Deal, now = new Date()): ConversationSummary {
  const all = conv.messages.filter((m) => m.from !== "nota" && m.from !== "sistema");
  const clientMsgs = all.filter((m) => m.from === "cliente");
  const tawperMsgs = all.filter((m) => m.from === "tawper");
  const allText = normalize(all.map((m) => m.text).join(" "));
  const clientText = clientMsgs.map((m) => m.text).join(" ");

  let assunto = "Contato comercial";
  if (has(allText, /pedido|aprovado por aqui|fechar/)) assunto = "Fechamento de pedido";
  else if (has(allText, /orcamento|proposta|cotacao/)) assunto = "Orçamento de mangueiras e kits";
  else if (has(allText, /vazamento|vazando|terminal/)) assunto = "Suporte técnico — vazamento";
  else if (has(allText, /medida|teste|testar|homolog/)) assunto = "Teste / homologação de mangueiras";
  else if (has(allText, /mangueira|estouro|colhedora/)) assunto = "Interesse em mangueiras hidráulicas para colhedoras";

  let necessidade = "Conhecer a solução da Tawper.";
  const ct = normalize(clientText);
  if (has(ct, /estouro|estoura|estourou/)) necessidade = "Reduzir estouro de mangueiras nas colhedoras durante a safra.";
  else if (has(ct, /vazando|vazamento/)) necessidade = "Resolver vazamento no terminal e voltar a máquina à operação.";
  else if (has(ct, /reposicao|lista|estoque/)) necessidade = "Reposição de estoque de mangueiras e terminais.";
  else if (has(ct, /kit/)) necessidade = "Kits prontos de mangueiras para colhedoras.";

  const objecoes: string[] = [];
  if (has(ct, /abaixo|mais barato|caro|preco/)) objecoes.push("Preço em relação ao concorrente.");
  if (has(ct, /contrato/)) objecoes.push("Contrato vigente com concorrente.");
  if (has(ct, /28\/56|prazo de pagamento|condicao/)) objecoes.push("Condição de pagamento.");
  if (has(ct, /prazo de entrega/)) objecoes.push("Prazo de entrega.");

  const cut = (s: string) => (s.length > 90 ? `${s.slice(0, 88)}…` : s);
  const compromissosTawper = tawperMsgs.filter((m) => /\b(vou|mando|envio|passo|levo|segue)\b/i.test(m.text)).slice(-2).map((m) => cut(m.text));
  const compromissosCliente = clientMsgs.filter((m) => /\b(vou|te mando|mando|envio|retorno|passo|gerar)\b/i.test(m.text)).slice(-2).map((m) => cut(m.text));

  const datas: string[] = [];
  clientMsgs.concat(tawperMsgs).forEach((m) => {
    const tt = normalize(m.text);
    WEEKDAY_RES.forEach(({ re }) => {
      const mm = tt.match(re);
      if (mm) datas.push(`${mm[0][0].toUpperCase()}${mm[0].slice(1)} — ${cut(m.text).slice(0, 48)}`);
    });
  });

  const dados = extractTechData(clientText);
  const last = clientMsgs.at(-1)?.text ?? "";
  const lt = normalize(last);
  let proximoPasso = "Dar retorno ao cliente";
  let proximoPassoTipo: ActivityType = "WhatsApp";
  let proximoPassoDias = 1;
  if (has(lt, /pedido|aprovado por aqui/)) {
    proximoPasso = "Registrar a venda e confirmar o pedido de compra";
    proximoPassoTipo = "Outro";
    proximoPassoDias = 0;
  } else if (has(lt, /te mando|mando|envio/) && has(lt, /medida/)) {
    const due = inferDue(last, now);
    proximoPasso = "Verificar recebimento das medidas e cobrar";
    proximoPassoDias = Math.max(0, dayDiff(due.date, now));
  } else if (has(lt, /pode vir|pode ser|terca|visita/)) {
    proximoPasso = "Visita técnica à manutenção";
    proximoPassoTipo = "Visita";
    proximoPassoDias = Math.max(1, dayDiff(nextWeekday(now, 2), now));
  } else if (has(lt, /topamos testar|testar/)) {
    proximoPasso = "Preparar kit de teste para 2 colhedoras";
    proximoPassoTipo = "Homologação";
    proximoPassoDias = 3;
  } else if (has(lt, /pode mandar|manda sim|quanto fica/)) {
    proximoPasso = "Montar e enviar orçamento";
    proximoPassoTipo = "Cotação";
    proximoPassoDias = 1;
  } else if (has(lt, /28\/56|diretoria/)) {
    proximoPasso = "Responder condição de pagamento e buscar decisão";
    proximoPassoTipo = "Reunião";
    proximoPassoDias = 2;
  } else if (has(lt, /kit pronto|colhedoras/)) {
    proximoPasso = "Apresentar a Tawper e os kits prontos para colhedoras";
    proximoPassoTipo = "Visita";
    proximoPassoDias = 3;
  } else if (has(lt, /parada|aguardo/)) {
    proximoPasso = "Resolver o chamado técnico hoje";
    proximoPassoTipo = "Suporte";
    proximoPassoDias = 0;
  }

  const { etapa } = inferStage(all.map((m) => m.text).join(" "), deal);
  const features = [objecoes.length, compromissosCliente.length, datas.length, Object.keys(dados).length, etapa].filter(Boolean).length;

  return {
    assunto,
    necessidade,
    objecoes,
    compromissosTawper,
    compromissosCliente,
    datas: Array.from(new Set(datas)).slice(0, 3),
    proximoPasso,
    proximoPassoTipo,
    proximoPassoDias,
    confianca: Math.min(0.95, 0.62 + features * 0.06),
    etapaSugerida: etapa?.stageId,
    dadosExtraidos: Object.keys(dados).length ? dados : undefined,
    geradoEm: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Copiloto estratégico (seção 9.2)
// ---------------------------------------------------------------------------
export function copilotFor(d: Data, companyId: string, now = new Date()) {
  const c = d.companies.find((x) => x.id === companyId)!;
  const deal = openDealOf(d, companyId);
  const contacts = d.contacts.filter((x) => x.companyId === companyId && x.ativo);
  const tecnico = contacts.find((x) => x.papel === "Técnico" || x.papel === "Mecânico");
  const decisor = contacts.find((x) => x.papel === "Decisor");
  const comprador = contacts.find((x) => x.papel === "Comprador");
  const st = deal ? stageOf(deal) : undefined;
  const days = deal ? daysInStage(deal, now) : 0;
  const nInter = d.interactions.filter((i) => i.companyId === companyId).length + d.activities.filter((a) => a.companyId === companyId && a.status === "concluida").length;
  const strategy = d.strategies.find((x) => x.companyId === companyId);
  const lastAt = lastInteractionAt(d, companyId);
  const openQuote = d.quotes.find((q) => q.companyId === companyId && q.status === "enviado");
  const owner = d.users.find((u) => u.id === c.ownerId);
  const falar = tecnico?.nome.split(" ")[0] ?? comprador?.nome.split(" ")[0] ?? decisor?.nome.split(" ")[0] ?? "pessoal";

  const faltantes: string[] = [];
  if (!c.colhedoras) faltantes.push("Número de colhedoras — sem ele não dá para estimar o potencial.");
  if (!c.prensa) faltantes.push("Tipo de prensa — define se a troca de fornecedor tem custo de equipamento.");
  if (!c.marcaAtual) faltantes.push("Fornecedor atual — necessário para posicionar a proposta.");
  if (!tecnico) faltantes.push("Contato técnico da manutenção — quem sente o problema no dia a dia.");
  if (!decisor) faltantes.push("Quem decide a compra.");

  const base = [
    `Cadastro: ${c.ramo ?? "ramo não informado"}${c.cidade ? `, ${c.cidade}/${c.uf}` : ""}`,
    st && deal ? `Etapa: ${st.nome} há ${days} dias (limite ${st.limiteDias || "—"})` : "Sem oportunidade aberta",
    `${nInter} interações e atividades registradas`,
    c.colhedoras ? `Frota: ${c.colhedoras} colhedoras${c.modelos ? ` (${c.modelos})` : ""}` : "Frota não informada",
    c.marcaAtual ? `Fornecedor atual: ${c.marcaAtual}${c.prensa ? ` · prensa ${c.prensa.toLowerCase()}` : ""}` : "Fornecedor atual não informado",
  ];
  if (strategy) base.push(`Estratégia vigente v${strategy.versao}`);
  if (deal?.objecao) base.push(`Objeção registrada: ${deal.objecao}`);
  if (lastAt) base.push(`Última interação há ${daysSince(lastAt, now)} dias`);

  const comodatoConc = c.prensa === "Comodato concorrente";
  const hip: string[] = [];
  let acoes: CopilotDetail["acoes"] = [];
  let perguntas: string[] = [];
  let objetivo = "";
  let barreira = "";
  let estrategia = "";
  let resultado = "";
  let rascunho = "";
  const sid = deal?.stageId ?? "lead";

  if (sid === "lead" || sid === "qualificacao") {
    objetivo = "Qualificar a operação e chegar em quem sente o problema de estouro.";
    barreira = tecnico ? "Ainda não conhecemos o consumo e o fornecedor com detalhes." : "Não temos contato com a manutenção.";
    estrategia = "Entrar pela manutenção: mapear frota, pontos de falha e fornecedor atual; oferecer apresentação técnica curta com kit de demonstração.";
    resultado = "Dados de frota completos e apresentação técnica agendada em até 10 dias.";
    hip.push(tecnico ? "O comprador ainda não enxerga a dor da manutenção." : "Estamos falando só com Compras/recepção, longe de quem sofre com as quebras.");
    if (comodatoConc) hip.push("A prensa em comodato do concorrente cria custo de troca.");
    hip.push("Sem números de frota, qualquer proposta fica genérica.");
    acoes = [
      { titulo: "Mapear frota, consumo e pontos de falha com a manutenção", tipo: "WhatsApp", prazoDias: 1 },
      { titulo: "Agendar apresentação técnica com kit de demonstração", tipo: "Visita", prazoDias: 4 },
      { titulo: "Enviar catálogo da linha 4SH e dos kits para colhedoras", tipo: "WhatsApp", prazoDias: 1 },
    ];
    perguntas = ["Quantas colhedoras e de quais modelos?", "Onde mais estoura mangueira hoje: corte de base, picador ou elevador?", "Quem aprova tecnicamente um novo fornecedor?"];
    rascunho = `Olá ${falar}, tudo bem? Aqui é o ${owner?.short ?? "time"}, da Tawper Mangueiras e Conexões. Trabalhamos com kits prontos para colhedoras e prensagem na hora. Posso te fazer 3 perguntas rápidas sobre a frota de vocês?`;
  } else if (sid === "apresentacao" || sid === "cadastro") {
    objetivo = "Transformar o interesse em um teste técnico formal.";
    barreira = comodatoConc ? `Prensa em comodato da ${c.marcaAtual}.` : "Processo de cadastro e aprovação interna.";
    estrategia = "Propor teste em 2 colhedoras com acompanhamento semanal e treinamento Tawper Academy para os mecânicos como diferencial.";
    resultado = "Teste instalado em até 20 dias.";
    hip.push("O cliente gostou, mas não há um responsável interno pelo teste.", "O cadastro pode travar em Suprimentos sem alguém cobrando.");
    if (comodatoConc) hip.push("Trocar de fornecedor implica devolver a prensa do concorrente.");
    acoes = [
      { titulo: "Definir com a manutenção as 2 colhedoras do teste", tipo: "Ligação", prazoDias: 2 },
      { titulo: "Enviar ficha cadastral e acompanhar com Suprimentos", tipo: "E-mail", prazoDias: 1 },
      { titulo: "Oferecer turma Tawper Academy para os mecânicos", tipo: "WhatsApp", prazoDias: 3 },
    ];
    perguntas = ["Quem acompanha o teste do lado de vocês?", "Qual o critério para aprovar um fornecedor novo?", "O cadastro depende de mais algum documento?"];
    rascunho = `Oi ${falar}! Para facilitar a avaliação, a Tawper monta o kit de teste para 2 colhedoras e acompanha semanalmente com vocês. Posso reservar para a próxima semana?`;
  } else if (sid === "homologacao" || sid === "aprovado") {
    objetivo = sid === "aprovado" ? "Converter a aprovação técnica no primeiro pedido." : "Concluir o teste com evidência e aprovação formal.";
    barreira = c.concorrente ? `Relação com ${c.concorrente}.` : "Tempo do teste e prioridade da safra.";
    estrategia =
      sid === "aprovado"
        ? "Antecipar o orçamento com estoque reservado e condição especial para o primeiro pedido, alinhado à janela de compra."
        : "Acompanhar o teste com leituras de horas e fotos; registrar laudo simples assinado pela manutenção.";
    resultado = sid === "aprovado" ? "Solicitação de orçamento em até 15 dias." : "Aprovação técnica registrada em até 30 dias.";
    hip.push("Sem evidência formal, a aprovação fica só no discurso.", "A safra reduz a disponibilidade da manutenção.");
    acoes =
      sid === "aprovado"
        ? [
            { titulo: "Confirmar janela de compra e volume com Suprimentos", tipo: "Ligação", prazoDias: 2 },
            { titulo: "Pré-montar orçamento com estoque reservado", tipo: "Cotação", prazoDias: 3 },
          ]
        : [
            { titulo: "Registrar leitura de horas e fotos do teste", tipo: "Visita", prazoDias: 3 },
            { titulo: "Pedir laudo simples de aprovação à manutenção", tipo: "WhatsApp", prazoDias: 7 },
          ];
    perguntas = ["Quantas horas o kit já rodou?", "Houve algum vazamento ou desgaste?", "Quem assina a aprovação técnica?"];
    rascunho = `Oi ${falar}, tudo certo? Passando para acompanhar o teste das mangueiras. Consegue me mandar uma foto e a leitura de horas da colhedora? Assim já registro a evolução.`;
  } else if (sid === "orcamento" || sid === "negociacao" || sid === "orcamento_r") {
    objetivo = "Obter uma decisão explícita sobre o orçamento.";
    barreira = deal?.objecao ?? "Decisão concentrada em Compras.";
    estrategia = "Envolver quem sente o problema (manutenção) na decisão, trocar desconto por prazo e usar o treinamento como diferencial.";
    resultado = "Decisão (ganho ou perda com motivo) em até 10 dias.";
    hip.push("O orçamento pode estar sendo usado para negociar com o concorrente.", "A manutenção não participou da decisão.");
    if (openQuote) hip.push(`Orçamento ${openQuote.numero} vence em ${fmtDateShort(quoteExpiresAt(openQuote))}.`);
    acoes = [
      { titulo: `Reunião com ${decisor?.nome.split(" ")[0] ?? "o decisor"} e a manutenção`, tipo: "Reunião", prazoDias: 2 },
      { titulo: "Propor condição 28/56 dias mantendo o preço", tipo: "Cotação", prazoDias: 3 },
    ];
    perguntas = ["O que falta para vocês decidirem?", "Quem mais participa da decisão?", "Se a condição fosse 28/56 dias, fecharíamos esta semana?"];
    rascunho = `${falar}, bom dia! Revisei o orçamento e consigo melhorar a condição de pagamento para 28/56 dias, mantendo o treinamento incluso. Podemos fechar os detalhes numa conversa rápida amanhã?`;
  } else {
    objetivo = "Manter a recorrência e antecipar a próxima compra.";
    barreira = "Risco de acomodação ou oferta de concorrente.";
    estrategia = "Visita de relacionamento para mapear estoque, safra e reforma; propor reposição programada.";
    resultado = "Previsão de compra registrada e próxima janela definida.";
    hip.push("Sem contato frequente, o cliente pode comprar avulso de outro fornecedor.", "A reforma de entressafra concentra a demanda do ano.");
    acoes = [
      { titulo: "Visita de relacionamento — estoque e reforma", tipo: "Visita", prazoDias: 7 },
      { titulo: "Propor reposição programada para a entressafra", tipo: "Cotação", prazoDias: 14 },
    ];
    perguntas = ["Como está o estoque de mangueiras e terminais?", "Quando começa a reforma de entressafra?", "Houve alguma falha com os kits Tawper?"];
    rascunho = `Oi ${falar}! Tudo certo com os kits? Queria passar aí para planejarmos juntos a reposição da entressafra. Qual o melhor dia na semana que vem?`;
  }

  const diagnostico = `${c.nome}${c.colhedoras ? ` opera ${c.colhedoras} colhedoras${c.modelos ? ` (${c.modelos})` : ""}` : " ainda não tem a frota mapeada"}${c.marcaAtual ? ` e hoje compra da ${c.marcaAtual}` : ""}. ${st ? `Está em ${st.nome} há ${days} dias${deal && isStagnant(deal, now) ? ", acima do limite da etapa" : ""}.` : ""}${
    c.influenciadoraId ? ` Depende da decisão técnica da ${d.companies.find((x) => x.id === c.influenciadoraId)?.nome}.` : ""
  }`;

  const detalhes: CopilotDetail = { diagnostico, hipoteses: hip, acoes, perguntas, rascunho, objetivo, barreira, estrategia, resultadoEsperado: resultado };
  return {
    titulo: objetivo,
    texto: estrategia,
    detalhes,
    base,
    faltantes,
  };
}

// ---------------------------------------------------------------------------
// Resumo diário do vendedor e revisão do gestor
// ---------------------------------------------------------------------------
const lcFirst = (t: string) => (t.length > 1 && t[1] === t[1].toUpperCase() && /[A-Z]/.test(t[1]) ? t : t.charAt(0).toLowerCase() + t.slice(1));

export function dailyBriefing(d: Data, user: User, now = new Date()) {
  const manager = user.role === "admin" || user.role === "gestor";
  const mine = d.activities.filter((a) => a.ownerId === user.id && a.status === "pendente").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const overdue = mine.filter((a) => dayDiff(a.dueAt, now) < 0);
  const today = mine.filter((a) => dayDiff(a.dueAt, now) === 0);
  const week = mine.filter((a) => dayDiff(a.dueAt, now) > 0 && dayDiff(a.dueAt, now) <= 7);
  const al = alertsOf(d, { ownerId: user.id, now });
  const max = manager ? 4 : 3;
  const prioridades: { companyId: string; texto: string }[] = [];
  const seen = new Set<string>();
  const push = (companyId: string, texto: string) => {
    if (seen.has(companyId) || prioridades.length >= max) return;
    seen.add(companyId);
    prioridades.push({ companyId, texto });
  };
  const cname = (id: string) => d.companies.find((c) => c.id === id)?.nome ?? "";
  const uname = (id: string) => d.users.find((u) => u.id === id)?.short ?? "";
  overdue.forEach((a) => push(a.companyId, `${cname(a.companyId)} — "${a.titulo}" está atrasada há ${-dayDiff(a.dueAt, now)} ${-dayDiff(a.dueAt, now) === 1 ? "dia" : "dias"}.`));
  today
    .filter((a) => a.prioridade === "Alta")
    .forEach((a) => push(a.companyId, `${cname(a.companyId)} — ${lcFirst(a.titulo)} hoje.${a.descricao ? ` ${a.descricao}` : ""}`));
  al.filter((a) => a.tipo === "orcamento").forEach((a) => push(a.companyId, `${cname(a.companyId)} — ${lcFirst(a.titulo)}; faça o follow-up antes que esfrie.`));

  let equipe: { atrasadas: number; semProximo: number; estagnadas: number; sugestoes: number } | undefined;
  if (manager) {
    const team = alertsOf(d, { now }).filter((a) => a.ownerId !== user.id);
    equipe = {
      atrasadas: team.filter((a) => a.tipo === "atraso").length,
      semProximo: team.filter((a) => a.tipo === "sem_proximo_passo").length,
      estagnadas: team.filter((a) => a.tipo === "estagnacao").length,
      sugestoes: team.filter((a) => a.tipo === "sugestao").length,
    };
    const hasSug = (id: string) => d.suggestions.some((x) => x.companyId === id && x.status === "pendente");
    team
      .filter((a) => a.tipo === "estagnacao" && a.severidade === "alta")
      .sort((a, b) => Number(hasSug(b.companyId)) - Number(hasSug(a.companyId)))
      .forEach((a) =>
        push(
          a.companyId,
          `${cname(a.companyId)} (${uname(a.ownerId)}) — ${a.texto}. ${hasSug(a.companyId) ? "A IA já sugeriu uma nova estratégia: revise e cobre." : "Vale cobrar o responsável."}`,
        ),
      );
    team
      .filter((a) => a.tipo === "recorrencia")
      .forEach((a) => push(a.companyId, `${cname(a.companyId)} (${uname(a.ownerId)}) — cliente recorrente sem compra: ${lcFirst(a.texto)}.`));
  }
  al.filter((a) => a.tipo === "estagnacao").forEach((a) => push(a.companyId, `${cname(a.companyId)} — ${a.texto}. Reveja a estratégia.`));
  today.forEach((a) => push(a.companyId, `${cname(a.companyId)} — ${lcFirst(a.titulo)}.`));
  week.slice(0, 2).forEach((a) => push(a.companyId, `${cname(a.companyId)} — ${lcFirst(a.titulo)} (${fmtDateShort(a.dueAt)}).`));

  const cobranca = d.interactions.find((i) => i.kind === "cobranca" && d.companies.find((c) => c.id === i.companyId)?.ownerId === user.id && daysSince(i.at, now) <= 2);
  const base = `Você tem ${today.length} ${today.length === 1 ? "atividade" : "atividades"} para hoje${overdue.length ? `, ${overdue.length} ${overdue.length === 1 ? "atrasada" : "atrasadas"}` : ""} e ${week.length} nos próximos 7 dias.`;
  const time = equipe
    ? ` Na equipe: ${equipe.atrasadas} ${equipe.atrasadas === 1 ? "tarefa atrasada" : "tarefas atrasadas"}, ${equipe.semProximo} sem próximo passo e ${equipe.estagnadas} ${equipe.estagnadas === 1 ? "conta parada" : "contas paradas"}.`
    : "";
  return {
    saudacao: `${greeting(now)}, ${user.short}.`,
    resumo: base + time,
    prioridades,
    cobranca: cobranca ? { companyId: cobranca.companyId, texto: cobranca.conteudo ?? "" } : undefined,
    semProximo: al.filter((a) => a.tipo === "sem_proximo_passo").length,
    equipe,
  };
}

export function managerDigest(d: Data, now = new Date()) {
  const al = alertsOf(d, { now });
  const m = computeMetrics(d, { now });
  const stats = sellerStats(d, now).filter((s) => s.user.role === "vendedor");
  const best = [...stats].sort((a, b) => b.execucao.rate - a.execucao.rate)[0];
  const worst = [...stats].sort((a, b) => a.execucao.rate - b.execucao.rate)[0];
  const counts = (t: string) => al.filter((a) => a.tipo === t).length;
  return {
    linhas: [
      `${counts("atraso")} tarefas atrasadas, ${counts("sem_proximo_passo")} contas sem próximo passo e ${counts("estagnacao")} estagnadas.`,
      `${m.ganhos.value} vendas ganhas nos últimos 30 dias (${m.ganhos.sub}). ${m.propostas.value} propostas abertas (${m.propostas.sub}).`,
      best && worst ? `${best.user.short} lidera a execução (${Math.round(best.execucao.rate * 100)}% no prazo). ${worst.user.short} precisa de atenção (${Math.round(worst.execucao.rate * 100)}%).` : "",
    ].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Assistente (perguntas livres ao "Tawper IA")
// ---------------------------------------------------------------------------
export interface AssistantAnswer {
  texto: string;
  itens?: { label: string; meta?: string; href: string }[];
}

export const ASSISTANT_SUGGESTIONS = [
  "Quais clientes estão parados?",
  "O que eu preciso fazer hoje?",
  "Quais orçamentos estão abertos?",
  "Como está a execução do time?",
  "Quais recorrentes estão sem compra?",
  "Me resume a Usina Alvorada",
];

export function assistantAnswer(d: Data, user: User, question: string, now = new Date()): AssistantAnswer {
  const q = normalize(question);
  const manager = user.role === "admin" || user.role === "gestor";
  const ownerId = manager ? undefined : user.id;
  const al = alertsOf(d, { ownerId, now });
  const cname = (id: string) => d.companies.find((c) => c.id === id)?.nome ?? id;

  const company = d.companies
    .filter((c) => !ownerId || c.ownerId === ownerId)
    .find((c) => {
      const toks = normalize(c.nome).split(" ").filter((t) => t.length > 3 && !["usina", "grupo", "agricola", "bioenergia", "agroindustrial", "fornecedora", "cana"].includes(t));
      return toks.some((t) => q.includes(t));
    });

  if (company && /resum|como esta|situacao|conta|fala|me conta/.test(q)) {
    const deal = openDealOf(d, company.id);
    const next = nextStepOf(d, company.id);
    const strat = d.strategies.find((s) => s.companyId === company.id);
    const lastAt = lastInteractionAt(d, company.id);
    return {
      texto: [
        `${company.nome} (${company.cidade}/${company.uf}) — responsável: ${d.users.find((u) => u.id === company.ownerId)?.short}.`,
        deal ? `Está em ${stageOf(deal).nome} há ${daysInStage(deal, now)} dias${isStagnant(deal, now) ? " (acima do limite)" : ""}${deal.valor ? `, valor estimado de ${money(deal.valor)}` : ""}.` : "Sem oportunidade aberta.",
        lastAt ? `Última interação há ${daysSince(lastAt, now)} dias.` : "",
        next ? `Próximo passo: ${next.titulo} (${fmtDateShort(next.dueAt)}).` : "⚠️ Não há próximo passo definido.",
        strat ? `Estratégia: ${strat.estrategia}` : "Sem estratégia registrada.",
      ]
        .filter(Boolean)
        .join(" "),
      itens: [{ label: `Abrir ${company.nome}`, href: `/empresas/${company.id}` }],
    };
  }

  if (/parad|estagn|travad|sem avanc/.test(q)) {
    const list = al.filter((a) => a.tipo === "estagnacao" || a.tipo === "dependencia");
    return {
      texto: list.length ? `Encontrei ${list.length} contas paradas acima do limite da etapa. As que dependem de outra conta estão marcadas.` : "Nenhuma conta parada acima do limite. 👏",
      itens: list.map((a) => ({ label: cname(a.companyId), meta: a.texto, href: `/empresas/${a.companyId}` })),
    };
  }
  if (/hoje|fazer|prioridade|agenda|meu dia/.test(q)) {
    const b = dailyBriefing(d, user, now);
    return { texto: `${b.resumo} Prioridades:`, itens: b.prioridades.map((p) => ({ label: cname(p.companyId), meta: p.texto.split(" — ")[1], href: `/empresas/${p.companyId}` })) };
  }
  if (/orcamento|proposta|cotac/.test(q)) {
    const qs = d.quotes.filter((x) => x.status === "enviado" && (!ownerId || d.companies.find((c) => c.id === x.companyId)?.ownerId === ownerId));
    return {
      texto: `${qs.length} orçamentos enviados aguardando decisão.`,
      itens: qs.map((x) => {
        const left = dayDiff(quoteExpiresAt(x), now);
        return { label: `${x.numero} · ${cname(x.companyId)}`, meta: left < 0 ? `vencido há ${-left} dias` : `vence em ${left} dias`, href: `/empresas/${x.companyId}` };
      }),
    };
  }
  if (/execu|time|equipe|vendedor|desempenho|performance/.test(q)) {
    const stats = sellerStats(d, now);
    return {
      texto: "Execução dos últimos 30 dias (atividades concluídas no prazo sobre as que venceram no período):",
      itens: stats.map((s) => ({ label: s.user.name, meta: `${Math.round(s.execucao.rate * 100)}% no prazo · ${s.feitas} feitas · ${s.atrasadas} atrasadas`, href: "/gestao" })),
    };
  }
  if (/recorren|recompra|sem compra/.test(q)) {
    const list = al.filter((a) => a.tipo === "recorrencia");
    const prev = d.deals.filter((x) => x.status === "aberta" && x.funnel === "recorrencia" && x.stageId === "previsao" && (!ownerId || x.ownerId === ownerId));
    return {
      texto: `${list.length} recorrentes passaram da janela sem nova compra. ${prev.length} clientes estão com previsão de compra registrada.`,
      itens: [
        ...list.map((a) => ({ label: cname(a.companyId), meta: a.texto, href: `/empresas/${a.companyId}` })),
        ...prev.filter((x) => !list.some((a) => a.companyId === x.companyId)).map((x) => ({ label: cname(x.companyId), meta: `previsão: ${fmtDateShort(x.previsaoFechamento)}`, href: `/empresas/${x.companyId}` })),
      ],
    };
  }
  if (/sem proximo|proximo passo/.test(q)) {
    const list = al.filter((a) => a.tipo === "sem_proximo_passo");
    return { texto: `${list.length} contas ativas sem próximo passo.`, itens: list.map((a) => ({ label: cname(a.companyId), meta: a.texto, href: `/empresas/${a.companyId}` })) };
  }
  if (/atras|vencid/.test(q)) {
    const list = al.filter((a) => a.tipo === "atraso");
    return { texto: `${list.length} atividades atrasadas.`, itens: list.map((a) => ({ label: cname(a.companyId), meta: `${a.titulo} · ${a.texto}`, href: `/empresas/${a.companyId}` })) };
  }
  if (company) return assistantAnswer(d, user, `resumo ${company.nome}`, now);
  return {
    texto:
      "Posso responder com base nos dados registrados no Tawper OS. Experimente perguntar sobre clientes parados, sua agenda de hoje, orçamentos abertos, execução do time, recorrência ou pedir o resumo de uma conta.",
  };
}

export function funnelLabel(deal?: Deal) {
  if (!deal) return "—";
  return `${FUNNELS[deal.funnel].nome} · ${getStage(deal.funnel, deal.stageId).nome}`;
}

export function pendingCount(d: Data, companyId: string) {
  return pendingOf(d, companyId).length;
}

export { qualityOf };
