import "server-only";

import postgres from "postgres";
import { TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { invalidateCrmReadCache } from "@/server/crm";
import { ensureOperators, resolveOwner } from "@/server/persist";

/**
 * O contrário de cada gravação do agente, guardado junto da resposta no WhatsApp.
 * Quando o usuário responde DESFAZER, o sistema aplica estes passos de trás para frente, numa transação só.
 */
export type UndoOp =
  | { op: "cancelar_tarefa"; id: string }
  | { op: "reabrir_tarefa"; id: string }
  | { op: "prazo_tarefa"; id: string; dueAt: string }
  | { op: "apagar_registro"; id: string }
  | { op: "apagar_contato"; id: string }
  | { op: "recriar_contato"; row: Cells }
  | { op: "restaurar_contato"; id: string; row: Cells }
  | { op: "restaurar_empresa"; id: string; row: Cells }
  | { op: "apagar_empresa"; id: string };

/** Um item desfazível: os passos e a frase que aparece no "↩️ Desfeito: …". */
export type Undo = { ops: UndoOp[]; resumo: string };

/** Linha do banco como veio (e volta) do JSON guardado na resposta. */
export type Cells = Record<string, string | number | boolean | Date | null>;

const COMPANY_COLUMNS = [
  "trade_name", "legal_name", "cnpj", "city", "state", "postal_code", "address", "industry", "region_id", "notes",
  "harvesters_count", "press_type", "current_brand", "competitor", "potential", "urgency",
] as const;
const CONTACT_COLUMNS = ["name", "job_title", "role", "whatsapp_e164", "email", "preferred_channel", "is_active"] as const;

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente para gravar pelo agente.");
  return postgres(url, { max: 1, ssl: /(?:localhost|127\.0\.0\.1):\d+/.test(url) ? false : "require" });
}

async function profileOf(actorId: string) {
  return resolveOwner(actorId, await ensureOperators());
}

type Tx = postgres.TransactionSql;

/** Transação com autor = o usuário, origem = IA (a auditoria registra os dois). */
export async function aiTx<T>(actorId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const actor = await profileOf(actorId);
  const sql = connect();
  try {
    return (await sql.begin(async (tx) => {
      await tx`select app.crm_begin(${actor}::uuid, 'ai')`;
      return fn(tx);
    })) as T;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Valores atuais das colunas da empresa, para devolver no desfazer. */
export async function companyRow(id: string) {
  const sql = connect();
  try {
    const rows = await sql<Cells[]>`
      select ${sql(COMPANY_COLUMNS as unknown as string[])} from public.companies where id = ${id}::uuid and organization_id = ${TAWPER_ORG_ID}::uuid
    `;
    return rows[0] ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** O registro que acabou de entrar na linha do tempo (crm_add_interaction não devolve o id). */
export async function lastInteractionId(companyId: string, titulo: string) {
  const sql = connect();
  try {
    const rows = await sql<{ id: string }[]>`
      select id::text from public.interactions
       where company_id = ${companyId}::uuid and title = ${titulo.trim()} and created_at > now() - interval '5 minutes'
       order by created_at desc limit 1
    `;
    return rows[0]?.id ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function updateContactRow(actorId: string, id: string, patch: Cells) {
  return aiTx(actorId, async (tx) => {
    const before = await tx<Cells[]>`
      select ${tx(CONTACT_COLUMNS as unknown as string[])} from public.contacts where id = ${id}::uuid and organization_id = ${TAWPER_ORG_ID}::uuid for update
    `;
    if (!before[0]) throw new Error("Contato não encontrado.");
    const cols = Object.keys(patch);
    if (cols.length) await tx`update public.contacts set ${tx(patch, cols)} where id = ${id}::uuid`;
    return before[0];
  });
}

/** Apaga o contato e devolve a linha inteira, para recriar igual no desfazer. */
export async function deleteContactRow(actorId: string, id: string) {
  return aiTx(actorId, async (tx) => {
    const rows = await tx<Cells[]>`
      delete from public.contacts where id = ${id}::uuid and organization_id = ${TAWPER_ORG_ID}::uuid returning *
    `;
    if (!rows[0]) throw new Error("Contato não encontrado.");
    return rows[0];
  });
}

export async function cancelActivityRow(actorId: string, id: string, motivo: string) {
  return aiTx(actorId, async (tx) => {
    const rows = await tx`
      update public.activities set status = 'cancelled', outcome = ${motivo}
       where id = ${id}::uuid and organization_id = ${TAWPER_ORG_ID}::uuid and status in ('pending', 'in_progress')
      returning id
    `;
    if (!rows.length) throw new Error("A tarefa não está mais pendente.");
  });
}

async function apply(tx: Tx, item: UndoOp) {
  switch (item.op) {
    case "cancelar_tarefa":
      await tx`update public.activities set status = 'cancelled', outcome = 'Desfeito pelo usuário' where id = ${item.id}::uuid and status in ('pending', 'in_progress')`;
      return;
    case "reabrir_tarefa":
      await tx`update public.activities set status = 'pending', outcome = null where id = ${item.id}::uuid and status in ('done', 'cancelled')`;
      return;
    case "prazo_tarefa":
      await tx`update public.activities set due_at = ${item.dueAt}::timestamptz where id = ${item.id}::uuid`;
      return;
    case "apagar_registro":
      await tx`delete from public.interactions where id = ${item.id}::uuid`;
      return;
    case "apagar_contato":
      await tx`delete from public.contacts where id = ${item.id}::uuid`;
      return;
    case "recriar_contato": {
      const cols = Object.keys(item.row);
      await tx`insert into public.contacts ${tx(item.row, cols)} on conflict (id) do nothing`;
      return;
    }
    case "restaurar_contato": {
      const cols = Object.keys(item.row);
      if (cols.length) await tx`update public.contacts set ${tx(item.row, cols)} where id = ${item.id}::uuid`;
      return;
    }
    case "restaurar_empresa": {
      const cols = Object.keys(item.row);
      if (cols.length) await tx`update public.companies set ${tx(item.row, cols)} where id = ${item.id}::uuid`;
      return;
    }
    case "apagar_empresa":
      // O histórico de etapa é imutável; apagar o cadastro recém-criado é correção, e fica na auditoria.
      await tx`select set_config('app.admin_correction', 'on', true)`;
      await tx`delete from public.companies where id = ${item.id}::uuid and organization_id = ${TAWPER_ORG_ID}::uuid`;
      await tx`select set_config('app.admin_correction', '', true)`;
      return;
  }
}

/** Desfaz, na ordem inversa, tudo o que a resposta gravou. Tudo ou nada. */
export async function runUndo(actorId: string, undos: Undo[]) {
  await aiTx(actorId, async (tx) => {
    for (const undo of [...undos].reverse()) {
      for (const item of [...undo.ops].reverse()) await apply(tx, item);
    }
  });
  invalidateCrmReadCache();
}
