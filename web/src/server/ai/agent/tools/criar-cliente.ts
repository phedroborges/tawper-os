import { ACTIVITY_TYPES, influenciaDoPapel, ORIGENS, PAPEIS } from "@/lib/constants";
import { CARGO_TEXTO, PAPEL_TEXTO } from "./texto-pessoas";
import { storedCNPJ, storedWhatsAppAssumindoNove } from "@/lib/br-ids";
import type { ActivityType, Company, Contact, Papel, User } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { invalidateCrmReadCache } from "@/server/crm";
import { registerCompany } from "@/server/persist";
import { dueFrom, fmtWhen, isPastDay, pastDayError } from "../dates";
import { findCompanies } from "../search";
import type { AgentTool } from "../types";
import { isUuid, loadScope, str, userAsked } from "./shared";

export const PEDIU_CADASTRO = /cadastr|cliente novo|novo cliente|lead novo|novo lead|\b(cria|criar|crie|adiciona|adicionar|registra|registrar|inclui|incluir)\b.{0,30}\b(cliente|empresa|usina|lead)\b/;

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

function minutesAgo(iso: string | undefined, now: Date) {
  const at = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(at) ? Math.max(0, Math.round((now.getTime() - at) / 60_000)) : undefined;
}

/** Valida o pedido e monta o cadastro. Não grava nada: devolve o que falta ou o que bloqueia. */
export function planNewClient(args: Record<string, unknown>, base: Base, actor: User, now = new Date()): NewClientPlan {
  const nome = str(args.nome, 120);
  // "não informada", "?" e afins são o modelo tapando buraco: contam como cidade faltando.
  const cidade = /^(n[aã]o (informad[ao]|sei|tem)|desconhecid[ao]|sem cidade|n\/?a|\?+|-+)$/i.test(str(args.cidade, 80)) ? "" : str(args.cidade, 80);
  const contatoNome = str(args.contato_nome, 120);
  // Só nome e cidade são indispensáveis. Sem contato ou sem próximo passo dito, o cadastro nasce com um passo padrão.
  const passoTitulo =
    str(args.proximo_passo_titulo, 160) ||
    (contatoNome ? `Ligar para ${contatoNome} e qualificar frota e prensa` : "Descobrir o contato certo e qualificar frota e prensa");
  const faltando = [!nome && "nome da empresa", !cidade && "cidade"].filter((item): item is string => Boolean(item));
  if (faltando.length) return { ok: false, faltando };

  const rawCnpj = str(args.cnpj, 30);
  const cnpj = rawCnpj ? storedCNPJ(rawCnpj) : undefined;
  if (rawCnpj && !cnpj) return { ok: false, erro: "CNPJ inválido: os dígitos verificadores não conferem (por voz é fácil errar um número). Peça para a pessoa digitar o CNPJ, ou ofereça cadastrar sem CNPJ por enquanto." };
  const rawPhone = str(args.contato_whatsapp, 30);
  const phone = rawPhone ? storedWhatsAppAssumindoNove(rawPhone) : undefined;
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
      duplicados: similar.map((match) => ({ nome: match.company.nome, cidade: match.company.cidade, motivos: match.motivos, cadastrado_ha_minutos: minutesAgo(match.company.createdAt, now) })),
      erro: "Parece que esse cliente já existe. Se cadastrado_ha_minutos for pequeno e foi você mesmo quem cadastrou nesta conversa, ele JÁ está cadastrado: diga isso. Senão, pergunte se é o mesmo; só chame de novo com confirmar_duplicado=true se o usuário disser que é outra empresa.",
    };
  }

  const papelRaw = str(args.contato_papel, 30);
  const papel = PAPEIS.find((item) => normalize(item) === normalize(papelRaw)) ?? "Outro";
  const tipoRaw = str(args.proximo_passo_tipo, 30);
  const tipo = ACTIVITY_TYPES.find((item) => normalize(item) === normalize(tipoRaw)) ?? (phone ? "WhatsApp" : "Ligação");
  const dias = Math.min(60, Math.max(0, Math.round(Number(args.proximo_passo_prazo_dias ?? 1)) || 1));
  // Data e hora exatas do primeiro passo, quando o usuário disse ("dia 18 às 8h30"); sem elas vale "em quantos dias".
  const exata = args.proximo_passo_data ? dueFrom(args.proximo_passo_data, args.proximo_passo_hora) : null;
  if (exata && "erro" in exata) return { ok: false, erro: `proximo_passo_data: ${exata.erro}` };
  if (exata && isPastDay(exata.iso, now)) return { ok: false, erro: `proximo_passo_data: ${pastDayError(exata.iso, now)}` };
  const due = exata ? new Date(exata.iso) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dias, 12, 0, 0));
  const origemRaw = str(args.origem, 60);
  const origem = ORIGENS.find((item) => normalize(item) === normalize(origemRaw)) ?? "WhatsApp";
  const uf = str(args.uf, 2).toUpperCase();

  const contact: Omit<Contact, "id" | "companyId"> | null = !contatoNome ? null : {
    nome: contatoNome,
    cargo: str(args.contato_cargo, 80),
    papel: papel as Papel,
    influencia: PAPEIS.find((item) => normalize(item) === normalize(papelRaw)) ? influenciaDoPapel(papel) : 2,
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
        razaoSocial: str(args.razao_social, 160) || undefined,
        cidade,
        uf: uf || undefined,
        cnpj: cnpj || undefined,
        ramo: str(args.ramo, 80) || undefined,
        origem,
        observacoes: str(args.observacoes, 500) || undefined,
        ownerId: owner.id,
      },
      contacts: contact ? [contact] : [],
      firstActivity: { tipo: tipo as ActivityType, titulo: passoTitulo, dueAt: due.toISOString(), ownerId: owner.id },
    },
  };
}

export const criarCliente: AgentTool = {
  name: "criar_cliente",
  description:
    "Cadastra um cliente novo no CRM: empresa, contato principal (se houver), negócio no funil de Aquisição (etapa Lead) e o primeiro próximo passo, tudo de uma vez. Use só quando o usuário pediu ou confirmou o cadastro; nunca invente a cidade. Chame direto, sem buscar antes: ela mesma confere duplicidade e CNPJ e devolve erro claro. Só nome da empresa e cidade são indispensáveis. Contato e próximo passo são opcionais: sem eles, o sistema cria um próximo passo padrão.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome fantasia da empresa." },
      razao_social: { type: "string", description: "Opcional. Só se o usuário disser a razão social. Não confundir com CNPJ." },
      cidade: { type: "string" },
      uf: { type: "string", description: "Sigla do estado. Deduza pela cidade quando ela for conhecida (Ribeirão Preto → SP, Rio Verde → GO); pergunte só se não souber." },
      cnpj: { type: "string", description: "Opcional. 14 dígitos." },
      ramo: { type: "string", description: "Opcional. Ex.: usina de cana." },
      origem: { type: "string", description: `Opcional. Uma de: ${ORIGENS.join(", ")}. Padrão WhatsApp.` },
      observacoes: { type: "string", description: "Opcional. O que o usuário contou de relevante sobre o cliente." },
      contato_nome: { type: "string", description: "Opcional. Pergunte uma vez; se o usuário não souber, siga sem." },
      contato_cargo: { type: "string", description: CARGO_TEXTO },
      contato_papel: { type: "string", enum: PAPEIS, description: PAPEL_TEXTO },
      contato_whatsapp: { type: "string", description: "Celular com DDD, exatamente como o usuário disse. Não complete nem corrija dígitos: o sistema acrescenta o 9 sozinho." },
      contato_email: { type: "string" },
      proximo_passo_titulo: { type: "string", description: "O que fazer primeiro com esse cliente. Ex.: Ligar para qualificar frota e prensa." },
      proximo_passo_tipo: { type: "string", description: `Opcional. Um de: ${ACTIVITY_TYPES.join(", ")}.` },
      proximo_passo_prazo_dias: { type: "number", description: "Em quantos dias. Padrão 1 (amanhã)." },
      proximo_passo_data: { type: "string", description: "AAAA-MM-DD do primeiro passo, quando o usuário disse o dia (já convertido pelo calendário). Tem prioridade sobre proximo_passo_prazo_dias." },
      proximo_passo_hora: { type: "string", description: "HH:MM do primeiro passo, se o usuário disse (ex.: 08:30). Sem hora: 09:00." },
      responsavel: { type: "string", description: "Opcional. Nome de quem fica responsável. Padrão: o próprio usuário." },
      confirmar_duplicado: { type: "boolean", description: "true só depois do usuário confirmar que NÃO é o cliente parecido já existente." },
    },
    required: ["nome", "cidade"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    if (!userAsked(ctx, PEDIU_CADASTRO)) {
      return { data: { ok: false, erro: "O usuário não pediu para cadastrar. Não cadastre: diga que esse cliente não está no CRM e pergunte se ele quer cadastrar." } };
    }
    const { snapshot, ownerName } = await loadScope(ctx.actor);
    const plan = planNewClient(args, snapshot, ctx.actor);
    if (!plan.ok) return { data: plan };
    const saved = await registerCompany(plan.input);
    invalidateCrmReadCache();
    const contato = saved.contacts[0]?.nome;
    const when = fmtWhen(saved.activity.dueAt);
    return {
      wrote: true,
      empresaId: saved.company.id,
      recibo: [
        `✅ Cliente cadastrado: ${saved.company.nome}${saved.company.cidade ? ` (${saved.company.cidade})` : ""}, no funil de Aquisição, etapa Lead.`,
        contato && `✅ Contato: ${contato}.`,
        `📅 Próximo passo: ${saved.activity.titulo}, ${when}.`,
      ].filter(Boolean).join("\n"),
      memo: `${saved.company.nome} empresa_id=${saved.company.id}: cadastrada agora nesta conversa; próximo passo tarefa_id=${saved.activity.id} "${saved.activity.titulo}" ${when}`,
      desfazer: { ops: [{ op: "apagar_empresa", id: saved.company.id }], resumo: `cadastro da ${saved.company.nome}` },
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
