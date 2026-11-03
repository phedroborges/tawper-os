import { PAPEIS, PRENSAS, REGIOES } from "@/lib/constants";
import { storedCNPJ, storedWhatsApp } from "@/lib/br-ids";
import type { Company, Contact, Papel } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { invalidateCrmReadCache } from "@/server/crm";
import { addContactRecord, updateCompanyRecord } from "@/server/persist";
import type { AgentTool } from "../types";
import { companyRow, deleteContactRow, updateContactRow, type Cells } from "../undo";
import { findContact } from "./registrar-atividade";
import { companyInScope, isUuid, loadScope, str, userAsked } from "./shared";

type Base = { companies: Company[]; contacts: Contact[] };

const PEDIU_EXCLUIR = /exclu|apag|remov|\b(tira|tirar|tire)\b|saiu|nao (trabalha|esta|fica) mais|desligad|demitid|duplicad/;

const pick = <T extends string>(value: unknown, allowed: readonly T[]) => allowed.find((item) => normalize(item) === normalize(str(value, 40)));

/** Campo do pedido → campo do cadastro, com o nome que aparece no comprovante. */
const CAMPOS: Record<string, { campo: keyof Company; rotulo: string }> = {
  nome: { campo: "nome", rotulo: "nome" },
  razao_social: { campo: "razaoSocial", rotulo: "razão social" },
  cnpj: { campo: "cnpj", rotulo: "CNPJ" },
  cidade: { campo: "cidade", rotulo: "cidade" },
  uf: { campo: "uf", rotulo: "UF" },
  cep: { campo: "cep", rotulo: "CEP" },
  endereco: { campo: "endereco", rotulo: "endereço" },
  ramo: { campo: "ramo", rotulo: "ramo" },
  regiao: { campo: "regiao", rotulo: "região" },
  colhedoras: { campo: "colhedoras", rotulo: "colhedoras" },
  prensa: { campo: "prensa", rotulo: "prensa" },
  marca_atual: { campo: "marcaAtual", rotulo: "marca atual" },
  concorrente: { campo: "concorrente", rotulo: "concorrente" },
  potencial: { campo: "potencial", rotulo: "potencial" },
  urgencia: { campo: "urgencia", rotulo: "urgência" },
};

/** Monta a alteração. Não grava: devolve o que mudar ou o que está errado. */
export function planAtualizarCliente(args: Record<string, unknown>, base: Base, visible: Set<string>) {
  const found = companyInScope(args.empresa_id, base, visible);
  if ("erro" in found) return { ok: false as const, erro: found.erro };
  const company = found.company;
  const patch: Partial<Company> = {};
  const mudou: string[] = [];
  for (const [key, { campo, rotulo }] of Object.entries(CAMPOS)) {
    if (args[key] === undefined || args[key] === null || args[key] === "") continue;
    let value: unknown = typeof args[key] === "number" ? args[key] : str(args[key], 300);
    if (key === "cnpj") {
      value = storedCNPJ(String(value));
      if (!value) return { ok: false as const, erro: "CNPJ inválido: os dígitos verificadores não conferem. Peça para a pessoa digitar o CNPJ." };
    } else if (key === "cep") {
      value = String(value).replace(/\D/g, "");
      if (String(value).length !== 8) return { ok: false as const, erro: "CEP precisa de 8 dígitos." };
    } else if (key === "uf") value = String(value).toUpperCase().slice(0, 2);
    else if (key === "regiao") {
      value = pick(value, REGIOES);
      if (!value) return { ok: false as const, erro: `Região precisa ser uma de: ${REGIOES.join(", ")}.` };
    } else if (key === "prensa") {
      value = pick(value, PRENSAS);
      if (!value) return { ok: false as const, erro: `Prensa precisa ser uma de: ${PRENSAS.join(", ")}.` };
    } else if (key === "potencial") {
      value = pick(value, ["Alto", "Médio", "Baixo"] as const);
      if (!value) return { ok: false as const, erro: "Potencial precisa ser Alto, Médio ou Baixo." };
    } else if (key === "urgencia") {
      value = pick(value, ["Alta", "Média", "Baixa"] as const);
      if (!value) return { ok: false as const, erro: "Urgência precisa ser Alta, Média ou Baixa." };
    } else if (key === "colhedoras") {
      value = Math.round(Number(value));
      if (!Number.isFinite(value) || (value as number) < 0) return { ok: false as const, erro: "Número de colhedoras inválido." };
    }
    (patch as Record<string, unknown>)[campo] = value;
    mudou.push(`${rotulo}: ${value}`);
  }
  const nota = str(args.observacao, 800);
  if (nota) {
    const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date());
    patch.observacoes = [company.observacoes?.trim(), `${dia}: ${nota}`].filter(Boolean).join("\n");
    mudou.push(`observação: ${nota}`);
  }
  if (!mudou.length) return { ok: false as const, faltando: ["o que mudar no cadastro"] };
  return { ok: true as const, company, patch, mudou };
}

export const atualizarCliente: AgentTool = {
  name: "atualizar_cliente",
  description:
    "Corrige ou completa o cadastro de um cliente: nome, razão social, CNPJ, cidade, CEP, endereço, ramo, região, colhedoras, prensa, marca atual, concorrente, potencial, urgência, ou acrescenta uma observação. Mande só o que o usuário disse que mudou.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      empresa_id: { type: "string", description: "id que veio de buscar_cliente." },
      nome: { type: "string" },
      razao_social: { type: "string" },
      cnpj: { type: "string" },
      cidade: { type: "string" },
      uf: { type: "string" },
      cep: { type: "string" },
      endereco: { type: "string" },
      ramo: { type: "string" },
      regiao: { type: "string", enum: REGIOES },
      colhedoras: { type: "number" },
      prensa: { type: "string", enum: PRENSAS },
      marca_atual: { type: "string", description: "Marca de mangueira que o cliente usa hoje." },
      concorrente: { type: "string" },
      potencial: { type: "string", enum: ["Alto", "Médio", "Baixo"] },
      urgencia: { type: "string", enum: ["Alta", "Média", "Baixa"] },
      observacao: { type: "string", description: "Algo a acrescentar nas observações do cliente (não apaga as anteriores)." },
    },
    required: ["empresa_id"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planAtualizarCliente(args, snapshot, visible);
    if (!plan.ok) return { data: plan };
    const before = await companyRow(plan.company.id);
    await updateCompanyRecord(plan.company.id, plan.patch, ctx.actor.id);
    invalidateCrmReadCache();
    return {
      wrote: true,
      empresaId: plan.company.id,
      recibo: `✏️ Atualizado na ${plan.patch.nome ?? plan.company.nome}: ${plan.mudou.join("; ")}.`,
      memo: `${plan.company.nome} empresa_id=${plan.company.id}: cadastro atualizado (${plan.mudou.join("; ")})`,
      desfazer: before ? { ops: [{ op: "restaurar_empresa", id: plan.company.id, row: before }], resumo: `alteração no cadastro da ${plan.company.nome}` } : undefined,
      data: { ok: true, empresa: plan.company.nome, alterado: plan.mudou },
    };
  },
};

const contatoCampos = {
  nome: { type: "string" },
  cargo: { type: "string" },
  papel: { type: "string", enum: PAPEIS },
  whatsapp: { type: "string", description: "Celular com DDD." },
  email: { type: "string" },
};

export function planAdicionarContato(args: Record<string, unknown>, base: Base, visible: Set<string>) {
  const found = companyInScope(args.empresa_id, base, visible);
  if ("erro" in found) return { ok: false as const, erro: found.erro };
  const nome = str(args.nome, 120);
  if (!nome) return { ok: false as const, faltando: ["nome do contato"] };
  const existente = findContact(base.contacts, found.company.id, nome);
  if (existente) return { ok: false as const, erro: `${existente.nome} já é contato da ${found.company.nome} (contato_id=${existente.id}). Para mudar os dados dele, use atualizar_contato.` };
  const rawPhone = str(args.whatsapp, 30);
  const phone = rawPhone ? storedWhatsApp(rawPhone) : undefined;
  if (rawPhone && !phone) return { ok: false as const, erro: "WhatsApp inválido. Precisa de celular brasileiro com DDD." };
  const contato: Omit<Contact, "id"> = {
    companyId: found.company.id,
    nome,
    cargo: str(args.cargo, 80),
    papel: (pick(args.papel, PAPEIS) ?? "Outro") as Papel,
    influencia: 2,
    whatsapp: phone || undefined,
    email: str(args.email, 120) || undefined,
    canal: phone ? "WhatsApp" : "Ligação",
    autorizaContato: true,
    ativo: true,
  };
  return { ok: true as const, company: found.company, contato };
}

export const adicionarContato: AgentTool = {
  name: "adicionar_contato",
  description: "Cadastra uma pessoa nova como contato de um cliente que já existe (comprador, mecânico, gerente…).",
  writes: true,
  parameters: {
    type: "object",
    properties: { empresa_id: { type: "string", description: "id que veio de buscar_cliente." }, ...contatoCampos },
    required: ["empresa_id", "nome"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planAdicionarContato(args, snapshot, visible);
    if (!plan.ok) return { data: plan };
    const id = await addContactRecord(plan.contato, ctx.actor.id);
    invalidateCrmReadCache();
    const detalhe = [plan.contato.cargo, plan.contato.papel !== "Outro" && plan.contato.papel, plan.contato.whatsapp].filter(Boolean).join(", ");
    return {
      wrote: true,
      empresaId: plan.company.id,
      recibo: `✅ Contato adicionado na ${plan.company.nome}: ${plan.contato.nome}${detalhe ? ` (${detalhe})` : ""}.`,
      memo: `${plan.company.nome} empresa_id=${plan.company.id}: contato_id=${id ?? "?"} ${plan.contato.nome} adicionado`,
      desfazer: id ? { ops: [{ op: "apagar_contato", id }], resumo: `contato ${plan.contato.nome}` } : undefined,
      data: { ok: true, contato: { id, nome: plan.contato.nome }, empresa: plan.company.nome },
    };
  },
};

function contactInScope(id: unknown, base: Base & { contacts: Contact[] }, visible: Set<string>) {
  const contact = isUuid(id) ? base.contacts.find((item) => item.id === id) : undefined;
  if (!contact) return { erro: "contato_id inválido. Use o id de contatos do buscar_cliente." } as const;
  if (!visible.has(contact.companyId)) return { erro: "Esse contato não está na sua carteira." } as const;
  const company = base.companies.find((item) => item.id === contact.companyId);
  return { contact, company } as const;
}

const ROLE_TO_DB: Record<string, string> = { Decisor: "decision_maker", Comprador: "buyer", Técnico: "technical", Mecânico: "mechanic", Influenciador: "influencer", Outro: "other" };

export function planAtualizarContato(args: Record<string, unknown>, base: Base, visible: Set<string>) {
  const found = contactInScope(args.contato_id, base, visible);
  if ("erro" in found) return { ok: false as const, erro: found.erro };
  const row: Cells = {};
  const mudou: string[] = [];
  const set = (column: string, value: string, rotulo: string, shown = value) => {
    row[column] = value;
    mudou.push(`${rotulo}: ${shown}`);
  };
  const nome = str(args.nome, 120);
  if (nome) set("name", nome, "nome");
  const cargo = str(args.cargo, 80);
  if (cargo) set("job_title", cargo, "cargo");
  const papel = pick(args.papel, PAPEIS);
  if (papel) set("role", ROLE_TO_DB[papel], "papel", papel);
  const rawPhone = str(args.whatsapp, 30);
  if (rawPhone) {
    const phone = storedWhatsApp(rawPhone);
    if (!phone) return { ok: false as const, erro: "WhatsApp inválido. Precisa de celular brasileiro com DDD." };
    set("whatsapp_e164", phone, "WhatsApp");
  }
  const email = str(args.email, 120);
  if (email) set("email", email, "e-mail");
  if (!mudou.length) return { ok: false as const, faltando: ["o que mudar no contato"] };
  return { ok: true as const, contact: found.contact, company: found.company, row, mudou };
}

export const atualizarContato: AgentTool = {
  name: "atualizar_contato",
  description: "Corrige ou completa os dados de um contato que já existe: nome, cargo, papel, WhatsApp, e-mail.",
  writes: true,
  parameters: {
    type: "object",
    properties: { contato_id: { type: "string", description: "id de contatos do buscar_cliente." }, ...contatoCampos },
    required: ["contato_id"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planAtualizarContato(args, snapshot, visible);
    if (!plan.ok) return { data: plan };
    const before = await updateContactRow(ctx.actor.id, plan.contact.id, plan.row);
    invalidateCrmReadCache();
    const restore = Object.fromEntries(Object.keys(plan.row).map((key) => [key, before[key] ?? null]));
    return {
      wrote: true,
      empresaId: plan.contact.companyId,
      recibo: `✏️ Contato atualizado${plan.company ? ` na ${plan.company.nome}` : ""}: ${plan.contact.nome} (${plan.mudou.join("; ")}).`,
      memo: `contato_id=${plan.contact.id} ${plan.contact.nome} atualizado`,
      desfazer: { ops: [{ op: "restaurar_contato", id: plan.contact.id, row: restore }], resumo: `alteração no contato ${plan.contact.nome}` },
      data: { ok: true, contato: plan.contact.nome, alterado: plan.mudou },
    };
  },
};

export const excluirContato: AgentTool = {
  name: "excluir_contato",
  description: "Exclui um contato de um cliente (saiu da empresa, cadastrado errado, duplicado). Só quando o usuário pediu para excluir aquela pessoa.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      contato_id: { type: "string", description: "id de contatos do buscar_cliente." },
      motivo: { type: "string", description: "Por quê, se o usuário disse." },
    },
    required: ["contato_id"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    if (!userAsked(ctx, PEDIU_EXCLUIR)) {
      return { data: { ok: false, erro: "O usuário não pediu para excluir esse contato. Não exclua: pergunte." } };
    }
    const { snapshot, visible } = await loadScope(ctx.actor);
    const found = contactInScope(args.contato_id, snapshot, visible);
    if ("erro" in found) return { data: { ok: false, erro: found.erro } };
    const row = await deleteContactRow(ctx.actor.id, found.contact.id);
    invalidateCrmReadCache();
    return {
      wrote: true,
      empresaId: found.contact.companyId,
      recibo: `🗑️ Contato excluído${found.company ? ` da ${found.company.nome}` : ""}: ${found.contact.nome}.`,
      memo: `contato ${found.contact.nome} excluído`,
      desfazer: { ops: [{ op: "recriar_contato", row }], resumo: `exclusão do contato ${found.contact.nome}` },
      data: { ok: true, excluido: found.contact.nome },
    };
  },
};
