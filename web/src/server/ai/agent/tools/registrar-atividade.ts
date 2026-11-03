import { ACTIVITY_TYPES } from "@/lib/constants";
import { storedWhatsApp } from "@/lib/br-ids";
import type { Activity, ActivityType, Canal, Company, Contact, Deal, User } from "@/lib/types";
import { normalize } from "@/lib/utils";
import { runCommand } from "@/server/commands";
import { invalidateCrmReadCache } from "@/server/crm";
import { addActivityRecord, addContactRecord, completeActivityRecord } from "@/server/persist";
import { dueFrom, fmtWhen, isPastDay, pastDayError } from "../dates";
import type { AgentContext, AgentTool } from "../types";
import { lastInteractionId, type UndoOp } from "../undo";
import { companyInScope, duplicatesPending, loadScope, otherContactInTask, pendingTasks, str, taskBrief } from "./shared";

type Base = { companies: Company[]; contacts: Contact[]; deals: Deal[]; activities: Activity[] };

const FEITO = ["Ligação", "WhatsApp", "Visita", "Reunião", "E-mail", "Outro"] as const;
const CANAL: Record<string, Canal> = { Ligação: "Ligação", WhatsApp: "WhatsApp", Visita: "Visita", Reunião: "Reunião", "E-mail": "E-mail" };

function pickType(value: unknown, allowed: readonly string[]) {
  const raw = normalize(str(value, 30));
  return allowed.find((item) => normalize(item) === raw);
}

/** Contato da empresa com esse nome: "Pedro" acha "Pedro Henrique". */
export function findContact(contacts: Contact[], companyId: string, nome: string) {
  const target = normalize(nome);
  if (!target) return undefined;
  return contacts.find((contact) => {
    if (contact.companyId !== companyId) return false;
    const name = normalize(contact.nome);
    return name === target || name.startsWith(`${target} `) || target.startsWith(`${name} `);
  });
}

export type RegistroPlan =
  | { ok: false; faltando?: string[]; erro?: string; dica?: string }
  | {
      ok: true;
      company: Company;
      dealId?: string;
      canal: Canal;
      tipo: string;
      titulo: string;
      resumo: string;
      contato?: { existente?: Contact; novo?: Omit<Contact, "id"> };
      tarefa?: Activity;
      next?: { tipo: ActivityType; titulo: string; dueAt: string };
      restantes: Activity[];
    };

/** Valida o registro e decide o que gravar. Não grava nada. */
export function planRegistro(args: Record<string, unknown>, base: Base, visible: Set<string>, now = new Date(), said?: Pick<AgentContext, "question" | "history">): RegistroPlan {
  const found = companyInScope(args.empresa_id, base, visible);
  if ("erro" in found) return { ok: false, erro: found.erro };
  const company = found.company;
  const tipo = pickType(args.tipo, FEITO);
  const resumo = str(args.resumo, 1500);
  const faltando = [!tipo && "tipo (o que foi feito: ligação, visita…)", !resumo && "resumo do que aconteceu"].filter((item): item is string => Boolean(item));
  if (faltando.length) return { ok: false, faltando };

  let tarefa: Activity | undefined;
  if (args.concluir_tarefa_id) {
    tarefa = base.activities.find((item) => item.id === args.concluir_tarefa_id && item.companyId === company.id);
    if (!tarefa) return { ok: false, erro: "concluir_tarefa_id não é uma tarefa desta empresa. Use o id de tarefas_pendentes do buscar_cliente." };
    if (tarefa.status !== "pendente") return { ok: false, erro: `A tarefa "${tarefa.titulo}" já não está pendente.` };
    const outro = said ? otherContactInTask(tarefa, base.contacts, said) : undefined;
    if (outro) return { ok: false, erro: `A tarefa "${tarefa.titulo}" é com ${outro}, e o usuário não falou de ${outro.split(" ")[0]}. Registre sem concluir_tarefa_id e, no fim, pergunte se essa tarefa foi feita.` };
  }

  let next: { tipo: ActivityType; titulo: string; dueAt: string } | undefined;
  const passo = args.proximo_passo && typeof args.proximo_passo === "object" ? (args.proximo_passo as Record<string, unknown>) : null;
  if (passo) {
    const titulo = str(passo.titulo, 160);
    const due = dueFrom(passo.data, passo.hora);
    if (!titulo) return { ok: false, erro: "proximo_passo sem título." };
    if ("erro" in due) return { ok: false, erro: `proximo_passo: ${due.erro}` };
    if (isPastDay(due.iso, now)) return { ok: false, erro: `proximo_passo: ${pastDayError(due.iso, now)}` };
    next = { tipo: (pickType(passo.tipo, ACTIVITY_TYPES) ?? "Ligação") as ActivityType, titulo, dueAt: due.iso };
  }

  const restantes = pendingTasks(base, company.id).filter((item) => item.id !== tarefa?.id);
  if (next && duplicatesPending(next.titulo, pendingTasks(base, company.id))) next = undefined;
  // Toda empresa ativa precisa de um próximo passo: sem um dito e sem outra tarefa aberta, pergunta antes de gravar.
  if (!next && !restantes.length) {
    return {
      ok: false,
      faltando: ["proximo_passo"],
      dica: `${company.nome} ficaria sem próximo passo. Sugira um que faça sentido com o que foi contado (tipo, o quê e quando) e pergunte se pode ser esse. Nada foi gravado ainda.`,
    };
  }

  const contatoNome = str(args.contato_nome, 120);
  let contato: { existente?: Contact; novo?: Omit<Contact, "id"> } | undefined;
  if (contatoNome) {
    const existente = findContact(base.contacts, company.id, contatoNome);
    const rawPhone = str(args.contato_whatsapp, 30);
    const phone = rawPhone ? storedWhatsApp(rawPhone) : undefined;
    if (rawPhone && !phone && !existente) return { ok: false, erro: "WhatsApp do contato inválido. Precisa de celular brasileiro com DDD (ou registre sem o número)." };
    contato = existente
      ? { existente }
      : {
          novo: {
            companyId: company.id,
            nome: contatoNome,
            cargo: str(args.contato_cargo, 80),
            papel: "Outro",
            influencia: 2,
            whatsapp: phone || undefined,
            canal: phone ? "WhatsApp" : "Ligação",
            autorizaContato: true,
            ativo: true,
          },
        };
  }

  const deal = base.deals.find((item) => item.companyId === company.id && item.status === "aberta");
  const titulo = str(args.resultado, 160) || `${tipo}${contatoNome ? ` com ${contatoNome}` : ""}`;
  return { ok: true, company, dealId: deal?.id, canal: CANAL[tipo!] ?? "Nota", tipo: tipo!, titulo, resumo, contato, tarefa, next, restantes };
}

export const registrarAtividade: AgentTool = {
  name: "registrar_atividade",
  description:
    "Registra no histórico do cliente algo que o usuário JÁ FEZ (ligação, visita, reunião, WhatsApp, e-mail) e cria o próximo passo. Se a conversa foi com alguém que ainda não é contato da empresa, o contato é cadastrado junto. Também conclui uma tarefa pendente, mas só se o usuário disse que fez exatamente aquela tarefa.",
  writes: true,
  parameters: {
    type: "object",
    properties: {
      empresa_id: { type: "string", description: "id que veio de buscar_cliente." },
      tipo: { type: "string", enum: [...FEITO], description: "O que foi feito." },
      resultado: { type: "string", description: "Título curto do que aconteceu. Ex.: Pedro liberou visita para 22/01." },
      resumo: { type: "string", description: "O que aconteceu, em 1 a 3 frases objetivas, só com o que o usuário contou." },
      contato_nome: { type: "string", description: "Com quem foi a conversa, se o usuário disse." },
      contato_cargo: { type: "string" },
      contato_whatsapp: { type: "string", description: "Só se o usuário passou o número." },
      concluir_tarefa_id: {
        type: "string",
        description: "id da tarefa pendente que o usuário disse ter feito (\"aquela ligação pra Joana eu já fiz\" conclui a ligação da Joana). Conversa com outra pessoa não conclui a tarefa de outro contato. Se não ficou claro, registre sem concluir e pergunte.",
      },
      proximo_passo: {
        type: "object",
        description: "O que vem depois, se o usuário disse (ex.: visita marcada, mandar orçamento).",
        properties: {
          tipo: { type: "string", enum: ACTIVITY_TYPES },
          titulo: { type: "string", description: "Ex.: Visitar o Pedro na usina." },
          data: { type: "string", description: "AAAA-MM-DD, já convertida a partir de hoje." },
          hora: { type: "string", description: "HH:MM, se o usuário disse." },
        },
        required: ["tipo", "titulo", "data"],
        additionalProperties: false,
      },
    },
    required: ["empresa_id", "tipo", "resumo"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const { snapshot, visible } = await loadScope(ctx.actor);
    const plan = planRegistro(args, snapshot, visible, new Date(), ctx);
    if (!plan.ok) return { data: plan };
    const actor: User = ctx.actor;
    const ai = { actorId: actor.id, actorType: "ai" as const };
    const request = (suffix: string) => (ctx.requestId ? `${ctx.requestId}:${suffix}` : undefined);

    const ops: UndoOp[] = [];
    let contatoNovo = false;
    if (plan.contato?.novo) {
      const contactId = await addContactRecord(plan.contato.novo, actor.id);
      if (contactId) ops.push({ op: "apagar_contato", id: contactId });
      contatoNovo = true;
    }
    const nextActivity = plan.next ? { ...plan.next, companyId: plan.company.id, dealId: plan.dealId, ownerId: plan.company.ownerId, origem: "ia" as const } : undefined;
    let nextId: string | null = null;
    if (plan.tarefa) {
      nextId = await completeActivityRecord(plan.tarefa.id, `${plan.titulo}. ${plan.resumo}`, nextActivity, { ...ai, requestId: request(`concluir:${plan.tarefa.id}`) });
      ops.push({ op: "reabrir_tarefa", id: plan.tarefa.id });
    } else {
      await runCommand({ command: "addInteraction", companyId: plan.company.id, dealId: plan.dealId, canal: plan.canal, kind: "note", titulo: plan.titulo, conteudo: plan.resumo, autorId: actor.id });
      const registroId = await lastInteractionId(plan.company.id, plan.titulo).catch(() => null);
      if (registroId) ops.push({ op: "apagar_registro", id: registroId });
      if (nextActivity) nextId = await addActivityRecord(nextActivity, { ...ai, requestId: request(`passo:${nextActivity.titulo}:${nextActivity.dueAt}`) });
    }
    if (nextId) ops.push({ op: "cancelar_tarefa", id: nextId });
    invalidateCrmReadCache();

    const com = plan.contato ? ` com ${plan.contato.existente?.nome ?? plan.contato.novo?.nome}` : "";
    const recibo = [
      `✅ Registrado na ${plan.company.nome}: ${plan.tipo.toLowerCase()}${com}.`,
      contatoNovo && `✅ ${plan.contato?.novo?.nome} adicionado aos contatos da ${plan.company.nome}.`,
      plan.tarefa && `✅ Tarefa concluída: ${plan.tarefa.titulo}.`,
      plan.next && `📅 Próximo passo: ${plan.next.titulo} (${plan.next.tipo}), ${fmtWhen(plan.next.dueAt)}.`,
    ].filter(Boolean).join("\n");
    return {
      wrote: true,
      recibo,
      empresaId: plan.company.id,
      memo: `${plan.company.nome} empresa_id=${plan.company.id}: registrada ${plan.tipo}${com}${plan.tarefa ? `; concluída tarefa_id=${plan.tarefa.id}` : ""}${plan.next ? `; próximo passo tarefa_id=${nextId ?? "?"} "${plan.next.titulo}" ${fmtWhen(plan.next.dueAt)}` : ""}`,
      desfazer: { ops, resumo: `registro de ${plan.tipo.toLowerCase()} na ${plan.company.nome}` },
      data: {
        ok: true,
        registrado: { empresa: plan.company.nome, tipo: plan.tipo, titulo: plan.titulo },
        contato_adicionado: contatoNovo ? plan.contato?.novo?.nome : undefined,
        tarefa_concluida: plan.tarefa?.titulo,
        proximo_passo: plan.next ? { id: nextId, titulo: plan.next.titulo, quando: fmtWhen(plan.next.dueAt) } : undefined,
        outras_tarefas_pendentes: plan.restantes.slice(0, 4).map(taskBrief),
      },
    };
  },
};
