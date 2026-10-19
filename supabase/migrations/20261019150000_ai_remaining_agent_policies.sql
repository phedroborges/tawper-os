-- SM-2026-10-19-002 / ADR-004
-- Políticas desabilitadas por padrão para os especialistas migrados.

insert into public.ai_model_policies
  (organization_id, agent_key, task_key, primary_model, fallback_models, max_steps, max_output_tokens, prompt_version, enabled)
select o.id, p.agent_key, p.task_key, p.primary_model, p.fallback_models, p.max_steps, p.max_output_tokens, p.prompt_version, false
from public.organizations o
cross join (values
  ('quick_note', 'quick_note', 'google/gemini-3.5-flash-lite', array['openai/gpt-5.6-luna']::text[], 2, 900, 'quick-note-v2'),
  ('next_step', 'next_step', 'openai/gpt-5.6-luna', array['google/gemini-3.5-flash-lite']::text[], 2, 400, 'next-step-v2'),
  ('conversation_summary', 'conversation_summary', 'google/gemini-3.5-flash-lite', array['openai/gpt-5.6-luna']::text[], 2, 1100, 'conversation-summary-v2'),
  ('conversation_router', 'inbound_assignment', 'deterministic/portfolio-rule', array[]::text[], 1, 100, 'conversation-routing-rule-v1'),
  ('visit_route', 'visit_route', 'openai/gpt-5.6-luna', array['google/gemini-3.5-flash-lite']::text[], 2, 400, 'visit-route-v2'),
  ('lead_extractor', 'lead_extraction', 'google/gemini-3.5-flash-lite', array['openai/gpt-5.6-luna']::text[], 2, 500, 'lead-extraction-v2'),
  ('daily_briefing', 'daily_briefing', 'openai/gpt-5.6-luna', array['google/gemini-3.5-flash-lite']::text[], 2, 700, 'daily-briefing-v2'),
  ('manager_digest', 'manager_digest', 'openai/gpt-5.6-sol', array['anthropic/claude-sonnet-4.6']::text[], 2, 400, 'manager-digest-v2'),
  ('transcription', 'transcription', 'openai/gpt-4o-mini-transcribe', array['openai/whisper-1']::text[], 1, 20000, 'transcription-v1'),
  ('conversation', 'orchestration', 'openai/gpt-5.6-luna', array['google/gemini-3.5-flash-lite']::text[], 4, 1200, 'conversation-agent-v1'),
  ('operations', 'automation', 'openai/gpt-5.6-luna', array['google/gemini-3.5-flash-lite']::text[], 4, 600, 'operations-agent-v1')
) as p(agent_key, task_key, primary_model, fallback_models, max_steps, max_output_tokens, prompt_version)
on conflict (organization_id, agent_key, task_key) do update set
  primary_model = excluded.primary_model,
  fallback_models = excluded.fallback_models,
  max_steps = excluded.max_steps,
  max_output_tokens = excluded.max_output_tokens,
  prompt_version = excluded.prompt_version,
  enabled = false,
  updated_at = now();
