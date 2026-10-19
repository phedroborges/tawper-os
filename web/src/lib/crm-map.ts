/** Chaves da tela (funil da demo) ↔ chaves persistidas no Postgres. */

const STAGE_UI_TO_DB: Record<string, string> = {
  apresentacao: "apresentacao_empresa",
  suporte: "relacionamento",
};

const STAGE_DB_TO_UI: Record<string, string> = {
  apresentacao_empresa: "apresentacao",
  apresentacao_tecnica: "apresentacao",
};

export function stageKeyToDb(key: string) {
  return STAGE_UI_TO_DB[key] ?? key;
}

export function stageKeyToUi(key: string) {
  return STAGE_DB_TO_UI[key] ?? key;
}

export function checklistFromRequirements(rows: { key: string; isMet: boolean }[]) {
  const checklist: Record<string, boolean> = {};
  for (const row of rows) {
    if (!row.isMet) continue;
    checklist[row.key] = true;
  }
  return checklist;
}

export const RETORNO_NOTE_PREFIX = "[retorno]";

export function withRetornoNote(nota?: string) {
  const text = nota?.trim();
  if (!text) return text;
  return hasRetornoNote(text) ? text : `${RETORNO_NOTE_PREFIX} ${text}`;
}

export function hasRetornoNote(note?: string | null) {
  return Boolean(note?.trim().toLowerCase().startsWith(RETORNO_NOTE_PREFIX));
}
