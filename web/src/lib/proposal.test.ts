import { describe, expect, it } from "vitest";
import { buildInitialProposalInput, buildProposalPdfBytes, calcProposalTotals, pdfSafeText } from "./proposal";
import type { Company, Contact, Deal, User } from "./types";

describe("proposal PDF generator", () => {
  const company: Company = {
    id: "c1",
    codigo: "TW-0042",
    nome: "Usina Rio Pardo",
    razaoSocial: "Agroindustrial Rio Pardo S/A",
    cnpj: "12.345.678/0001-99",
    status: "ativa",
    ownerId: "u1",
    cidade: "Uberaba",
    uf: "MG",
    cep: "38010-000",
    endereco: "Rodovia BR-050, Km 142",
    ramo: "Sucroenergético",
    origem: "Prospecção",
    urgencia: "Alta",
    colhedoras: 18,
    modelos: "Case A8800, John Deere CH570",
    prensa: "Comodato concorrente",
    marcaAtual: "Parker",
    observacoes: "Priorizar safra de abril",
    createdAt: "2026-01-01",
    updatedAt: "2026-11-01",
  };

  const contact: Contact = {
    id: "ct1",
    companyId: "c1",
    nome: "Carlos Eduardo",
    cargo: "Gerente de Manutenção",
    papel: "Decisor",
    influencia: 3,
    whatsapp: "(34) 99988-7766",
    email: "carlos@riopardo.com.br",
    canal: "WhatsApp",
    autorizaContato: true,
    ativo: true,
  };

  const owner: User = {
    id: "u1",
    name: "Fernando Silva",
    short: "Fernando",
    role: "vendedor",
    title: "Consultor Técnico Comercial",
    initials: "FS",
    color: "#0a1d3f",
    phone: "(34) 99123-4567",
    regions: ["Triângulo Mineiro"],
  };

  const deal = {
    id: "d1",
    companyId: "c1",
    ownerId: "u1",
    funnel: "aquisicao",
    stageId: "orcamento",
    titulo: "Implantação prensa + kit inicial",
    valor: 48000,
    status: "aberta",
    createdAt: "2026-11-01",
    stageEnteredAt: "2026-11-05",
    checklist: {},
    history: [],
    ciclo: 1,
  } as Deal;

  it("gera dados iniciais completos e calcula totais com desconto", () => {
    const data = buildInitialProposalInput({ company, contact, owner, deal, now: new Date(2026, 10, 14) });
    expect(data.cliente.cnpj).toBe("12.345.678/0001-99");
    expect(data.vendedor.nome).toBe("Fernando Silva");
    expect(data.frota.modelos).toContain("Case A8800");
    expect(data.itens.length).toBeGreaterThanOrEqual(3);

    const totals = calcProposalTotals(
      [
        { id: "1", equipamento: "Kit", especificacao: "", modalidade: "venda", unidade: "kit", qtd: 2, valorUnitario: 1000 },
        { id: "2", equipamento: "Mapeamento", especificacao: "", modalidade: "cortesia", unidade: "serv", qtd: 1, valorUnitario: 500 },
      ],
      10,
    );
    expect(totals.subtotal).toBe(2000);
    expect(totals.descontoValor).toBe(200);
    expect(totals.total).toBe(1800);
  });

  it("gera um arquivo PDF binário válido com cabeçalho %PDF-1.", async () => {
    const data = buildInitialProposalInput({ company, contact, owner, deal, now: new Date(2026, 10, 14) });
    const bytes = await buildProposalPdfBytes(data);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(2000);
    const header = new TextDecoder().decode(bytes.slice(0, 7));
    expect(header).toBe("%PDF-1.");
    expect(pdfSafeText("Atenção — entrega… R$ 100 → OK")).toBe("Atenção - entrega... R$ 100 -> OK");
  });
});
