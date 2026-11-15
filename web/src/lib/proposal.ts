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
        "Padronização da montagem de conjuntos hidráulicos na unidade, redução do tempo de máquina parada por rompimento e rastreabilidade individual HydraSense.",
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
// PDF ENGINE — 9 SLIDES OFICIAIS TAWPER (A4 PAISAGEM SEM BORDAS: 841.89 x 595.28 pt)
// SEGUINDO FIELMENTE O DESIGN SYSTEM DA APRESENTAÇÃO HTML + ANEXO DO PDF DO ERP
// =====================================================================

const W = 841.89; // 297mm (A4 Landscape sem bordas)
const H = 595.28; // 210mm

const C = {
  blue: rgb(41 / 255, 56 / 255, 127 / 255),     // --blue: #29387f
  red: rgb(227 / 255, 28 / 255, 63 / 255),      // --red: #e31c3f
  ink: rgb(20 / 255, 29 / 255, 53 / 255),       // --ink: #141d35
  hydraDark: rgb(23 / 255, 30 / 255, 37 / 255), // #171e25
  paper: rgb(245 / 255, 245 / 255, 242 / 255),  // --paper: #f5f5f2
  orange: rgb(246 / 255, 107 / 255, 22 / 255),  // --orange: #f66b16
  muted: rgb(98 / 255, 107 / 255, 125 / 255),   // --muted: #626b7d
  lightMuted: rgb(195 / 255, 204 / 255, 223 / 255),
  pinkAccent: rgb(255 / 255, 141 / 255, 163 / 255),
  line: rgb(220 / 255, 224 / 255, 232 / 255),   // --line: #dce0e8
  white: rgb(1, 1, 1),
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
  const lh = opts.lineHeight ?? opts.size * 1.28;
  let lines = wrapLines(text, opts.font, opts.size, opts.maxWidth);
  if (opts.maxLines && lines.length > opts.maxLines) {
    lines = lines.slice(0, opts.maxLines);
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = last.length > 4 ? `${last.slice(0, last.length - 3)}...` : last;
  }
  for (let i = 0; i < lines.length; i++) {
    const yPdf = H - (opts.yTop + i * lh + opts.size);
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
    y: H - yTop - h,
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
    y: H - dyTop - drawH,
    width: drawW,
    height: drawH,
  });
}

function drawTopbarAndFooter(
  page: PDFPage,
  fonts: TextCtx,
  opts: {
    topic: string;
    footerLeft: string;
    slideNum: number;
    totalSlides: number;
    dark?: boolean;
    logoImg?: PDFImage | null;
  }
) {
  const textColor = opts.dark ? C.white : C.ink;
  const mutedColor = opts.dark ? C.lightMuted : C.muted;

  if (opts.logoImg && opts.dark) {
    const ratio = opts.logoImg.width / Math.max(1, opts.logoImg.height);
    const lh = 22;
    page.drawImage(opts.logoImg, {
      x: 42,
      y: H - 26 - lh,
      width: lh * ratio,
      height: lh,
    });
  } else {
    page.drawText("Tawper", {
      x: 42,
      y: H - 44,
      font: fonts.bold,
      size: 20,
      color: opts.dark ? C.white : C.blue,
    });
    rectTop(page, 42, 48, 22, 3, C.red);
  }

  const topicClean = pdfSafeText(opts.topic.toUpperCase());
  page.drawText(topicClean, {
    x: W - 42 - fonts.bold.widthOfTextAtSize(topicClean, 8.5),
    y: H - 40,
    font: fonts.bold,
    size: 8.5,
    color: mutedColor,
  });

  const footLeft = pdfSafeText(opts.footerLeft.toUpperCase());
  const pageStr = `${String(opts.slideNum).padStart(2, "0")} / ${String(opts.totalSlides).padStart(2, "0")}`;
  page.drawText(footLeft, {
    x: 42,
    y: 18,
    font: fonts.regular,
    size: 7.5,
    color: mutedColor,
  });
  page.drawText(pageStr, {
    x: W - 42 - fonts.bold.widthOfTextAtSize(pageStr, 8),
    y: 18,
    font: fonts.bold,
    size: 8,
    color: textColor,
  });
}

function drawKicker(page: PDFPage, fonts: TextCtx, x: number, yTop: number, text: string, color: ReturnType<typeof rgb>, barColor = C.red) {
  rectTop(page, x, yTop + 3, 18, 2.5, barColor);
  page.drawText(pdfSafeText(text.toUpperCase()), {
    x: x + 26,
    y: H - (yTop + 8),
    font: fonts.bold,
    size: 9,
    color,
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
    reliabilityBytes?: Uint8Array | null;
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
  const relImg = await tryEmbedImage(doc, assets?.reliabilityBytes);
  const terminaisImg = await tryEmbedImage(doc, assets?.terminaisBytes ?? assets?.workshopPhotoBytes);
  const prensaImg = await tryEmbedImage(doc, assets?.prensaBytes);
  const hydraImg = await tryEmbedImage(doc, assets?.hydrasenseBytes ?? assets?.academyBytes);

  let erpDoc: PDFDocument | null = null;
  if (assets?.erpPdfBytes && assets.erpPdfBytes.byteLength > 100) {
    try {
      erpDoc = await PDFDocument.load(assets.erpPdfBytes, { ignoreEncryption: true });
    } catch {
      erpDoc = null;
    }
  }

  const TAWPER_SLIDES = 9;
  const erpPageCount = erpDoc ? erpDoc.getPageCount() : 0;
  const nomeCliente = input.cliente.nomeFantasia || input.cliente.razaoSocial || "Cliente Parceiro";
  const emissaoFmt = fmtIsoDate(input.termos.dataEmissao);
  const validadeFmt = addDaysIso(input.termos.dataEmissao, input.termos.validadeDias);

  // ------------------------------------------------------------------
  // SLIDE 01 — CAPA OFICIAL PERSONALIZADA (cover cover-revised proposal-cover)
  // ------------------------------------------------------------------
  {
    const s1 = doc.addPage([W, H]);
    rectTop(s1, 0, 0, W, H, C.ink);
    if (capaImg) {
      drawCoverImage(s1, capaImg, 0, 0, W, H);
      s1.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.ink, opacity: 0.78 });
    }
    drawTopbarAndFooter(s1, fonts, {
      topic: `PROPOSTA COMERCIAL · ${input.termos.codigo}`,
      footerLeft: `TAWPER · PROPOSTA ${input.termos.codigo} · ${nomeCliente}`,
      slideNum: 1,
      totalSlides: TAWPER_SLIDES,
      dark: true,
      logoImg,
    });

    drawKicker(
      s1,
      fonts,
      42,
      115,
      `PREPARADO PARA ${nomeCliente}${input.cliente.cidadeUf ? ` · ${input.cliente.cidadeUf}` : ""}`,
      C.white
    );

    const hEnd = drawLines(s1, "Soluções completas em mangueiras hidráulicas", {
      x: 42,
      yTop: 140,
      font: bold,
      size: 42,
      maxWidth: 560,
      lineHeight: 46,
      color: C.white,
      maxLines: 2,
    });

    drawLines(
      s1,
      `Tecnologia, padronização de oficina, fornecimento direto e rastreabilidade para a operação da ${nomeCliente}.`,
      {
        x: 42,
        yTop: hEnd + 18,
        font: regular,
        size: 15,
        maxWidth: 460,
        lineHeight: 21,
        color: C.lightMuted,
        maxLines: 3,
      }
    );

    rectTop(s1, 42, 488, W - 84, 42, C.ink, { color: rgb(45 / 255, 58 / 255, 92 / 255), width: 1 });
    rectTop(s1, 42, 488, 4, 42, C.red);
    drawLines(
      s1,
      `A/C ${input.cliente.destinatarioNome} (${input.cliente.destinatarioCargo})  ·  Consultor Tawper: ${input.vendedor.nome}${
        input.vendedor.telefone ? ` (${input.vendedor.telefone})` : ""
      }  ·  Emissão: ${emissaoFmt}`,
      {
        x: 58,
        yTop: 502,
        font: bold,
        size: 10.5,
        maxWidth: W - 116,
        lineHeight: 14,
        color: C.white,
        maxLines: 1,
      }
    );
  }

  // ------------------------------------------------------------------
  // SLIDE 02 — DIAGNÓSTICO OPERACIONAL DO CLIENTE (.company-story .proposal-diagnosis)
  // ------------------------------------------------------------------
  {
    const s2 = doc.addPage([W, H]);
    rectTop(s2, 0, 0, W, H, C.white);
    drawTopbarAndFooter(s2, fonts, {
      topic: `DIAGNÓSTICO DO CLIENTE · ${input.termos.codigo}`,
      footerLeft: `TAWPER · DIAGNÓSTICO OPERACIONAL · ${nomeCliente}`,
      slideNum: 2,
      totalSlides: TAWPER_SLIDES,
    });

    drawKicker(s2, fonts, 42, 82, "CENÁRIO OPERACIONAL MAPEADO", C.ink);
    drawLines(s2, `A operação da ${nomeCliente} no centro da proposta.`, {
      x: 42,
      yTop: 104,
      font: bold,
      size: 30,
      maxWidth: 430,
      lineHeight: 34,
      color: C.ink,
      maxLines: 2,
    });

    const cells = [
      { idx: "01 · UNIDADE / EMPRESA", val: input.cliente.razaoSocial || nomeCliente, sub: `CNPJ: ${input.cliente.cnpj}` },
      { idx: "02 · LOCALIZAÇÃO", val: input.cliente.cidadeUf, sub: input.cliente.endereco || "Unidade operacional" },
      { idx: "03 · DESTINATÁRIO", val: input.cliente.destinatarioNome, sub: input.cliente.destinatarioCargo },
      { idx: "04 · CONSULTOR DEDICADO", val: input.vendedor.nome, sub: `WhatsApp: ${input.vendedor.telefone || "Atendimento direto"}` },
    ];
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = 42 + col * 206;
      const cy = 200 + row * 92;
      rectTop(s2, cx, cy, 192, 2, C.blue);
      s2.drawText(pdfSafeText(cells[i].idx), { x: cx, y: H - (cy + 16), font: bold, size: 7.5, color: C.red });
      drawLines(s2, cells[i].val, { x: cx, yTop: cy + 24, font: bold, size: 11.5, maxWidth: 192, lineHeight: 14, color: C.ink, maxLines: 2 });
      drawLines(s2, cells[i].sub, { x: cx, yTop: cy + 54, font: regular, size: 9, maxWidth: 192, lineHeight: 12, color: C.muted, maxLines: 2 });
    }

    rectTop(s2, 42, 398, 400, 120, C.paper);
    rectTop(s2, 42, 398, 4, 120, C.red);
    s2.drawText("OBJETIVO TÉCNICO E DIRETRIZES DA IMPLANTAÇÃO", {
      x: 56,
      y: H - 418,
      font: bold,
      size: 7.5,
      color: C.blue,
    });
    drawLines(s2, input.frota.gargaloPrincipal, {
      x: 56,
      yTop: 428,
      font: regular,
      size: 10.5,
      maxWidth: 374,
      lineHeight: 15,
      color: C.ink,
      maxLines: 5,
    });

    // Right blue panel (.story-path)
    rectTop(s2, 468, 174, 332, 344, C.blue);
    const fleetItems = [
      {
        n: "01",
        t: `Frota mapeada: ${input.frota.numColhedoras} máquina(s)`,
        d: `Equipamentos de referência: ${input.frota.marcaFrota}.`,
      },
      {
        n: "02",
        t: "Estrutura de prensagem na oficina",
        d: `Configuração prevista: ${input.frota.prensa} com sistema visual de cores.`,
      },
      {
        n: "03",
        t: "Padrão atual e evolução Tawper",
        d: `Referência atual (${input.frota.fornecedorAtual}) -> Padronização Tawper + HydraSense.`,
      },
    ];
    for (let i = 0; i < fleetItems.length; i++) {
      const fy = 198 + i * 106;
      s2.drawText(fleetItems[i].n, { x: 492, y: H - (fy + 16), font: bold, size: 15, color: C.pinkAccent });
      drawLines(s2, fleetItems[i].t, { x: 534, yTop: fy + 2, font: bold, size: 13.5, maxWidth: 246, lineHeight: 17, color: C.white, maxLines: 2 });
      drawLines(s2, fleetItems[i].d, { x: 534, yTop: fy + 40, font: regular, size: 10.5, maxWidth: 246, lineHeight: 14, color: C.lightMuted, maxLines: 3 });
      if (i < 2) rectTop(s2, 492, fy + 92, 286, 0.75, rgb(95 / 255, 110 / 255, 170 / 255));
    }
  }

  // ------------------------------------------------------------------
  // SLIDE 03 — QUALIDADE DA LINHA TAWPER (+8 ANOS NO MERCADO)
  // ------------------------------------------------------------------
  {
    const s3 = doc.addPage([W, H]);
    rectTop(s3, 0, 0, W, H, C.blue);
    if (relImg) {
      drawCoverImage(s3, relImg, 360, 0, W - 360, H);
      s3.drawRectangle({ x: 360, y: 0, width: 180, height: H, color: C.blue, opacity: 0.72 });
    }
    drawTopbarAndFooter(s3, fonts, {
      topic: "A TAWPER",
      footerLeft: "TAWPER · CONFIABILIDADE COMPROVADA",
      slideNum: 3,
      totalSlides: TAWPER_SLIDES,
      dark: true,
      logoImg,
    });

    drawKicker(s3, fonts, 42, 90, "QUALIDADE COMPROVADA EM CAMPO", C.white);
    drawLines(s3, "Qualidade da linha Tawper.", {
      x: 42,
      yTop: 112,
      font: bold,
      size: 32,
      maxWidth: 420,
      lineHeight: 36,
      color: C.white,
    });

    s3.drawText("Mais de 8 anos", {
      x: 42,
      y: H - 245,
      font: bold,
      size: 46,
      color: C.white,
    });
    drawLines(
      s3,
      "no mercado entregando confiabilidade e mais de 2 milhões de metros de mangueiras vendidos sem histórico de defeito de fabricação.",
      {
        x: 42,
        yTop: 262,
        font: regular,
        size: 20,
        maxWidth: 410,
        lineHeight: 27,
        color: C.white,
        maxLines: 5,
      }
    );
  }

  // ------------------------------------------------------------------
  // SLIDE 04 — O IMPACTO DA PARADA (R$ 7.700 / 9,1%)
  // ------------------------------------------------------------------
  {
    const s4 = doc.addPage([W, H]);
    rectTop(s4, 0, 0, W, H, C.white);
    drawTopbarAndFooter(s4, fonts, {
      topic: "O IMPACTO",
      footerLeft: "TAWPER · SIMULAÇÃO DE PARADA",
      slideNum: 4,
      totalSlides: TAWPER_SLIDES,
    });

    drawKicker(s4, fonts, 42, 82, "SIMULAÇÃO DE 1 HORA DE MÁQUINA PARADA", C.ink);
    drawLines(s4, "A mangueira é apenas uma parte da conta.", {
      x: 42,
      yTop: 104,
      font: bold,
      size: 32,
      maxWidth: 720,
      lineHeight: 36,
      color: C.ink,
    });

    s4.drawText("R$", { x: 42, y: H - 228, font: bold, size: 18, color: C.ink });
    s4.drawText("7.700", { x: 42, y: H - 292, font: bold, size: 68, color: C.ink });
    drawLines(s4, "Custo estimado em 1 hora de colhedora parada durante a safra.", {
      x: 42,
      yTop: 310,
      font: regular,
      size: 12,
      maxWidth: 260,
      lineHeight: 16,
      color: C.muted,
    });

    s4.drawText("9,1%", { x: 42, y: H - 418, font: bold, size: 36, color: C.red });
    drawLines(s4, "A mangueira representa apenas 9,1% do prejuízo total do evento.", {
      x: 140,
      yTop: 390,
      font: regular,
      size: 12,
      maxWidth: 200,
      lineHeight: 16,
      color: C.ink,
    });

    const bars = [
      { label: "Colheita interrompida (produção)", val: "R$ 5.000", pct: 1.0 },
      { label: "Conjunto de mangueira + conexões", val: "R$ 700", pct: 0.18 },
      { label: "Óleo hidráulico perdido", val: "R$ 1.500", pct: 0.34 },
      { label: "Deslocamento + hora mecânica", val: "R$ 500", pct: 0.14 },
    ];
    for (let i = 0; i < bars.length; i++) {
      const by = 210 + i * 64;
      s4.drawText(pdfSafeText(bars[i].label), { x: 390, y: H - (by + 14), font: regular, size: 12, color: C.ink });
      const vw = bold.widthOfTextAtSize(bars[i].val, 16);
      s4.drawText(bars[i].val, { x: W - 42 - vw, y: H - (by + 14), font: bold, size: 16, color: C.ink });
      rectTop(s4, 390, by + 22, 409, 10, C.line);
      rectTop(s4, 390, by + 22, Math.max(12, 409 * bars[i].pct), 10, C.blue);
    }

    rectTop(s4, 42, 500, W - 84, 0.75, C.line);
    s4.drawText("Valores médios de referência operacional em frentes de colheita mecanizada.", {
      x: 42,
      y: H - 522,
      font: regular,
      size: 9.5,
      color: C.muted,
    });
  }

  // ------------------------------------------------------------------
  // SLIDE 05 — MANGUEIRAS DE TECNOLOGIA EUROPEIA (ISO · MSHA · CCS)
  // ------------------------------------------------------------------
  {
    const s5 = doc.addPage([W, H]);
    rectTop(s5, 0, 0, W, H, C.white);
    drawTopbarAndFooter(s5, fonts, {
      topic: "DIFERENCIAIS TAWPER",
      footerLeft: "TAWPER · ENGENHARIA DE PRODUTO",
      slideNum: 5,
      totalSlides: TAWPER_SLIDES,
    });

    drawKicker(s5, fonts, 42, 82, "ALTA PERFORMANCE HIDRÁULICA", C.ink);
    drawLines(s5, "Mangueiras de tecnologia europeia.", {
      x: 42,
      yTop: 104,
      font: bold,
      size: 32,
      maxWidth: 380,
      lineHeight: 36,
      color: C.ink,
    });

    drawLines(
      s5,
      "Projetadas para resistir a picos severos de pressão, temperatura elevada e abrasão contínua em colhedoras de cana e linha pesada.",
      {
        x: 42,
        yTop: 190,
        font: regular,
        size: 13,
        maxWidth: 360,
        lineHeight: 18,
        color: C.ink,
      }
    );

    rectTop(s5, 42, 268, 360, 1, C.line);
    s5.drawText("Resistência comprovada em teste de impulso", { x: 42, y: H - 292, font: bold, size: 13.5, color: C.ink });
    drawLines(
      s5,
      "Linha de 2 tramas de aço testada com até 15 vezes mais ciclos que o exigido pela norma ISO, além das linhas espiraladas 4SH e R13.",
      {
        x: 42,
        yTop: 302,
        font: regular,
        size: 11,
        maxWidth: 360,
        lineHeight: 15.5,
        color: C.muted,
      }
    );

    rectTop(s5, 42, 378, 4, 68, C.red);
    s5.drawText("CERTIFICAÇÕES INTERNACIONAIS", { x: 58, y: H - 392, font: regular, size: 9, color: C.muted });
    s5.drawText("ISO  ·  MSHA  ·  CCS", { x: 58, y: H - 418, font: bold, size: 22, color: C.blue });
    s5.drawText("Padrão global de segurança e capa antichama.", { x: 58, y: H - 438, font: regular, size: 10.5, color: C.ink });

    if (terminaisImg) {
      drawCoverImage(s5, terminaisImg, 430, 110, 370, 400);
    }
  }

  // ------------------------------------------------------------------
  // SLIDE 06 — PRENSAGEM PADRONIZADA & SISTEMA DE CORES
  // ------------------------------------------------------------------
  {
    const s6 = doc.addPage([W, H]);
    rectTop(s6, 0, 0, W, H, C.blue);
    drawTopbarAndFooter(s6, fonts, {
      topic: "A SOLUÇÃO NA OFICINA",
      footerLeft: "TAWPER · PRENSAGEM PADRONIZADA & SISTEMA DE CORES",
      slideNum: 6,
      totalSlides: TAWPER_SLIDES,
      dark: true,
      logoImg,
    });

    if (prensaImg) {
      drawCoverImage(s6, prensaImg, 42, 85, 410, 260);
    }

    drawKicker(s6, fonts, 480, 88, "OFICINA PADRONIZADA", C.white);
    drawLines(s6, "Prensagem padronizada.", {
      x: 480,
      yTop: 110,
      font: bold,
      size: 30,
      maxWidth: 320,
      lineHeight: 34,
      color: C.white,
    });

    const details = [
      {
        t: "Sensor de final de curso",
        d: "Interrompe a prensagem automaticamente na medida exata calibrada para cada terminal.",
      },
      {
        t: "Pistola de descontaminação & Lacre",
        d: "Limpeza interna do tubo após o corte e selagem termoencolhível contra contaminação.",
      },
      {
        t: "Capacitação Tawper Academy",
        d: "Treinamento prático da equipe mecânica na própria oficina da usina.",
      },
    ];
    for (let i = 0; i < details.length; i++) {
      const dy = 195 + i * 82;
      rectTop(s6, 480, dy, 320, 0.75, rgb(95 / 255, 110 / 255, 170 / 255));
      s6.drawText(pdfSafeText(details[i].t), { x: 480, y: H - (dy + 20), font: bold, size: 13, color: C.white });
      drawLines(s6, details[i].d, { x: 480, yTop: dy + 28, font: regular, size: 10.5, maxWidth: 320, lineHeight: 14, color: C.lightMuted, maxLines: 2 });
    }

    // White color-coding strip (.press-color-guide)
    rectTop(s6, 42, 376, 410, 74, C.white);
    rectTop(s6, 54, 390, 3, 46, C.red);
    drawLines(s6, "A cor da mangueira indica a cor da castanha da prensa:", {
      x: 66,
      yTop: 392,
      font: bold,
      size: 11,
      maxWidth: 190,
      lineHeight: 14.5,
      color: C.ink,
    });
    const dieColors = [
      rgb(227 / 255, 28 / 255, 63 / 255),
      rgb(37 / 255, 99 / 255, 235 / 255),
      rgb(22 / 255, 163 / 255, 74 / 255),
      rgb(234 / 255, 179 / 255, 8 / 255),
      rgb(147 / 255, 51 / 255, 234 / 255),
    ];
    for (let i = 0; i < dieColors.length; i++) {
      rectTop(s6, 272 + i * 32, 401, 22, 22, dieColors[i]);
    }
  }

  // ------------------------------------------------------------------
  // SLIDE 07 — HYDRASENSE: O DNA DE CADA MANGUEIRA
  // ------------------------------------------------------------------
  {
    const s7 = doc.addPage([W, H]);
    rectTop(s7, 0, 0, W, H, C.hydraDark);
    if (hydraImg) {
      drawCoverImage(s7, hydraImg, 470, 0, W - 470, H);
      s7.drawRectangle({ x: 470, y: 0, width: 120, height: H, color: C.hydraDark, opacity: 0.65 });
    }
    drawTopbarAndFooter(s7, fonts, {
      topic: "INTELIGÊNCIA & RASTREABILIDADE",
      footerLeft: "TAWPER · HYDRASENSE",
      slideNum: 7,
      totalSlides: TAWPER_SLIDES,
      dark: true,
      logoImg,
    });

    drawKicker(s7, fonts, 42, 92, "HYDRASENSE · GESTÃO POR CONJUNTO", C.white, C.orange);
    drawLines(s7, "O DNA de cada mangueira.", {
      x: 42,
      yTop: 118,
      font: bold,
      size: 38,
      maxWidth: 420,
      lineHeight: 42,
      color: C.white,
    });

    drawLines(
      s7,
      "Cada mangueira montada recebe identificação individual para registrar onde foi aplicada, quando foi trocada e qual o histórico real de durabilidade na máquina.",
      {
        x: 42,
        yTop: 222,
        font: regular,
        size: 14,
        maxWidth: 400,
        lineHeight: 20,
        color: C.lightMuted,
      }
    );

    const hSteps = ["01 Identificar", "02 Registrar", "03 Consultar", "04 Decidir"];
    for (let i = 0; i < hSteps.length; i++) {
      const sx = 42 + i * 102;
      rectTop(s7, sx, 460, 92, 2, C.orange);
      s7.drawText(hSteps[i], { x: sx, y: H - 482, font: bold, size: 11, color: C.white });
    }
  }

  // ------------------------------------------------------------------
  // SLIDE 08 — INVESTIMENTO (ORÇAMENTO ERP) & CONDIÇÕES COMERCIAIS
  // ------------------------------------------------------------------
  {
    const s8 = doc.addPage([W, H]);
    rectTop(s8, 0, 0, W, H, C.white);
    drawTopbarAndFooter(s8, fonts, {
      topic: `INVESTIMENTO E CONDIÇÕES · ${input.termos.codigo}`,
      footerLeft: `TAWPER · CONDIÇÕES COMERCIAIS · ${input.termos.codigo}`,
      slideNum: 8,
      totalSlides: TAWPER_SLIDES,
    });

    drawKicker(s8, fonts, 42, 82, "FORNECIMENTO DIRETO DE IMPORTADORA · SEM INTERMEDIAÇÃO", C.ink);
    drawLines(s8, "Condições comerciais e orçamento oficial Tawper.", {
      x: 42,
      yTop: 104,
      font: bold,
      size: 30,
      maxWidth: 740,
      lineHeight: 34,
      color: C.ink,
    });

    const hasValor = Boolean(input.termos.mostrarValores && input.orcamento.valorTotal && input.orcamento.valorTotal > 0);
    const erpBadge = input.orcamento.numeroExterno
      ? `ORÇAMENTO ERP Nº ${input.orcamento.numeroExterno}`
      : "ESCOPO & CONDIÇÕES COMERCIAIS";

    s8.drawText(pdfSafeText(erpBadge), { x: 42, y: H - 206, font: bold, size: 9.5, color: C.red });
    const mainVal =
      hasValor && input.orcamento.valorTotal
        ? money(input.orcamento.valorTotal)
        : input.orcamento.numeroExterno
          ? `Orçamento #${input.orcamento.numeroExterno}`
          : "Fornecimento & Comodato";

    drawLines(s8, mainVal, {
      x: 42,
      yTop: 216,
      font: bold,
      size: hasValor ? 36 : 26,
      maxWidth: 300,
      lineHeight: hasValor ? 40 : 30,
      color: C.blue,
      maxLines: 2,
    });

    drawLines(s8, input.orcamento.resumoEscopo, {
      x: 42,
      yTop: 274,
      font: regular,
      size: 10.5,
      maxWidth: 300,
      lineHeight: 15,
      color: C.ink,
      maxLines: 5,
    });

    rectTop(s8, 42, 368, 300, 96, C.paper);
    rectTop(s8, 42, 368, 4, 96, C.red);
    const callTitle =
      erpPageCount > 0
        ? `Orçamento ERP original anexo (${erpPageCount} pág.)`
        : `Importação direta Tawper -> ${nomeCliente}`;
    s8.drawText(pdfSafeText(callTitle), { x: 56, y: H - 388, font: bold, size: 10.5, color: C.ink });
    drawLines(
      s8,
      (input.orcamento.destaques ?? []).slice(0, 3).join(" · ") ||
        "Detalhamento de itens, códigos e quantidades conforme orçamento emitido no ERP da Tawper.",
      {
        x: 56,
        yTop: 398,
        font: regular,
        size: 9.2,
        maxWidth: 274,
        lineHeight: 13.5,
        color: C.muted,
        maxLines: 4,
      }
    );

    const terms = [
      { idx: "01 · CONDIÇÃO DE PAGAMENTO", val: input.termos.condicaoPagamento, sub: "Faturamento direto pela Tawper conforme cronograma acordado." },
      { idx: "02 · PRAZO DE ENTREGA", val: input.termos.prazoEntrega, sub: "Inclui entrega técnica, bancada e capacitação na unidade." },
      { idx: "03 · FRETE E LOGÍSTICA", val: input.termos.frete, sub: "Atendimento pelas unidades de Monte Aprazível/SP e Maceió/AL." },
      { idx: "04 · VALIDADE DA PROPOSTA", val: `${input.termos.validadeDias} dias corridos`, sub: `Emitida em ${emissaoFmt} · Válida até ${validadeFmt}.` },
    ];
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const tx = 374 + col * 218;
      const ty = 200 + row * 134;
      rectTop(s8, tx, ty, 204, 2, C.blue);
      s8.drawText(pdfSafeText(terms[i].idx), { x: tx, y: H - (ty + 18), font: bold, size: 7.5, color: C.red });
      drawLines(s8, terms[i].val, { x: tx, yTop: ty + 28, font: bold, size: 14, maxWidth: 204, lineHeight: 17, color: C.ink, maxLines: 2 });
      drawLines(s8, terms[i].sub, { x: tx, yTop: ty + 68, font: regular, size: 9.5, maxWidth: 204, lineHeight: 13.5, color: C.muted, maxLines: 3 });
    }

    rectTop(s8, 42, 502, W - 84, 0.75, C.line);
    s8.drawText(
      pdfSafeText(
        `Proposta Comercial Nº ${input.termos.codigo} · Destinada a ${nomeCliente} (CNPJ ${input.cliente.cnpj}) · Responsável: ${input.vendedor.nome}`
      ),
      { x: 42, y: H - 522, font: regular, size: 9, color: C.muted }
    );
  }

  // ------------------------------------------------------------------
  // SLIDE 09 — FALE COM A TAWPER, CONSULTOR RESPONSÁVEL & ACEITE FORMAL
  // ------------------------------------------------------------------
  {
    const s9 = doc.addPage([W, H]);
    rectTop(s9, 0, 0, W, H, C.white);
    drawTopbarAndFooter(s9, fonts, {
      topic: `CONTATO E FORMALIZAÇÃO · ${input.termos.codigo}`,
      footerLeft: "TAWPER · MANGUEIRAS E CONEXÕES",
      slideNum: 9,
      totalSlides: TAWPER_SLIDES,
    });

    drawKicker(s9, fonts, 42, 82, `PRÓXIMO PASSO COM A ${nomeCliente}`, C.ink);
    drawLines(s9, "Fale com a Tawper", {
      x: 42,
      yTop: 104,
      font: bold,
      size: 36,
      maxWidth: 600,
      lineHeight: 40,
      color: C.ink,
    });

    const cols = [
      {
        pill: "CONSULTOR RESPONSÁVEL",
        featured: true,
        name: input.vendedor.nome || "Consultor Tawper",
        region: `${input.vendedor.cargo} · ${input.vendedor.regiao || "Atendimento Dedicado"}`,
        phone: input.vendedor.telefone || "(17) 9 9125-2896",
        email: input.vendedor.email || "tawper@tawper.com.br",
      },
      {
        pill: "COORDENAÇÃO SÃO PAULO",
        featured: false,
        name: "Murilo & Nilton",
        region: "Monte Aprazível · São Paulo",
        phone: "(17) 9 9125-2896",
        email: "Nilton: (17) 9 8230-2700",
      },
      {
        pill: "UNIDADE NORDESTE",
        featured: false,
        name: "Douglas",
        region: "Maceió · Alagoas",
        phone: "(17) 9 8164-0028",
        email: "Ponto de apoio Nordeste",
      },
    ];

    const colW = (W - 84 - 48) / 3;
    for (let i = 0; i < cols.length; i++) {
      const cx = 42 + i * (colW + 24);
      const cy = 196;
      if (cols[i].featured) {
        rectTop(s9, cx, cy, colW, 195, C.paper);
        rectTop(s9, cx, cy, colW, 3.5, C.red);
      } else {
        rectTop(s9, cx, cy, colW, 2, C.line);
      }
      const px = cols[i].featured ? cx + 14 : cx;
      rectTop(s9, px, cy + 14, 136, 16, cols[i].featured ? C.red : C.line);
      s9.drawText(pdfSafeText(cols[i].pill), {
        x: px + 6,
        y: H - (cy + 25),
        font: bold,
        size: 7,
        color: cols[i].featured ? C.white : C.blue,
      });

      drawLines(s9, cols[i].name, {
        x: px,
        yTop: cy + 40,
        font: bold,
        size: 18,
        maxWidth: colW - 24,
        lineHeight: 22,
        color: C.ink,
        maxLines: 2,
      });
      drawLines(s9, cols[i].region, {
        x: px,
        yTop: cy + 84,
        font: regular,
        size: 10,
        maxWidth: colW - 24,
        lineHeight: 13.5,
        color: C.muted,
        maxLines: 2,
      });
      s9.drawText(pdfSafeText(cols[i].phone), {
        x: px,
        y: H - (cy + 138),
        font: bold,
        size: 14,
        color: C.blue,
      });
      s9.drawText(pdfSafeText(cols[i].email), {
        x: px,
        y: H - (cy + 162),
        font: regular,
        size: 9.5,
        color: C.muted,
      });
    }

    rectTop(s9, 42, 428, W - 84, 1, C.line);
    s9.drawText("tawper@tawper.com.br", { x: 42, y: H - 458, font: bold, size: 14, color: C.blue });
    s9.drawText("Av. Santos Dumont, 1845 · Jardim Melo · Monte Aprazível, São Paulo", {
      x: 42,
      y: H - 478,
      font: regular,
      size: 10.5,
      color: C.muted,
    });

    rectTop(s9, 430, 442, 370, 74, C.paper);
    rectTop(s9, 430, 442, 3.5, 74, C.blue);
    s9.drawText(pdfSafeText(`DE ACORDO / ACEITE DA PROPOSTA ${input.termos.codigo}`), {
      x: 444,
      y: H - 458,
      font: bold,
      size: 7.5,
      color: C.blue,
    });
    drawLines(s9, `${nomeCliente} · A/C ${input.cliente.destinatarioNome}`, {
      x: 444,
      yTop: 465,
      font: bold,
      size: 10,
      maxWidth: 344,
      lineHeight: 13,
      color: C.ink,
      maxLines: 1,
    });
    s9.drawText("Assinatura / Carimbo: _______________________   Data: ____/____/2026", {
      x: 444,
      y: H - 502,
      font: regular,
      size: 8.5,
      color: C.muted,
    });
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
