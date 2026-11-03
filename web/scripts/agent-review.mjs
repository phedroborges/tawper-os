/**
 * Revisão semanal do agente do WhatsApp: lista os atendimentos dos últimos dias que pedem atenção.
 * Só lê o banco (pela API do Supabase, com a chave de serviço do .env.local da pasta atual ou de web/).
 * Uso, de dentro de web/: node scripts/agent-review.mjs [dias=7] [--todos]
 *
 * Entra na lista: quem respondeu "errou", ferramenta que falhou ou recusou, limite de passos,
 * queda no fluxo antigo, e a mensagem seguinte do usuário (quando ele corrige, aparece aqui).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = [join(process.cwd(), ".env.local"), join(here, "..", ".env.local")].find((path) => existsSync(path));
const env = envPath
  ? Object.fromEntries(
      readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
        }),
    )
  : {};
const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ausentes (rode de dentro de web/, onde está o .env.local).");

async function get(path) {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`${response.status} ao ler ${path.split("?")[0]}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

const days = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 7);
const all = process.argv.includes("--todos");
const since = new Date(Date.now() - days * 86_400_000).toISOString();

const runs = await get(
  `ai_agent_runs?select=id,created_at,finished_at,session_id,model,prompt_version,actor_profile_id,input_summary,output_summary&agent_key=eq.whatsapp_agent&created_at=gt.${since}&order=created_at.asc&limit=1000`,
);
const flagged = runs.filter((run) => all || (run.output_summary?.marcas ?? []).length);
const names = new Map();
const profileIds = [...new Set(flagged.map((run) => run.actor_profile_id).filter(Boolean))];
if (profileIds.length) for (const p of await get(`profiles?select=id,full_name&id=in.(${profileIds.join(",")})`)) names.set(p.id, p.full_name);

console.log(`${runs.length} atendimentos em ${days} dia(s); ${flagged.length} para revisar.\n`);
for (const run of flagged) {
  const steps = await get(`ai_agent_steps?select=tool_name,status,request_summary&run_id=eq.${run.id}&kind=eq.tool&order=step_number.asc`);
  const after = encodeURIComponent(run.finished_at ?? run.created_at);
  const [next] = await get(`ai_channel_messages?select=body&session_id=eq.${run.session_id}&direction=eq.in&created_at=gt.${after}&order=created_at.asc&limit=1`);
  const when = new Date(run.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`── ${when} · ${names.get(run.actor_profile_id) ?? "?"} · ${run.model ?? "fluxo antigo"} · v${run.prompt_version}`);
  console.log(`   marcas: ${(run.output_summary?.marcas ?? []).join(", ") || "-"}`);
  console.log(`   pediu${run.input_summary?.audio ? " (áudio)" : ""}: ${run.input_summary?.pergunta}`);
  for (const step of steps) console.log(`   ${step.status === "completed" ? "✓" : "✗"} ${step.tool_name} ${JSON.stringify(step.request_summary).slice(0, 220)}`);
  console.log(`   respondeu: ${String(run.output_summary?.resposta ?? "").replace(/\n+/g, " / ").slice(0, 400)}`);
  if (next) console.log(`   depois o usuário disse: ${next.body}`);
  console.log();
}
