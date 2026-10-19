import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { formatCNPJ } from "@/lib/br-ids";
import type { Quote, QuoteItem } from "@/lib/types";
import { quoteTotals } from "@/lib/utils";

const NAVY = rgb(0.07, 0.23, 0.48);
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.4, 0.44, 0.5);
const LINE = rgb(0.84, 0.86, 0.9);
const SOFT = rgb(0.95, 0.96, 0.98);

const W = 595.28;
const H = 841.89;
const MX = 40;

/** As fontes padrão do PDF só cobrem Latin-1: troca o que ficar de fora por um equivalente simples. */
function clean(input: string) {
  return input
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/•/g, "-")
    .replace(/[^\n -ÿ]/g, "?");
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const qtyFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut -= 1;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface QuotePdfContext {
  orgName: string;
  company: { nome: string; razaoSocial?: string; cnpj?: string; cidade?: string; uf?: string };
  contact?: { nome: string; cargo?: string; email?: string; whatsapp?: string };
  seller?: string;
}

export async function loadQuotePdfContext(quote: Quote, contactId?: string): Promise<QuotePdfContext> {
  const sb = getSupabaseAdmin();
  const contactRef = contactId || quote.enviadoPara?.contatoId;
  const [org, company, contact, seller] = await Promise.all([
    sb.from("organizations").select("name").eq("id", TAWPER_ORG_ID).maybeSingle(),
    sb.from("companies").select("trade_name, legal_name, cnpj, city, state").eq("id", quote.companyId).maybeSingle(),
    contactRef
      ? sb.from("contacts").select("name, job_title, email, whatsapp_e164").eq("id", contactRef).maybeSingle()
      : Promise.resolve({ data: null }),
    quote.autorId ? sb.from("profiles").select("full_name").eq("id", quote.autorId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const c = company.data;
  const ct = contact.data;
  return {
    orgName: (org.data?.name as string) || "Tawper",
    company: {
      nome: (c?.trade_name as string) || "Cliente",
      razaoSocial: (c?.legal_name as string) || undefined,
      cnpj: (c?.cnpj as string) || undefined,
      cidade: (c?.city as string) || undefined,
      uf: (c?.state as string) || undefined,
    },
    contact: ct
      ? { nome: ct.name as string, cargo: (ct.job_title as string) || undefined, email: (ct.email as string) || undefined, whatsapp: (ct.whatsapp_e164 as string) || undefined }
      : undefined,
    seller: (seller.data?.full_name as string) || undefined,
  };
}

type Col = { label: string; x: number; align: "left" | "right"; width?: number };
type Row = { cells: string[]; sub?: string[]; strong?: boolean };

export async function buildQuotePdf(quote: Quote, ctx: QuotePdfContext): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Orcamento ${quote.numero}`);
  doc.setProducer("Tawper OS");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - MX;

  const text = (s: string, x: number, yy: number, size = 9.5, font = regular, color = INK) => page.drawText(clean(s), { x, y: yy, size, font, color });
  const right = (s: string, xRight: number, yy: number, size = 9.5, font = regular, color = INK) => {
    const t = clean(s);
    page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y: yy, size, font, color });
  };
  const ensure = (needed: number) => {
    if (y - needed < MX + 30) {
      page = doc.addPage([W, H]);
      y = H - MX;
    }
  };

  const emitted = quote.enviadoEm ? new Date(quote.enviadoEm) : new Date(quote.createdAt);
  const validUntil = new Date(emitted.getTime() + quote.validadeDias * 86_400_000);

  // Cabeçalho
  page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: NAVY });
  page.drawText(clean(ctx.orgName.toUpperCase()), { x: MX, y: H - 50, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Proposta comercial", { x: MX, y: H - 70, size: 10, font: regular, color: rgb(0.8, 0.86, 0.95) });
  right(`Orçamento ${quote.numero}`, W - MX, H - 46, 13, bold, rgb(1, 1, 1));
  right(`Emitido em ${dateFmt.format(emitted)}`, W - MX, H - 62, 9, regular, rgb(0.8, 0.86, 0.95));
  right(`Válido até ${dateFmt.format(validUntil)}`, W - MX, H - 75, 9, regular, rgb(0.8, 0.86, 0.95));
  y = H - 92 - 28;

  // Cliente
  text("CLIENTE", MX, y, 8, bold, MUTED);
  y -= 15;
  text(ctx.company.razaoSocial || ctx.company.nome, MX, y, 12, bold);
  y -= 14;
  const meta = [ctx.company.cnpj ? `CNPJ ${formatCNPJ(ctx.company.cnpj)}` : "", [ctx.company.cidade, ctx.company.uf].filter(Boolean).join("/")].filter(Boolean);
  if (meta.length) {
    text(meta.join("  ·  "), MX, y, 9, regular, MUTED);
    y -= 13;
  }
  if (ctx.contact) {
    const c = [ctx.contact.nome + (ctx.contact.cargo ? ` (${ctx.contact.cargo})` : ""), ctx.contact.email].filter(Boolean).join("  ·  ");
    text(`A/C ${c}`, MX, y, 9, regular, INK);
    y -= 13;
  }
  y -= 14;

  /** Uma seção = título + cabeçalho de colunas + linhas (com sublinhas opcionais). */
  const section = (title: string, subtitle: string, cols: Col[], rows: Row[]) => {
    ensure(70);
    text(title, MX, y, 10.5, bold, NAVY);
    text(subtitle, MX + bold.widthOfTextAtSize(clean(title), 10.5) + 8, y, 8.5, regular, MUTED);
    y -= 14;
    const header = () => {
      page.drawRectangle({ x: MX, y: y - 6, width: W - 2 * MX, height: 20, color: NAVY });
      for (const c of cols) {
        if (c.align === "right") right(c.label, c.x, y, 7.5, bold, rgb(1, 1, 1));
        else text(c.label, c.x, y, 7.5, bold, rgb(1, 1, 1));
      }
      y -= 20;
    };
    header();
    const descCol = cols.find((c) => c.width);
    rows.forEach((row, i) => {
      const descLines = descCol ? wrap(row.cells[cols.indexOf(descCol)], regular, 9, descCol.width!) : [row.cells[0]];
      const subLines = (row.sub ?? []).flatMap((l) => (descCol ? wrap(l, regular, 8, descCol.width! - 8) : [l]));
      const rowH = descLines.length * 11.5 + subLines.length * 10.5 + 8;
      if (y - rowH < MX + 40) {
        page = doc.addPage([W, H]);
        y = H - MX;
        header();
      }
      if (i % 2 === 1) page.drawRectangle({ x: MX, y: y - rowH + 11, width: W - 2 * MX, height: rowH, color: SOFT });
      cols.forEach((c, k) => {
        if (c === descCol) {
          descLines.forEach((l, n) => text(l, c.x, y - n * 11.5, 9, row.strong ? bold : regular));
        } else if (c.align === "right") {
          right(row.cells[k], c.x, y, 9, k === cols.length - 1 ? bold : regular);
        } else {
          text(row.cells[k], c.x, y, k === 0 ? 8 : 9, regular, k === 0 ? MUTED : INK);
        }
      });
      subLines.forEach((l, n) => text(l, descCol ? descCol.x + 8 : MX, y - descLines.length * 11.5 - n * 10.5 + 1, 8, regular, MUTED));
      y -= rowH;
    });
    page.drawLine({ start: { x: MX, y: y + 8 }, end: { x: W - MX, y: y + 8 }, thickness: 0.6, color: LINE });
    y -= 12;
  };

  const kitLines = (it: QuoteItem) => (it.componentes ?? []).map((c) => `${qtyFmt.format(c.qtd)} ${c.unidade} - ${c.descricao}`);
  const of = (modo: QuoteItem["modo"]) => quote.itens.filter((i) => i.modo === modo);
  const t = quoteTotals(quote.itens, quote.desconto);
  const R = W - MX - 8;

  // VENDA
  const sale = of("venda");
  if (sale.length) {
    section(
      "VENDA",
      "pagamento único",
      [
        { label: "CÓDIGO", x: MX + 8, align: "left" },
        { label: "DESCRIÇÃO", x: MX + 92, align: "left", width: 215 },
        { label: "UN.", x: 372, align: "left" },
        { label: "QTD.", x: 428, align: "right" },
        { label: "UNITÁRIO", x: 492, align: "right" },
        { label: "TOTAL", x: R, align: "right" },
      ],
      sale.map((it) => ({
        cells: [it.sku, it.descricao, it.unidade, qtyFmt.format(it.qtd), brl.format(it.preco), brl.format(Math.round(it.qtd * it.preco * 100) / 100)],
        sub: [...kitLines(it).map((l) => `- ${l}`), ...(it.prazoPagamento ? [`Pagamento deste item: ${it.prazoPagamento}`] : [])],
      })),
    );
    ensure(80);
    const boxX = W - MX - 200;
    text("Subtotal de venda", boxX, y, 9.5, regular, MUTED);
    right(brl.format(t.bruto), R, y, 9.5);
    y -= 15;
    if (quote.desconto > 0) {
      text(`Desconto (${qtyFmt.format(quote.desconto)}%)`, boxX, y, 9.5, regular, MUTED);
      right(`- ${brl.format(t.desconto)}`, R, y, 9.5);
      y -= 15;
    }
    page.drawRectangle({ x: boxX - 8, y: y - 10, width: 208, height: 26, color: NAVY });
    text("TOTAL DA VENDA", boxX, y - 1, 9.5, bold, rgb(1, 1, 1));
    right(brl.format(t.total), R, y - 1, 12, bold, rgb(1, 1, 1));
    y -= 38;
  }

  // LOCAÇÃO
  const rental = of("locacao");
  if (rental.length) {
    section(
      "LOCAÇÃO MENSAL",
      "comodato pago, cobrado todo mês",
      [
        { label: "CÓDIGO", x: MX + 8, align: "left" },
        { label: "DESCRIÇÃO", x: MX + 92, align: "left", width: 205 },
        { label: "QTD.", x: 352, align: "right" },
        { label: "VALOR MENSAL", x: 425, align: "right" },
        { label: "PRAZO", x: 468, align: "right" },
        { label: "TOTAL MENSAL", x: R, align: "right" },
      ],
      rental.map((it) => ({
        cells: [it.sku, it.descricao, qtyFmt.format(it.qtd), brl.format(it.preco), `${it.meses ?? 1} m`, brl.format(Math.round(it.qtd * it.preco * 100) / 100)],
      })),
    );
    ensure(60);
    const boxX = W - MX - 230;
    text("Total mensal", boxX, y, 9.5, regular, MUTED);
    right(brl.format(t.mensal), R, y, 9.5);
    y -= 15;
    page.drawRectangle({ x: boxX - 8, y: y - 10, width: 238, height: 26, color: NAVY });
    text("VALOR TOTAL NO CONTRATO", boxX, y - 1, 9.5, bold, rgb(1, 1, 1));
    right(brl.format(t.contratoLocacao), R, y - 1, 12, bold, rgb(1, 1, 1));
    y -= 38;
  }

  // CORTESIA
  const courtesy = of("cortesia");
  if (courtesy.length) {
    section(
      "COMODATO ISENTO (CORTESIA)",
      "sem cobrança",
      [
        { label: "CÓDIGO", x: MX + 8, align: "left" },
        { label: "DESCRIÇÃO", x: MX + 92, align: "left", width: 205 },
        { label: "QTD.", x: 352, align: "right" },
        { label: "PRAZO", x: 395, align: "right" },
        { label: "REFERÊNCIA/MÊS", x: 475, align: "right" },
        { label: "COBRADO", x: R, align: "right" },
      ],
      courtesy.map((it) => ({
        cells: [it.sku, it.descricao, qtyFmt.format(it.qtd), `${it.meses ?? 1} m`, brl.format(it.precoReferencia ?? 0), brl.format(0)],
        sub: [`Motivo: ${it.motivoCortesia ?? "-"}`],
      })),
    );
    ensure(30);
    text("Valor de referência no prazo (não cobrado)", W - MX - 280, y, 9, regular, MUTED);
    right(brl.format(t.cortesiaRef), R, y, 9);
    y -= 28;
  }

  // RESUMO
  if ([sale.length, rental.length, courtesy.length].filter(Boolean).length > 1) {
    ensure(90);
    page.drawRectangle({ x: MX, y: y - 56, width: W - 2 * MX, height: 70, color: SOFT });
    text("RESUMO DA PROPOSTA", MX + 12, y, 8, bold, MUTED);
    const line = (label: string, value: string, yy: number) => {
      text(label, MX + 12, yy, 9.5);
      right(value, W - MX - 12, yy, 9.5, bold);
    };
    let yy = y - 16;
    if (sale.length) {
      line("Venda (pagamento único)", brl.format(t.total), yy);
      yy -= 14;
    }
    if (rental.length) {
      line("Locação (por mês)", `${brl.format(t.mensal)} / mês`, yy);
      yy -= 14;
    }
    if (courtesy.length) line("Cortesia (não cobrado)", brl.format(0), yy);
    y -= 84;
  }

  // Condições
  const block = (title: string, body: string) => {
    const lines = wrap(body, regular, 9.5, W - 2 * MX);
    ensure(lines.length * 12 + 24);
    text(title, MX, y, 8, bold, MUTED);
    y -= 14;
    for (const l of lines) {
      text(l, MX, y, 9.5);
      y -= 12;
    }
    y -= 8;
  };
  if (sale.length) block("CONDIÇÃO DE PAGAMENTO DA VENDA", quote.condicao || "A combinar");
  block("VALIDADE DA PROPOSTA", `${quote.validadeDias} dias, até ${dateFmt.format(validUntil)}.`);
  if (quote.observacoes?.trim()) block("OBSERVAÇÕES", quote.observacoes.trim());

  // Rodapé em todas as páginas
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MX, y: MX - 6 }, end: { x: W - MX, y: MX - 6 }, thickness: 0.5, color: LINE });
    p.drawText(clean(`${ctx.orgName}${ctx.seller ? ` · ${ctx.seller}` : ""}`), { x: MX, y: MX - 20, size: 8, font: regular, color: MUTED });
    const label = `Página ${i + 1} de ${pages.length}`;
    p.drawText(label, { x: W - MX - regular.widthOfTextAtSize(label, 8), y: MX - 20, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}
