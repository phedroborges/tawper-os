import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROPOSAL_STANDARD } from "./config";
import { buildInitialProposalInput, buildProposalPdfBytes, pdfSafeText } from "./proposal";
import { buildTawperPresentationDeck } from "./tawper-presentation";
import type { Company, Contact, Deal, User } from "./types";

const sampleCompany: Company = {
  id: "emp-teste",
  codigo: "TWP-099",
  nome: "Usina Rio Claro Bioenergia",
  razaoSocial: "Usina Rio Claro Bioenergia S.A.",
  cnpj: "12.345.678/0001-90",
  status: "ativa",
  ownerId: "u-douglas",
  regiao: "Goiás",
  cidade: "Rio Verde",
  uf: "GO",
  colhedoras: 22,
  modelos: "Case A8800 / John Deere CH570",
  prensa: "Comodato concorrente",
  marcaAtual: "Parker",
  origem: "Prospecção ativa",
  urgencia: "Alta",
  createdAt: "2026-10-01",
  updatedAt: "2026-11-10",
};

const sampleContact: Contact = {
  id: "ctt-1",
  companyId: "emp-teste",
  nome: "Marcelo Prado",
  cargo: "Gerente de Manutenção Agrícola",
  papel: "Decisor",
  influencia: 3,
  whatsapp: "(64) 99911-2233",
  email: "marcelo@rioclaro.example",
  canal: "WhatsApp",
  autorizaContato: true,
  ativo: true,
};

const sampleSeller: User = {
  id: "u-douglas",
  name: "Douglas Ferreira",
  short: "Douglas",
  role: "vendedor",
  title: "Consultor Técnico Comercial",
  initials: "DF",
  color: "#c81421",
  phone: "5517981640028",
  regions: ["Goiás", "Triângulo"],
};

const sampleDeal: Deal = {
  id: "deal-1",
  companyId: "emp-teste",
  ownerId: "u-douglas",
  funnel: "aquisicao",
  stageId: "orcamento",
  titulo: "Implantação de Oficina + Mangueiras Safra",
  valor: 42500,
  status: "aberta",
  createdAt: "2026-11-01",
  stageEnteredAt: "2026-11-08",
  checklist: {},
  history: [],
  ciclo: 1,
};

describe("proposal official HTML presentation (9 slides) & ERP PDF merge", () => {
  it("normalizes unsupported glyphs for WinAnsi PDF embedding", () => {
    expect(pdfSafeText("Proposta — Frota • Safra 2026 ✅")).toBe("Proposta - Frota - Safra 2026");
  });

  it("initializes proposal from company fleet, consultant phone and commercial standards", () => {
    const input = buildInitialProposalInput({
      company: sampleCompany,
      contact: sampleContact,
      owner: sampleSeller,
      deal: sampleDeal,
      standard: DEFAULT_PROPOSAL_STANDARD,
    });

    expect(input.frota.numColhedoras).toBe(22);
    expect(input.frota.marcaFrota).toContain("Case A8800");
    expect(input.vendedor.nome).toBe("Douglas Ferreira");
    expect(input.vendedor.telefone).toBe("5517981640028");
    expect(input.cliente.destinatarioNome).toBe("Marcelo Prado");
    expect(DEFAULT_PROPOSAL_STANDARD.condicoesPagamento).toContain(input.termos.condicaoPagamento);
    expect(DEFAULT_PROPOSAL_STANDARD.validadesDias).toContain(input.termos.validadeDias);
  });

  it("generates strictly 9 presentation slides in PDF without ERP attachment and merges all ERP pages cleanly", async () => {
    const input = buildInitialProposalInput({
      company: sampleCompany,
      contact: sampleContact,
      owner: sampleSeller,
      deal: sampleDeal,
      standard: DEFAULT_PROPOSAL_STANDARD,
    });

    const basePdfBytes = await buildProposalPdfBytes(input);
    const baseDoc = await PDFDocument.load(basePdfBytes);
    expect(baseDoc.getPageCount()).toBe(9);
    const p1Size = baseDoc.getPage(0).getSize();
    expect(Math.round(p1Size.width)).toBe(842);
    expect(Math.round(p1Size.height)).toBe(595);

    // Create a synthetic 2-page ERP quote PDF
    const syntheticErp = await PDFDocument.create();
    syntheticErp.addPage([595.28, 841.89]);
    syntheticErp.addPage([595.28, 841.89]);
    const erpPdfBytes = await syntheticErp.save();

    input.orcamento.numeroExterno = "ERP-004512";
    input.orcamento.valorTotal = 42500;
    input.orcamento.paginasAnexo = 2;

    const mergedBytes = await buildProposalPdfBytes(input, { erpPdfBytes });
    const mergedDoc = await PDFDocument.load(mergedBytes);
    expect(mergedDoc.getPageCount()).toBe(11);
  });

  it("uses the original Tawper HTML & CSS presentation condensed to 9 slides (< 10) with zero sorteio", () => {
    const input = buildInitialProposalInput({
      company: sampleCompany,
      contact: sampleContact,
      owner: sampleSeller,
      deal: sampleDeal,
      standard: DEFAULT_PROPOSAL_STANDARD,
    });
    input.orcamento.numeroExterno = "ERP-009911";
    input.orcamento.valorTotal = 42500;
    input.orcamento.paginasAnexo = 2;

    const deck = buildTawperPresentationDeck(input, { baseUrl: "/apresentacao-tawper" });

    expect(deck.slides).toHaveLength(9);
    expect(deck.slides.length).toBeLessThan(10);
    expect(deck.html).toContain("/apresentacao-tawper/apresentacao.css");
    expect(deck.html).toContain("/apresentacao-tawper/refinamentos.css");
    expect(deck.html).toContain("Mangueiras de tecnologia europeia.");
    expect(deck.html).toContain("Prensagem padronizada.");
    expect(deck.html).toContain("O DNA de cada mangueira.");
    expect(deck.html).toContain("ERP-009911");
    expect(deck.html).toContain("5517981640028");
    expect(deck.html.toLowerCase()).not.toContain("sorteio");
  });
});
