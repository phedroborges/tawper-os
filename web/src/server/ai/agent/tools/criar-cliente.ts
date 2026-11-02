import { ACTIVITY_TYPES, ORIGENS, PAPEIS, REGIOES } from "@/lib/constants";
import { storedCNPJ, storedWhatsApp } from "@/lib/br-ids";
import type { ActivityType, Company, Contact, Papel, User } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { invalidateCrmReadCache } from "@/server/crm";
import { registerCompany } from "@/server/persist";
import { findCompanies } from "../search";
import type { AgentTool } from "../types";
import { isUuid, loadScope, str } from "./shared";

type Base = { companies: Company[]; contacts: Contact[]; users: User[] };
type NewClient = Parameters<typeof registerCompany>[0];

export type NewClientPlan =
  | { ok: true; input: NewClient; responsavel: string }
  | { ok: false; faltando?: string[]; erro?: string; duplicados?: unknown[]; bloqueado?: boolean };

function pickOwner(args: Record<string, unknown>, actor: User, users: User[]): { id: string; name: string } | { erro: string } {
  const wanted = str(args.responsavel, 80);
  if (wanted) {
    const target = normalize(wanted);
    const found = users.filter((user) => [user.name, user.short].some((name) => normalize(name).split(" ").includes(target) || normalize(name) === target));
    if (found.length !== 1) return { erro: found.length ? `Mais de uma pessoa se chama "${wanted}". Peça o nome completo.` : `Não achei "${wanted}" na equipe.` };
    if (actor.role === "vendedor" && found[0].id !== actor.id) return { erro: "Vendedores só podem cadastrar clientes na própria carteira." };
    return { id: found[0].id, name: found[0].short };
  }
  if (isUuid(actor.id)) return { id: actor.id, name: actor.short };
  return { erro: "Seu perfil não está vinculado ao Tawper. Diga quem será o responsável por este cliente." };
}

/** Valida o pedido e monta o cadastro. Não grava nada: devolve o que falta ou o que bloqueia. */
export function planNewClient(args: Record<string, unknown>, base: Base, actor: User, now = new Date()): NewClientPlan {
  const nome = str(args.nome, 120);
  const cidade = str(args.cidade, 80);
  const contatoNome = str(args.contato_nome, 120);
  const passoTitulo = str(args.proximo_passo_titulo, 160);
  const faltando = [
    !nome && "nome da empresa",
    !cidade && "cidade",
    !contatoNome && "nome do contato",
    !passoTitulo && "próximo passo (o que fazer com esse cliente e quando)",
  ].filter((item): item is string => Boolean(item));
  if (faltando.length) return { ok: false, faltando };

  const rawCnpj = str(args.cnpj, 30);
  const cnpj = rawCnpj ? storedCNPJ(rawCnpj) : undefined;
  if (rawCnpj && !cnpj) return { ok: false, erro: "CNPJ inválido: os dígitos verificadores não conferem (por voz é fácil errar um número). Peça para a pessoa digitar o CNPJ, ou ofereça cadastrar sem CNPJ por enquanto." };
  const rawPhone = str(args.contato_whatsapp, 30);
  const phone = rawPhone ? storedWhatsApp(rawPhone) : undefined;
  if (rawPhone && !phone) return { ok: false, erro: "WhatsApp inválido. Precisa de celular brasileiro com DDD." };

  const owner = pickOwner(args, actor, base.users);
  if ("erro" in owner) return { ok: false, erro: owner.erro };

  const similar = [
    ...findCompanies(base, nome, 3, 0.6),
    ...(cnpj ? findCompanies(base, cnpj, 3, 0.6) : []),
    ...(phone ? findCompanies(base, phone, 3, 0.6) : []),
  ].filter((match, index, all) => all.findIndex((other) => other.company.id === match.company.id) === index);
  const exact = similar.find((match) => match.motivos.includes("mesmo CNPJ"));
  if (exact) return { ok: false, bloqueado: true, erro: `Já existe um cliente com esse CNPJ: ${exact.company.nome}. Não vou duplicar; use o cadastro existente.` };
  if (similar.length && args.confirmar_duplicado !== true) {
    return {
      ok: false,
      duplicados: similar.map((match) => ({ nome: match.company.nome, cidade: match.company.cidade, motivos: match.motivos })),
      erro: "Parece que esse cliente já existe. Pergunte se é o mesmo; só chame de novo com confirmar_duplicado=true se o usuário disser que é outra empresa.",
    };
  }

  const papelRaw = str(args.contato_papel, 30);
  const papel = PAPEIS.find((item) => normalize(item) === normalize(papelRaw)) ?? "Outro";
  const tipoRaw = str(args.proximo_passo_tipo, 30);
  const tipo = ACTIVITY_TYPES.find((item) => normalize(item) === normalize(tipoRaw)) ?? (phone ? "WhatsApp" : "Ligação");
  const dias = Math.min(60, Math.max(0, Math.round(Number(args.proximo_passo_prazo_dias ?? 1)) || 1));
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dias, 12, 0, 0));
  const regiaoRaw = str(args.regiao, 60);
  const regiao = REGIOES.find((item) => normalize(item) === normalize(regiaoRaw));
  const origemRaw = str(args.origem, 60);
  const origem = ORIGENS.find((item) => normalize(item) === normalize(origemRaw)) ?? "WhatsApp";
  const uf = str(args.uf, 2).toUpperCase();

  const contact: Omit<Contact, "id" | "companyId"> = {
    nome: contatoNome,
    cargo: str(args.contato_cargo, 80),
    papel: papel as Papel,
    influencia: 2,
    whatsapp: phone || undefined,
    email: str(args.contato_email, 120) || undefined,
    canal: phone ? "WhatsApp" : "Ligação",
    autorizaContato: true,
    ativo: true,
  };
  return {
    ok: true,
    responsavel: owner.name,
    input: {
      actorId: owner.id,
      company: {
        nome,
        cidade,
        uf: uf || undefined,
        cnpj: cnpj || undefined,
        ramo: str(args.ramo, 80) || undefined,
        regiao,
        origem,
        observacoes: str(args.observacoes, 500) || undefined,
        ownerId: owner.id,
      },
      contacts: [contact],
      firstActivity: { tipo: tipo as ActivityType, titulo: passoTitulo, dueAt: due.toISOString(), ownerId: owner.id },
    },
  };
}

export const criarCliente: AgentTool = {
  name: "criar_cliente",
  description:
    "Cadastra um cliente novo no CRM: empresa, contato principal, negócio no funil de Aquisição (etapa Lead) e o primeiro próximo passo, tudo de uma vez. Só chame quando já tiver nome da empresa, cidade, nome do contato e o próximo passo; se faltar algo, pergunte ao usuário (uma mensagem curta, só o que falta). Verifica duplicidade e devolve erro claro.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome fantasia da empresa." },
      cidade: { type: "string" },
      uf: { type: "string", description: "Sigla do estado, ex.: SP." },
      cnpj: { type: "string", description: "Opcional. 14 dígitos." },
      ramo: { type: "string", description: "Opcional. Ex.: usina de cana." },
      regiao: { type: "string", description: `Opcional. Uma de: ${REGIOES.join(", ")}.` },
      origem: { type: "string", description: `Opcional. Uma de: ${ORIGENS.join(", ")}. Padrão WhatsApp.` },
      observacoes: { type: "string", description: "Opcional. O que o usuário contou de relevante sobre o cliente." },
      contato_nome: { type: "string" },
      contato_cargo: { type: "string" },
      contato_papel: { type: "string", description: `Opcional. Um de: ${PAPEIS.join(", ")}.` },
      contato_whatsapp: { type: "string", description: "Celular com DDD." },
      contato_email: { type: "string" },
      proximo_passo_titulo: { type: "string", description: "O que fazer primeiro com esse cliente. Ex.: Ligar para qualificar frota e prensa." },
      proximo_passo_tipo: { type: "string", description: `Opcional. Um de: ${ACTIVITY_TYPES.join(", ")}.` },
      proximo_passo_prazo_dias: { type: "number", description: "Em quantos dias. Padrão 1 (amanhã)." },
      responsavel: { type: "string", description: "Opcional. Nome de quem fica responsável. Padrão: o próprio usuário." },
      confirmar_duplicado: { type: "boolean", description: "true só depois do usuário confirmar que NÃO é o cliente parecido já existente." },
    },
    required: ["nome", "cidade", "contato_nome", "proximo_passo_titulo"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const { snapshot, ownerName } = await loadScope(ctx.actor);
    const plan = planNewClient(args, snapshot, ctx.actor);
    if (!plan.ok) return { data: plan };
    const saved = await registerCompany(plan.input);
    invalidateCrmReadCache();
    return {
      wrote: true,
      data: {
        ok: true,
        empresa: { id: saved.company.id, codigo: saved.company.codigo, nome: saved.company.nome },
        contato: saved.contacts[0]?.nome,
        negocio: "Aquisição → Lead",
        proximo_passo: { titulo: saved.activity.titulo, prazo: saved.activity.dueAt, tipo: saved.activity.tipo },
        responsavel: ownerName(saved.company.ownerId),
      },
    };
  },
};
