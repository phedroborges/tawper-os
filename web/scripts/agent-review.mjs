/**
 * Revisão semanal do agente do WhatsApp: lista os atendimentos dos últimos dias que pedem atenção.
 * Só lê o banco. Uso: node scripts/agent-review.mjs [dias=7] [--todos]
 *
 * Entra na lista: quem respondeu "errou", ferramenta que falhou ou recusou, limite de passos,
 * queda no fluxo antigo, e a mensagem seguinte do usuário (quando ele corrige, aparece aqui).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const url = process.env.DATABASE_URL || env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ausente.");

const days = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? 7);
const all = process.argv.includes("--todos");
const sql = postgres(url, { max: 1, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require" });

try {
  const runs = await sql`
    select r.id, r.created_at, r.session_id, r.model, r.prompt_version, p.full_name,
           r.input_summary, r.output_summary,
           (select json_agg(json_build_object('tool', s.tool_name, 'ok', s.status = 'completed', 'args', s.request_summary) order by s.step_number)
              from public.ai_agent_steps s where s.run_id = r.id and s.kind = 'tool') as tools,
           (select m.body from public.ai_channel_messages m
             where m.session_id = r.session_id and m.direction = 'in' and m.created_at > r.finished_at
             order by m.created_at limit 1) as seguinte
      from public.ai_agent_runs r
      left join public.profiles p on p.id = r.actor_profile_id
     where r.agent_key = 'whatsapp_agent' and r.created_at > now() - make_interval(days => ${days})
     order by r.created_at
  `;
  const flagged = runs.filter((run) => all || (run.output_summary?.marcas ?? []).length);
  console.log(`${runs.length} atendimentos em ${days} dia(s); ${flagged.length} para revisar.\n`);
  for (const run of flagged) {
    const when = new Date(run.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    console.log(`── ${when} · ${run.full_name ?? "?"} · ${run.model ?? "fluxo antigo"} · v${run.prompt_version}`);
    console.log(`   marcas: ${(run.output_summary?.marcas ?? []).join(", ") || "-"}`);
    console.log(`   pediu${run.input_summary?.audio ? " (áudio)" : ""}: ${run.input_summary?.pergunta}`);
    for (const tool of run.tools ?? []) console.log(`   ${tool.ok ? "✓" : "✗"} ${tool.tool} ${JSON.stringify(tool.args).slice(0, 220)}`);
    console.log(`   respondeu: ${String(run.output_summary?.resposta ?? "").replace(/\n+/g, " / ").slice(0, 400)}`);
    if (run.seguinte) console.log(`   depois o usuário disse: ${run.seguinte}`);
    console.log();
  }
} finally {
  await sql.end({ timeout: 5 });
}
