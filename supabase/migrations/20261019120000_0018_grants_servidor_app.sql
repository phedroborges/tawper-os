-- =============================================================================
-- Tawper OS — 0018 — Permissão do servidor sobre as funções do schema app
-- Gravar orçamento dispara triggers do schema app (número sequencial, totais).
-- A chave de serviço do servidor (service_role) precisava de USAGE no schema
-- e EXECUTE nas funções, senão a gravação falha com "permission denied for schema app".
-- Só o servidor (service_role) recebe a permissão; anon e authenticated seguem como estavam.
-- =============================================================================

grant usage on schema app to service_role;
grant execute on all functions in schema app to service_role;

alter default privileges in schema app grant execute on functions to service_role;
