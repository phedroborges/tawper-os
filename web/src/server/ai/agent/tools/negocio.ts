import { MOTIVOS_ESPERA, MOTIVOS_PERDA } from "@/lib/constants";
import type { AssistantActionPayload, AssistantActionProposal } from "@/lib/assistant-actions";
import type { Company, Deal, User } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { proposal } from "../../action-engine";
import { dueFrom, isPastDay } from "../dates";
import type { AgentContext, AgentTool } from "../types";
import { companyInScope, loadScope, str } from "./shared";

/**
 * Ganhar, perder, espera e retomar mudam o funil e os relatórios, e ganhar abre recorrência e pós-venda:
 * não dá para desfazer limpo. Por isso estas ferramentas só propõem; grava quando o usuário responde CONFIRMAR.
 */

type Base = { companies: Company[]; deals: Deal[]; users: User[] };
type Plan = { ok: true; payload: AssistantActionPayload; title: string; summary: string; confirmationText: string } | { ok: false; erro?: string; faltando?: string[] };

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function openDeal(base: Base, companyId: string) {
  return base.deals.filter((deal) => deal.companyId === companyId && deal.status === "aberta").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Motivo da lista do sistema quando bate; senão, o texto do usuário. */
function reason(value: unknown, list: readonly string[]) {
  const raw = str(value, 300);
  return list.find((item) => normalize(item) === normalize(raw)) ?? raw;
}

export function planNegocio(kind: "win_deal" | "lose_deal" | "set_standby" | "resume_standby", args: Record<string, unknown>, base: Base, visible: Set<string>, actor: User, now = new Date()): Plan {
  const found = companyInScope(args.empresa_id, base, visible);
  if ("erro" in found) return { ok: false, erro: found.erro };
  const company = found.company;

  if (kind === "resume_standby") {
    if (company.status !== "espera") return { ok: false, erro: `${company.nome} não está em espera.` };
    return { ok: true, payload: { kind, companyId: company.id }, title: `Retomar ${company.nome}`, summary: `Vou tirar a ${company.nome} da espera e voltar com ela para o funil.`, confirmationText: "Confirmar retomada" };
  }
  if (kind === "set_standby") {
    if (company.status !== "ativa") return { ok: false, erro: `Só uma conta ativa pode ir para espera; a ${company.nome} está ${company.status}.` };
    const motivo = reason(args.motivo, MOTIVOS_ESPERA);
    const condicao = str(args.condicao_retomada, 500);
    const due = dueFrom(args.data_reavaliacao, undefined);
    const faltando = [motivo.length < 3 && "motivo da espera", condicao.length < 3 && "o que precisa acontecer para retomar", "erro" in due && "data de reavaliação"].filter((item): item is string => Boolean(item));
    if (faltando.length) return { ok: false, faltando };
    if (!("iso" in due) || isPastDay(due.iso, now) || new Date(due.iso).getTime() <= now.getTime()) return { ok: false, erro: "A data de reavaliação precisa ser futura." };
    const responsavel = company.ownerId || actor.id;
    return {
      ok: true,
      payload: { kind, companyId: company.id, motivo, condicao, reavaliacao: due.iso, responsavelId: responsavel },
      title: `Espera: ${company.nome}`,
      summary: `Vou colocar a ${company.nome} em espera.\nMotivo: ${motivo}\nVolta quando: ${condicao}\nReavaliação: ${day(due.iso)}\nAs tarefas abertas dela serão encerradas.`,
      confirmationText: "Confirmar espera",
    };
  }

  const deal = openDeal(base, company.id);
  if (!deal) return { ok: false, erro: `A ${company.nome} não tem negócio aberto.` };
  if (kind === "win_deal") {
    if (company.status === "espera") return { ok: false, erro: `A ${company.nome} está em espera: para registrar a venda, ela primeiro precisa ser retomada (retomar_espera).` };
    const valor = Number(String(args.valor ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) return { ok: false, faltando: ["valor da venda"] };
    const obs = str(args.observacao, 500) || undefined;
    return {
      ok: true,
      payload: { kind, companyId: company.id, dealId: deal.id, valor, obs },
      title: `Venda: ${company.nome}`,
      summary: `Vou registrar a venda da ${company.nome}: ${brl(valor)}.${obs ? `\nObs.: ${obs}` : ""}\nO negócio fecha como ganho, o cliente entra na recorrência e o pós-venda é criado.`,
      confirmationText: "Confirmar venda",
    };
  }
  const motivo = reason(args.motivo, MOTIVOS_PERDA);
  if (motivo.length < 3) return { ok: false, faltando: ["motivo da perda"] };
  const obs = str(args.observacao, 500) || undefined;
  return {
    ok: true,
    payload: { kind, companyId: company.id, dealId: deal.id, motivo, obs },
    title: `Perda: ${company.nome}`,
    summary: `Vou marcar o negócio da ${company.nome} como perdido.\nMotivo: ${motivo}${obs ? `\nObs.: ${obs}` : ""}\nAs tarefas abertas dele serão encerradas.`,
    confirmationText: "Confirmar perda",
  };
}

function proposer(kind: Parameters<typeof planNegocio>[0]) {
  return async (args: Record<string, unknown>, ctx: AgentContext) => {
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planNegocio(kind, args, snapshot, visible, ctx.actor);
    if (!plan.ok) return { data: plan };
    const acao: AssistantActionProposal = proposal({ kind, status: "awaiting_confirmation", title: plan.title, summary: plan.summary, confirmationText: plan.confirmationText, actorId: ctx.actor.id, payload: plan.payload });
    ctx.acoes = [...(ctx.acoes ?? []).filter((item) => !(item.kind === acao.kind && item.payload?.companyId === plan.payload.companyId)), acao];
    ctx.acao = ctx.acoes[0];
    return { data: { ok: true, aguardando_confirmacao: plan.summary }, reply: plan.summary, empresaId: plan.payload.companyId };
  };
}

const empresa = { empresa_id: { type: "string", description: "id que veio de buscar_cliente." } };
const confirma = " Não grava na hora: mostra o resumo e o usuário confirma respondendo CONFIRMAR.";

export const ganharNegocio: AgentTool = {
  name: "ganhar_negocio",
  description: `Registra a venda: o negócio aberto do cliente fecha como ganho, com o valor. Use quando o usuário diz que fechou, vendeu, o cliente comprou ou mandou o pedido.${confirma}`,
  writes: false,
  parameters: {
    type: "object",
    properties: { ...empresa, valor: { type: "number", description: "Valor da venda em reais. Pergunte se o usuário não disse." }, observacao: { type: "string" } },
    required: ["empresa_id", "valor"],
    additionalProperties: false,
  },
  run: proposer("win_deal"),
};

export const perderNegocio: AgentTool = {
  name: "perder_negocio",
  description: `Marca o negócio aberto do cliente como perdido. Use quando o usuário diz que perdeu, que o cliente fechou com outro ou desistiu.${confirma}`,
  writes: false,
  parameters: {
    type: "object",
    properties: { ...empresa, motivo: { type: "string", description: `Um de: ${MOTIVOS_PERDA.join(", ")}; ou o motivo nas palavras do usuário.` }, observacao: { type: "string" } },
    required: ["empresa_id", "motivo"],
    additionalProperties: false,
  },
  run: proposer("lose_deal"),
};

export const colocarEmEspera: AgentTool = {
  name: "colocar_em_espera",
  description: `Põe a conta em espera: o cliente pediu para voltar a falar depois (próxima safra, orçamento do ano que vem, fim de contrato com concorrente). Precisa do motivo, do que tem de acontecer para retomar e da data de reavaliação.${confirma}`,
  writes: false,
  parameters: {
    type: "object",
    properties: {
      ...empresa,
      motivo: { type: "string", description: `Um de: ${MOTIVOS_ESPERA.join(", ")}; ou o motivo nas palavras do usuário.` },
      condicao_retomada: { type: "string", description: "O que precisa acontecer para voltar a negociar." },
      data_reavaliacao: { type: "string", description: "AAAA-MM-DD, quando olhar de novo." },
    },
    required: ["empresa_id", "motivo", "condicao_retomada", "data_reavaliacao"],
    additionalProperties: false,
  },
  run: proposer("set_standby"),
};

export const retomarEspera: AgentTool = {
  name: "retomar_espera",
  description: `Tira a conta da espera e volta com ela para o funil.${confirma}`,
  writes: false,
  parameters: { type: "object", properties: { ...empresa }, required: ["empresa_id"], additionalProperties: false },
  run: proposer("resume_standby"),
};
