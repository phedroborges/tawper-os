"use client";

import { ArrowRight, History, Megaphone, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertRow, UserAvatar, userName } from "@/components/crm/crm";
import { Modal } from "@/components/ui/overlay";
import { Button, Card, CardHeader, Empty, Input, Progress } from "@/components/ui/primitives";
import { managerDigest, type ManagerDigest } from "@/lib/ai";
import { isManager } from "@/lib/constants";
import { fmtAgo, fmtDateTime } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { ALERT_LABEL, alertsOf, computeMetrics, sellerStats, type Alert, type AlertType } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, money, normalize } from "@/lib/utils";
import { aiDigest } from "@/server/ai/actions";

const ORDER: AlertType[] = [
  "atraso",
  "sem_proximo_passo",
  "estagnacao",
  "sugestao",
  "orcamento",
  "recorrencia",
  "espera_vencida",
  "dados",
  "dependencia",
];

export default function GestaoPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const router = useRouter();
  const { open } = useUI();

  const [tipo, setTipo] = useState<AlertType | "todas">("todas");
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const alerts = useMemo(() => alertsOf(s, { now }), [s, now]);
  const stats = useMemo(() => sellerStats(s, now), [s, now]);
  const metrics = useMemo(() => computeMetrics(s, { now }), [s, now]);
  const activeStats = useMemo(
    () =>
      stats.filter(
        (st) =>
          st.contas > 0 ||
          st.feitas > 0 ||
          st.ganhos > 0 ||
          st.user.role === "vendedor" ||
          st.user.role === "representante",
      ),
    [stats],
  );

  const localDigest = useMemo(() => managerDigest(s, now), [s, now]);
  const digestKey = localDigest.linhas.join("|");
  const [aiDigestState, setAiDigestState] = useState<{ key: string; data: ManagerDigest } | null>(null);
  const digest = aiDigestState?.key === digestKey ? aiDigestState.data : localDigest;

  useEffect(() => {
    const cacheKey = `tawper-ai-digest-v2:${digestKey}`;
    const fallback = managerDigest(useStore.getState(), new Date());
    let alive = true;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const data = JSON.parse(cached) as ManagerDigest;
        queueMicrotask(() => {
          if (alive) setAiDigestState({ key: digestKey, data });
        });
        return () => {
          alive = false;
        };
      }
    } catch {
      /* sessionStorage indisponível */
    }
    void (async () => {
      try {
        const data = await aiDigest({ fallback });
        if (!alive) return;
        setAiDigestState({ key: digestKey, data });
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          /* ignore quota */
        }
      } catch {
        /* mantém o resumo local */
      }
    })();
    return () => {
      alive = false;
    };
  }, [digestKey]);

  const cobrancas = useMemo(
    () =>
      s.interactions
        .filter((i) => i.kind === "cobranca")
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 12),
    [s.interactions],
  );

  if (!isManager(user)) {
    return (
      <Empty
        icon={<ShieldCheck size={20} />}
        title="Área do gestor"
        text="Troque para o perfil do Murilo no topo para ver a gestão da carteira."
      />
    );
  }

  const atrasosCount = alerts.filter((a) => a.tipo === "atraso").length;
  const avgExec = activeStats.length
    ? Math.round((activeStats.reduce((sum, st) => sum + st.execucao.rate, 0) / activeStats.length) * 100)
    : 100;

  const baseAlerts = ownerFilter ? alerts.filter((a) => a.ownerId === ownerFilter) : alerts;
  const counts = ORDER.map((t) => ({ t, n: baseAlerts.filter((a) => a.tipo === t).length })).filter((x) => x.n > 0);
  const queryNorm = normalize(q.trim());
  const list = baseAlerts.filter((a) => {
    if (tipo !== "todas" && a.tipo !== tipo) return false;
    if (!queryNorm) return true;
    const owner = userName(s.users, a.ownerId);
    const compName = s.companies.find((c) => c.id === a.companyId)?.nome ?? "";
    return normalize(`${compName} ${a.titulo} ${a.texto} ${owner}`).includes(queryNorm);
  });

  const selectedOwnerName = ownerFilter ? userName(s.users, ownerFilter) : null;

  const actionFor = (a: Alert) => {
    if (a.tipo === "sem_proximo_passo") {
      return { label: "Definir", fn: () => open({ kind: "newActivity", companyId: a.companyId }) };
    }
    if (a.tipo === "sugestao") {
      return { label: "Revisar", fn: () => router.push(`/empresas/${a.companyId}?tab=estrategia`) };
    }
    if (a.tipo === "dados") {
      return { label: "Completar", fn: () => open({ kind: "editCompany", companyId: a.companyId }) };
    }
    return { label: "Cobrar", fn: () => open({ kind: "cobranca", companyId: a.companyId }) };
  };

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-100px)] lg:overflow-hidden">
      {/* Cabeçalho compacto com indicadores inline e botão sutil de Histórico */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Comando gerencial · cobrança e execução
          </div>
          <h1 className="text-[20px] font-bold leading-tight text-ink">Gestão</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-3 py-1.5 text-[12px]">
            <div>
              <span className="text-muted">Pendências:</span>{" "}
              <span className="font-bold text-ink">{alerts.length}</span>
            </div>
            <span className="h-3 w-px bg-line" />
            <div>
              <span className="text-muted">Atrasos:</span>{" "}
              <span className={cn("font-bold", atrasosCount > 0 ? "text-brand" : "text-ok")}>{atrasosCount}</span>
            </div>
            <span className="h-3 w-px bg-line" />
            <div>
              <span className="text-muted">Execução média:</span>{" "}
              <span className={cn("font-bold", avgExec >= 80 ? "text-ok" : avgExec >= 60 ? "text-warn" : "text-brand")}>
                {avgExec}%
              </span>
            </div>
            <span className="h-3 w-px bg-line" />
            <div>
              <span className="text-muted">Ganhos 30d:</span>{" "}
              <span className="font-bold text-ink">{metrics.ganhos.value}</span>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} className="border border-line bg-white">
            <History size={14} />
            Histórico
            {cobrancas.length > 0 && (
              <span className="rounded-full bg-soft px-1.5 py-0.5 text-[10.5px] font-bold text-navy-3">
                {cobrancas.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Resumo de pessoas da IA (compacto) */}
      <Card className="shrink-0">
        <div className="flex items-center gap-2 border-b border-line/70 px-3.5 py-2">
          <Sparkles size={14} className="text-ai" />
          <span className="text-[12.5px] font-semibold text-ink">Pulso da equipe</span>
          <span className="label ml-auto">IA · pessoas e execução</span>
        </div>
        <div className="grid gap-2 px-3.5 py-2.5 md:grid-cols-3 md:gap-4">
          {digest.linhas.map((l) => (
            <div key={l} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ai/70" />
              <span>{l}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Cockpit principal sem rolagem de página */}
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(360px,31vw,500px)]">
        {/* Esquerda: Fila de exceções com cobrança em 1 clique */}
        <Card className="flex min-h-0 min-w-0 flex-col">
          <CardHeader
            kicker={`${list.length} de ${alerts.length} pendências`}
            title="Fila de exceções"
            action={
              <div className="flex items-center gap-2">
                {selectedOwnerName && (
                  <button
                    type="button"
                    onClick={() => setOwnerFilter(null)}
                    className="inline-flex items-center gap-1 rounded-full bg-navy px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-navy/90"
                  >
                    {selectedOwnerName}
                    <X size={12} />
                  </button>
                )}
                <div className="relative w-44 sm:w-56">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar cliente ou vendedor..."
                    className="h-8 pl-8 text-[12px]"
                  />
                </div>
              </div>
            }
          />
          <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-line/70 px-3 py-2">
            <button
              type="button"
              onClick={() => setTipo("todas")}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                tipo === "todas" ? "bg-navy text-white" : "bg-soft text-navy-3",
              )}
            >
              Todas {baseAlerts.length}
            </button>
            {counts.map(({ t, n }) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                  tipo === t ? "bg-navy text-white" : "bg-soft text-navy-3",
                )}
              >
                {ALERT_LABEL[t]} {n}
              </button>
            ))}
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {list.map((a) => {
              const act = actionFor(a);
              return <AlertRow key={a.id} a={a} actionLabel={act.label} onAction={act.fn} />;
            })}
            {list.length === 0 && (
              <Empty
                title="Nenhuma exceção"
                text={selectedOwnerName || q ? "Limpe o filtro para ver toda a equipe." : "A carteira está em dia."}
              />
            )}
          </div>
        </Card>

        {/* Direita: Execução da equipe (clicar filtra a fila à esquerda) */}
        <Card className="flex min-h-0 min-w-0 flex-col">
          <CardHeader
            kicker="Execução × resultado · 30 dias"
            title="Quem está executando o processo"
            action={
              selectedOwnerName ? (
                <button
                  type="button"
                  onClick={() => setOwnerFilter(null)}
                  className="text-[11.5px] font-semibold text-brand hover:underline"
                >
                  Mostrar todos
                </button>
              ) : (
                <span className="text-[11px] text-muted">Clique para filtrar</span>
              )
            }
          />
          <div className="scrollbar-thin min-h-0 flex-1 divide-y divide-line/70 overflow-y-auto">
            {activeStats.map((st) => {
              const isSelected = ownerFilter === st.user.id;
              return (
                <div
                  key={st.user.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOwnerFilter((prev) => (prev === st.user.id ? null : st.user.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOwnerFilter((prev) => (prev === st.user.id ? null : st.user.id));
                    }
                  }}
                  className={cn(
                    "cursor-pointer px-4 py-3 text-left transition-colors hover:bg-soft/40",
                    isSelected && "bg-soft/70 ring-1 ring-inset ring-navy/25",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <UserAvatar userId={st.user.id} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-ink">{st.user.name}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              open({
                                kind: "drill",
                                title: `Carteira de ${st.user.short}`,
                                subtitle: `${st.contas} contas ativas`,
                                companyIds: s.companies
                                  .filter((c) => c.ownerId === st.user.id && (c.status === "ativa" || c.status === "espera"))
                                  .map((c) => c.id),
                              });
                            }}
                            className="text-[11px] font-semibold text-navy-3 hover:text-brand"
                          >
                            Ver carteira
                          </button>
                          <span
                            className={cn(
                              "text-[13px] font-bold",
                              st.execucao.rate >= 0.8 ? "text-ok" : st.execucao.rate >= 0.6 ? "text-warn" : "text-brand",
                            )}
                          >
                            {Math.round(st.execucao.rate * 100)}%
                          </span>
                        </div>
                      </div>
                      <Progress
                        value={st.execucao.rate * 100}
                        tone={st.execucao.rate >= 0.8 ? "green" : st.execucao.rate >= 0.6 ? "amber" : "red"}
                        className="mt-1"
                      />
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
                        <span>{st.contas} contas</span>
                        <span>{st.feitas} feitas</span>
                        <span>{st.avancos} avanços</span>
                        <span>
                          {st.ganhos} ganhos · {money(st.valorGanho)}
                        </span>
                        {st.atrasadas > 0 && <span className="font-semibold text-brand">{st.atrasadas} atrasadas</span>}
                        {st.semProximo > 0 && (
                          <span className="font-semibold text-brand">{st.semProximo} sem próximo passo</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-line/70 px-4 py-2 text-[11px] text-muted">
            Taxa de execução = atividades concluídas no prazo ÷ atividades que venceram no período.
          </div>
        </Card>
      </div>

      {/* Modal sutil de Histórico (cobranças e auditoria) */}
      {showHistory && (
        <Modal title="Histórico de cobranças e auditoria" onClose={() => setShowHistory(false)} size="lg">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Megaphone size={14} className="text-muted" />
                Últimas cobranças do gestor
              </div>
              <div className="max-h-[380px] divide-y divide-line/70 overflow-y-auto rounded-lg border border-line">
                {cobrancas.length === 0 && (
                  <div className="px-4 py-6 text-[12.5px] text-muted">Nenhuma cobrança registrada.</div>
                )}
                {cobrancas.map((i) => {
                  const c = s.companies.find((x) => x.id === i.companyId);
                  return (
                    <Link
                      key={i.id}
                      href={`/empresas/${i.companyId}`}
                      onClick={() => setShowHistory(false)}
                      className="block px-3.5 py-2.5 hover:bg-soft/40"
                    >
                      <div className="text-[12.5px] font-semibold text-ink">
                        {c?.nome ?? "Empresa"}{" "}
                        <span className="font-normal text-muted">→ {userName(s.users, c?.ownerId ?? "")}</span>
                      </div>
                      <div className="text-[12px] text-ink/80">“{i.conteudo}”</div>
                      <div className="text-[11px] text-muted">{fmtAgo(i.at, now)}</div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink">Alterações recentes</span>
                <Link
                  href="/configuracoes/auditoria"
                  onClick={() => setShowHistory(false)}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy-3 hover:text-brand"
                >
                  Ver tudo <ArrowRight size={12} />
                </Link>
              </div>
              <div className="max-h-[380px] divide-y divide-line/70 overflow-y-auto rounded-lg border border-line">
                {s.audit.slice(0, 10).map((a) => {
                  const comp = s.companies.find((c) => c.id === a.companyId);
                  return (
                    <div key={a.id} className="flex items-start gap-2.5 px-3.5 py-2 text-[12px]">
                      <UserAvatar userId={a.autorId} size={22} />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-ink">{userName(s.users, a.autorId)}</span>{" "}
                        <span className="text-muted">alterou</span> {a.entidade.toLowerCase()} · {a.campo}
                        {a.para && <span className="text-ink/80"> → {a.para}</span>}
                        <div className="text-[11px] text-muted">
                          {comp ? `${comp.nome} · ` : ""}
                          {fmtDateTime(a.at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
