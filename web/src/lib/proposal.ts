import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { DEFAULT_PROPOSAL_STANDARD, type ProposalStandardConfig } from "./config";
import { papelRotulo } from "./constants";
import type { Company, Contact, Deal, User } from "./types";
import { money } from "./utils";

export interface ProposalClientData {
  companyId: string;
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  cidadeUf: string;
  endereco: string;
  cep: string;
  destinatarioNome: string;
  destinatarioCargo: string;
  destinatarioPapel: string;
  destinatarioFone: string;
  destinatarioEmail: string;
}

export interface ProposalSellerData {
  userId: string;
  nome: string;
  cargo: string;
  telefone: string;
  email: string;
  regiao: string;
}

export interface ProposalEquipmentFleet {
  numColhedoras: number;
  marcaFrota: string;
  prensa: string;
  conector: string;
  espiral: string;
  fornecedorAtual: string;
  modalidadeAtendimento: string;
  gargaloPrincipal: string;
}

export interface ProposalBudgetMeta {
  numeroExterno: string;
  nomeArquivo?: string;
  valorTotal?: number | null;
  resumoEscopo: string;
  destaques: string[];
  condicaoDetectada?: string;
  paginasAnexo: number;
}

export interface ProposalTerms {
  codigo: string;
  dataEmissao: string;
  validadeDias: number;
  condicaoPagamento: string;
  frete: string;
  prazoEntrega: string;
  garantia: string;
  observacoes: string;
  mostrarValores: boolean;
}

export interface ProposalDocumentInput {
  cliente: ProposalClientData;
  vendedor: ProposalSellerData;
  frota: ProposalEquipmentFleet;
  orcamento: ProposalBudgetMeta;
  termos: ProposalTerms;
  dealId?: string;
  dealTitulo?: string;
}

export function defaultSellerEmail(user?: Pick<User, "name" | "short"> | null): string {
  const base = (user?.short || user?.name || "comercial")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${base || "comercial"}@tawper.com.br`;
}

export function pdfSafeText(v: string | number | null | undefined): string {
  return String(v ?? "")
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addDaysIso(isoDate: string, days: number): string {
  const base = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setDate(base.getDate() + Math.max(0, days));
  const dd = String(base.getDate()).padStart(2, "0");
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${base.getFullYear()}`;
}

function fmtIsoDate(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return isoDate;
}

export function buildInitialProposalInput(args: {
  company: Company;
  contact?: Contact | null;
  contacts?: Contact[];
  deal?: Deal | null;
  owner?: User | null;
  seller?: User | null;
  standard?: ProposalStandardConfig | null;
  sequenceNumber?: number;
}): ProposalDocumentInput {
  const { company, deal, sequenceNumber = 1 } = args;
  const seller = args.seller ?? args.owner ?? null;
  const standard = args.standard ?? DEFAULT_PROPOSAL_STANDARD;
  const todayIso = new Date().toISOString().slice(0, 10);
  const year = todayIso.slice(0, 4);

  const contactsList = args.contacts ?? (args.contact ? [args.contact] : []);
  const primaryContact =
    args.contact ??
    contactsList.find((c) => c.papel === "Decisor" || c.influencia === 3) ??
    contactsList.find((c) => c.whatsapp || c.email) ??
    contactsList[0];

  const colhedoras = Math.max(1, company.colhedoras ?? 10);
  const condicaoDefault =
    standard.condicaoPagamento || standard.condicoesPagamento[0] || DEFAULT_PROPOSAL_STANDARD.condicaoPagamento;
  const freteDefault = standard.frete || standard.opcoesFrete[0] || DEFAULT_PROPOSAL_STANDARD.frete;
  const entregaDefault =
    standard.prazoEntrega || standard.opcoesEntrega[0] || DEFAULT_PROPOSAL_STANDARD.prazoEntrega;
  const cidadeUf = [company.cidade, company.uf].filter(Boolean).join(" / ") || "Brasil";

  return {
    cliente: {
      companyId: company.id,
      nomeFantasia: company.nome,
      razaoSocial: company.razaoSocial || company.nome,
      cnpj: company.cnpj || "A confirmar",
      cidadeUf,
      endereco: company.endereco || "",
      cep: company.cep || "",
      destinatarioNome: primaryContact?.nome || "Equipe Técnica & Compras",
      destinatarioCargo: primaryContact?.cargo || "Manutenção / Suprimentos",
      destinatarioPapel: primaryContact ? papelRotulo(primaryContact.papel) : "Decisor / Compras",
      destinatarioFone: primaryContact?.whatsapp || "",
      destinatarioEmail: primaryContact?.email || "",
    },
    vendedor: {
      userId: seller?.id || "",
      nome: seller?.name || "Consultor Tawper",
      cargo: seller?.title || (seller ? papelRotulo(seller.role) : "Consultor Comercial"),
      telefone: seller?.phone || "",
      email: defaultSellerEmail(seller),
      regiao: seller?.regions?.join(" · ") || company.regiao || "",
    },
    frota: {
      numColhedoras: colhedoras,
      marcaFrota: company.modelos || "Case / John Deere",
      prensa: company.prensa || "A avaliar em oficina",
      conector: "JIC / ORFS / SAE",
      espiral: "Proteção antichama / alta abrasão",
      fornecedorAtual: company.marcaAtual || company.concorrente || "Em diagnóstico",
      modalidadeAtendimento:
        company.prensa === "Comodato Tawper"
          ? "Recorrência & Comodato Ativo Tawper"
          : "Venda Direta & Comodato de Estrutura",
      gargaloPrincipal:
        company.observacoes?.trim() ||
        "Reduzir tempo de máquina parada por rompimento de mangueira e padronizar montagens na oficina durante a safra.",
    },
    orcamento: {
      numeroExterno: "",
      nomeArquivo: "",
      valorTotal: deal?.valor && deal.valor > 0 ? deal.valor : null,
      resumoEscopo:
        "Fornecimento programado de mangueiras hidráulicas, terminais padronizados, estruturação técnica de oficina e rastreabilidade operacional conforme orçamento oficial emitido no ERP Tawper.",
      destaques: [
        "Padronização de mangueiras e conexões críticas para a frota ativa",
        "Identificação visual por Sistema de Cores Tawper e lacre de proteção",
        "Capacitação da equipe via Tawper Academy e inspeção contínua HydraSense",
      ],
      condicaoDetectada: "",
      paginasAnexo: 0,
    },
    termos: {
      codigo: `PROP-${year}-${String(sequenceNumber).padStart(4, "0")}`,
      dataEmissao: todayIso,
      validadeDias: standard.validadeDias || DEFAULT_PROPOSAL_STANDARD.validadeDias,
      condicaoPagamento: condicaoDefault,
      frete: freteDefault,
      prazoEntrega: entregaDefault,
      garantia: "Garantia Tawper contra defeitos de fabricação e prensagem conforme especificação técnica.",
      observacoes: standard.observacoesPadrao || DEFAULT_PROPOSAL_STANDARD.observacoesPadrao,
      mostrarValores: standard.mostrarValores ?? true,
    },
    dealId: deal?.id,
    dealTitulo: deal?.titulo,
  };
}

// =====================================================================
// PDF ENGINE — 8 PÁGINAS A4 SEM BORDAS (595.28 x 841.89 pt) + ANEXO ERP
// =====================================================================

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

const C = {
  red: rgb(200 / 255, 20 / 255, 33 / 255),
  dark: rgb(14 / 255, 16 / 255, 22 / 255),
  darkCard: rgb(26 / 255, 29 / 255, 38 / 255),
  ink: rgb(22 / 255, 25 / 255, 34 / 255),
  muted: rgb(95 / 255, 104 / 255, 120 / 255),
  lightMuted: rgb(184 / 255, 192 / 255, 204 / 255),
  border: rgb(224 / 255, 228 / 255, 236 / 255),
  softBg: rgb(246 / 255, 247 / 255, 250 / 255),
  softRed: rgb(254 / 255, 242 / 255, 242 / 255),
  white: rgb(1, 1, 1),
  green: rgb(22 / 255, 122 / 255, 68 / 255),
};

interface TextCtx {
  regular: PDFFont;
  bold: PDFFont;
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = pdfSafeText(text);
  if (!clean) return [];
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawLines(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    yTop: number;
    font: PDFFont;
    size: number;
    maxWidth: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
    maxLines?: number;
  }
): number {
  const lh = opts.lineHeight ?? opts.size * 1.38;
  let lines = wrapLines(text, opts.font, opts.size, opts.maxWidth);
  if (opts.maxLines && lines.length > opts.maxLines) {
    lines = lines.slice(0, opts.maxLines);
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = last.length > 4 ? `${last.slice(0, last.length - 3)}...` : last;
  }
  for (let i = 0; i < lines.length; i++) {
    const yPdf = A4_HEIGHT - (opts.yTop + i * lh + opts.size);
    page.drawText(lines[i], {
      x: opts.x,
      y: yPdf,
      font: opts.font,
      size: opts.size,
      color: opts.color ?? C.ink,
    });
  }
  return opts.yTop + lines.length * lh;
}

function rectTop(
  page: PDFPage,
  x: number,
  yTop: number,
  w: number,
  h: number,
  fill: ReturnType<typeof rgb>,
  border?: { color: ReturnType<typeof rgb>; width?: number }
) {
  page.drawRectangle({
    x,
    y: A4_HEIGHT - yTop - h,
    width: w,
    height: h,
    color: fill,
    borderColor: border?.color,
    borderWidth: border?.width,
  });
}

function drawCoverImage(page: PDFPage, img: PDFImage, x: number, yTop: number, w: number, h: number) {
  const iw = img.width || 1;
  const ih = img.height || 1;
  const boxRatio = w / h;
  const imgRatio = iw / ih;
  let drawW = w;
  let drawH = h;
  if (imgRatio > boxRatio) {
    drawH = h;
    drawW = h * imgRatio;
  } else {
    drawW = w;
    drawH = w / imgRatio;
  }
  const dx = x + (w - drawW) / 2;
  const dyTop = yTop + (h - drawH) / 2;
  page.drawImage(img, {
    x: dx,
    y: A4_HEIGHT - dyTop - drawH,
    width: drawW,
    height: drawH,
  });
}

function drawHeaderBand(page: PDFPage, fonts: TextCtx, sectionKicker: string, title: string, slideNum: number, totalTawperPages: number) {
  rectTop(page, 0, 0, A4_WIDTH, 108, C.dark);
  rectTop(page, 0, 108, A4_WIDTH, 4, C.red);
  rectTop(page, 40, 26, 26, 3, C.red);

  page.drawText(pdfSafeText(sectionKicker.toUpperCase()), {
    x: 74,
    y: A4_HEIGHT - 31,
    font: fonts.bold,
    size: 8.5,
    color: rgb(255 / 255, 130 / 255, 138 / 255),
  });
  page.drawText(`TAWPER OS  |  ${String(slideNum).padStart(2, "0")}/${String(totalTawperPages).padStart(2, "0")}`, {
    x: A4_WIDTH - 148,
    y: A4_HEIGHT - 31,
    font: fonts.bold,
    size: 8.5,
    color: C.lightMuted,
  });
  drawLines(page, title, {
    x: 40,
    yTop: 42,
    font: fonts.bold,
    size: 20,
    maxWidth: A4_WIDTH - 80,
    lineHeight: 24,
    color: C.white,
    maxLines: 2,
  });
}

function drawFooterBand(page: PDFPage, fonts: TextCtx, input: ProposalDocumentInput, pageNum: number, totalPages: number) {
  rectTop(page, 0, A4_HEIGHT - 34, A4_WIDTH, 34, C.softBg);
  rectTop(page, 0, A4_HEIGHT - 34, A4_WIDTH, 0.75, C.border);

  const left = pdfSafeText(
    `${input.termos.codigo}  |  ${input.cliente.nomeFantasia}  |  Consultor: ${input.vendedor.nome}`
  );
  const right = `Pag. ${pageNum}/${totalPages}`;

  page.drawText(left.slice(0, 95), {
    x: 40,
    y: 13,
    font: fonts.regular,
    size: 8,
    color: C.muted,
  });
  page.drawText(right, {
    x: A4_WIDTH - 40 - fonts.bold.widthOfTextAtSize(right, 8),
    y: 13,
    font: fonts.bold,
    size: 8,
    color: C.ink,
  });
}

async function tryEmbedImage(doc: PDFDocument, bytes?: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.byteLength < 32) return null;
  try {
    return await doc.embedPng(bytes);
  } catch {
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

export async function buildProposalPdfBytes(
  input: ProposalDocumentInput,
  assets?: {
    logoPngBytes?: Uint8Array | null;
    workshopPhotoBytes?: Uint8Array | null;
    capaHeroBytes?: Uint8Array | null;
    terminaisBytes?: Uint8Array | null;
    coresBytes?: Uint8Array | null;
    prensaBytes?: Uint8Array | null;
    academyBytes?: Uint8Array | null;
    hydrasenseBytes?: Uint8Array | null;
    erpPdfBytes?: Uint8Array | null;
  }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafeText(`Proposta Comercial Tawper - ${input.cliente.nomeFantasia}`));
  doc.setAuthor(pdfSafeText(input.vendedor.nome || "Tawper Mangueiras e Conexoes"));
  doc.setSubject(pdfSafeText(input.termos.codigo));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: TextCtx = { regular, bold };

  const logoImg = await tryEmbedImage(doc, assets?.logoPngBytes);
  const capaImg = await tryEmbedImage(doc, assets?.capaHeroBytes ?? assets?.workshopPhotoBytes);
  const terminaisImg = await tryEmbedImage(doc, assets?.terminaisBytes ?? assets?.workshopPhotoBytes);
  const coresImg = await tryEmbedImage(doc, assets?.coresBytes);
  const prensaImg = await tryEmbedImage(doc, assets?.prensaBytes);
  const academyImg = await tryEmbedImage(doc, assets?.academyBytes ?? assets?.hydrasenseBytes);

  let erpDoc: PDFDocument | null = null;
  if (assets?.erpPdfBytes && assets.erpPdfBytes.byteLength > 100) {
    try {
      erpDoc = await PDFDocument.load(assets.erpPdfBytes, { ignoreEncryption: true });
    } catch {
      erpDoc = null;
    }
  }

  const TAWPER_PAGES = 8;
  const erpPageCount = erpDoc ? erpDoc.getPageCount() : 0;
  const totalPages = TAWPER_PAGES + erpPageCount;

  // ------------------------------------------------------------------
  // PÁGINA 1 — CAPA EXECUTIVA (A4 SEM BORDAS)
  // ------------------------------------------------------------------
  {
    const p1 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    rectTop(p1, 0, 0, A4_WIDTH, A4_HEIGHT, C.dark);
    rectTop(p1, 0, 0, 12, A4_HEIGHT, C.red);

    if (capaImg) {
      drawCoverImage(p1, capaImg, 12, 0, A4_WIDTH - 12, 340);
      p1.drawRectangle({
        x: 12,
        y: A4_HEIGHT - 340,
        width: A4_WIDTH - 12,
        height: 340,
        color: C.dark,
        opacity: 0.72,
      });
    } else {
      rectTop(p1, 12, 0, A4_WIDTH - 12, 340, rgb(20 / 255, 23 / 255, 31 / 255));
    }

    if (logoImg) {
      const ratio = logoImg.width / Math.max(1, logoImg.height);
      const lh = 26;
      p1.drawImage(logoImg, {
        x: 44,
        y: A4_HEIGHT - 40 - lh,
        width: lh * ratio,
        height: lh,
      });
    } else {
      p1.drawText("TAWPER", {
        x: 44,
        y: A4_HEIGHT - 60,
        font: bold,
        size: 20,
        color: C.white,
      });
    }

    const codeLabel = pdfSafeText(`${input.termos.codigo}  |  PROPOSTA COMERCIAL`);
    p1.drawText(codeLabel, {
      x: A4_WIDTH - 40 - bold.widthOfTextAtSize(codeLabel, 9),
      y: A4_HEIGHT - 56,
      font: bold,
      size: 9,
      color: C.lightMuted,
    });

    rectTop(p1, 44, 118, 32, 3, C.red);
    p1.drawText(pdfSafeText(`PREPARADA PARA ${input.cliente.nomeFantasia.toUpperCase()}`), {
      x: 84,
      y: A4_HEIGHT - 123,
      font: bold,
      size: 9.5,
      color: rgb(255 / 255, 138 / 255, 146 / 255),
    });

    const heroEnd = drawLines(p1, "Soluções completas em mangueiras hidráulicas para safra contínua.", {
      x: 44,
      yTop: 142,
      font: bold,
      size: 27,
      maxWidth: A4_WIDTH - 88,
      lineHeight: 33,
      color: C.white,
      maxLines: 3,
    });

    drawLines(
      p1,
      `Tecnologia, padronização de oficina, fornecimento programado e rastreabilidade operacional desenhada para ${input.cliente.nomeFantasia}.`,
      {
        x: 44,
        yTop: heroEnd + 14,
        font: regular,
        size: 11.5,
        maxWidth: A4_WIDTH - 88,
        lineHeight: 16,
        color: C.lightMuted,
        maxLines: 3,
      }
    );

    rectTop(p1, 44, 368, A4_WIDTH - 88, 126, C.darkCard, { color: rgb(46 / 255, 52 / 255, 66 / 255), width: 1 });
    rectTop(p1, 44, 368, 4, 126, C.red);

    p1.drawText("DESTINATÁRIO & UNIDADE", {
      x: 62,
      y: A4_HEIGHT - 392,
      font: bold,
      size: 8.5,
      color: rgb(255 / 255, 138 / 255, 146 / 255),
    });
    drawLines(p1, input.cliente.nomeFantasia, {
      x: 62,
      yTop: 400,
      font: bold,
      size: 16,
      maxWidth: A4_WIDTH - 126,
      lineHeight: 20,
      color: C.white,
      maxLines: 1,
    });
    drawLines(
      p1,
      `${input.cliente.razaoSocial}  |  CNPJ: ${input.cliente.cnpj}  |  ${input.cliente.cidadeUf}`,
      {
        x: 62,
        yTop: 425,
        font: regular,
        size: 9.5,
        maxWidth: A4_WIDTH - 126,
        lineHeight: 14,
        color: C.lightMuted,
        maxLines: 2,
      }
    );
    drawLines(
      p1,
      `A/C: ${input.cliente.destinatarioNome} (${input.cliente.destinatarioCargo})  ${
        input.cliente.destinatarioFone ? `|  Tel/WhatsApp: ${input.cliente.destinatarioFone}` : ""
      }`,
      {
        x: 62,
        yTop: 460,
        font: bold,
        size: 9.5,
        maxWidth: A4_WIDTH - 126,
        lineHeight: 14,
        color: C.white,
        maxLines: 2,
      }
    );

    const boxY = 516;
    const gap = 12;
    const boxW = (A4_WIDTH - 88 - gap * 2) / 3;
    const metrics = [
      { label: "FROTA MAPEADA", value: `${input.frota.numColhedoras} máquinas`, sub: input.frota.marcaFrota },
      { label: "CONDIÇÃO COMERCIAL", value: input.termos.condicaoPagamento, sub: `${input.termos.frete}  |  ${input.termos.prazoEntrega}` },
      {
        label: input.orcamento.valorTotal && input.termos.mostrarValores ? "ORÇAMENTO ERP" : "VALIDADE",
        value:
          input.orcamento.valorTotal && input.termos.mostrarValores
            ? money(input.orcamento.valorTotal)
            : `${input.termos.validadeDias} dias`,
        sub: input.orcamento.numeroExterno
          ? `Orçamento ERP ${input.orcamento.numeroExterno}`
          : `Válida até ${addDaysIso(input.termos.dataEmissao, input.termos.validadeDias)}`,
      },
    ];
    for (let i = 0; i < metrics.length; i++) {
      const mx = 44 + i * (boxW + gap);
      rectTop(p1, mx, boxY, boxW, 102, C.darkCard, { color: rgb(46 / 255, 52 / 255, 66 / 255), width: 1 });
      p1.drawText(pdfSafeText(metrics[i].label), {
        x: mx + 14,
        y: A4_HEIGHT - (boxY + 22),
        font: bold,
        size: 8,
        color: C.lightMuted,
      });
      drawLines(p1, metrics[i].value, {
        x: mx + 14,
        yTop: boxY + 34,
        font: bold,
        size: 13.5,
        maxWidth: boxW - 28,
        lineHeight: 17,
        color: C.white,
        maxLines: 2,
      });
      drawLines(p1, metrics[i].sub, {
        x: mx + 14,
        yTop: boxY + 72,
        font: regular,
        size: 8.5,
        maxWidth: boxW - 28,
        lineHeight: 12,
        color: C.lightMuted,
        maxLines: 2,
      });
    }

    rectTop(p1, 44, 642, A4_WIDTH - 88, 128, C.darkCard, { color: rgb(46 / 255, 52 / 255, 66 / 255), width: 1 });
    p1.drawText("CONSULTOR TÉCNICO RESPONSÁVEL", {
      x: 62,
      y: A4_HEIGHT - 666,
      font: bold,
      size: 8.5,
      color: rgb(255 / 255, 138 / 255, 146 / 255),
    });
    drawLines(p1, `${input.vendedor.nome}  —  ${input.vendedor.cargo}`, {
      x: 62,
      yTop: 676,
      font: bold,
      size: 14,
      maxWidth: A4_WIDTH - 126,
      lineHeight: 18,
      color: C.white,
      maxLines: 1,
    });
    drawLines(
      p1,
      `WhatsApp Comercial: ${input.vendedor.telefone || "A confirmar no cadastro"}   |   E-mail: ${
        input.vendedor.email || "comercial@tawper.com.br"
      }`,
      {
        x: 62,
        yTop: 704,
        font: regular,
        size: 9.5,
        maxWidth: A4_WIDTH - 126,
        lineHeight: 14,
        color: C.lightMuted,
        maxLines: 2,
      }
    );
    p1.drawText(
      pdfSafeText(
        `Emissão: ${fmtIsoDate(input.termos.dataEmissao)}   |   Validade: ${addDaysIso(
          input.termos.dataEmissao,
          input.termos.validadeDias
        )}${erpPageCount > 0 ? `   |   + ${erpPageCount} pág(s). de Orçamento ERP anexo` : ""}`
      ),
      {
        x: 62,
        y: A4_HEIGHT - 746,
        font: bold,
        size: 8.5,
        color: C.white,
      }
    );

    p1.drawText("TAWPER MANGUEIRAS E CONEXÕES  |  DOCUMENTO EXECUTIVO A4 (1/8)", {
      x: 44,
      y: 26,
      font: bold,
      size: 8,
      color: C.lightMuted,
    });
  }

  // ------------------------------------------------------------------
  // PÁGINA 2 — DIAGNÓSTICO DE FROTA & IMPACTO DE PARADA
  // ------------------------------------------------------------------
  {
    const p2 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeaderBand(
      p2,
      fonts,
      "02 · Diagnóstico da Operação",
      `Cenário técnico e riscos operacionais em ${input.cliente.nomeFantasia}`,
      2,
      TAWPER_PAGES
    );

    const specs: Array<[string, string]> = [
      ["Frota Ativa", `${input.frota.numColhedoras} colhedoras / máquinas`],
      ["Fabricantes / Linhas", input.frota.marcaFrota],
      ["Prensa em Oficina", input.frota.prensa],
      ["Terminais / Roscas", input.frota.conector],
      ["Proteção / Espiral", input.frota.espiral],
      ["Fornecedor Atual", input.frota.fornecedorAtual],
      ["Modalidade Sugerida", input.frota.modalidadeAtendimento],
      ["Cidade / UF", input.cliente.cidadeUf],
    ];

    const colW = (A4_WIDTH - 80 - 14) / 2;
    let y = 138;
    for (let i = 0; i < specs.length; i += 2) {
      for (let c = 0; c < 2; c++) {
        const item = specs[i + c];
        const x = 40 + c * (colW + 14);
        rectTop(p2, x, y, colW, 56, C.softBg, { color: C.border, width: 0.75 });
        p2.drawText(pdfSafeText(item[0].toUpperCase()), {
          x: x + 12,
          y: A4_HEIGHT - (y + 18),
          font: bold,
          size: 7.5,
          color: C.muted,
        });
        drawLines(p2, item[1], {
          x: x + 12,
          yTop: y + 26,
          font: bold,
          size: 10.5,
          maxWidth: colW - 24,
          lineHeight: 14,
          color: C.ink,
          maxLines: 2,
        });
      }
      y += 66;
    }

    rectTop(p2, 40, y + 6, A4_WIDTH - 80, 74, C.softRed, { color: rgb(245 / 255, 195 / 255, 198 / 255), width: 1 });
    rectTop(p2, 40, y + 6, 4, 74, C.red);
    p2.drawText("FOCO PRIORITÁRIO DO PROJETO", {
      x: 56,
      y: A4_HEIGHT - (y + 24),
      font: bold,
      size: 8.5,
      color: C.red,
    });
    drawLines(p2, input.frota.gargaloPrincipal, {
      x: 56,
      yTop: y + 32,
      font: regular,
      size: 10.5,
      maxWidth: A4_WIDTH - 108,
      lineHeight: 15,
      color: C.ink,
      maxLines: 3,
    });

    const pTop = y + 102;
    p2.drawText("POR QUE UMA MANGUEIRA NÃO É SÓ UMA MANGUEIRA?", {
      x: 40,
      y: A4_HEIGHT - pTop,
      font: bold,
      size: 11,
      color: C.ink,
    });

    const risks = [
      {
        title: "1. Parada em pico de safra",
        body: "Um único rompimento hidráulico trava a colhedora no talhão, gera deslocamento emergencial de mecânico e reduz o ritmo de entrega na usina.",
      },
      {
        title: "2. Erro de montagem ou prensagem",
        body: "Prensagens fora de especificação, comprimento incorreto ou terminal trocado causam retrabalho repetido e vazamento prematuro sob pico de pressão.",
      },
      {
        title: "3. Falta de padronização na oficina",
        body: "Sem identificação clara de diâmetro, comprimento e aplicação, cada troca depende de medição manual, gerando estoque ocioso ou falta de peça crítica.",
      },
    ];
    let ry = pTop + 16;
    for (const r of risks) {
      rectTop(p2, 40, ry, A4_WIDTH - 80, 62, C.white, { color: C.border, width: 0.75 });
      p2.drawText(pdfSafeText(r.title), {
        x: 54,
        y: A4_HEIGHT - (ry + 18),
        font: bold,
        size: 10,
        color: C.red,
      });
      drawLines(p2, r.body, {
        x: 54,
        yTop: ry + 26,
        font: regular,
        size: 9.5,
        maxWidth: A4_WIDTH - 108,
        lineHeight: 13.5,
        color: C.ink,
        maxLines: 2,
      });
      ry += 72;
    }

    drawFooterBand(p2, fonts, input, 2, totalPages);
  }

  // ------------------------------------------------------------------
  // PÁGINA 3 — PORTFÓLIO TÉCNICO TAWPER
  // ------------------------------------------------------------------
  {
    const p3 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeaderBand(
      p3,
      fonts,
      "03 · Engenharia de Linha Tawper",
      "Mangueiras de alta performance, terminais padronizados e proteção",
      3,
      TAWPER_PAGES
    );

    if (terminaisImg) {
      drawCoverImage(p3, terminaisImg, 40, 134, A4_WIDTH - 80, 196);
      rectTop(p3, 40, 326, A4_WIDTH - 80, 4, C.red);
    }

    const startY = terminaisImg ? 350 : 140;
    const pillars = [
      {
        tag: "MANGUEIRA 2 TRAMAS (15x ISO)",
        title: "Resistência extrema à fadiga por impulso",
        desc: "Desenvolvida para suportar ciclos contínuos de vibração e pressão muito acima do padrão convencional ISO em sistemas de colhedoras e tratores.",
      },
      {
        tag: "LINHA ESPIRALADA 4SH / R13",
        title: "Alta pressão para linha pesada agrícola e industrial",
        desc: "Construção multicamada com foco em estabilidade térmica, raio de curvatura controlado e segurança em circuitos principais.",
      },
      {
        tag: "TERMINAIS & CONEXÕES",
        title: "JIC, ORFS e SAE com vedação precisa",
        desc: "Compatibilidade direta com os padrões Case, John Deere e implementos agrícolas, evitando adaptações improvisadas em campo.",
      },
      {
        tag: "PROTEÇÃO EXTERNA ANTICHAMA",
        title: "Espiral protetor & capa de alta abrasão",
        desc: "Reduz desgaste mecânico por atrito, exposição solar e calor próximo ao motor, preservando a vida útil do conjunto montado.",
      },
    ];

    const cw = (A4_WIDTH - 80 - 14) / 2;
    let y = startY;
    for (let i = 0; i < pillars.length; i += 2) {
      for (let c = 0; c < 2; c++) {
        const item = pillars[i + c];
        const x = 40 + c * (cw + 14);
        rectTop(p3, x, y, cw, 160, C.softBg, { color: C.border, width: 0.75 });
        rectTop(p3, x, y, cw, 4, C.red);
        p3.drawText(pdfSafeText(item.tag), {
          x: x + 14,
          y: A4_HEIGHT - (y + 24),
          font: bold,
          size: 8,
          color: C.red,
        });
        const tEnd = drawLines(p3, item.title, {
          x: x + 14,
          yTop: y + 34,
          font: bold,
          size: 11.5,
          maxWidth: cw - 28,
          lineHeight: 15,
          color: C.ink,
          maxLines: 2,
        });
        drawLines(p3, item.desc, {
          x: x + 14,
          yTop: tEnd + 8,
          font: regular,
          size: 9.5,
          maxWidth: cw - 28,
          lineHeight: 14,
          color: C.muted,
          maxLines: 5,
        });
      }
      y += 174;
    }

    rectTop(p3, 40, 718, A4_WIDTH - 80, 62, C.dark);
    p3.drawText("MODALIDADES FLEXÍVEIS DE ATENDIMENTO", {
      x: 56,
      y: A4_HEIGHT - 738,
      font: bold,
      size: 8.5,
      color: rgb(255 / 255, 138 / 255, 146 / 255),
    });
    drawLines(
      p3,
      "Atuação via Venda Direta, Comodato de Estrutura/Prensa, Locação ou Programas Técnicos conforme perfil da frota — quantidades e preços oficiais detalhados no orçamento ERP anexo.",
      {
        x: 56,
        yTop: 745,
        font: regular,
        size: 9.5,
        maxWidth: A4_WIDTH - 112,
        lineHeight: 13.5,
        color: C.white,
        maxLines: 2,
      }
    );

    drawFooterBand(p3, fonts, input, 3, totalPages);
  }

  // ------------------------------------------------------------------
  // PÁGINA 4 — SISTEMA DE CORES & LACRE DE PROTEÇÃO
  // ------------------------------------------------------------------
  {
    const p4 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeaderBand(
      p4,
      fonts,
      "04 · Padronização Visual em Campo",
      "Sistema de Cores Tawper, Pistola Térmica e Lacre de Proteção",
      4,
      TAWPER_PAGES
    );

    if (coresImg) {
      drawCoverImage(p4, coresImg, 40, 134, A4_WIDTH - 80, 230);
      rectTop(p4, 40, 360, A4_WIDTH - 80, 4, C.red);
    }

    const baseTop = coresImg ? 386 : 140;
    const blocks = [
      {
        title: "Sistema de Cores por Bitola & Especificação",
        text: "Cada bitola e linha de pressão recebe identificação visual imediata. O operador e o almoxarife identificam a mangueira correta em segundos, eliminando erro de separação e reduzindo o tempo de troca no campo.",
      },
      {
        title: "Pistola Térmica & Lacre Termoencolhível Tawper",
        text: "O lacre aplicado na região do terminal sela contra entrada de poeira, umidade e contaminação durante o transporte e estocagem na oficina, além de carregar a identificação padronizada do conjunto.",
      },
      {
        title: "Organização de Bancada e Reposição Inteligente",
        text: "Com códigos visuais padronizados por máquina e circuito hidráulico, a oficina mantém giro previsível das peças de maior criticidade sem travar a equipe mecânica.",
      },
    ];

    let y = baseTop;
    for (let idx = 0; idx < blocks.length; idx++) {
      rectTop(p4, 40, y, A4_WIDTH - 80, 108, C.softBg, { color: C.border, width: 0.75 });
      rectTop(p4, 40, y, 6, 108, idx === 0 ? C.red : idx === 1 ? C.dark : C.muted);
      p4.drawText(pdfSafeText(`0${idx + 1}. ${blocks[idx].title}`), {
        x: 60,
        y: A4_HEIGHT - (y + 24),
        font: bold,
        size: 12,
        color: C.ink,
      });
      drawLines(p4, blocks[idx].text, {
        x: 60,
        yTop: y + 36,
        font: regular,
        size: 10,
        maxWidth: A4_WIDTH - 116,
        lineHeight: 15,
        color: C.muted,
        maxLines: 4,
      });
      y += 122;
    }

    drawFooterBand(p4, fonts, input, 4, totalPages);
  }

  // ------------------------------------------------------------------
  // PÁGINA 5 — OFICINA ESTRUTURADA & PRENSA COM SENSOR FIM DE CURSO
  // ------------------------------------------------------------------
  {
    const p5 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeaderBand(
      p5,
      fonts,
      "05 · Oficina de Alta Confiabilidade",
      "Prensa Hidráulica Tawper com Sensor Fim de Curso",
      5,
      TAWPER_PAGES
    );

    if (prensaImg) {
      drawCoverImage(p5, prensaImg, 40, 134, A4_WIDTH - 80, 236);
      rectTop(p5, 40, 366, A4_WIDTH - 80, 4, C.red);
    }

    const startY = prensaImg ? 392 : 140;
    rectTop(p5, 40, startY, A4_WIDTH - 80, 114, C.dark);
    p5.drawText("PRECISÃO REPETITIVA NA PRENSAGEM", {
      x: 56,
      y: A4_HEIGHT - (startY + 24),
      font: bold,
      size: 9,
      color: rgb(255 / 255, 138 / 255, 146 / 255),
    });
    drawLines(
      p5,
      "O sensor de fim de curso garante que toda prensagem atinja exatamente o diâmetro especificado pela engenharia Tawper — sem depender da sensibilidade individual do operador.",
      {
        x: 56,
        yTop: startY + 34,
        font: regular,
        size: 10.5,
        maxWidth: A4_WIDTH - 112,
        lineHeight: 15.5,
        color: C.white,
        maxLines: 4,
      }
    );

    const cardW = (A4_WIDTH - 80 - 14) / 2;
    const gy = startY + 132;
    const ganhos = [
      {
        t: "Zero subprensagem ou esmagamento",
        d: "Evita vazamento precoce no terminal ou dano interno na trama da mangueira logo nas primeiras horas de trabalho.",
      },
      {
        t: "Implantação guiada na oficina",
        d: "Avaliação técnica da estrutura existente da usina com opções de venda ou comodato conforme o projeto aprovado.",
      },
      {
        t: "Troca rápida de castanhas e kits",
        d: "Tabela visual de prensagem diretamente junto à máquina para operação ágil em turnos de safra 24h.",
      },
      {
        t: "Menor custo total por hora colhida",
        d: "Menos retrabalho na oficina significa mais disponibilidade mecânica da frota no talhão.",
      },
    ];
    for (let i = 0; i < ganhos.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 40 + col * (cardW + 14);
      const y = gy + row * 116;
      rectTop(p5, x, y, cardW, 102, C.softBg, { color: C.border, width: 0.75 });
      p5.drawText(pdfSafeText(ganhos[i].t), {
        x: x + 14,
        y: A4_HEIGHT - (y + 22),
        font: bold,
        size: 10.5,
        color: C.ink,
      });
      drawLines(p5, ganhos[i].d, {
        x: x + 14,
        yTop: y + 32,
        font: regular,
        size: 9.5,
        maxWidth: cardW - 28,
        lineHeight: 14,
        color: C.muted,
        maxLines: 4,
      });
    }

    drawFooterBand(p5, fonts, input, 5, totalPages);
  }

  // ------------------------------------------------------------------
  // PÁGINA 6 — TAWPER ACADEMY & HYDRASENSE
  // ------------------------------------------------------------------
  {
    const p6 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeaderBand(
      p6,
      fonts,
      "06 · Capacitação & Inteligência Digital",
      "Tawper Academy + HydraSense: equipe treinada e frota rastreada",
      6,
      TAWPER_PAGES
    );

    if (academyImg) {
      drawCoverImage(p6, academyImg, 40, 134, A4_WIDTH - 80, 210);
      rectTop(p6, 40, 340, A4_WIDTH - 80, 4, C.red);
    }

    const yBase = academyImg ? 366 : 140;
    const colW = (A4_WIDTH - 80 - 16) / 2;

    rectTop(p6, 40, yBase, colW, 390, C.softBg, { color: C.border, width: 0.75 });
    rectTop(p6, 40, yBase, colW, 5, C.red);
    p6.drawText("TAWPER ACADEMY", {
      x: 54,
      y: A4_HEIGHT - (yBase + 26),
      font: bold,
      size: 12,
      color: C.red,
    });
    const aItems = [
      "Treinamento prático presencial na oficina da unidade para mecânicos e almoxarifes.",
      "Boas práticas de corte, descascamento, escolha de terminal, prensagem e instalação sem torção.",
      "Prevenção de falhas por atrito, raio mínimo de curvatura e calor excessivo.",
      "Certificação da equipe para manter o padrão mesmo na troca de turnos de safra.",
    ];
    let ay = yBase + 40;
    for (const txt of aItems) {
      ay = drawLines(p6, `- ${txt}`, {
        x: 54,
        yTop: ay,
        font: regular,
        size: 9.5,
        maxWidth: colW - 28,
        lineHeight: 14,
        color: C.ink,
        maxLines: 4,
      });
      ay += 10;
    }

    const hx = 40 + colW + 16;
    rectTop(p6, hx, yBase, colW, 390, C.dark);
    rectTop(p6, hx, yBase, colW, 5, C.red);
    p6.drawText("HYDRASENSE", {
      x: hx + 14,
      y: A4_HEIGHT - (yBase + 26),
      font: bold,
      size: 12,
      color: C.white,
    });
    const hItems = [
      "Mapeamento e identificação individual de mangueiras críticas por QR Code / tag em cada máquina.",
      "Histórico de trocas por colhedora e ponto hidráulico para antecipar manutenções preventivas.",
      "Redução drástica do tempo de identificação em campo: basta consultar o ponto da máquina.",
      "Relatórios de consumo e confiabilidade para a gestão de manutenção da usina.",
    ];
    let hy = yBase + 40;
    for (const txt of hItems) {
      hy = drawLines(p6, `- ${txt}`, {
        x: hx + 14,
        yTop: hy,
        font: regular,
        size: 9.5,
        maxWidth: colW - 28,
        lineHeight: 14,
        color: C.lightMuted,
        maxLines: 4,
      });
      hy += 10;
    }

    drawFooterBand(p6, fonts, input, 6, totalPages);
  }

  // ------------------------------------------------------------------
  // PÁGINA 7 — ORÇAMENTO ERP ANEXO & CONDIÇÕES COMERCIAIS
  // ------------------------------------------------------------------
  {
    const p7 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeaderBand(
      p7,
      fonts,
      "07 · Investimento & Condições Comerciais",
      "Orçamento oficial do ERP Tawper e diretrizes de fornecimento",
      7,
      TAWPER_PAGES
    );

    rectTop(p7, 40, 136, A4_WIDTH - 80, 260, C.softBg, { color: C.border, width: 1 });
    rectTop(p7, 40, 136, A4_WIDTH - 80, 4, C.red);

    p7.drawText("ORÇAMENTO VINCULADO (ERP TAWPER)", {
      x: 56,
      y: A4_HEIGHT - 160,
      font: bold,
      size: 9,
      color: C.red,
    });

    const erpTitle = input.orcamento.numeroExterno
      ? `Orçamento N. ${input.orcamento.numeroExterno}`
      : "Escopo Técnico & Orçamento Oficial";
    p7.drawText(pdfSafeText(erpTitle), {
      x: 56,
      y: A4_HEIGHT - 182,
      font: bold,
      size: 15,
      color: C.ink,
    });

    if (input.termos.mostrarValores && input.orcamento.valorTotal && input.orcamento.valorTotal > 0) {
      const valText = money(input.orcamento.valorTotal);
      p7.drawText(pdfSafeText(valText), {
        x: A4_WIDTH - 56 - bold.widthOfTextAtSize(pdfSafeText(valText), 17),
        y: A4_HEIGHT - 182,
        font: bold,
        size: 17,
        color: C.red,
      });
    }

    let ey = drawLines(p7, input.orcamento.resumoEscopo, {
      x: 56,
      yTop: 196,
      font: regular,
      size: 10,
      maxWidth: A4_WIDTH - 112,
      lineHeight: 14.5,
      color: C.ink,
      maxLines: 4,
    });

    ey += 10;
    const destaques = input.orcamento.destaques.slice(0, 4);
    for (const d of destaques) {
      ey = drawLines(p7, `+ ${d}`, {
        x: 60,
        yTop: ey,
        font: bold,
        size: 9.2,
        maxWidth: A4_WIDTH - 120,
        lineHeight: 13.5,
        color: C.ink,
        maxLines: 2,
      });
      ey += 4;
    }

    const attachMsg =
      erpPageCount > 0
        ? `Anexo integrante: ${erpPageCount} página(s) original(is) do orçamento ERP anexada(s) na sequência deste PDF (páginas ${
            TAWPER_PAGES + 1
          } a ${totalPages}).`
        : "Detalhamento de códigos, quantidades e valores unitários conforme orçamento emitido no ERP Tawper.";
    p7.drawText(pdfSafeText(attachMsg), {
      x: 56,
      y: A4_HEIGHT - 380,
      font: bold,
      size: 8.5,
      color: erpPageCount > 0 ? C.green : C.muted,
    });

    const condTop = 418;
    p7.drawText("CONDIÇÕES COMERCIAIS PADRÃO", {
      x: 40,
      y: A4_HEIGHT - condTop,
      font: bold,
      size: 11,
      color: C.ink,
    });

    const rows: Array<[string, string]> = [
      ["Condição de Pagamento", input.termos.condicaoPagamento],
      [
        "Validade da Proposta",
        `${input.termos.validadeDias} dias corridos (até ${addDaysIso(
          input.termos.dataEmissao,
          input.termos.validadeDias
        )})`,
      ],
      ["Frete & Logística", input.termos.frete],
      ["Prazo de Entrega", input.termos.prazoEntrega],
      ["Garantia & Suporte", input.termos.garantia],
    ];

    let ry = condTop + 14;
    for (let i = 0; i < rows.length; i++) {
      rectTop(p7, 40, ry, A4_WIDTH - 80, 44, i % 2 === 0 ? C.softBg : C.white, {
        color: C.border,
        width: 0.75,
      });
      p7.drawText(pdfSafeText(rows[i][0]), {
        x: 54,
        y: A4_HEIGHT - (ry + 18),
        font: bold,
        size: 9,
        color: C.muted,
      });
      drawLines(p7, rows[i][1], {
        x: 210,
        yTop: ry + 11,
        font: bold,
        size: 9.8,
        maxWidth: A4_WIDTH - 264,
        lineHeight: 13.5,
        color: C.ink,
        maxLines: 2,
      });
      ry += 44;
    }

    if (input.termos.observacoes) {
      drawLines(p7, `Observações: ${input.termos.observacoes}`, {
        x: 40,
        yTop: ry + 14,
        font: regular,
        size: 8.8,
        maxWidth: A4_WIDTH - 80,
        lineHeight: 13,
        color: C.muted,
        maxLines: 4,
      });
    }

    drawFooterBand(p7, fonts, input, 7, totalPages);
  }

  // ------------------------------------------------------------------
  // PÁGINA 8 — CRONOGRAMA DE IMPLANTAÇÃO & ACEITE / CONTATO
  // ------------------------------------------------------------------
  {
    const p8 = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeaderBand(
      p8,
      fonts,
      "08 · Próximos Passos & Aceite",
      "Implantação em 4 etapas e canal direto Tawper",
      8,
      TAWPER_PAGES
    );

    const steps = [
      {
        n: "01",
        t: "Aprovação do Orçamento ERP & Alinhamento de Frota",
        d: `Validação do orçamento ${input.orcamento.numeroExterno || "oficial"} e confirmação das criticidades para as ${
          input.frota.numColhedoras
        } máquinas.`,
      },
      {
        n: "02",
        t: "Entrega Programada & Estruturação da Oficina",
        d: `Despacho conforme prazo (${input.termos.prazoEntrega}), instalação da prensa com sensor e organização dos kits por sistema de cores.`,
      },
      {
        n: "03",
        t: "Capacitação Presencial — Tawper Academy",
        d: "Treinamento prático da equipe mecânica, boas práticas de montagem e entrega dos lacres de proteção.",
      },
      {
        n: "04",
        t: "Acompanhamento Contínuo — HydraSense",
        d: "Revisões periódicas de desempenho, indicadores de reposição e suporte direto ao time de manutenção.",
      },
    ];

    let sy = 138;
    for (const st of steps) {
      rectTop(p8, 40, sy, A4_WIDTH - 80, 68, C.softBg, { color: C.border, width: 0.75 });
      rectTop(p8, 40, sy, 46, 68, C.dark);
      p8.drawText(st.n, {
        x: 54,
        y: A4_HEIGHT - (sy + 39),
        font: bold,
        size: 16,
        color: C.white,
      });
      p8.drawText(pdfSafeText(st.t), {
        x: 100,
        y: A4_HEIGHT - (sy + 21),
        font: bold,
        size: 11,
        color: C.ink,
      });
      drawLines(p8, st.d, {
        x: 100,
        yTop: sy + 30,
        font: regular,
        size: 9.5,
        maxWidth: A4_WIDTH - 154,
        lineHeight: 13.5,
        color: C.muted,
        maxLines: 2,
      });
      sy += 80;
    }

    rectTop(p8, 40, sy + 10, A4_WIDTH - 80, 126, C.dark);
    rectTop(p8, 40, sy + 10, 6, 126, C.red);
    p8.drawText("CONTATO DIRETO DO CONSULTOR TAWPER", {
      x: 62,
      y: A4_HEIGHT - (sy + 34),
      font: bold,
      size: 9,
      color: rgb(255 / 255, 138 / 255, 146 / 255),
    });
    drawLines(p8, `${input.vendedor.nome}  (${input.vendedor.cargo})`, {
      x: 62,
      yTop: sy + 44,
      font: bold,
      size: 15,
      maxWidth: A4_WIDTH - 124,
      lineHeight: 19,
      color: C.white,
      maxLines: 1,
    });
    drawLines(
      p8,
      `WhatsApp Comercial: ${input.vendedor.telefone || "Solicitar número"}   |   E-mail: ${input.vendedor.email}`,
      {
        x: 62,
        yTop: sy + 72,
        font: bold,
        size: 10.5,
        maxWidth: A4_WIDTH - 124,
        lineHeight: 15,
        color: C.white,
        maxLines: 2,
      }
    );
    p8.drawText(
      pdfSafeText(
        `Cliente: ${input.cliente.nomeFantasia}  |  A/C: ${input.cliente.destinatarioNome}  |  Proposta ${input.termos.codigo}`
      ),
      {
        x: 62,
        y: A4_HEIGHT - (sy + 114),
        font: regular,
        size: 8.8,
        color: C.lightMuted,
      }
    );

    const sigY = sy + 158;
    rectTop(p8, 40, sigY, A4_WIDTH - 80, 118, C.white, { color: C.border, width: 0.75 });
    p8.drawText("ACEITE FORMAL DA PROPOSTA & ORÇAMENTO ANEXO", {
      x: 56,
      y: A4_HEIGHT - (sigY + 22),
      font: bold,
      size: 8.5,
      color: C.muted,
    });
    const half = (A4_WIDTH - 112 - 24) / 2;
    rectTop(p8, 56, sigY + 72, half, 0.75, C.ink);
    p8.drawText(pdfSafeText(input.cliente.destinatarioNome || input.cliente.nomeFantasia), {
      x: 56,
      y: A4_HEIGHT - (sigY + 86),
      font: bold,
      size: 8.5,
      color: C.ink,
    });
    p8.drawText(pdfSafeText(`${input.cliente.nomeFantasia}  |  Data: ____/____/______`), {
      x: 56,
      y: A4_HEIGHT - (sigY + 99),
      font: regular,
      size: 8,
      color: C.muted,
    });

    const rx = 56 + half + 24;
    rectTop(p8, rx, sigY + 72, half, 0.75, C.ink);
    p8.drawText(pdfSafeText(input.vendedor.nome), {
      x: rx,
      y: A4_HEIGHT - (sigY + 86),
      font: bold,
      size: 8.5,
      color: C.ink,
    });
    p8.drawText("Tawper Mangueiras e Conexões", {
      x: rx,
      y: A4_HEIGHT - (sigY + 99),
      font: regular,
      size: 8,
      color: C.muted,
    });

    drawFooterBand(p8, fonts, input, 8, totalPages);
  }

  // ------------------------------------------------------------------
  // ANEXO AUTOMÁTICO: TODAS AS PÁGINAS DO ORÇAMENTO ERP
  // ------------------------------------------------------------------
  if (erpDoc && erpPageCount > 0) {
    const copied = await doc.copyPages(erpDoc, erpDoc.getPageIndices());
    for (const p of copied) {
      doc.addPage(p);
    }
  }

  return doc.save();
}
