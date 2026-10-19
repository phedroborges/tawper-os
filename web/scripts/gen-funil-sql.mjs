/**
 * Gera a migration que alinha os funis do banco com os funis do app (web/src/lib/constants.ts).
 * O app é a definição aprovada de etapas, critérios e tarefas; o banco precisa aplicar exatamente
 * as mesmas regras quando muda a etapa de um negócio.
 *
 *   node scripts/gen-funil-sql.mjs > ../supabase/migrations/<timestamp>_0019_funis_alinhados.sql
 */
import { FUNNELS } from "../src/lib/constants.ts";

const ACTIVITY = { Ligação: "call", WhatsApp: "whatsapp", "E-mail": "email", Visita: "visit", Reunião: "meeting", Cotação: "quote", Homologação: "homologation", Cadastro: "registration", Suporte: "support", Outro: "other" };
const FIELD = { cidade: "city", regiao: "region_id", ramo: "industry", colhedoras: "harvesters_count", prensa: "press_type", marcaAtual: "current_brand", potencial: "potential" };
const LEGACY = { aquisicao: { apresentacao_empresa: "apresentacao", apresentacao_tecnica: "apresentacao" }, recorrencia: { negociacao_r: "orcamento_r" } };
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const snake = (id) => id.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

const out = [];
out.push(`-- =============================================================================
-- Tawper OS — 0019 — Funis do banco alinhados aos funis do app
-- Gerada por web/scripts/gen-funil-sql.mjs a partir de web/src/lib/constants.ts.
-- Etapas, probabilidades, prazos, critérios de saída e tarefas das etapas passam a ser
-- exatamente os que a tela mostra; o banco aplica essas regras ao mudar de etapa.
-- Negócios em etapas que deixam de existir são movidos para a etapa equivalente.
-- =============================================================================

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001';
  v_f   uuid;
  v_s   uuid;
  v_old uuid;
begin
  perform set_config('app.bypass_stage_rules', 'on', true);
  perform set_config('app.admin_correction', 'on', true);
`);

for (const [funnelKey, funnel] of Object.entries(FUNNELS)) {
  out.push(`  -- ---------------------------------------------------------------- ${funnelKey}`);
  out.push(`  select id into v_f from public.funnels where organization_id = v_org and key = ${q(funnelKey)};`);
  const keys = funnel.stages.map((s) => s.id);
  funnel.stages.forEach((s, i) => {
    const outcome = s.terminal ? "'won'" : "null";
    out.push(`
  -- ${s.nome}
  insert into public.stages (organization_id, funnel_id, key, name, short_name, objective, position, sla_days, probability, is_terminal, terminal_outcome)
  values (v_org, v_f, ${q(s.id)}, ${q(s.nome)}, ${q(s.curto)}, ${q(s.objetivo)}, ${1000 + i + 1}, ${s.limiteDias}, ${s.probabilidade}, ${s.terminal ? "true" : "false"}, ${outcome})
  on conflict (funnel_id, key) do update set
    name = excluded.name, short_name = excluded.short_name, objective = excluded.objective, position = excluded.position, sla_days = excluded.sla_days,
    probability = excluded.probability, is_terminal = excluded.is_terminal, terminal_outcome = excluded.terminal_outcome, is_active = true;
  select id into v_s from public.stages where funnel_id = v_f and key = ${q(s.id)};
  delete from public.stage_requirements where stage_id = v_s;
  delete from public.stage_task_templates where stage_id = v_s;`);
    s.criterios.forEach((c, k) => {
      out.push(`  insert into public.stage_requirements (organization_id, stage_id, key, label, kind, field_name, hint, position)
  values (v_org, v_s, ${q(snake(c.id))}, ${q(c.label)}, ${q(c.kind)}, ${c.field ? q(FIELD[c.field]) : "null"}, ${c.hint ? q(c.hint) : "null"}, ${k + 1});`);
    });
    s.tarefas.forEach((t, k) => {
      out.push(`  insert into public.stage_task_templates (organization_id, stage_id, title, activity_type, due_days, priority, is_mandatory, position)
  values (v_org, v_s, ${q(t.titulo)}, ${q(ACTIVITY[t.tipo])}, ${t.prazoDias}, 'medium', false, ${k + 1});`);
    });
  });

  // Etapas antigas: move o que estiver nelas para a equivalente e remove.
  for (const [oldKey, newKey] of Object.entries(LEGACY[funnelKey] ?? {})) {
    out.push(`
  select id into v_old from public.stages where funnel_id = v_f and key = ${q(oldKey)};
  if v_old is not null then
    select id into v_s from public.stages where funnel_id = v_f and key = ${q(newKey)};
    update public.opportunities set stage_id = v_s where stage_id = v_old;
    update public.opportunity_stage_history set stage_id = v_s where stage_id = v_old;
    update public.activity_results set suggested_stage_id = v_s where suggested_stage_id = v_old;
    delete from public.stages where id = v_old;
  end if;`);
  }
  out.push(`
  -- renumera na ordem do app (a unicidade de posição é verificada só no fim)
  update public.stages set position = position - 1000 where funnel_id = v_f and position > 1000;`);
  out.push(`  delete from public.stages where funnel_id = v_f and key <> all (array[${keys.map(q).join(", ")}]);
`);
}

out.push(`  perform set_config('app.bypass_stage_rules', '', true);
  perform set_config('app.admin_correction', '', true);
end $$;
`);

console.log(out.join("\n"));
