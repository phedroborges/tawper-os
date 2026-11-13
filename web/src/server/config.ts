import "server-only";

import { EMPTY_CONFIG, parseConfig, type AppConfig } from "@/lib/config";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";

// shortcut: a configuração mora em reference_options (list_key = 'config', value = chave, label = JSON),
// a tabela de configuração da organização que já existe. Passar para tabela própria se ganhar histórico ou crescer.
const LIST_KEY = "config";
const KEYS: (keyof AppConfig)[] = ["stageRules", "activityRules", "goals", "remindersOff"];

const TTL_MS = 5_000;
let cache: { at: number; config: AppConfig } | null = null;

export async function loadConfig(fresh = false): Promise<AppConfig> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.config;
  const rows = await getSupabaseAdmin().from("reference_options").select("value, label").eq("organization_id", TAWPER_ORG_ID).eq("list_key", LIST_KEY);
  if (rows.error) throw new Error(rows.error.message);
  const raw: Partial<Record<keyof AppConfig, unknown>> = {};
  for (const row of rows.data ?? []) {
    try {
      raw[row.value as keyof AppConfig] = JSON.parse(String(row.label));
    } catch {
      /* linha ilegível: vale o padrão */
    }
  }
  const config = parseConfig(raw);
  cache = { at: Date.now(), config };
  return config;
}

/** Nunca derruba a leitura do CRM por causa da configuração. */
export async function loadConfigSafe(): Promise<AppConfig> {
  return loadConfig().catch(() => EMPTY_CONFIG);
}

export async function saveConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
  if (!KEYS.includes(key)) throw new Error("Configuração desconhecida.");
  const saved = await getSupabaseAdmin()
    .from("reference_options")
    .upsert({ organization_id: TAWPER_ORG_ID, list_key: LIST_KEY, value: key, label: JSON.stringify(value), is_active: false }, { onConflict: "organization_id,list_key,value" });
  if (saved.error) throw new Error(saved.error.message);
  cache = null;
}
