import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { getAssistantAccess } from "../src/server/assistant/access";
import { TABLES } from "../src/server/assistant/schema";

Object.assign(process.env, { NODE_ENV: "development" });
loadEnvConfig(process.cwd(), true);

async function main() {
  const access = await getAssistantAccess(new Request("http://127.0.0.1:4100/api/assistant"), AbortSignal.timeout(30000));
  if (!access.reader) throw new Error("CRM não configurado");
  const evidence: { table: string; ok: boolean; total: number | null }[] = [];
  for (const table of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
    try {
      const result = await access.reader.query({ table, filters: [], orderBy: null, descending: false, offset: 0, limit: 1 });
      evidence.push({ table, ok: true, total: result.total });
      console.log(JSON.stringify({ table, ok: true, total: result.total }));
    } catch {
      evidence.push({ table, ok: false, total: null });
      console.log(JSON.stringify({ table, ok: false }));
    }
  }
  const anon = createClient((process.env.ASSISTANT_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!, (process.env.ASSISTANT_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, { auth: { persistSession: false } });
  const anonResult = await anon.from("companies").select("id", { count: "exact", head: true });
  const anonymousCannotReadCompanies = Boolean(anonResult.error) || anonResult.count === 0;
  console.log(JSON.stringify({ anonymousCannotReadCompanies }));
  await mkdir("../docs/evidencias", { recursive: true });
  await writeFile("../docs/evidencias/assistant-crm-2026-10-17.json", JSON.stringify({ runAt: new Date().toISOString(), mode: access.mode, readOnly: true, evidence, anonymousCannotReadCompanies, note: "Sem criação ou alteração de registros. Este teste não substitui validação completa de RLS entre usuários autenticados." }, null, 2) + "\n");
  if (evidence.some((e) => !e.ok) || !anonymousCannotReadCompanies) process.exitCode = 1;
}

main().catch(() => { console.error("Não foi possível concluir a verificação do CRM."); process.exitCode = 1; });
