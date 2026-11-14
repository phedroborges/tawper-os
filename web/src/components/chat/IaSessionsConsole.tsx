"use client";

import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Flag,
  MessageSquare,
  Mic,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversasReady } from "@/components/chat/ConversasLoading";
import { CompanyLink, UserAvatar } from "@/components/crm/crm";
import { Modal } from "@/components/ui/overlay";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Progress, Select } from "@/components/ui/primitives";
import { formatWhatsApp } from "@/lib/br-ids";
import { isManager } from "@/lib/constants";
import { fmtAgo, fmtDateTime } from "@/lib/dates";
import {
  buildDemoIaSessions,
  summarizeIaSessions,
  type IaSessionBlock,
  type InterventionLevel,
} from "@/lib/ia-sessions";
import { ACTION_LABEL, formatRecordMark } from "@/lib/registros";
import { useCurrentUser, useStore } from "@/lib/store";
import { cn, normalize } from "@/lib/utils";

type StatusFilter = "todos" | InterventionLevel;

const STATUS_META: Record<
  InterventionLevel,
  { label: string; tone: "red" | "amber" | "green" | "navy" }
> = {
  intervencao: { label: "Precisa intervenção humana", tone: "red" },
  atencao: { label: "Atenção / Contingência", tone: "amber" },
  normal: { label: "IA operando normal", tone: "green" },
  revisado: { label: "Revisado pelo gestor", tone: "navy" },
};

/** Central de gerenciamento e auditoria da IA que atende a equipe pelo WhatsApp. */
export function IaSessionsConsole() {
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const companies = useStore((s) => s.companies);
  const interactions = useStore((s) => s.interactions);
  const activities = useStore((s) => s.activities);
  const manager = isManager(user);

  const [liveSessions, setLiveSessions] = useState<IaSessionBlock[] | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [sellerFilter, setSellerFilter] = useState("");
  const [q, setQ] = useState("");
  const [auditSessionId, setAuditSessionId] = useState<string | null>(null);
  const [demoOverrides, setDemoOverrides] = useState<Record<string, InterventionLevel>>({});

  useEffect(() => {
    if (!manager) return;
    let off = false;
    fetch("/api/whatsapp/ia-sessions", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          live?: boolean;
          sessions?: IaSessionBlock[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Falha ao carregar os atendimentos da IA.");
        if (!off) {
          setIsLive(Boolean(data.live));
          setLiveSessions(data.sessions ?? []);
          setError("");
        }
      })
      .catch((e: unknown) => {
        if (!off) {
          setError(e instanceof Error ? e.message : "Falha ao carregar os atendimentos da IA.");
          setLiveSessions([]);
        }
      })
      .finally(() => {
        if (!off) setLoading(false);
      });
    return () => {
      off = true;
    };
  }, [manager, reloadTick]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadTick((n) => n + 1);
  }, []);

  const sessions = useMemo<IaSessionBlock[]>(() => {
    if (isLive && liveSessions) return liveSessions;
    const demo = buildDemoIaSessions({ users, interactions, activities, companies });
    return demo.map((b) => {
      const override = demoOverrides[b.id];
      if (!override) return b;
      return {
        ...b,
        intervention: override,
        attendant: override === "intervencao" ? "Escalar para gestor" : "Agente Tawper IA",
        reviewedBy: override === "revisado" ? user.short : undefined,
        interventionReasons: override === "revisado" ? [] : b.interventionReasons,
      };
    });
  }, [isLive, liveSessions, users, interactions, activities, companies, demoOverrides, user.short]);

  const summary = useMemo(() => summarizeIaSessions(sessions), [sessions]);

  const filtered = useMemo(() => {
    const n = normalize(q.trim());
    return sessions.filter((s) => {
      if (statusFilter !== "todos" && s.intervention !== statusFilter) return false;
      if (sellerFilter && s.sellerId !== sellerFilter) return false;
      if (!n) return true;
      return normalize(
        `${s.sellerName} ${s.phone} ${s.attendant} ${s.modelLabel} ${s.lastQuestion} ${s.lastReply} ${s.interventionReasons.join(" ")}`,
      ).includes(n);
    });
  }, [sessions, statusFilter, sellerFilter, q]);

  const auditSession = useMemo(
    () => sessions.find((s) => s.id === auditSessionId) ?? null,
    [sessions, auditSessionId],
  );

  const handleAction = async (sessionId: string, action: "resolve" | "flag") => {
    setBusyId(sessionId);
    try {
      if (!isLive) {
        setDemoOverrides((prev) => ({
          ...prev,
          [sessionId]: action === "resolve" ? "revisado" : "intervencao",
        }));
        return;
      }
      const res = await fetch("/api/whatsapp/ia-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível atualizar o status.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar o atendimento.");
    } finally {
      setBusyId(null);
    }
  };

  if (!manager) {
    return (
      <Empty
        icon={<Bot size={20} />}
        title="Área do gestor"
        text="O gerenciamento e auditoria dos atendimentos da IA no WhatsApp é restrito à gestão."
      />
    );
  }

  return (
    <div>
      <ConversasReady />
      <PageHeader
        kicker="Auditoria e gerenciamento da IA · WhatsApp da equipe"
        title="Atendimento IA"
        subtitle="A IA recebe os registros dos vendedores pelo WhatsApp e grava no CRM. Acompanhe os blocos de atendimento da equipe, desempenho da IA, trocas e sinais de intervenção humana."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
              Atualizar
            </Button>
            <LinkButton href="/registros" variant="outline" size="sm">
              <ClipboardCheck size={14} /> Tabela de registros
            </LinkButton>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-[8px] border border-brand/30 bg-brand-soft px-4 py-2.5 text-[13px] text-brand">
          {error}
        </div>
      )}

      {/* KPIs de Gerenciamento e Desempenho da IA */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setStatusFilter("todos")}
          className={cn(
            "rounded-[8px] border bg-white p-3.5 text-left transition hover:border-navy/40",
            statusFilter === "todos" ? "border-navy ring-1 ring-navy/20" : "border-line",
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>Atendimentos da equipe</span>
            <Bot size={15} className="text-navy-3" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[26px] font-bold leading-none tabular-nums text-ink">{summary.totalSessions}</span>
            <span className="text-[12px] text-muted">{summary.activeNow} ativos</span>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">Canais vendedor ↔ Agente IA</div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter((f) => (f === "intervencao" ? "todos" : "intervencao"))}
          className={cn(
            "rounded-[8px] border bg-white p-3.5 text-left transition hover:border-brand/40",
            statusFilter === "intervencao"
              ? "border-brand ring-1 ring-brand/25"
              : summary.needsIntervention > 0
                ? "border-brand/35"
                : "border-line",
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>Intervenção humana</span>
            <ShieldAlert size={15} className={summary.needsIntervention > 0 ? "text-brand" : "text-ok"} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn(
                "text-[26px] font-bold leading-none tabular-nums",
                summary.needsIntervention > 0 ? "text-brand" : "text-ok",
              )}
            >
              {summary.needsIntervention}
            </span>
            <span className="text-[12px] text-muted">
              {summary.attentionCount > 0 ? `+ ${summary.attentionCount} atenção` : "fila imediata"}
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">
            {summary.needsIntervention > 0 ? "Clique para filtrar pendentes" : "Nenhum bloqueio pendente"}
          </div>
        </button>

        <div className="rounded-[8px] border border-line bg-white p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>Desempenho da IA</span>
            <Sparkles size={15} className="text-ai" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn(
                "text-[26px] font-bold leading-none tabular-nums",
                summary.iaScorePct >= 90 ? "text-ok" : summary.iaScorePct >= 75 ? "text-warn" : "text-brand",
              )}
            >
              {summary.iaScorePct}%
            </span>
            <span className="text-[12px] text-muted">{summary.totalWrites} ações gravadas</span>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">Taxa de resolução autônoma no CRM</div>
        </div>

        <div className="rounded-[8px] border border-line bg-white p-3.5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>Mensagens trocadas</span>
            <MessageSquare size={15} className="text-navy-3" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[26px] font-bold leading-none tabular-nums text-ink">{summary.totalMessages}</span>
            <span className="text-[12px] text-muted">
              {summary.messagesFromSeller} env · {summary.messagesFromIa} IA
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">
            {summary.avgLatencyMs > 0
              ? `Tempo médio IA: ${(summary.avgLatencyMs / 1000).toFixed(1)}s`
              : "Trocas registradas na sessão"}
          </div>
        </div>
      </div>

      {/* Barra de filtros */}
      <Card className="mb-5 p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar vendedor, telefone, ação ou assunto…"
              className="h-9 pl-8 text-[13px]"
            />
          </div>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 w-auto text-[13px]"
            aria-label="Filtrar por estado de intervenção"
          >
            <option value="todos">Todos os atendimentos</option>
            <option value="intervencao">Precisa intervenção humana</option>
            <option value="atencao">Atenção / Contingência</option>
            <option value="normal">IA operando normal</option>
            <option value="revisado">Revisados pelo gestor</option>
          </Select>

          <Select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            className="h-9 w-auto text-[13px]"
            aria-label="Filtrar por vendedor"
          >
            <option value="">Toda a equipe</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.sellerId || s.id}>
                {s.sellerName}
              </option>
            ))}
          </Select>

          {(statusFilter !== "todos" || sellerFilter || q) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter("todos");
                setSellerFilter("");
                setQ("");
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </Card>

      {/* Grade de blocos de atendimentos da equipe */}
      {filtered.length === 0 ? (
        <Card>
          <Empty
            icon={<Bot size={22} />}
            title="Nenhum atendimento encontrado"
            text={
              sessions.length === 0
                ? "Ainda não há sessões da equipe com a IA no WhatsApp para o filtro atual."
                : "Ajuste os filtros acima para visualizar os demais atendimentos."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((block) => {
            const meta = STATUS_META[block.intervention];
            const scoreTone = block.iaScorePct >= 90 ? "green" : block.iaScorePct >= 75 ? "amber" : "red";
            const isBusy = busyId === block.id;

            return (
              <Card
                key={block.id}
                className={cn(
                  "flex flex-col justify-between transition",
                  block.intervention === "intervencao" && "border-brand/45 ring-1 ring-brand/15",
                )}
              >
                <div>
                  {/* Cabeçalho: vendedor + status de intervenção */}
                  <div className="flex items-start justify-between gap-3 border-b border-line/70 px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      {block.sellerId ? (
                        <UserAvatar userId={block.sellerId} size={38} />
                      ) : (
                        <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-soft text-[14px] font-bold text-ink">
                          {block.sellerShort[0] ?? "E"}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-bold text-ink">{block.sellerName}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                          <span>{block.phone ? formatWhatsApp(block.phone) : "Canal WhatsApp IA"}</span>
                          <span>·</span>
                          <span>{fmtAgo(block.lastActivityAt)}</span>
                        </div>
                      </div>
                    </div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>

                  {/* Quem está atendendo + Desempenho + Mensagens trocadas */}
                  <div className="space-y-3 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2 rounded-[6px] border border-line bg-soft/45 px-3 py-2 text-[12px]">
                      <span className="flex items-center gap-1.5 font-medium text-ink">
                        {block.intervention === "intervencao" ? (
                          <UserCheck size={14} className="text-brand" />
                        ) : (
                          <Bot size={14} className="text-ai" />
                        )}
                        Atendimento: <b>{block.attendant}</b>
                      </span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
                        {block.modelLabel}
                      </span>
                    </div>

                    {/* 3 blocos numéricos compactos */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-[6px] border border-line/80 bg-soft/30 px-2.5 py-2">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Mensagens</div>
                        <div className="mt-0.5 text-[16px] font-bold tabular-nums text-ink">{block.messagesTotal}</div>
                        <div className="text-[10.5px] text-muted">
                          {block.messagesFromSeller} env · {block.messagesFromIa} IA
                        </div>
                      </div>

                      <div className="rounded-[6px] border border-line/80 bg-soft/30 px-2.5 py-2">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Desempenho IA</div>
                        <div
                          className={cn(
                            "mt-0.5 text-[16px] font-bold tabular-nums",
                            block.iaScorePct >= 90 ? "text-ok" : block.iaScorePct >= 75 ? "text-warn" : "text-brand",
                          )}
                        >
                          {block.iaScorePct}%
                        </div>
                        <div className="text-[10.5px] text-muted">
                          {block.avgLatencyMs > 0 ? `${(block.avgLatencyMs / 1000).toFixed(1)}s médio` : `${block.consultsCount} consultas`}
                        </div>
                      </div>

                      <div className="rounded-[6px] border border-line/80 bg-soft/30 px-2.5 py-2">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">No CRM</div>
                        <div className="mt-0.5 text-[16px] font-bold tabular-nums text-ink">{block.writesCount}</div>
                        <div className="flex items-center gap-1 text-[10.5px] text-muted">
                          {block.audioCount > 0 ? (
                            <>
                              <Mic size={10} /> {block.audioCount} áudios
                            </>
                          ) : (
                            "ações gravadas"
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Barra de desempenho da IA */}
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                        <span>Autonomia e precisão nesse atendimento</span>
                        <span className="font-semibold text-ink">{block.errorsCount} falha(s)</span>
                      </div>
                      <Progress value={block.iaScorePct} tone={scoreTone} />
                    </div>

                    {/* Motivo da intervenção humana (quando aplicável) */}
                    {block.interventionReasons.length > 0 && (
                      <div className="rounded-[6px] border border-brand/25 bg-brand-soft/60 px-3 py-2 text-[12px] text-brand">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertTriangle size={13} />
                          {block.intervention === "intervencao" ? "Por que precisa de você:" : "Ponto de atenção:"}
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11.5px]">
                          {block.interventionReasons.slice(0, 2).map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {block.reviewedBy && block.intervention === "revisado" && (
                      <div className="flex items-center gap-1.5 rounded-[6px] bg-ok-soft px-3 py-1.5 text-[11.5px] font-medium text-ok">
                        <ShieldCheck size={13} /> Revisado por {block.reviewedBy}
                      </div>
                    )}

                    {/* Última interação resumida */}
                    <div className="rounded-[6px] border border-line/70 bg-paper px-3 py-2 text-[12px]">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Último registro recebido</div>
                      <p className="mt-0.5 line-clamp-2 font-medium text-ink">“{block.lastQuestion}”</p>
                      <p className="mt-1 line-clamp-2 text-[11.5px] text-muted">IA: {block.lastReply}</p>
                      {block.lastGravou.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {block.lastGravou.slice(0, 3).map((g, i) => (
                            <Badge key={`${g}-${i}`} tone="green">
                              {ACTION_LABEL[g] ?? g}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rodapé de ações */}
                <div className="flex items-center justify-between gap-2 border-t border-line/70 px-4 py-2.5">
                  <Button variant="outline" size="xs" onClick={() => setAuditSessionId(block.id)}>
                    <Activity size={13} /> Auditar atendimento ({block.runs.length || block.messages.length})
                  </Button>

                  <div className="flex items-center gap-1.5">
                    {block.intervention === "intervencao" || block.intervention === "atencao" ? (
                      <Button
                        variant="primary"
                        size="xs"
                        disabled={isBusy}
                        onClick={() => void handleAction(block.id, "resolve")}
                      >
                        <CheckCircle2 size={13} /> {isBusy ? "Salvando…" : "Marcar resolvido"}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={isBusy}
                        title="Sinalizar para intervenção humana"
                        onClick={() => void handleAction(block.id, "flag")}
                      >
                        <Flag size={13} /> Sinalizar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Auditoria Completa do Atendimento */}
      {auditSession && (
        <Modal
          title={`Auditoria IA · ${auditSession.sellerName}`}
          onClose={() => setAuditSessionId(null)}
          size="lg"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-line bg-soft/40 p-3.5">
              <div className="space-y-0.5 text-[12.5px]">
                <div className="font-semibold text-ink">
                  Atendimento: {auditSession.attendant} ({auditSession.modelLabel})
                </div>
                <div className="text-muted">
                  {auditSession.messagesTotal} mensagens trocadas ({auditSession.messagesFromSeller} vendedor ·{" "}
                  {auditSession.messagesFromIa} IA) · Desempenho {auditSession.iaScorePct}% ·{" "}
                  {auditSession.writesCount} ações gravadas no CRM
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_META[auditSession.intervention].tone}>
                  {STATUS_META[auditSession.intervention].label}
                </Badge>
                {auditSession.intervention === "intervencao" || auditSession.intervention === "atencao" ? (
                  <Button
                    size="xs"
                    variant="primary"
                    disabled={busyId === auditSession.id}
                    onClick={() => void handleAction(auditSession.id, "resolve")}
                  >
                    <CheckCircle2 size={13} /> Resolver intervenção
                  </Button>
                ) : null}
              </div>
            </div>

            {auditSession.runs.length > 0 ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">
                    Execuções auditáveis da IA ({auditSession.runs.length})
                  </h4>
                  <LinkButton href="/registros" size="xs" variant="ghost">
                    Ver em Registros <ExternalLink size={12} />
                  </LinkButton>
                </div>

                <div className="scrollbar-thin max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
                  {auditSession.runs.map((run) => (
                    <div key={run.id} className="rounded-[8px] border border-line bg-white p-3 text-[12.5px]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 text-[11.5px] text-muted">
                            <Clock size={12} /> {fmtDateTime(run.at)}
                          </span>
                          {run.audio && (
                            <Badge tone="navy">
                              <Mic size={11} /> Áudio
                            </Badge>
                          )}
                          {run.caminho === "fluxo_antigo" && <Badge tone="amber">Contingência</Badge>}
                          {run.companyId && <CompanyLink company={companies.find((c) => c.id === run.companyId)} />}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted">
                          {run.latencyMs > 0 && <span>{(run.latencyMs / 1000).toFixed(1)}s</span>}
                          {run.tokens > 0 && <span>{run.tokens} tokens</span>}
                        </div>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <div>
                          <span className="font-semibold text-ink">Vendedor:</span>{" "}
                          <span className="text-ink">{run.pergunta || "—"}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-ai">IA:</span>{" "}
                          <span className="text-muted">{run.resposta || run.errorMessage || "—"}</span>
                        </div>
                      </div>

                      {(run.gravou.length > 0 || run.marcas.length > 0 || run.steps.length > 0) && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line/50 pt-2">
                          {run.gravou.map((g, i) => (
                            <Badge key={`${g}-${i}`} tone="green">
                              {ACTION_LABEL[g] ?? g}
                            </Badge>
                          ))}
                          {run.marcas.map((m, i) => (
                            <Badge key={`${m}-${i}`} tone={m.startsWith("revisado:") ? "navy" : "red"}>
                              {m.startsWith("revisado:") ? `Revisado por ${m.slice("revisado:".length)}` : formatRecordMark(m)}
                            </Badge>
                          ))}
                          {run.steps
                            .filter((st) => st.kind === "tool" && st.toolName)
                            .map((st) => (
                              <span
                                key={`${run.id}-st-${st.stepNumber}`}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px]",
                                  st.status === "failed"
                                    ? "border-brand/30 bg-brand-soft text-brand"
                                    : "border-line bg-soft text-muted",
                                )}
                              >
                                <Wrench size={10} /> {st.toolName} ({st.durationMs}ms)
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty title="Sem execuções registradas" text="As próximas trocas desse vendedor com a IA aparecerão aqui." />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
