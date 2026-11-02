import { describe, expect, it, vi } from "vitest";
import type { Company, Contact, User } from "@/lib/types";

vi.mock("@/server/persist", () => ({ registerCompany: vi.fn() }));
vi.mock("@/server/crm", () => ({ invalidateCrmReadCache: vi.fn(), loadCrmSnapshot: vi.fn() }));

import { planNewClient } from "./tools/criar-cliente";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const user = (id: string, short: string, role: User["role"] = "vendedor") => ({ id, name: `${short} Silva`, short, role, regions: [] }) as unknown as User;
const company = (id: string, nome: string, extra: Partial<Company> = {}) => ({ id, nome, ownerId: U1, cidade: "Jaboticabal", ...extra }) as Company;
const contact = (companyId: string, whatsapp: string) => ({ id: `c-${companyId}`, companyId, nome: "Fulano", whatsapp, ativo: true }) as unknown as Contact;

const base = { companies: [company("a", "Usina Santa Helena")], contacts: [contact("a", "5516991234567")], users: [user(U1, "Murilo", "gestor"), user(U2, "Ana")] };
const ok = { nome: "Usina Boa Vista", cidade: "Quirinópolis", contato_nome: "João", proximo_passo_titulo: "Ligar para qualificar" };
const actor = base.users[0];

describe("planNewClient", () => {
  it("só nome e cidade são indispensáveis; lista o que falta em vez de inventar", () => {
    const plan = planNewClient({ nome: "Usina X" }, base, actor);
    expect(plan).toMatchObject({ ok: false });
    expect((plan as { faltando: string[] }).faltando).toEqual(["cidade"]);
  });

  it("cadastra sem contato e sem próximo passo, com um passo padrão", () => {
    const plan = planNewClient({ nome: "Ativos de Mineiros", cidade: "Mineiros", uf: "GO" }, base, actor, new Date("2026-11-02T15:00:00Z"));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.contacts).toEqual([]);
    expect(plan.input.firstActivity).toMatchObject({ tipo: "Ligação", titulo: "Descobrir o contato certo e qualificar frota e prensa", dueAt: "2026-11-03T12:00:00.000Z" });
  });

  it("com contato e sem próximo passo, o passo padrão cita o contato", () => {
    const plan = planNewClient({ nome: "Ativos de Mineiros", cidade: "Mineiros", contato_nome: "João", contato_whatsapp: "(64) 99999-1234" }, base, actor);
    expect(plan.ok && plan.input.firstActivity).toMatchObject({ tipo: "WhatsApp", titulo: "Ligar para João e qualificar frota e prensa" });
  });

  it("monta o cadastro completo com responsável e prazo", () => {
    const plan = planNewClient({ ...ok, contato_whatsapp: "(64) 99999-1234", contato_papel: "decisor", proximo_passo_prazo_dias: 2, uf: "go" }, base, actor, new Date("2026-11-02T15:00:00Z"));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.input.company).toMatchObject({ nome: "Usina Boa Vista", cidade: "Quirinópolis", uf: "GO", ownerId: U1, origem: "WhatsApp" });
    expect(plan.input.contacts[0]).toMatchObject({ nome: "João", papel: "Decisor", canal: "WhatsApp" });
    expect(plan.input.firstActivity).toMatchObject({ tipo: "WhatsApp", titulo: "Ligar para qualificar", dueAt: "2026-11-04T12:00:00.000Z" });
  });

  it("avisa de nome parecido e só segue com confirmação", () => {
    const similar = { ...ok, nome: "Usina Santa Helena" };
    const first = planNewClient(similar, base, actor);
    expect(first).toMatchObject({ ok: false });
    expect((first as { duplicados: unknown[] }).duplicados).toHaveLength(1);
    expect(planNewClient({ ...similar, confirmar_duplicado: true }, base, actor).ok).toBe(true);
  });

  it("avisa quando o telefone já pertence a outro cliente", () => {
    const plan = planNewClient({ ...ok, contato_whatsapp: "(16) 99123-4567" }, base, actor);
    expect(plan).toMatchObject({ ok: false });
    expect((plan as { duplicados: { motivos: string[] }[] }).duplicados[0].motivos).toContain("mesmo telefone");
  });

  it("recusa CNPJ ou WhatsApp inválidos", () => {
    expect(planNewClient({ ...ok, cnpj: "123" }, base, actor)).toMatchObject({ ok: false, erro: expect.stringContaining("CNPJ") });
    expect(planNewClient({ ...ok, contato_whatsapp: "123" }, base, actor)).toMatchObject({ ok: false, erro: expect.stringContaining("WhatsApp") });
  });

  it("vendedor não cadastra na carteira de outra pessoa", () => {
    const seller = base.users[1];
    expect(planNewClient({ ...ok, responsavel: "Murilo" }, base, seller)).toMatchObject({ ok: false, erro: expect.stringContaining("própria carteira") });
    const own = planNewClient(ok, base, seller);
    expect(own.ok && own.input.company.ownerId).toBe(U2);
  });

  it("não escolhe responsável sozinho quando o perfil não está vinculado", () => {
    const unlinked = user("whatsapp-5517999999999", "Chefe", "gestor");
    expect(planNewClient(ok, base, unlinked)).toMatchObject({ ok: false, erro: expect.stringContaining("responsável") });
    const named = planNewClient({ ...ok, responsavel: "Ana" }, base, unlinked);
    expect(named.ok && named.input.company.ownerId).toBe(U2);
  });
});

describe("CNPJ no cadastro por voz", () => {
  const user1 = base.users[0];
  it("recusa o CNPJ ditado errado e explica o motivo ao modelo", () => {
    const plan = planNewClient({ ...ok, cnpj: "37.989.167/0001-01" }, base, user1);
    expect(plan).toMatchObject({ ok: false, erro: expect.stringContaining("dígitos verificadores") });
  });

  it("aceita um CNPJ válido, com ou sem máscara", () => {
    const plan = planNewClient({ ...ok, cnpj: "11.222.333/0001-81" }, base, user1);
    expect(plan.ok && plan.input.company.cnpj).toBe("11222333000181");
    expect(planNewClient({ ...ok, cnpj: "11222333000181" }, base, user1).ok).toBe(true);
  });

  it("cadastra sem CNPJ e guarda os dados extras nas observações", () => {
    const plan = planNewClient({ ...ok, observacoes: "Unidades: Morro Vermelho e Água Emendada" }, base, user1);
    expect(plan.ok && plan.input.company).toMatchObject({ cnpj: undefined, observacoes: "Unidades: Morro Vermelho e Água Emendada" });
  });
});
