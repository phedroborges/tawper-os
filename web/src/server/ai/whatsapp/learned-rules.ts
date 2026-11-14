import "server-only";

import { DEFAULT_LEARNED_RULES, type LearnedRule } from "@/lib/ia-sessions";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { supabaseOn } from "@/server/auth/team";

const SETTING_KEY = "whatsapp_ia_learned_rules";

const memoryStore: { rules: LearnedRule[]; loadedAt: number } = {
  rules: [...DEFAULT_LEARNED_RULES],
  loadedAt: 0,
};

/**
 * Carrega as Regras Aprendidas (do banco via audit_log/settings ou fallback em memória).
 * Usa cache curto (20s) para que o agente do WhatsApp injete as regras ativas sem custo de latência.
 */
export async function loadLearnedRules(forceRefresh = false): Promise<LearnedRule[]> {
  const now = Date.now();
  if (!forceRefresh && memoryStore.loadedAt > 0 && now - memoryStore.loadedAt < 20_000) {
    return memoryStore.rules;
  }

  if (!supabaseOn()) {
    memoryStore.loadedAt = now;
    return memoryStore.rules;
  }

  try {
    const db = getSupabaseAdmin();
    const res = await db
      .from("audit_logs")
      .select("id, created_at, metadata")
      .eq("organization_id", TAWPER_ORG_ID)
      .eq("action", SETTING_KEY)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!res.error && res.data && res.data.length > 0) {
      const meta = res.data[0].metadata as { rules?: LearnedRule[] } | null;
      if (meta && Array.isArray(meta.rules) && meta.rules.length > 0) {
        memoryStore.rules = meta.rules;
        memoryStore.loadedAt = now;
        return memoryStore.rules;
      }
    }
  } catch {
    // Mantém regras em memória se a tabela não responder
  }

  memoryStore.loadedAt = now;
  return memoryStore.rules;
}

export async function saveLearnedRules(rules: LearnedRule[], actorProfileId?: string): Promise<LearnedRule[]> {
  memoryStore.rules = rules;
  memoryStore.loadedAt = Date.now();

  if (supabaseOn()) {
    try {
      const db = getSupabaseAdmin();
      await db.from("audit_logs").insert({
        organization_id: TAWPER_ORG_ID,
        actor_profile_id: actorProfileId ?? null,
        entity_type: "ai_agent",
        action: SETTING_KEY,
        summary: `Atualização de regras aprendidas da IA (${rules.filter((r) => r.active).length} ativas)`,
        metadata: { rules },
      });
    } catch {
      // Falha de persistência não bloqueia atualização em memória
    }
  }

  return memoryStore.rules;
}

export async function appendLearnedRule(
  entry: Omit<LearnedRule, "id" | "createdAt">,
  actorProfileId?: string,
): Promise<LearnedRule> {
  const current = await loadLearnedRules(true);
  const normalizedNew = entry.rule.trim().toLowerCase();
  const existing = current.find((r) => r.rule.trim().toLowerCase() === normalizedNew);
  if (existing) return existing;

  const created: LearnedRule = {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  const next = [created, ...current].slice(0, 40);
  await saveLearnedRules(next, actorProfileId);
  return created;
}

/** Retorna apenas os textos das regras ativas prontas para injetar no prompt do Agente de WhatsApp. */
export async function activeLearnedRulesForPrompt(): Promise<string[]> {
  const rules = await loadLearnedRules(false);
  return rules.filter((r) => r.active && r.rule.trim().length > 0).map((r) => r.rule.trim());
}
