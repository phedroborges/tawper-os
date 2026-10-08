# Imagem de produção do app em web/. O contexto de build é a raiz do repositório.
# A estrutura /repo/web espelha o repositório porque a página /implementacao
# lê ../PLANO_IMPLEMENTACAO.md a partir do diretório do app.

FROM node:22-alpine AS deps
WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /repo/web
ENV NEXT_TELEMETRY_DISABLED=1
# Variáveis NEXT_PUBLIC_ são gravadas no bundle durante o build.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TAWPER_USE_SUPABASE
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_TAWPER_USE_SUPABASE=$NEXT_PUBLIC_TAWPER_USE_SUPABASE
COPY PLANO_IMPLEMENTACAO.md /repo/PLANO_IMPLEMENTACAO.md
COPY --from=deps /repo/web/node_modules ./node_modules
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /repo/web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY PLANO_IMPLEMENTACAO.md /repo/PLANO_IMPLEMENTACAO.md
COPY web/package.json ./
COPY --from=deps /repo/web/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/web/.next ./.next
COPY --from=build /repo/web/public ./public
COPY --from=build /repo/web/next.config.ts ./next.config.ts
USER node
EXPOSE 4100
CMD ["npm", "run", "start"]
