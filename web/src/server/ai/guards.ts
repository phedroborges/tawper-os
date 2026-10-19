import type { CopilotResult } from "@/lib/ai";

type KnownContact = { nome: string; papel: string; cargo?: string };

function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function contactsFrom(context: unknown): KnownContact[] {
  if (!context || typeof context !== "object") return [];
  const contacts = (context as { contatos?: unknown }).contatos;
  if (!Array.isArray(contacts)) return [];
  return contacts.flatMap((item): KnownContact[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as { nome?: unknown; papel?: unknown; cargo?: unknown };
      if (typeof row.nome !== "string" || typeof row.papel !== "string") return [];
      return [{ nome: row.nome.trim(), papel: row.papel.trim(), cargo: typeof row.cargo === "string" ? row.cargo.trim() : undefined }];
    });
}

/** Fatos canônicos do CRM vencem texto do modelo e rascunhos locais. */
export function reconcileCopilotWithKnownContacts(result: CopilotResult, context: unknown): CopilotResult {
  const decisionMaker = contactsFrom(context).find((contact) => fold(contact.papel) === "decisor");
  if (!decisionMaker) return result;

  const firstName = decisionMaker.nome.split(/\s+/)[0];
  const missingDecisionMaker = (value: string) => {
    const text = fold(value);
    return /quem (decide|aprova)( a)? compra|identificar.{0,30}decisor|descobrir.{0,30}decisor|mapear.{0,30}decisor|contato.{0,20}decisor/.test(text);
  };
  const discoveryAction = (value: string) => {
    const text = fold(value);
    return /(identificar|descobrir|mapear|encontrar).{0,45}(decisor|quem decide|quem aprova)/.test(text);
  };

  const baseFact = `Decisor cadastrado: ${decisionMaker.nome}${decisionMaker.cargo ? ` (${decisionMaker.cargo})` : ""}.`;
  const base = result.base.some((item) => fold(item).includes(fold(decisionMaker.nome))) ? result.base : [baseFact, ...result.base].slice(0, 8);
  const faltantes = result.faltantes.filter((item) => !missingDecisionMaker(item));
  const acoes = result.detalhes.acoes.map((action) =>
    discoveryAction(action.titulo) ? { ...action, titulo: `Alinhar critérios de decisão com ${firstName}` } : action,
  );
  const perguntas = result.detalhes.perguntas.map((question) =>
    missingDecisionMaker(question) ? `Quais critérios ${firstName} usará para aprovar a compra?` : question,
  );

  return { ...result, base, faltantes, detalhes: { ...result.detalhes, acoes, perguntas } };
}
