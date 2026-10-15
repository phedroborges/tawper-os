// Contexto enviado ao modelo de linguagem: só o necessário, já resumido e em texto legível.
// Funções puras sobre o estado do app, para rodar no navegador antes de chamar a ação do servidor.

import { CATALOG, CONDICOES_PAGAMENTO, FUNNELS, MOTIVOS_PERDA, REGIOES, isManager } from "./constants";
import { dayDiff, daysSince } from "./dates";
import {
  alertsOf,
  computeMetrics,
  daysInStage,
  isStagnant,
  lastInteractionAt,
  nextStepOf,
  openDealOf,
  pendingOf,
  quoteExpiresAt,
  sellerStats,
  stageDistribution,
  stageOf,
  visibleCompanies,
  type Data,
} from "./selectors";
import type { Deal, DemoData, User } from "./types";
import { money, quoteTotals } from "./utils";

type SystemData = Data & Partial<Pick<DemoData, "routes" | "strategyHistory" | "notifications" | "audit">>;

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

const clip = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Base inteira visível para o usuário, para o "Pergunte à IA" responder qualquer pergunta.
 * Gestor vê todas as contas; vendedor vê a própria carteira, com todos os registros dela.
 * Se o texto passar do limite do modelo, encurta conteúdos longos, sem apagar cadastro, negócio ou tarefa.
 */
export function systemContext(d: SystemData, user: User, now = new Date()) {
  const manager = isManager(user);
  const companies = visibleCompanies(d, user);
  const ids = new Set(companies.map((c) => c.id));
  const uname = (id: string) => d.users.find((u) => u.id === id)?.short ?? (id === "ia" ? "IA" : id === "sistema" ? "Sistema" : id);
  const nome = (id: string) => companies.find((c) => c.id === id)?.nome ?? d.companies.find((c) => c.id === id)?.nome ?? id;
  const metrics = computeMetrics(d, { ownerId: manager ? undefined : user.id, now });

  const build = (textClip: number, limits: { interacoes?: number; mensagens?: number; auditoria?: number }) => {
    const interacoes = d.interactions
      .filter((i) => ids.has(i.companyId))
      .sort((a, b) => b.at.localeCompare(a.at));
    const interacoesUsadas = limits.interacoes ? interacoes.slice(0, limits.interacoes) : interacoes;
    const conversas = d.conversations.filter((c) => (c.companyId && ids.has(c.companyId)) || (!c.companyId && (manager || c.ownerId === user.id)));
    return clean({
      hoje: day(now.toISOString()),
      cobertura: limits.interacoes
        ? `Todos os cadastros, negócios, tarefas e orçamentos estão incluídos. O histórico mostra as ${interacoesUsadas.length} interações mais recentes de ${interacoes.length}, e os textos longos foram encurtados.`
        : "Base completa do que este usuário pode ver. Nenhum cadastro, negócio, tarefa, orçamento ou interação foi omitido.",
      usuario: { nome: user.name, papel: user.role, veApenasPropriaCarteira: !manager },
      sobreATawper: {
        empresa: "Tawper Mangueiras e Conexões",
        oQueVende: "Mangueiras hidráulicas, terminais, kits prontos para colhedoras de cana, prensa em comodato e treinamento Tawper Academy para mecânicos de usina.",
        regioes: REGIOES,
        condicoesDePagamento: CONDICOES_PAGAMENTO,
        motivosDePerda: MOTIVOS_PERDA,
        catalogo: CATALOG.map((item) => ({ sku: item.sku, descricao: item.descricao, unidade: item.unidade, preco: money(item.preco), linha: item.linha })),
        funis: Object.values(FUNNELS).map((f) => ({
          nome: f.nome,
          etapas: f.stages.map((st) => clean({ id: st.id, nome: st.nome, objetivo: st.objetivo, limiteDias: st.limiteDias || undefined, terminal: st.terminal || undefined })),
        })),
      },
      equipe: d.users.map((u) => clean({ nome: u.name, papel: u.role, cargo: u.title, regioes: u.regions })),
      indicadores: Object.values(metrics).map((m) => clean({ indicador: m.label, valor: m.value, detalhe: m.sub })),
      funilAquisicao: stageDistribution(d, "aquisicao", { ownerId: manager ? undefined : user.id }).map((s) => ({ etapa: s.stage.nome, contas: s.count, valor: s.valor ? money(s.valor) : undefined })),
      funilRecorrencia: stageDistribution(d, "recorrencia", { ownerId: manager ? undefined : user.id }).map((s) => ({ etapa: s.stage.nome, contas: s.count, valor: s.valor ? money(s.valor) : undefined })),
      execucaoDoTime: manager
        ? sellerStats(d, now).map((s) => ({
            vendedor: s.user.name,
            contas: s.contas,
            feitas30d: s.feitas,
            noPrazo: `${Math.round(s.execucao.rate * 100)}%`,
            atrasadas: s.atrasadas,
            semProximoPasso: s.semProximo,
            estagnadas: s.estagnadas,
            vendas30d: s.ganhos,
            valorGanho30d: s.valorGanho ? money(s.valorGanho) : undefined,
          }))
        : undefined,
      empresas: companies.map((c) => {
        const deal = openDealOf(d, c.id);
        return clean({
          id: c.id,
          codigo: c.codigo,
          nome: c.nome,
          razaoSocial: c.razaoSocial,
          cnpj: c.cnpj,
          status: c.status,
          responsavel: uname(c.ownerId),
          cidade: c.cidade,
          uf: c.uf,
          regiao: c.regiao,
          ramo: c.ramo,
          grupo: c.grupo,
          origem: c.origem,
          potencial: c.potencial,
          potencialMensal: c.potencialMensal ? money(c.potencialMensal) : undefined,
          urgencia: c.urgencia,
          colhedoras: c.colhedoras,
          modelos: c.modelos,
          prensa: c.prensa,
          fornecedorAtual: c.marcaAtual,
          concorrente: c.concorrente,
          dependeDe: c.influenciadoraId ? nome(c.influenciadoraId) : undefined,
          condicaoDependencia: c.condicaoDependencia,
          observacoes: clip(c.observacoes, textClip),
          clienteDesde: day(c.clienteDesde),
          motivoPerda: c.motivoPerda,
          espera: c.standby ? clean({ motivo: c.standby.motivo, reavaliacao: day(c.standby.reavaliacao), condicao: c.standby.condicao }) : undefined,
          etapaAtual: deal ? `${FUNNELS[deal.funnel].nome} · ${stageOf(deal).nome}` : undefined,
          diasNaEtapa: deal ? daysInStage(deal, now) : undefined,
          parada: deal && isStagnant(deal, now) ? true : undefined,
        });
      }),
      contatos: d.contacts
        .filter((c) => ids.has(c.companyId))
        .map((c) => clean({ empresa: nome(c.companyId), nome: c.nome, cargo: c.cargo, papel: c.papel, influencia: c.influencia, whatsapp: c.whatsapp, email: c.email, canal: c.canal, autorizaContato: c.autorizaContato, ativo: c.ativo })),
      negocios: d.deals
        .filter((x) => ids.has(x.companyId))
        .map((x) => {
          const st = stageOf(x);
          return clean({
            empresa: nome(x.companyId),
            empresaId: x.companyId,
            titulo: x.titulo,
            funil: FUNNELS[x.funnel].nome,
            etapa: st.nome,
            status: x.status,
            responsavel: uname(x.ownerId),
            valor: x.valor ? money(x.valor) : undefined,
            valorRealizado: x.valorRealizado ? money(x.valorRealizado) : undefined,
            probabilidade: x.probabilidade,
            previsao: day(x.previsaoFechamento),
            diasNaEtapa: x.status === "aberta" ? daysInStage(x, now) : undefined,
            parado: x.status === "aberta" && isStagnant(x, now) ? true : undefined,
            objecao: x.objecao,
            motivo: x.motivo,
            ciclo: x.ciclo,
            abertoEm: day(x.createdAt),
            fechadoEm: day(x.closedAt),
          });
        }),
      atividades: d.activities
        .filter((a) => ids.has(a.companyId))
        .map((a) => clean({
          empresa: nome(a.companyId),
          empresaId: a.companyId,
          titulo: a.titulo,
          tipo: a.tipo,
          status: a.status,
          responsavel: uname(a.ownerId),
          vence: day(a.dueAt),
          prioridade: a.prioridade,
          atrasada: a.status === "pendente" && dayDiff(a.dueAt, now) < 0 ? true : undefined,
          descricao: clip(a.descricao, textClip),
          resultado: clip(a.resultado, textClip),
          concluidaEm: day(a.completedAt),
          origem: a.origem,
        })),
      interacoes: interacoesUsadas.map((i) => clean({
        empresa: nome(i.companyId),
        empresaId: i.companyId,
        data: day(i.at),
        canal: i.canal,
        autor: uname(i.autorId),
        titulo: i.titulo,
        conteudo: clip(i.conteudo, textClip),
      })),
      orcamentos: d.quotes
        .filter((q) => ids.has(q.companyId))
        .map((q) => clean({
          empresa: nome(q.companyId),
          empresaId: q.companyId,
          numero: q.numero,
          status: q.status,
          total: money(quoteTotals(q.itens, q.desconto).total),
          desconto: q.desconto ? `${q.desconto}%` : undefined,
          condicao: q.condicao,
          validadeDias: q.validadeDias,
          vence: day(quoteExpiresAt(q)),
          itens: q.itens.map((item) => `${item.qtd} ${item.unidade} ${item.descricao} (${money(item.preco)})`),
        })),
      estrategias: d.strategies
        .filter((s) => ids.has(s.companyId))
        .map((s) => clean({
          empresa: nome(s.companyId),
          empresaId: s.companyId,
          versao: s.versao,
          objetivo: s.objetivo,
          diagnostico: clip(s.diagnostico, textClip),
          barreira: s.barreira,
          estrategia: clip(s.estrategia, textClip),
          resultadoEsperado: s.resultadoEsperado,
          definidaPor: uname(s.definidoPorId),
          revisadaEm: day(s.revisadaEm),
          proximaRevisao: day(s.proximaRevisao),
          origem: s.origem,
        })),
      sugestoesDaIa: d.suggestions
        .filter((s) => ids.has(s.companyId))
        .map((s) => clean({ empresa: nome(s.companyId), empresaId: s.companyId, tipo: s.tipo, titulo: s.titulo, texto: clip(s.texto, textClip), status: s.status, criadaEm: day(s.createdAt) })),
      rotas: (d.routes ?? [])
        .filter((r) => manager || r.ownerId === user.id)
        .map((r) => ({
          regiao: r.regiao,
          data: day(r.data),
          status: r.status,
          km: r.kmEstimado,
          responsavel: uname(r.ownerId),
          paradas: r.paradas.filter((p) => ids.has(p.companyId)).map((p) => ({ empresa: nome(p.companyId), objetivo: p.objetivo, motivo: p.motivo })),
        })),
      conversasRegistradas: conversas.map((c) => clean({
        empresa: c.companyId ? nome(c.companyId) : undefined,
        empresaId: c.companyId,
        contato: c.contatoNome,
        telefone: c.telefone,
        responsavel: uname(c.ownerId),
        naoLidas: c.unread || undefined,
        mensagens: (limits.mensagens ? c.messages.slice(-limits.mensagens) : c.messages).map((m) => clean({ de: m.from, em: day(m.at), texto: clip(m.text, textClip) })),
      })),
      alertas: alertsOf(d, { ownerId: manager ? undefined : user.id, now })
        .filter((a) => ids.has(a.companyId))
        .map((a) => ({ empresa: nome(a.companyId), empresaId: a.companyId, tipo: a.tipo, severidade: a.severidade, titulo: a.titulo, texto: a.texto })),
      auditoria: limits.auditoria === 0
        ? undefined
        : (d.audit ?? [])
            .filter((a) => !a.companyId || ids.has(a.companyId))
            .slice(-(limits.auditoria ?? 10_000))
            .map((a) => clean({ data: day(a.at), empresa: a.companyId ? nome(a.companyId) : undefined, campo: a.campo, de: a.de, para: a.para, autor: uname(a.autorId) })),
    });
  };

  const budget = 100_000;
  const pack = (ctx: ReturnType<typeof build>, cobertura: string) => ({ ...ctx, cobertura });
  let ctx = build(1200, {});
  if (JSON.stringify(ctx).length <= budget) return pack(ctx, "Base completa: cadastro, pessoas, negócios, tarefas, histórico, orçamentos, estratégias, rotas, alertas e catálogo. Nada foi omitido.");
  ctx = build(400, {});
  if (JSON.stringify(ctx).length <= budget) return pack(ctx, "Todos os registros estão incluídos. Textos muito longos de histórico e mensagens foram encurtados.");
  ctx = build(180, { interacoes: 800, mensagens: 40, auditoria: 200 });
  if (JSON.stringify(ctx).length <= budget) return pack(ctx, "Cadastros, negócios, tarefas e orçamentos estão completos. O histórico e as conversas mostram só o trecho mais recente.");
  return pack(build(120, { interacoes: 300, mensagens: 15, auditoria: 0 }), "Cadastros, negócios, tarefas e orçamentos estão completos. Histórico antigo ficou de fora desta leitura.");
}
