-- Dois papéis novos para contatos: Financeiro (libera o pagamento) e Almoxarifado (recebe e controla o estoque).
-- Só acrescenta valores ao enum; nenhum contato existente muda. Idempotente (pode rodar de novo sem erro).
-- Rode ANTES de publicar a versão do app que grava esses papéis (2026-11-12.2).
alter type public.contact_role add value if not exists 'financial';
alter type public.contact_role add value if not exists 'warehouse';
