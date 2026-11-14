import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";
import type { ProposalStandardConfig } from "./config";
import { CONDICOES_PAGAMENTO, papelRotulo } from "./constants";
import type { Company, Contact, Deal, User } from "./types";
import { money } from "./utils";

export type ProposalMode = "venda" | "comodato" | "locacao" | "cortesia";

export interface ProposalClientData {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  cidadeUf: string;
  cep: string;
  ramo: string;
  contatoNome: string;
  contatoCargo: string;
  contatoPapel: string;
  contatoWhatsapp: string;
  contatoEmail: string;
}

export interface ProposalSellerData {
  nome: string;
  cargo: string;
  telefone: string;
  email: string;
  regiao: string;
}

export interface ProposalEquipmentFleet {
  colhedoras: string;
  modelos: string;
  prensa: string;
  marcaAtual: string;
  observacaoTecnica: string;
}

export interface ProposalLineItem {
  id: string;
  equipamento: string;
  especificacao: string;
  modalidade: ProposalMode;
  unidade: string;
  qtd: number;
  valorUnitario: number;
}

export interface ProposalTerms {
  numero: string;
  emitidaEm: string;
  validadeDias: number;
  condicaoPagamento: string;
  prazoEntrega: string;
  frete: string;
  mostrarValores: boolean;
  descontoPct: number;
  observacoes: string;
  incluirInstitucional: boolean;
}

export interface ProposalDocumentInput {
  cliente: ProposalClientData;
  vendedor: ProposalSellerData;
  frota: ProposalEquipmentFleet;
  itens: ProposalLineItem[];
  termos: ProposalTerms;
}

export const MODE_LABEL: Record<ProposalMode, string> = {
  venda: "Venda",
  comodato: "Comodato",
  locacao: "Locação",
  cortesia: "Cortesia",
};

export interface EquipmentPreset {
  key: string;
  label: string;
  equipamento: string;
  especificacao: string;
  modalidade: ProposalMode;
  unidade: string;
  qtd: number;
  valorUnitario: number;
}

export const PROPOSAL_EQUIPMENT_PRESETS: EquipmentPreset[] = [
  {
    key: "prensa",
    label: "+ Prensa em Comodato",
    equipamento: "Prensa Hidráulica Tawper In-Loco",
    especificacao: "Equipamento de prensagem de alta precisão instalado na oficina da usina/fazenda com manutenção inclusa",
    modalidade: "comodato",
    unidade: "un",
    qtd: 1,
    valorUnitario: 0,
  },
  {
    key: "mangueiras",
    label: "+ Kit Mangueiras Alta Pressão",
    equipamento: "Conjunto de Mangueiras Hidráulicas SAE 100R12 / 4SH",
    especificacao: "Mangueiras espiraladas de alta resistência à abrasão e picos de pressão para circuitos críticos de colhedoras",
    modalidade: "venda",
    unidade: "kit",
    qtd: 1,
    valorUnitario: 18500,
  },
  {
    key: "conexoes",
    label: "+ Terminais e Conexões",
    equipamento: "Kit Terminais, Capas e Adaptadores JIC / ORFS / BSP",
    especificacao: "Componentes usinados com proteção anticorrosiva e vedação certificada para reposição rápida",
    modalidade: "venda",
    unidade: "kit",
    qtd: 1,
    valorUnitario: 6800,
  },
  {
    key: "consignado",
    label: "+ Estoque Consignado",
    equipamento: "Módulo de Estoque Estratégico Consignado",
    especificacao: "Grade de mangueiras e terminais de maior giro alocada no cliente com reposição automática conforme consumo",
    modalidade: "comodato",
    unidade: "kit",
    qtd: 1,
    valorUnitario: 0,
  },
  {
    key: "mapeamento",
    label: "+ Mapeamento Técnico",
    equipamento: "Mapeamento e Taggeamento de Circuitos da Frota",
    especificacao: "Levantamento em campo máquina a máquina com identificação por código de cada mangueira e conexão",
    modalidade: "cortesia",
    unidade: "serv",
    qtd: 1,
    valorUnitario: 0,
  },
];

export function defaultSellerEmail(user?: User): string {
  if (!user) return "comercial@tawper.com.br";
  const slug = user.short
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${slug || "comercial"}@tawper.com.br`;
}

export function buildInitialProposalInput(params: {
  company: Company;
  contact: Contact;
  owner?: User;
  deal?: Deal;
  standard?: ProposalStandardConfig | null;
  now?: Date;
}): ProposalDocumentInput {
  const { company, contact, owner, deal, standard, now = new Date() } = params;
  const yy = now.getFullYear();
  const suffix = company.codigo.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const hasTawperPrensa = company.prensa === "Comodato Tawper";

  const defaultItems: ProposalLineItem[] = [
    ...(hasTawperPrensa
      ? []
      : [
          {
            id: "item-prensa",
            equipamento: PROPOSAL_EQUIPMENT_PRESETS[0].equipamento,
            especificacao: PROPOSAL_EQUIPMENT_PRESETS[0].especificacao,
            modalidade: PROPOSAL_EQUIPMENT_PRESETS[0].modalidade,
            unidade: PROPOSAL_EQUIPMENT_PRESETS[0].unidade,
            qtd: 1,
            valorUnitario: 0,
          },
        ]),
    {
      id: "item-mangueiras",
      equipamento: PROPOSAL_EQUIPMENT_PRESETS[1].equipamento,
      especificacao: company.modelos
        ? `Dimensionado para frota ${company.modelos} (${company.colhedoras ?? "frota ativa"} máquinas)`
        : PROPOSAL_EQUIPMENT_PRESETS[1].especificacao,
      modalidade: "venda",
      unidade: "kit",
      qtd: Math.max(1, Math.ceil((company.colhedoras ?? 4) / 4)),
      valorUnitario: deal?.valor ? Math.round((deal.valor * 0.72) / Math.max(1, Math.ceil((company.colhedoras ?? 4) / 4))) : 18500,
    },
    {
      id: "item-conexoes",
      equipamento: PROPOSAL_EQUIPMENT_PRESETS[2].equipamento,
      especificacao: PROPOSAL_EQUIPMENT_PRESETS[2].especificacao,
      modalidade: "venda",
      unidade: "kit",
      qtd: 1,
      valorUnitario: deal?.valor ? Math.round(deal.valor * 0.28) : 6800,
    },
    {
      id: "item-mapeamento",
      equipamento: PROPOSAL_EQUIPMENT_PRESETS[4].equipamento,
      especificacao: PROPOSAL_EQUIPMENT_PRESETS[4].especificacao,
      modalidade: "cortesia",
      unidade: "serv",
      qtd: 1,
      valorUnitario: 0,
    },
  ];

  const initialItems: ProposalLineItem[] =
    standard?.itensPadrao && standard.itensPadrao.length > 0
      ? standard.itensPadrao.map((it) => ({ ...it }))
      : defaultItems;

  const cidadeUf = [company.cidade, company.uf].filter(Boolean).join(" / ") || company.regiao || "";
  const obsCombined = [standard?.observacoesPadrao, company.observacoes]
    .filter((x) => typeof x === "string" && x.trim().length > 0)
    .join(" · ");

  return {
    cliente: {
      nomeFantasia: company.nome,
      razaoSocial: company.razaoSocial || company.nome,
      cnpj: company.cnpj ?? "",
      endereco: company.endereco ?? "",
      cidadeUf,
      cep: company.cep ?? "",
      ramo: company.ramo ?? "Agroindustrial / Industrial",
      contatoNome: contact.nome,
      contatoCargo: contact.cargo ?? "",
      contatoPapel: contact.papel ? papelRotulo(contact.papel) : "",
      contatoWhatsapp: contact.whatsapp ?? "",
      contatoEmail: contact.email ?? "",
    },
    vendedor: {
      nome: owner?.name ?? "Equipe Comercial Tawper",
      cargo: owner?.title ?? "Consultor Técnico Comercial",
      telefone: owner?.phone ?? "",
      email: defaultSellerEmail(owner),
      regiao: owner?.regions?.join(", ") || company.regiao || "Atendimento Nacional",
    },
    frota: {
      colhedoras: company.colhedoras != null ? String(company.colhedoras) : "",
      modelos: company.modelos ?? "",
      prensa: company.prensa ?? "",
      marcaAtual: company.marcaAtual ?? "",
      observacaoTecnica: company.observacoes ?? "",
    },
    itens: initialItems,
    termos: {
      numero: `PROP-${yy}-${suffix}`,
      emitidaEm: now.toLocaleDateString("pt-BR"),
      validadeDias: standard?.validadeDias ?? 15,
      condicaoPagamento: standard?.condicaoPagamento || CONDICOES_PAGAMENTO[1] || "28 dias",
      prazoEntrega: standard?.prazoEntrega || "Imediato / até 5 dias úteis após aprovação",
      frete: standard?.frete || "CIF — Entrega e implantação pela Tawper",
      mostrarValores: standard ? standard.mostrarValores : Boolean(deal?.valor && deal.valor > 0),
      descontoPct: standard?.descontoMaxPct ?? 0,
      observacoes: obsCombined,
      incluirInstitucional: standard?.incluirInstitucional ?? true,
    },
  };
}

export function calcProposalTotals(itens: ProposalLineItem[], descontoPct: number) {
  const subtotal = itens.reduce((sum, it) => {
    if (it.modalidade === "cortesia") return sum;
    return sum + Math.max(0, it.qtd) * Math.max(0, it.valorUnitario);
  }, 0);
  const clampedPct = Math.max(0, Math.min(90, Number.isFinite(descontoPct) ? descontoPct : 0));
  const descontoValor = subtotal * (clampedPct / 100);
  const total = Math.max(0, subtotal - descontoValor);
  return { subtotal, descontoPct: clampedPct, descontoValor, total };
}

/** Sanitiza strings para encoding WinAnsi do Helvetica no PDF sem nunca falhar em caracteres especiais. */
export function pdfSafeText(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2192/g, "->")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    // Remove emojis ou símbolos fora de Latin-1/WinAnsi preservando acentos pt-BR
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = pdfSafeText(text).replace(/\r\n/g, "\n");
  if (!clean.trim()) return [];
  const out: string[] = [];
  for (const para of clean.split("\n")) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const M = 36;
const CW = PAGE_W - M * 2;

const C = {
  navy: rgb(20 / 255, 29 / 255, 53 / 255), // #141d35 (--ink)
  navy2: rgb(41 / 255, 56 / 255, 127 / 255), // #29387f (--blue)
  brand: rgb(227 / 255, 28 / 255, 63 / 255), // #e31c3f (--red)
  ink: rgb(20 / 255, 29 / 255, 53 / 255), // #141d35 (--ink)
  muted: rgb(98 / 255, 107 / 255, 125 / 255), // #626b7d (--muted)
  line: rgb(220 / 255, 224 / 255, 232 / 255), // #dce0e8 (--line)
  soft: rgb(245 / 255, 245 / 255, 242 / 255), // #f5f5f2 (--paper)
  paper: rgb(252 / 255, 252 / 255, 249 / 255),
  white: rgb(1, 1, 1),
  ok: rgb(21 / 255, 127 / 255, 95 / 255),
  okSoft: rgb(231 / 255, 244 / 255, 239 / 255),
};

export async function buildProposalPdfBytes(
  input: ProposalDocumentInput,
  assets?: { logoWhitePng?: Uint8Array },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafeText(`Proposta Comercial ${input.termos.numero} - ${input.cliente.nomeFantasia}`));
  doc.setAuthor(pdfSafeText(input.vendedor.nome || "Tawper Mangueiras e Conexões"));
  doc.setSubject("Proposta Comercial Tawper");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logoImg: PDFImage | null = null;
  if (assets?.logoWhitePng?.byteLength) {
    try {
      logoImg = await doc.embedPng(assets.logoWhitePng);
    } catch {
      logoImg = null;
    }
  }

  const pages: PDFPage[] = [];
  let page = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);
  let y = PAGE_H;

  const drawHeader = (p: PDFPage, compact = false) => {
    const headerH = compact ? 58 : 88;
    p.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: C.navy });
    p.drawRectangle({ x: 0, y: PAGE_H - headerH - 3, width: PAGE_W, height: 3, color: C.brand });

    if (logoImg) {
      const targetH = compact ? 24 : 32;
      const ratio = logoImg.width / Math.max(1, logoImg.height);
      const targetW = targetH * ratio;
      p.drawImage(logoImg, {
        x: M,
        y: PAGE_H - headerH + (headerH - targetH) / 2,
        width: targetW,
        height: targetH,
      });
    } else {
      p.drawText("TAWPER", {
        x: M,
        y: PAGE_H - (compact ? 34 : 46),
        size: compact ? 18 : 22,
        font: bold,
        color: C.white,
      });
      p.drawText("MANGUEIRAS E CONEXOES", {
        x: M,
        y: PAGE_H - (compact ? 46 : 61),
        size: 8,
        font,
        color: rgb(0.75, 0.81, 0.9),
      });
    }

    const numStr = pdfSafeText(input.termos.numero || "PROPOSTA");
    const dateStr = pdfSafeText(`Emitida em ${input.termos.emitidaEm} · Validade: ${input.termos.validadeDias} dias`);
    const titleStr = compact ? "CONTINUACAO DA PROPOSTA" : "PROPOSTA COMERCIAL";

    const tW = bold.widthOfTextAtSize(titleStr, compact ? 10 : 12);
    p.drawText(titleStr, {
      x: PAGE_W - M - tW,
      y: PAGE_H - (compact ? 24 : 32),
      size: compact ? 10 : 12,
      font: bold,
      color: rgb(1, 0.65, 0.65),
    });

    const nW = bold.widthOfTextAtSize(numStr, compact ? 12 : 16);
    p.drawText(numStr, {
      x: PAGE_W - M - nW,
      y: PAGE_H - (compact ? 38 : 51),
      size: compact ? 12 : 16,
      font: bold,
      color: C.white,
    });

    if (!compact) {
      const dW = font.widthOfTextAtSize(dateStr, 8.5);
      p.drawText(dateStr, {
        x: PAGE_W - M - dW,
        y: PAGE_H - 68,
        size: 8.5,
        font,
        color: rgb(0.78, 0.84, 0.92),
      });
    }

    return PAGE_H - headerH - 22;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed >= 56) return;
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = drawHeader(page, true);
  };

  const drawLabelValue = (p: PDFPage, x: number, curY: number, label: string, val: string, maxW: number, valSize = 9.5) => {
    p.drawText(pdfSafeText(label).toUpperCase(), { x, y: curY, size: 7, font: bold, color: C.muted });
    const lines = wrapLines(val || "—", bold, valSize, maxW);
    let ly = curY - 11;
    for (const l of lines.slice(0, 2)) {
      p.drawText(l, { x, y: ly, size: valSize, font: bold, color: C.ink });
      ly -= valSize + 3;
    }
    return ly;
  };

  // --- PÁGINA 1: CAPA DE DADOS ---
  y = drawHeader(page, false);

  // Quadro Cliente + Vendedor lado a lado
  const colGap = 14;
  const colW = (CW - colGap) / 2;
  const boxH = 178;
  page.drawRectangle({ x: M, y: y - boxH, width: colW, height: boxH, color: C.white, borderColor: C.line, borderWidth: 1 });
  page.drawRectangle({ x: M + colW + colGap, y: y - boxH, width: colW, height: boxH, color: C.soft, borderColor: C.line, borderWidth: 1 });

  // Faixa título Cliente
  page.drawRectangle({ x: M, y: y - 24, width: colW, height: 24, color: C.navy });
  page.drawText("DADOS DO CLIENTE E DESTINATARIO", { x: M + 12, y: y - 16, size: 8.5, font: bold, color: C.white });

  let cy = y - 38;
  const cx = M + 12;
  const cwInner = colW - 24;
  cy = drawLabelValue(page, cx, cy, "Empresa / Razao Social", `${input.cliente.nomeFantasia}${input.cliente.razaoSocial && input.cliente.razaoSocial !== input.cliente.nomeFantasia ? ` (${input.cliente.razaoSocial})` : ""}`, cwInner, 9.5);
  cy -= 3;
  const docLoc = [input.cliente.cnpj ? `CNPJ ${input.cliente.cnpj}` : null, input.cliente.cidadeUf || null, input.cliente.cep ? `CEP ${input.cliente.cep}` : null].filter(Boolean).join(" · ");
  cy = drawLabelValue(page, cx, cy, "Identificacao e Localizacao", docLoc || "A completar", cwInner, 8.5);
  if (input.cliente.endereco) {
    cy -= 2;
    cy = drawLabelValue(page, cx, cy, "Endereco", input.cliente.endereco, cwInner, 8.5);
  }
  cy -= 3;
  const contactLine = [input.cliente.contatoNome, input.cliente.contatoCargo, input.cliente.contatoPapel].filter(Boolean).join(" · ");
  const contactChannel = [input.cliente.contatoWhatsapp, input.cliente.contatoEmail].filter(Boolean).join(" · ");
  drawLabelValue(page, cx, cy, "Destinatario", [contactLine, contactChannel].filter(Boolean).join(" | ") || "—", cwInner, 8.5);

  // Faixa título Vendedor
  const vx = M + colW + colGap;
  page.drawRectangle({ x: vx, y: y - 24, width: colW, height: 24, color: C.brand });
  page.drawText("CONSULTOR COMERCIAL TAWPER", { x: vx + 12, y: y - 16, size: 8.5, font: bold, color: C.white });

  let vy = y - 38;
  const vInner = colW - 24;
  vy = drawLabelValue(page, vx + 12, vy, "Vendedor / Responsavel", input.vendedor.nome, vInner, 10);
  vy -= 4;
  vy = drawLabelValue(page, vx + 12, vy, "Cargo / Atuacao", `${input.vendedor.cargo}${input.vendedor.regiao ? ` · ${input.vendedor.regiao}` : ""}`, vInner, 8.5);
  vy -= 4;
  vy = drawLabelValue(page, vx + 12, vy, "Telefone / WhatsApp", input.vendedor.telefone || "—", vInner, 9);
  vy -= 4;
  drawLabelValue(page, vx + 12, vy, "E-mail Comercial", input.vendedor.email || "comercial@tawper.com.br", vInner, 8.5);

  y -= boxH + 16;

  // --- BLOCO 2: PARQUE DE EQUIPAMENTOS DO CLIENTE ---
  const fleetH = 82;
  page.drawRectangle({ x: M, y: y - fleetH, width: CW, height: fleetH, color: C.paper, borderColor: C.line, borderWidth: 1 });
  page.drawText("PARQUE DE EQUIPAMENTOS E OPERACAO DO CLIENTE", { x: M + 12, y: y - 15, size: 8, font: bold, color: C.navy });

  const fColW = (CW - 24) / 4;
  const fy = y - 32;
  drawLabelValue(page, M + 12, fy, "Colhedoras / Frota", input.frota.colhedoras ? `${input.frota.colhedoras} maquinas` : "Nao informado", fColW - 8, 9);
  drawLabelValue(page, M + 12 + fColW, fy, "Modelos de Equipamentos", input.frota.modelos || "Nao informado", fColW - 8, 8.5);
  drawLabelValue(page, M + 12 + fColW * 2, fy, "Sistema de Prensa", input.frota.prensa || "A definir", fColW - 8, 8.5);
  drawLabelValue(page, M + 12 + fColW * 3, fy, "Fornecedor Atual", input.frota.marcaAtual || "Nao informado", fColW - 8, 8.5);

  y -= fleetH + 18;

  // --- BLOCO 3: TABELA DE EQUIPAMENTOS, PRODUTOS E SOLUÇÕES DA PROPOSTA ---
  page.drawText("EQUIPAMENTOS, PRODUTOS E SOLUCOES PROPOSTAS", { x: M, y, size: 10, font: bold, color: C.navy });
  y -= 10;

  const showPrices = input.termos.mostrarValores;
  const cols = showPrices
    ? { idx: 24, desc: 256, mode: 66, qty: 54, unit: 62, sub: CW - (24 + 256 + 66 + 54 + 62) }
    : { idx: 26, desc: 326, mode: 90, qty: CW - (26 + 326 + 90), unit: 0, sub: 0 };

  const drawTableHeader = (curY: number) => {
    page.drawRectangle({ x: M, y: curY - 22, width: CW, height: 22, color: C.navy2 });
    let x = M + 6;
    page.drawText("#", { x, y: curY - 14, size: 8, font: bold, color: C.white });
    x += cols.idx;
    page.drawText("EQUIPAMENTO / ITEM E ESPECIFICACAO", { x, y: curY - 14, size: 8, font: bold, color: C.white });
    x += cols.desc;
    page.drawText("MODALIDADE", { x, y: curY - 14, size: 8, font: bold, color: C.white });
    x += cols.mode;
    page.drawText("QTD / UN", { x, y: curY - 14, size: 8, font: bold, color: C.white });
    if (showPrices) {
      x += cols.qty;
      page.drawText("UNITARIO", { x, y: curY - 14, size: 8, font: bold, color: C.white });
      x += cols.unit;
      page.drawText("SUBTOTAL", { x, y: curY - 14, size: 8, font: bold, color: C.white });
    }
    return curY - 22;
  };

  y = drawTableHeader(y);

  for (let i = 0; i < input.itens.length; i++) {
    const item = input.itens[i];
    const descLines = wrapLines(item.especificacao, font, 8, cols.desc - 12);
    const titleLines = wrapLines(item.equipamento, bold, 9, cols.desc - 12);
    const rowH = Math.max(30, titleLines.length * 11 + descLines.length * 10 + 12);

    if (y - rowH < 72) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      pages.push(page);
      y = drawHeader(page, true);
      y = drawTableHeader(y);
    }

    const rowBg = i % 2 === 1 ? C.paper : C.white;
    page.drawRectangle({ x: M, y: y - rowH, width: CW, height: rowH, color: rowBg, borderColor: C.line, borderWidth: 0.6 });

    let x = M + 6;
    page.drawText(String(i + 1).padStart(2, "0"), { x, y: y - 15, size: 8.5, font: bold, color: C.muted });
    x += cols.idx;

    let ty = y - 14;
    for (const tl of titleLines) {
      page.drawText(tl, { x, y: ty, size: 9, font: bold, color: C.ink });
      ty -= 11;
    }
    for (const dl of descLines) {
      page.drawText(dl, { x, y: ty, size: 8, font, color: C.muted });
      ty -= 10;
    }

    x += cols.desc;
    page.drawText(pdfSafeText(MODE_LABEL[item.modalidade]), { x, y: y - 15, size: 8.5, font: bold, color: item.modalidade === "cortesia" ? C.ok : C.ink });

    x += cols.mode;
    page.drawText(pdfSafeText(`${item.qtd} ${item.unidade}`), { x, y: y - 15, size: 8.5, font, color: C.ink });

    if (showPrices) {
      x += cols.qty;
      const freeText = item.modalidade === "cortesia" ? "Cortesia" : item.valorUnitario <= 0 ? "Comodato" : pdfSafeText(money(item.valorUnitario));
      const subText = item.modalidade === "cortesia" ? "Incluso" : item.valorUnitario <= 0 ? "Sob regiao" : pdfSafeText(money(item.qtd * item.valorUnitario));
      page.drawText(freeText, { x, y: y - 15, size: 8.5, font, color: C.ink });
      x += cols.unit;
      page.drawText(subText, { x, y: y - 15, size: 8.5, font: bold, color: C.ink });
    }

    y -= rowH;
  }

  // Totais se exibir valores
  const totals = calcProposalTotals(input.itens, input.termos.descontoPct);
  if (showPrices) {
    ensureSpace(64);
    const totalBoxW = 228;
    const totalBoxH = totals.descontoPct > 0 ? 58 : 40;
    const tx = PAGE_W - M - totalBoxW;
    page.drawRectangle({ x: tx, y: y - totalBoxH - 6, width: totalBoxW, height: totalBoxH, color: C.soft, borderColor: C.line, borderWidth: 1 });
    let tcur = y - 20;
    if (totals.descontoPct > 0) {
      page.drawText("Subtotal:", { x: tx + 10, y: tcur, size: 8.5, font, color: C.muted });
      const sVal = pdfSafeText(money(totals.subtotal));
      page.drawText(sVal, { x: tx + totalBoxW - 10 - font.widthOfTextAtSize(sVal, 8.5), y: tcur, size: 8.5, font, color: C.ink });
      tcur -= 13;
      page.drawText(`Desconto (${totals.descontoPct}%):`, { x: tx + 10, y: tcur, size: 8.5, font, color: C.brand });
      const dVal = pdfSafeText(`- ${money(totals.descontoValor)}`);
      page.drawText(dVal, { x: tx + totalBoxW - 10 - font.widthOfTextAtSize(dVal, 8.5), y: tcur, size: 8.5, font, color: C.brand });
      tcur -= 15;
    } else {
      tcur -= 8;
    }
    page.drawText("TOTAL DA PROPOSTA:", { x: tx + 10, y: tcur, size: 9, font: bold, color: C.navy });
    const gVal = pdfSafeText(money(totals.total));
    page.drawText(gVal, { x: tx + totalBoxW - 10 - bold.widthOfTextAtSize(gVal, 11.5), y: tcur, size: 11.5, font: bold, color: C.navy });
    y -= totalBoxH + 18;
  } else {
    y -= 16;
  }

  // --- BLOCO 4: CONDIÇÕES COMERCIAIS E OBSERVAÇÕES ---
  const obsLines = wrapLines(input.termos.observacoes, font, 8.5, CW - 24);
  const termsH = 74 + (obsLines.length ? Math.min(8, obsLines.length) * 11 + 16 : 0);
  ensureSpace(termsH + 16);

  page.drawRectangle({ x: M, y: y - termsH, width: CW, height: termsH, color: C.white, borderColor: C.line, borderWidth: 1 });
  page.drawText("CONDICOES COMERCIAIS E PRAZOS", { x: M + 12, y: y - 16, size: 8.5, font: bold, color: C.navy });

  const tCol = (CW - 24) / 3;
  drawLabelValue(page, M + 12, y - 34, "Pagamento", input.termos.condicaoPagamento || "A combinar", tCol - 8, 9);
  drawLabelValue(page, M + 12 + tCol, y - 34, "Prazo / Implantacao", input.termos.prazoEntrega || "A combinar", tCol - 8, 8.5);
  drawLabelValue(page, M + 12 + tCol * 2, y - 34, "Frete / Logistica", input.termos.frete || "CIF", tCol - 8, 8.5);

  if (obsLines.length) {
    let oy = y - 72;
    page.drawText("OBSERVACOES DA PROPOSTA:", { x: M + 12, y: oy, size: 7, font: bold, color: C.muted });
    oy -= 11;
    for (const ol of obsLines.slice(0, 8)) {
      page.drawText(ol, { x: M + 12, y: oy, size: 8.5, font, color: C.ink });
      oy -= 11;
    }
  }
  y -= termsH + 22;

  // --- BLOCO 5: ASSINATURA / ACEITE ---
  ensureSpace(78);
  const sigW = (CW - 32) / 2;
  page.drawLine({ start: { x: M, y: y - 30 }, end: { x: M + sigW, y: y - 30 }, thickness: 0.8, color: C.muted });
  page.drawText(pdfSafeText(input.vendedor.nome), { x: M, y: y - 42, size: 8.5, font: bold, color: C.ink });
  page.drawText(pdfSafeText("Tawper Mangueiras e Conexoes"), { x: M, y: y - 53, size: 7.5, font, color: C.muted });

  const sx2 = M + sigW + 32;
  page.drawLine({ start: { x: sx2, y: y - 30 }, end: { x: sx2 + sigW, y: y - 30 }, thickness: 0.8, color: C.muted });
  page.drawText(pdfSafeText(`Aceite: ${input.cliente.contatoNome || input.cliente.nomeFantasia}`), { x: sx2, y: y - 42, size: 8.5, font: bold, color: C.ink });
  page.drawText(pdfSafeText(input.cliente.nomeFantasia), { x: sx2, y: y - 53, size: 7.5, font, color: C.muted });

  // --- PÁGINA INSTITUCIONAL OPCIONAL ---
  if (input.termos.incluirInstitucional) {
    const inst = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(inst);
    let iy = drawHeader(inst, true);

    inst.drawRectangle({ x: M, y: iy - 2, width: 28, height: 3.5, color: C.brand });
    inst.drawText("DIFERENCIAIS TAWPER · TECNOLOGIA, RASTREABILIDADE E CONFIABILIDADE", {
      x: M + 36,
      y: iy - 3,
      size: 8.5,
      font: bold,
      color: C.navy2,
    });
    iy -= 22;
    inst.drawText("A solucao comeca antes da instalacao: da bancada ao campo.", {
      x: M,
      y: iy,
      size: 14,
      font: bold,
      color: C.navy,
    });
    iy -= 18;
    const intro = wrapLines(
      "Com mais de 8 anos de confiabilidade tecnica e mais de 400 empresas atendidas no Brasil, a Tawper une origem tecnica inglesa, producao dedicada e fornecimento direto sem intermediacao para proteger a disponibilidade da sua frente de colheita.",
      font,
      9.2,
      CW,
    );
    for (const l of intro) {
      inst.drawText(l, { x: M, y: iy, size: 9.2, font, color: C.ink });
      iy -= 13;
    }
    iy -= 10;

    const pillars = [
      {
        title: "01 · Mangueiras de Tecnologia Europeia (ISO · MSHA · CCS) e Terminais Crimpados",
        desc: "Origem tecnica inglesa para aplicacoes severas. Compatibilidade dimensional entre mangueira, terminal e capa conforme a pressao e o raio de curvatura de cada circuito.",
      },
      {
        title: "02 · Prensagem Padronizada com Final de Curso e Sistema Visual de Cores",
        desc: "A identificacao da mangueira corresponde a cor da castanha da prensa (vermelha, verde, amarela e roxa), dispensando ajustes por micrometro e reduzindo retrabalho na oficina.",
      },
      {
        title: "03 · Preparacao Completa: Maquina de Corte, Pistola de Descontaminacao e Lacre Retratil",
        desc: "Corte no comprimento exato, limpeza interna por projetil para remover residuos antes da instalacao e lacre termorretratil azul que protege a extremidade no transporte.",
      },
      {
        title: "04 · Inteligencia HydraSense + Gravacao a Laser Customizada (O DNA de cada mangueira)",
        desc: "Lacre numerado e gravacao a laser no terminal (equipamento, posicao, data e codigo), registrando quem montou, componentes, horimetro e historico de substituicao.",
      },
      {
        title: "05 · Fornecimento Direto, Tawper Academy e Suporte Tecnico Presencial",
        desc: "Importacao e fornecimento direto com menos intermediacao, catalogos customizados para a sua frota e treinamento teorico e pratico da sua equipe de manutencao.",
      },
    ];

    for (const pil of pillars) {
      const cardH = 62;
      inst.drawRectangle({ x: M, y: iy - cardH, width: CW, height: cardH, color: C.soft, borderColor: C.line, borderWidth: 1 });
      inst.drawRectangle({ x: M, y: iy, width: CW, height: 2, color: C.navy2 });
      inst.drawRectangle({ x: M, y: iy - cardH, width: 4, height: cardH, color: C.brand });
      inst.drawText(pdfSafeText(pil.title), { x: M + 14, y: iy - 18, size: 9.5, font: bold, color: C.navy });
      const lines = wrapLines(pil.desc, font, 8.5, CW - 28);
      let py = iy - 33;
      for (const pl of lines) {
        inst.drawText(pl, { x: M + 14, y: py, size: 8.5, font, color: C.ink });
        py -= 11.5;
      }
      iy -= cardH + 10;
    }
  }

  // Rodapé paginado em todas as páginas
  const totalPages = pages.length;
  pages.forEach((p, index) => {
    p.drawLine({ start: { x: M, y: 38 }, end: { x: PAGE_W - M, y: 38 }, thickness: 0.6, color: C.line });
    p.drawText(pdfSafeText(`Tawper Mangueiras e Conexoes · ${input.termos.numero} · ${input.cliente.nomeFantasia}`), {
      x: M,
      y: 24,
      size: 7.5,
      font,
      color: C.muted,
    });
    const pgLabel = `Pagina ${index + 1} de ${totalPages}`;
    p.drawText(pgLabel, {
      x: PAGE_W - M - font.widthOfTextAtSize(pgLabel, 7.5),
      y: 24,
      size: 7.5,
      font,
      color: C.muted,
    });
  });

  return doc.save();
}
