# Instruções do projeto Tawper OS para o Claude

Leia também `AGENTS.md` (regras do plano de implementação).

## Trabalho em equipe: sempre confira o git antes de qualquer coisa

Várias pessoas (e várias sessões do Claude) mexem neste repositório ao mesmo tempo. Antes de planejar ou editar qualquer coisa:

1. Rode `git fetch origin` e veja o que mudou:
   - `git branch --show-current` (confirme em qual branch você está; outra sessão pode ter trocado);
   - `git log --format='%h %an %s' HEAD..origin/main` (commits novos no `main`);
   - `git status --short` (alterações não comitadas que podem ser de outra pessoa ou sessão).
2. Se algum commit novo tocar a área em que você vai trabalhar (por exemplo funis, etapas, orçamento, WhatsApp, IA), **leia o diff desse commit** (`git show <hash> --stat` e `git show <hash> -- <arquivo>`) e siga a abordagem que já está no `main`. Se a sua ideia contradiz a dele, **pare e pergunte** ao usuário antes de escrever código ou SQL.
3. Repita a conferência antes de comitar, de fazer push e de pedir ao usuário que rode qualquer migration ou SQL. Um commit novo pode ter mudado o que você ia pedir.
4. Nunca peça para rodar SQL no banco sem antes conferir se alguém já mexeu na mesma tabela, função ou etapa. O banco é compartilhado e não tem "desfazer".
5. Não troque o branch da pasta principal. Para trabalhar sem atrapalhar outras sessões, use `git worktree add ../<nome> -b <branch>`.
6. Não comite o que não é seu: confira `git status` e adicione arquivos pelo nome, nunca `git add .`. Comite em branch próprio e só leve ao `main` quando o usuário pedir.

## Banco de dados (Supabase)

- Migrations ficam em `supabase/migrations/` e nunca são editadas depois de aplicadas: correções entram em uma nova migration.
- O Claude não tem acesso de escrita ao banco. Quando precisar de SQL aplicado, entregue o texto exato, diga a ordem, e peça a mensagem de erro se falhar.
- Funis e etapas: a tela usa chaves próprias (`web/src/lib/constants.ts`) e o mapeamento para as chaves do banco está em `web/src/lib/crm-map.ts`. Não renomeie nem apague etapas do banco sem combinar com quem mantém esse mapeamento.

## Convenções

- Idioma das mensagens ao usuário e dos textos da interface: português do Brasil.
- Toda gravação de negócio tem de mostrar o erro ao usuário quando falhar; nada de gravar sem esperar a resposta.
- Rode `npx tsc --noEmit`, `npx eslint` nos arquivos alterados e `npm run build` (em `web/`) antes de comitar.
