// Contexto enviado ao modelo de linguagem: só o necessário, já resumido e em texto legível.
// Funções puras sobre o estado do app, para rodar no navegador antes de chamar a ação do servidor.

import { FUNNELS, isManager } from "./constants";
import { dayDiff, daysSince } from "./dates";
import {
  alertsOf,
  daysInStage,
  isStagnant,
  lastInteractionAt,
  nextStepOf,
  openDealOf,
  pendingOf,
  quoteExpiresAt,
  sellerStats,
  stageOf,
  visibleCompanies,
  type Data,
} from "./selectors";
import type { Deal, User } from "./types";
import { money, quoteTotals } from "./utils";

const day = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
}

export function funnelStages(deal?: Deal) {
  if (!deal) return [];
  return FUNNELS[deal.funnel].stages.map((st) => ({ id: st.id, nome: st.nome }));
}

/** Tudo o que importa de uma conta: cadastro, pessoas, negócio, histórico recente, tarefas, orçamentos e estratégia. */
export function companyContext(d: Data, companyId: string, now = new Date()) {
  const c = d.companies.find((x) => x.id === companyId);
  if (!c) return null;
  const deal = openDealOf(d, companyId);
  const st = deal ? stageOf(deal) : undefined;
  const user = (id: string) => d.users.find((u) => u.id === id)?.short ?? (id === "ia" ? "IA" : id === "sistema" ? "Sistema" : id);
  const strategy = d.strategies.find((x) => x.companyId === companyId);
  const last = lastInteractionAt(d, companyId);
  return clean({
    empresa: clean({
      nome: c.nome,
      razaoSocial: c.razaoSocial,
      status: c.status,
      responsavel: user(c.ownerId),
      cidade: c.cidade ? `${c.cidade}/${c.uf ?? ""}` : undefined,
      regiao: c.regiao,
      ramo: c.ramo,
      origem: c.origem,
      potencial: c.potencial,
      potencialMensal: c.potencialMensal ? money(c.potencialMensal) : undefined,
      urgencia: c.urgencia,
      colhedoras: c.colhedoras,
      modelos: c.modelos,
      prensa: c.prensa,
      fornecedorAtual: c.marcaAtual,
      concorrente: c.concorrente,
      dependeDe: c.influenciadoraId ? d.companies.find((x) => x.id === c.influenciadoraId)?.nome : undefined,
      observacoes: c.observacoes,
    }),
    contatos: d.contacts
      .filter((x) => x.companyId === companyId && x.ativo)
      .map((x) => clean({ nome: x.nome, cargo: x.cargo, papel: x.papel, influencia: x.influencia, canal: x.canal })),
    negocio: deal && st
      ? clean({
          funil: FUNNELS[deal.funnel].nome,
          etapa: st.nome,
          etapaId: deal.stageId,
          diasNaEtapa: daysInStage(deal, now),
          limiteDiasEtapa: st.limiteDias || undefined,
          parado: isStagnant(deal, now) || undefined,
          valor: deal.valor ? money(deal.valor) : undefined,
          objecao: deal.objecao,
          ciclo: deal.ciclo,
        })
      : undefined,
    ultimaInteracaoHaDias: last ? daysSince(last, now) : undefined,
    historicoRecente: d.interactions
      .filter((i) => i.companyId === companyId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 15)
      .map((i) => clean({ data: day(i.at), canal: i.canal, autor: user(i.autorId), titulo: i.titulo, conteudo: i.conteudo?.slice(0, 400) })),
    tarefasAbertas: pendingOf(d, companyId).map((a) => clean({ titulo: a.titulo, tipo: a.tipo, vence: day(a.dueAt), prioridade: a.prioridade, atrasada: dayDiff(a.dueAt, now) < 0 || undefined })),
    orcamentos: d.quotes
      .filter((q) => q.companyId === companyId && q.status !== "rascunho")
      .map((q) => ({ numero: q.numero, status: q.status, total: money(quoteTotals(q.itens, q.desconto).total), condicao: q.condicao, vence: day(quoteExpiresAt(q)) })),
    estrategiaVigente: strategy ? clean({ versao: strategy.versao, objetivo: strategy.objetivo, barreira: strategy.barreira, estrategia: strategy.estrategia, resultadoEsperado: strategy.resultadoEsperado }) : undefined,
  });
}

/** Carteira visível para o usuário, para o assistente responder perguntas livres. */
export function portfolioContext(d: Data, user: User, now = new Date()) {
  const manager = isManager(user);
  const companies = visibleCompanies(d, user).filter((c) => c.status === "ativa" || c.status === "espera");
  const al = alertsOf(d, { ownerId: manager ? undefined : user.id, now });
  const uname = (id: string) => d.users.find((u) => u.id === id)?.short ?? id;
  const contas = companies.slice(0, 120).map((c) => {
    const deal = openDealOf(d, c.id);
    const next = nextStepOf(d, c.id);
    const last = lastInteractionAt(d, c.id);
    return clean({
      id: c.id,
      nome: c.nome,
      cidade: c.cidade,
      responsavel: uname(c.ownerId),
      status: c.status,
      etapa: deal ? `${FUNNELS[deal.funnel].nome} · ${stageOf(deal).nome}` : undefined,
      diasNaEtapa: deal ? daysInStage(deal, now) : undefined,
      parada: deal && isStagnant(deal, now) ? true : undefined,
      valor: deal?.valor ? money(deal.valor) : undefined,
      proximoPasso: next ? `${next.titulo} (${day(next.dueAt)})` : "sem próximo passo",
      ultimaInteracaoHaDias: last ? daysSince(last, now) : undefined,
      colhedoras: c.colhedoras,
      fornecedorAtual: c.marcaAtual,
      alertas: al.filter((a) => a.companyId === c.id).map((a) => `${a.tipo}: ${a.texto}`),
    });
  });
  const minhasTarefas = d.activities
    .filter((a) => a.status === "pendente" && a.ownerId === user.id && dayDiff(a.dueAt, now) <= 7)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 30)
    .map((a) => clean({ empresaId: a.companyId, empresa: d.companies.find((c) => c.id === a.companyId)?.nome, titulo: a.titulo, tipo: a.tipo, vence: day(a.dueAt), atrasada: dayDiff(a.dueAt, now) < 0 || undefined }));
  const ids = new Set(companies.map((c) => c.id));
  const orcamentosAbertos = d.quotes
    .filter((q) => q.status === "enviado" && ids.has(q.companyId))
    .map((q) => ({ empresaId: q.companyId, numero: q.numero, total: money(quoteTotals(q.itens, q.desconto).total), venceEmDias: dayDiff(quoteExpiresAt(q), now) }));
  return clean({
    hoje: day(now.toISOString()),
    usuario: { nome: user.short, papel: user.role, veApenasPropriaCarteira: !manager },
    contas,
    minhasTarefasProximos7Dias: minhasTarefas,
    orcamentosAbertos,
    execucaoDoTime: manager
      ? sellerStats(d, now).map((s) => ({ vendedor: s.user.short, noPrazo: `${Math.round(s.execucao.rate * 100)}%`, feitas: s.feitas, atrasadas: s.atrasadas }))
      : undefined,
  });
}
