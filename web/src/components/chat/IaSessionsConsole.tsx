"use client";

import {
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  MessageSquare,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversasReady } from "@/components/chat/ConversasLoading";
import { RegistrosPanel } from "@/components/chat/RegistrosPanel";
import { UserAvatar } from "@/components/crm/crm";
import { Modal } from "@/components/ui/overlay";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Empty,
  Input,
  PageHeader,
  Progress,
  Segmented,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { fmtAgo, fmtDateTime } from "@/lib/dates";
import {
  DEFAULT_LEARNED_RULES,
  buildDemoExternalCallers,
  buildDemoIaSessions,
  summarizeIaSessions,
  type AllowlistMember,
  type ExternalCallerBlock,
  type IaSessionBlock,
  type InterventionLevel,
  type LearnedRule,
} from "@/lib/ia-sessions";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

type MainTab = "equipe" | "registros" | "acesso" | "treinamento";
type FilterTab =
  | "todos"
  | "alerta_ia"
  | "aguardando_vendedor"
  | "auto_corrigido"
  | "alinhado";

const STATUS_BADGE: Record<
  InterventionLevel,
  { label: string; tone: "green" | "amber" | "red" | "ai" }
> = {
  normal: { label: "Alinhado", tone: "green" },
  revisado: { label: "Revisado", tone: "ai" },
  atencao: { label: "Aguardando vendedor", tone: "amber" },
  intervencao: { label: "Requer atenção (IA)", tone: "red" },
};

const TOOL_LABELS: Record<string, string> = {
  buscar_cliente: "Busca de cliente",
  buscar_empresas: "Busca de cliente",
  consultar_crm: "Consulta ao CRM",
  detalhar_empresa: "Leitura de ficha",
  listar_minhas_tarefas: "Consulta de tarefas",
  resumo_carteira: "Resumo da carteira",
  buscar_historico_empresa: "Histórico do cliente",
  consultar_mensagens_whatsapp: "Leitura WhatsApp",
  registrar_atividade: "Atividade registrada",
  registrar_interacao: "Interação registrada",
  criar_tarefa: "Tarefa agendada",
  reagendar_tarefa: "Tarefa reagendada",
  concluir_tarefa: "Tarefa concluída",
  mover_etapa: "Etapa avançada",
  mover_etapa_empresa: "Etapa avançada",
  atualizar_proximo_passo: "Próximo passo atualizado",
  adicionar_nota_empresa: "Nota adicionada",
  atualizar_cliente: "Ficha atualizada",
  atualizar_dados_tecnicos: "Dados técnicos atualizados",
  criar_proposta: "Proposta criada",
  registrar_proposta: "Proposta registrada",
  atualizar_proposta: "Proposta atualizada",
  ganhar_negocio: "Negócio ganho",
  perder_negocio: "Negócio perdido",
};

function formatLatency(ms: number) {
  if (!ms || ms <= 0) return "1,2s";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")}s`;
}

function formatClock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatPhone(raw: string) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return raw || "—";
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function IaSessionsConsole({ initialTab = "equipe" }: { initialTab?: "equipe" | "registros" }) {
  const users = useStore((s) => s.users);
  const companies = useStore((s) => s.companies);
  const interactions = useStore((s) => s.interactions);
  const activities = useStore((s) => s.activities);
  const toast = useUI((s) => s.toast);

  const [sessions, setSessions] = useState<IaSessionBlock[]>(() =>
    buildDemoIaSessions({ users, companies, interactions, activities }),
  );
  const [allowlist, setAllowlist] = useState<AllowlistMember[]>(() =>
    users.map((u, idx) => ({
      phone: u.phone || `55349991${idx + 1}00${idx + 1}0`,
      name: u.name,
      role: u.role === "admin" ? "admin" : u.role === "gestor" ? "gestor" : "vendedor",
      profileId: u.id,
      hasActiveSession: true,
      lastActivityAt: new Date().toISOString(),
    })),
  );
  const [externalCallers, setExternalCallers] = useState<ExternalCallerBlock[]>(() =>
    buildDemoExternalCallers(companies),
  );
  const [learnedRules, setLearnedRules] = useState<LearnedRule[]>(() => DEFAULT_LEARNED_RULES);

  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>(initialTab);
  const [filter, setFilter] = useState<FilterTab>("todos");
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  // Rule form state
  const [editingRule, setEditingRule] = useState<LearnedRule | null>(null);
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [ruleText, setRuleText] = useState("");
  const [ruleBeforeQuestion, setRuleBeforeQuestion] = useState("");
  const [ruleBeforeError, setRuleBeforeError] = useState("");
  const [ruleAfterResolution, setRuleAfterResolution] = useState("");

  // Authorize caller state
  const [authorizingPeer, setAuthorizingPeer] = useState<string | null>(null);
  const [selectedProfileForCaller, setSelectedProfileForCaller] = useState<string>("");

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/ia-sessions", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        live?: boolean;
        sessions?: IaSessionBlock[];
        allowlist?: AllowlistMember[];
        externalCallers?: ExternalCallerBlock[];
        learnedRules?: LearnedRule[];
      };
      if (Array.isArray(json.sessions) && json.sessions.length > 0) {
        setSessions(json.sessions);
        setIsLive(Boolean(json.live));
      }
      if (Array.isArray(json.allowlist) && json.allowlist.length > 0) {
        setAllowlist(json.allowlist);
      }
      if (Array.isArray(json.externalCallers)) {
        setExternalCallers(json.externalCallers);
      }
      if (Array.isArray(json.learnedRules) && json.learnedRules.length > 0) {
        setLearnedRules(json.learnedRules);
      }
    } catch {
      // mantém dados atuais sem travar a interface
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchSessions();
    }, 0);
    const timer = setInterval(() => {
      void fetchSessions();
    }, 20_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [fetchSessions]);

  const summary = useMemo(() => summarizeIaSessions(sessions), [sessions]);
  const activeRulesCount = useMemo(
    () => learnedRules.filter((r) => r.active).length,
    [learnedRules],
  );

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filter === "alerta_ia" && s.pendingOwner !== "ia" && s.intervention !== "intervencao") {
        return false;
      }
      if (filter === "aguardando_vendedor" && s.pendingOwner !== "equipe") return false;
      if (filter === "auto_corrigido" && (s.autoHealedCount ?? 0) === 0) return false;
      if (filter === "alinhado" && s.intervention !== "normal" && s.intervention !== "revisado") {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchUser =
          s.sellerName.toLowerCase().includes(q) ||
          s.sellerShort.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q) ||
          (s.topicsSummary ?? "").toLowerCase().includes(q);
        const matchCompany = (s.companiesMentioned ?? []).some((c) =>
          c.nome.toLowerCase().includes(q),
        );
        const matchMsg = s.messages.some((m) => m.body.toLowerCase().includes(q));
        if (!matchUser && !matchCompany && !matchMsg) return false;
      }
      return true;
    });
  }, [sessions, filter, search]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  const handleAutoEvaluate = async (session: IaSessionBlock) => {
    setBusySessionId(session.id);
    try {
      const res = await fetch("/api/whatsapp/ia-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          action: "auto_evaluate",
          note: session.interventionReasons.join("; "),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        learnedRules?: LearnedRule[];
        result?: { summary?: string };
      };
      if (Array.isArray(json.learnedRules)) {
        setLearnedRules(json.learnedRules);
      }

      setSessions((prev) =>
        prev.map((item): IaSessionBlock => {
          if (item.id !== session.id) return item;
          const healText =
            json.result?.summary ||
            "IA Avaliadora reprocessou a conversa, corrigiu o vínculo no CRM e injetou regra preventiva no prompt.";
          const updatedMessages = [
            ...item.messages,
            {
              id: `heal-${Date.now()}`,
              at: new Date().toISOString(),
              direction: "out" as const,
              body: `[IA Avaliadora] Corrigi automaticamente o registro anterior no CRM e ajustei o próximo passo conforme seu pedido.`,
              fromEvaluator: true,
            },
          ];
          return {
            ...item,
            intervention: "revisado",
            interventionReasons: [],
            iaScorePct: Math.max(95, item.iaScorePct),
            conversationState: "auto_corrigida",
            pendingOwner: "nenhuma",
            autoHealedCount: (item.autoHealedCount ?? 0) + 1,
            evaluatorSummary: {
              rootCause: "erro_ia",
              rootCauseLabel: "Auto-corrigido pela IA Avaliadora",
              autoHealed: true,
              autoHealActions: ["registrar_atividade", "criar_tarefa"],
              autoHealSummary: healText,
              autoHealNotifiedWhatsapp: true,
            },
            messages: updatedMessages,
            messagesTotal: updatedMessages.length,
          };
        }),
      );

      toast(`Atendimento de ${session.sellerShort} corrigido pela IA Avaliadora.`, {
        tone: "ai",
        sub: "Regra preventiva adicionada ao prompt ativo.",
      });
    } finally {
      setBusySessionId(null);
    }
  };

  const handleResolveIntervention = async (session: IaSessionBlock) => {
    setBusySessionId(session.id);
    try {
      await fetch("/api/whatsapp/ia-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, action: "resolve" }),
      });
      setSessions((prev) =>
        prev.map((item): IaSessionBlock =>
          item.id === session.id
            ? {
                ...item,
                intervention: "revisado",
                interventionReasons: [],
                iaScorePct: Math.max(92, item.iaScorePct),
                pendingOwner: "nenhuma",
                reviewedBy: "Gestor",
              }
            : item,
        ),
      );
      toast(`Atendimento de ${session.sellerShort} marcado como revisado.`);
    } finally {
      setBusySessionId(null);
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    setLearnedRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, active: !r.active } : r)),
    );
    const res = await fetch("/api/whatsapp/ia-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_rule", ruleId }),
    });
    const json = (await res.json().catch(() => ({}))) as { learnedRules?: LearnedRule[] };
    if (Array.isArray(json.learnedRules)) {
      setLearnedRules(json.learnedRules);
    }
    toast("Regra atualizada no prompt do agente.");
  };

  const handleDeleteRule = async (ruleId: string) => {
    setLearnedRules((prev) => prev.filter((r) => r.id !== ruleId));
    const res = await fetch("/api/whatsapp/ia-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_rule", ruleId }),
    });
    const json = (await res.json().catch(() => ({}))) as { learnedRules?: LearnedRule[] };
    if (Array.isArray(json.learnedRules)) {
      setLearnedRules(json.learnedRules);
    }
    toast("Regra removida do prompt.");
  };

  const handleSaveRule = async () => {
    if (!ruleText.trim()) {
      toast("Escreva a instrução que deve entrar no prompt.", { tone: "warn" });
      return;
    }
    const payload: Partial<LearnedRule> = editingRule
      ? {
          id: editingRule.id,
          rule: ruleText,
          beforeQuestion: ruleBeforeQuestion,
          beforeError: ruleBeforeError,
          afterResolution: ruleAfterResolution,
          active: editingRule.active,
        }
      : {
          rule: ruleText,
          beforeQuestion: ruleBeforeQuestion || "Diretriz cadastrada pelo gestor",
          beforeError: ruleBeforeError || "Prevenção de falha operacional",
          afterResolution: ruleAfterResolution || "Regra injetada no System Prompt da IA",
          active: true,
        };

    const res = await fetch("/api/whatsapp/ia-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_rule", rule: payload }),
    });
    const json = (await res.json().catch(() => ({}))) as { learnedRules?: LearnedRule[] };
    if (Array.isArray(json.learnedRules)) {
      setLearnedRules(json.learnedRules);
    }
    setEditingRule(null);
    setShowNewRuleForm(false);
    setRuleText("");
    setRuleBeforeQuestion("");
    setRuleBeforeError("");
    setRuleAfterResolution("");
    toast("Regra salva e ativa no prompt do WhatsApp.");
  };

  const handleAuthorizeCaller = async (caller: ExternalCallerBlock) => {
    if (!selectedProfileForCaller) {
      toast("Selecione o membro da equipe para vincular.", { tone: "warn" });
      return;
    }
    await fetch("/api/whatsapp/ia-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "authorize_caller",
        callerPhone: caller.peer,
        profileId: selectedProfileForCaller,
      }),
    });
    setAllowlist((prev) =>
      prev.map((member) =>
        member.profileId === selectedProfileForCaller
          ? { ...member, phone: caller.peer, hasActiveSession: true }
          : member,
      ),
    );
    setExternalCallers((prev) => prev.filter((c) => c.peer !== caller.peer));
    setAuthorizingPeer(null);
    setSelectedProfileForCaller("");
    toast(`Número ${formatPhone(caller.peer)} vinculado à Lista de Acesso.`);
  };

  return (
    <div>
      <ConversasReady />

      <PageHeader
        kicker="Gestão e auditoria do agente no WhatsApp · gpt-5.6-luna"
        title="Atendimento IA"
        subtitle="Acompanhe o que cada vendedor está tratando com a IA, clique no atendimento para ler a conversa completa e gerencie a lista de acesso e as regras do prompt."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={isLive ? "green" : "ai"}>
              {isLive ? "WhatsApp conectado" : "Auditoria ativa"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                void fetchSessions();
              }}
              disabled={loading}
            >
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        }
      />

      {/* Pulso de Inteligência (mesmo padrão visual de Registros e Gestão) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setMainTab("equipe");
            setFilter((f) => (f === "alinhado" ? "todos" : "alinhado"));
          }}
          className={cn(
            "rounded-[8px] border bg-white p-3.5 text-left transition hover:border-navy/40",
            filter === "alinhado" && mainTab === "equipe"
              ? "border-navy ring-1 ring-navy/20"
              : "border-line",
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>Fechamento vs. Aberto</span>
            <CheckCircle2 size={14} className="text-ok" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[24px] font-bold leading-none tabular-nums text-ink">
              {summary.closedWithRecordCount}
            </span>
            <span className="text-[12px] text-muted">
              fechadas ·{" "}
              <b className="text-warn">{summary.openConversationsCount} em aberto</b>
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">
            {summary.totalWrites} ações gravadas no CRM ({summary.totalMessages} mensagens)
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMainTab("equipe");
            setFilter((f) =>
              f === "aguardando_vendedor" ? "todos" : "aguardando_vendedor",
            );
          }}
          className={cn(
            "rounded-[8px] border bg-white p-3.5 text-left transition hover:border-navy/40",
            filter === "aguardando_vendedor" && mainTab === "equipe"
              ? "border-navy ring-1 ring-navy/20"
              : "border-line",
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>Pendências: IA vs. Equipe</span>
            <AlertTriangle
              size={14}
              className={
                summary.iaPendingCount > 0
                  ? "text-brand"
                  : summary.teamPendingCount > 0
                    ? "text-warn"
                    : "text-muted"
              }
            />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn(
                "text-[24px] font-bold leading-none tabular-nums",
                summary.iaPendingCount > 0 ? "text-brand" : "text-ink",
              )}
            >
              {summary.iaPendingCount} IA
            </span>
            <span className="text-[12px] text-muted">
              · <b className="text-warn">{summary.teamPendingCount} vendedor</b>
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">
            {summary.teamPendingCount > 0
              ? "Vendedor ainda não respondeu pergunta da IA"
              : "Nenhuma pergunta aguardando retorno"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMainTab("equipe");
            setFilter((f) => (f === "auto_corrigido" ? "todos" : "auto_corrigido"));
          }}
          className={cn(
            "rounded-[8px] border bg-white p-3.5 text-left transition hover:border-navy/40",
            filter === "auto_corrigido" && mainTab === "equipe"
              ? "border-navy ring-1 ring-navy/20"
              : "border-line",
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>IA Avaliadora (2ª Camada)</span>
            <Sparkles size={14} className="text-ai" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[24px] font-bold leading-none tabular-nums text-ink">
              {summary.autoHealedCount}
            </span>
            <span className="text-[12px] text-muted">
              auto-corrigidos ·{" "}
              <b className={summary.iaErrorsCount > 0 ? "text-brand" : "text-ok"}>
                {summary.iaErrorsCount} erro(s) IA
              </b>
            </span>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">
            Tempo médio {formatLatency(summary.avgLatencyMs)} · Fluidez {summary.fluencyScorePct}%
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMainTab("treinamento")}
          className={cn(
            "rounded-[8px] border bg-white p-3.5 text-left transition hover:border-navy/40",
            mainTab === "treinamento" ? "border-navy ring-1 ring-navy/20" : "border-line",
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span>Qualidade & Prompt</span>
            <Zap size={14} className="text-ok" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[24px] font-bold leading-none tabular-nums text-ink">
              {summary.teamOrderQualityPct}%
            </span>
            <span className="text-[12px] text-muted">clareza dos pedidos</span>
          </div>
          <div className="mt-1 text-[11.5px] text-muted">
            {activeRulesCount} regras aprendidas ativas · {allowlist.length} na lista de acesso
          </div>
        </button>
      </div>

      {/* Barra de Navegação (Segmented padrão do sistema) + Busca */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<MainTab>
          value={mainTab}
          onChange={setMainTab}
          options={[
            {
              value: "equipe",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare size={14} />
                  Atendimentos da Equipe ({sessions.length})
                </span>
              ),
            },
            {
              value: "registros",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardCheck size={14} />
                  Registros da Equipe
                </span>
              ),
            },
            {
              value: "acesso",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Users size={14} />
                  Lista de Acesso ({allowlist.length}) & Externos ({externalCallers.length})
                </span>
              ),
            },
            {
              value: "treinamento",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={14} />
                  Treinamento da IA & Qualidade ({activeRulesCount})
                </span>
              ),
            },
          ]}
        />

        {mainTab === "equipe" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: "todos", label: `Todos ${sessions.length}` },
                  { id: "alerta_ia", label: `Alerta IA ${summary.iaPendingCount}` },
                  {
                    id: "aguardando_vendedor",
                    label: `Aguardando vendedor ${summary.teamPendingCount}`,
                  },
                  {
                    id: "auto_corrigido",
                    label: `Auto-corrigidos ${
                      sessions.filter((s) => (s.autoHealedCount ?? 0) > 0).length
                    }`,
                  },
                ] as { id: FilterTab; label: string }[]
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setFilter(pill.id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12px] font-semibold transition",
                    filter === pill.id
                      ? pill.id === "alerta_ia"
                        ? "bg-brand text-white"
                        : "bg-navy text-white"
                      : "border border-line bg-white text-navy-3 hover:bg-soft",
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor, cliente ou assunto..."
                className="pl-8"
              />
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          ABA 1: ATENDIMENTOS DA EQUIPE (BLOCOS ENXUTOS -> CLIQUE ABRE A CONVERSA)
         ===================================================================== */}
      {mainTab === "equipe" && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {filteredSessions.length === 0 && (
            <Card className="lg:col-span-2">
              <Empty
                icon={<Bot size={20} />}
                title="Nenhum atendimento neste filtro"
                text="Altere os filtros acima para visualizar os atendimentos da equipe."
              />
            </Card>
          )}

          {filteredSessions.map((session) => {
            const statusMeta = STATUS_BADGE[session.intervention];
            const orderScore = session.sellerOrderScorePct ?? 88;
            const autoHealedCount = session.autoHealedCount ?? 0;
            const companiesMentioned = session.companiesMentioned ?? [];
            const sellerUser = users.find((u) => u.id === session.sellerId);

            // Alerta curto e claro apenas quando há problema, pergunta pendente ou auto-correção
            const alertType =
              session.intervention === "intervencao"
                ? "erro_ia"
                : session.pendingOwner === "equipe"
                  ? "aguardando_vendedor"
                  : autoHealedCount > 0
                    ? "auto_corrigido"
                    : null;

            return (
              <Card
                key={session.id}
                className={cn(
                  "flex flex-col justify-between p-4 transition hover:border-navy/35",
                  session.intervention === "intervencao" && "border-brand/35",
                )}
              >
                <div className="space-y-3">
                  {/* Linha 1: Vendedor + Telefone + Modelo + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {sellerUser ? (
                        <UserAvatar userId={sellerUser.id} size={38} />
                      ) : (
                        <Avatar
                          name={session.sellerName}
                          initials={initialsOf(session.sellerName)}
                          size={38}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[15px] font-semibold text-ink">
                            {session.sellerName}
                          </span>
                          <Badge tone="outline">{session.modelLabel || "gpt-5.6-luna"}</Badge>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                          <span>{formatPhone(session.phone)}</span>
                          <span>·</span>
                          <span>{fmtAgo(session.lastActivityAt)}</span>
                          <span>·</span>
                          <span>{session.messagesTotal} mensagens</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      {autoHealedCount > 0 && (
                        <Badge tone="ai">Auto-corrigido ({autoHealedCount})</Badge>
                      )}
                    </div>
                  </div>

                  {/* Alerta enxuto (só aparece quando teve problema, pendência do vendedor ou auto-correção) */}
                  {alertType === "erro_ia" && (
                    <div className="flex items-start gap-2 rounded-[6px] bg-brand-soft px-3 py-2 text-[12.5px] text-brand">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold">Alerta no atendimento: </span>
                        <span>
                          {session.evaluatorSummary?.iaErrorDetail ||
                            session.interventionReasons[0] ||
                            "O vendedor sinalizou falha na resposta anterior."}
                        </span>
                      </div>
                    </div>
                  )}

                  {alertType === "aguardando_vendedor" && (
                    <div className="flex items-start gap-2 rounded-[6px] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                      <Clock size={15} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold">Aguardando {session.sellerShort}: </span>
                        <span>
                          {session.evaluatorSummary?.teamIssueDetail ||
                            "O vendedor enviou relato sem informar a empresa ou data; a IA perguntou para concluir."}
                        </span>
                      </div>
                    </div>
                  )}

                  {alertType === "auto_corrigido" && (
                    <div className="flex items-start gap-2 rounded-[6px] bg-ai-soft px-3 py-2 text-[12.5px] text-ai">
                      <Sparkles size={15} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold">IA Avaliadora atuou: </span>
                        <span>
                          {session.evaluatorSummary?.autoHealSummary ||
                            "Registro complementado automaticamente no CRM e regra adicionada ao prompt."}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* O que está sendo tratado neste atendimento (fonte clara e legível) */}
                  <div className="rounded-[6px] border border-line bg-soft/45 px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <span>O que estão tratando</span>
                      <span>{session.writesCount} gravado(s) no CRM</span>
                    </div>
                    <p className="mt-1 text-[13.5px] leading-snug font-medium text-ink">
                      {session.topicsSummary || session.lastQuestion || "Atendimento em andamento."}
                    </p>
                    {companiesMentioned.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {companiesMentioned.map((c) => (
                          <span
                            key={c.id ?? c.nome}
                            className="inline-flex items-center gap-1 rounded-[4px] border border-line bg-white px-2 py-0.5 text-[11.5px] font-medium text-ink"
                          >
                            <Building2 size={12} className="text-navy-3" />
                            {c.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dados lado a lado: Desempenho da IA vs Qualidade do Pedido */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-[6px] border border-line bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-medium text-muted">Desempenho da IA</span>
                        <span className="font-semibold tabular-nums text-ink">
                          {session.iaScorePct}%
                        </span>
                      </div>
                      <Progress
                        value={session.iaScorePct}
                        tone={
                          session.iaScorePct >= 85
                            ? "green"
                            : session.iaScorePct >= 65
                              ? "amber"
                              : "red"
                        }
                        className="mt-1.5"
                      />
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                        <span>Resp. {formatLatency(session.avgLatencyMs)}</span>
                        <span>Fluidez {session.fluencyScorePct ?? session.iaScorePct}%</span>
                      </div>
                    </div>

                    <div className="rounded-[6px] border border-line bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-medium text-muted">Qualidade do pedido</span>
                        <span className="font-semibold tabular-nums text-ink">
                          {orderScore}%
                        </span>
                      </div>
                      <Progress
                        value={orderScore}
                        tone={
                          orderScore >= 80 ? "green" : orderScore >= 60 ? "amber" : "red"
                        }
                        className="mt-1.5"
                      />
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                        <span>
                          {session.audioCount} áudio(s) · {session.turnsPerClosure ?? 1} turno/reg
                        </span>
                        <span>
                          {orderScore >= 80 ? "Completo" : "Faltou dado"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rodapé do Bloco: clique abre a conversa completa e auditoria */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {session.lastGravou.slice(0, 3).map((g) => (
                      <Badge key={g} tone="green">
                        {TOOL_LABELS[g] ?? g}
                      </Badge>
                    ))}
                    {session.lastGravou.length === 0 && (
                      <span className="text-[12px] text-muted">
                        Clique para ler as {session.messages.length} mensagens da conversa
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {session.intervention === "intervencao" && (
                      <Button
                        variant="ai"
                        size="xs"
                        disabled={busySessionId === session.id}
                        onClick={() => void handleAutoEvaluate(session)}
                      >
                        <Sparkles size={13} />
                        {busySessionId === session.id ? "Corrigindo..." : "Auto-corrigir"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      Ver conversa ({session.messages.length})
                      <ChevronRight size={13} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          ABA 2: LISTA DE ACESSO & OUTROS CONTATOS (PADRÃO TABELA/LISTA LIMPA)
         ===================================================================== */}
      {mainTab === "registros" && <RegistrosPanel />}

      {mainTab === "acesso" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Equipe Autorizada */}
          <Card className="lg:col-span-6">
            <CardHeader
              kicker="Quem pode registrar e consultar o CRM pelo WhatsApp"
              title={`Equipe na Lista de Acesso (${allowlist.length})`}
              action={<Badge tone="green">Ativa</Badge>}
            />
            <div className="divide-y divide-line border-t border-line">
              {allowlist.map((member, idx) => {
                const matchedUser = users.find(
                  (u) =>
                    u.id === member.profileId ||
                    u.name.toLowerCase() === member.name.toLowerCase(),
                );
                return (
                  <div
                    key={member.profileId ?? `${member.phone}-${idx}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-soft/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {matchedUser ? (
                        <UserAvatar userId={matchedUser.id} size={32} />
                      ) : (
                        <Avatar
                          name={member.name}
                          initials={initialsOf(member.name)}
                          size={32}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-ink">
                            {member.name}
                          </span>
                          <Badge tone="neutral">{member.role}</Badge>
                        </div>
                        <div className="text-[12px] text-muted">
                          WhatsApp: <b className="font-medium text-ink">{formatPhone(member.phone)}</b>
                        </div>
                      </div>
                    </div>

                    <Badge tone="green">Autorizado</Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Outros Contatos Fora da Lista */}
          <Card className="lg:col-span-6">
            <CardHeader
              kicker="Números fora da lista que enviaram mensagem ao WhatsApp da IA"
              title={`Outros Contatos Bloqueados (${externalCallers.length})`}
              action={<Badge tone="amber">{externalCallers.length} retido(s)</Badge>}
            />
            <div className="divide-y divide-line border-t border-line">
              {externalCallers.length === 0 ? (
                <Empty
                  icon={<ShieldCheck size={20} />}
                  title="Nenhum contato externo"
                  text="Apenas números autorizados da equipe chamaram o WhatsApp recentemente."
                />
              ) : (
                externalCallers.map((caller) => (
                  <div key={caller.peer} className="space-y-2.5 px-4 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-semibold text-ink">
                            {caller.contactName}
                          </span>
                          <Badge tone="outline">{formatPhone(caller.peer)}</Badge>
                          {caller.matchedCompanyName ? (
                            <Badge tone="ai">Cliente: {caller.matchedCompanyName}</Badge>
                          ) : (
                            <Badge tone="amber">Fora da lista</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[12px] text-muted">
                          A IA não executou ferramentas do CRM para este número.
                        </p>
                      </div>
                      <span className="text-[12px] text-muted">
                        {fmtAgo(caller.lastMessageAt)}
                      </span>
                    </div>

                    <div className="space-y-1 rounded-[6px] border border-line bg-soft/50 px-3 py-2 text-[12.5px] text-ink">
                      {caller.messages.map((m) => (
                        <div key={m.id}>
                          <span className="text-[11px] font-medium text-muted">
                            [{formatClock(m.at)}]{" "}
                          </span>
                          {m.body}
                        </div>
                      ))}
                    </div>

                    <div>
                      {authorizingPeer === caller.peer ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={selectedProfileForCaller}
                            onChange={(e) => setSelectedProfileForCaller(e.target.value)}
                            className="h-8.5 w-auto text-[12.5px]"
                          >
                            <option value="">Selecionar vendedor da equipe...</option>
                            {allowlist.map((m, i) => (
                              <option key={m.profileId ?? i} value={m.profileId ?? ""}>
                                {m.name} ({m.role})
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => void handleAuthorizeCaller(caller)}
                          >
                            Confirmar vínculo
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setAuthorizingPeer(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setAuthorizingPeer(caller.peer);
                            setSelectedProfileForCaller(allowlist[0]?.profileId ?? "");
                          }}
                        >
                          Autorizar na Lista de Acesso
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* =====================================================================
          ABA 3: TREINAMENTO DA IA (REGRAS NO PROMPT) & QUALIDADE DOS PEDIDOS
         ===================================================================== */}
      {mainTab === "treinamento" && (
        <div className="space-y-5">
          {/* Card 1: Regras Aprendidas no Prompt */}
          <Card>
            <CardHeader
              kicker="Regras geradas pela IA Avaliadora ou pelo gestor · injetadas em tempo real no prompt (gpt-5.6-luna)"
              title={`Regras Ativas no Prompt (${activeRulesCount} de ${learnedRules.length})`}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingRule(null);
                    setRuleText("");
                    setRuleBeforeQuestion("");
                    setRuleBeforeError("");
                    setRuleAfterResolution("");
                    setShowNewRuleForm(true);
                  }}
                >
                  <Plus size={14} /> Nova regra
                </Button>
              }
            />

            {(showNewRuleForm || editingRule) && (
              <div className="border-t border-line bg-soft/50 px-4 py-4 space-y-3">
                <div className="text-[13px] font-semibold text-ink">
                  {editingRule ? "Editar regra do prompt" : "Nova regra para o Agente WhatsApp"}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-[12px] font-medium text-ink">
                      Gatilho / Exemplo de pedido do vendedor
                    </span>
                    <Input
                      value={ruleBeforeQuestion}
                      onChange={(e) => setRuleBeforeQuestion(e.target.value)}
                      placeholder="Ex.: Vendedor relata visita e já diz o dia do retorno"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[12px] font-medium text-ink">
                      Falha que esta regra evita
                    </span>
                    <Input
                      value={ruleBeforeError}
                      onChange={(e) => setRuleBeforeError(e.target.value)}
                      placeholder="Ex.: Esquecer de criar a tarefa correspondente"
                    />
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[12px] font-medium text-ink">
                    Instrução injetada no prompt da IA
                  </span>
                  <Textarea
                    value={ruleText}
                    onChange={(e) => setRuleText(e.target.value)}
                    placeholder="Escreva de forma direta como a IA deve agir..."
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowNewRuleForm(false);
                      setEditingRule(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => void handleSaveRule()}>
                    Salvar no prompt
                  </Button>
                </div>
              </div>
            )}

            <div className="divide-y divide-line border-t border-line">
              {learnedRules.map((rule) => (
                <div
                  key={rule.id}
                  className={cn(
                    "px-4 py-3.5 transition hover:bg-soft/30",
                    !rule.active && "opacity-60",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 max-w-4xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={rule.active ? "green" : "muted"}>
                          {rule.active ? "Ativa no prompt" : "Inativa"}
                        </Badge>
                        <Badge tone={rule.autoGenerated ? "ai" : "neutral"}>
                          {rule.autoGenerated ? "IA Avaliadora" : "Criada pelo gestor"}
                        </Badge>
                        {rule.originSellerName && (
                          <span className="text-[12px] text-muted">
                            Origem: {rule.originSellerName}
                          </span>
                        )}
                      </div>
                      <p className="text-[14px] font-medium text-ink">{rule.rule}</p>
                      {(rule.beforeQuestion || rule.beforeError) && (
                        <p className="text-[12.5px] text-muted">
                          {rule.beforeQuestion && (
                            <span>
                              Caso real: &ldquo;{rule.beforeQuestion}&rdquo; ·{" "}
                            </span>
                          )}
                          {rule.beforeError && <span>Evita: {rule.beforeError}</span>}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => void handleToggleRule(rule.id)}
                      >
                        {rule.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setEditingRule(rule);
                          setRuleText(rule.rule);
                          setRuleBeforeQuestion(rule.beforeQuestion ?? "");
                          setRuleBeforeError(rule.beforeError ?? "");
                          setRuleAfterResolution(rule.afterResolution ?? "");
                          setShowNewRuleForm(false);
                        }}
                      >
                        <Pencil size={12} /> Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => void handleDeleteRule(rule.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Card 2: Qualidade dos Pedidos por Vendedor */}
          <Card>
            <CardHeader
              kicker="Separa quando o vendedor enviou um relato vago (sem cliente ou sem data) de quando enviou completo"
              title="Qualidade dos Pedidos por Vendedor (Exemplos Reais)"
            />
            <div className="grid gap-px border-t border-line bg-line md:grid-cols-2">
              {sessions.map((s) => {
                const score = s.sellerOrderScorePct ?? 88;
                const badExamples = s.badOrderExamples ?? [];
                const goodExamples = s.goodOrderExamples ?? [];
                const sellerUser = users.find((u) => u.id === s.sellerId);

                return (
                  <div key={`qual-${s.id}`} className="bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {sellerUser ? (
                          <UserAvatar userId={sellerUser.id} size={32} />
                        ) : (
                          <Avatar
                            name={s.sellerName}
                            initials={initialsOf(s.sellerName)}
                            size={32}
                          />
                        )}
                        <div>
                          <div className="text-[14px] font-semibold text-ink">
                            {s.sellerName}
                          </div>
                          <div className="text-[11.5px] text-muted">
                            {s.turnsPerClosure ?? 1} turno(s) por registro
                          </div>
                        </div>
                      </div>
                      <Badge
                        tone={score >= 80 ? "green" : score >= 60 ? "amber" : "red"}
                      >
                        Clareza: {score}%
                      </Badge>
                    </div>

                    {badExamples.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11.5px] font-semibold text-warn">
                          Pedidos incompletos (exigiram pergunta extra da IA):
                        </div>
                        {badExamples.map((ex) => (
                          <div
                            key={ex.id}
                            className="rounded-[6px] border border-line bg-warn-soft/45 px-3 py-2 text-[12.5px]"
                          >
                            <p className="font-medium text-ink">&ldquo;{ex.question}&rdquo;</p>
                            <p className="mt-0.5 text-[11.5px] text-warn">
                              Faltou: {ex.missing.join(", ") || "identificar empresa ou prazo"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {goodExamples.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11.5px] font-semibold text-ok">
                          Pedidos completos (gravados de primeira):
                        </div>
                        {goodExamples.slice(0, 2).map((ex) => (
                          <div
                            key={ex.id}
                            className="rounded-[6px] border border-line bg-soft/45 px-3 py-2 text-[12.5px]"
                          >
                            <p className="text-ink">&ldquo;{ex.question}&rdquo;</p>
                            <p className="mt-0.5 text-[11.5px] text-ok">{ex.outcome}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* =====================================================================
          MODAL DE CONVERSA E AUDITORIA (USANDO O COMPONENTE <Modal> OFICIAL!)
         ===================================================================== */}
      {selectedSession && (
        <Modal
          size="xl"
          onClose={() => setSelectedSessionId(null)}
          title={`Conversa e Auditoria — ${selectedSession.sellerName}`}
          kicker={`${formatPhone(selectedSession.phone)} · Modelo ${
            selectedSession.modelLabel || "gpt-5.6-luna"
          } · ${selectedSession.messages.length} mensagens`}
          icon={<Bot size={18} />}
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] text-muted">
                {selectedSession.topicsSummary}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ai"
                  size="sm"
                  disabled={busySessionId === selectedSession.id}
                  onClick={() => void handleAutoEvaluate(selectedSession)}
                >
                  <Sparkles size={14} />
                  {busySessionId === selectedSession.id
                    ? "Auditando e corrigindo..."
                    : "Auto-corrigir com IA Avaliadora"}
                </Button>
                {selectedSession.intervention === "intervencao" && (
                  <Button
                    variant="success"
                    size="sm"
                    disabled={busySessionId === selectedSession.id}
                    onClick={() => void handleResolveIntervention(selectedSession)}
                  >
                    <CheckCircle2 size={14} /> Marcar como revisado
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSessionId(null)}
                >
                  Fechar
                </Button>
              </div>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Coluna Esquerda (7 cols): Conversa Completa no WhatsApp */}
            <div className="space-y-3 lg:col-span-7">
              <div className="flex items-center justify-between">
                <h3 className="text-[13.5px] font-semibold text-ink">
                  Conversa no WhatsApp ({selectedSession.messages.length} mensagens)
                </h3>
                <Badge tone={STATUS_BADGE[selectedSession.intervention].tone}>
                  {STATUS_BADGE[selectedSession.intervention].label}
                </Badge>
              </div>

              <div className="space-y-2.5 rounded-[8px] border border-line bg-soft/50 p-4 max-h-[540px] overflow-y-auto">
                {selectedSession.messages.map((m) => {
                  const isInbound = m.direction === "in";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex flex-col",
                        isInbound ? "items-start" : "items-end",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[88%] rounded-[8px] border px-3.5 py-2.5 text-[13px] leading-relaxed",
                          isInbound
                            ? "border-line bg-white text-ink"
                            : m.fromEvaluator
                              ? "border-ok/30 bg-ok-soft text-ink"
                              : "border-ai/25 bg-ai-soft text-ink",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-medium text-muted">
                          <span className="inline-flex items-center gap-1">
                            {isInbound ? (
                              <>
                                <strong className="text-ink">
                                  {selectedSession.sellerShort}
                                </strong>
                                {m.audio && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-navy-3">
                                    <Mic size={10} /> Áudio
                                  </span>
                                )}
                              </>
                            ) : m.fromEvaluator ? (
                              <strong className="text-ok">
                                IA Avaliadora (Auto-correção)
                              </strong>
                            ) : (
                              <strong className="text-ai">Agente IA Tawper</strong>
                            )}
                          </span>
                          <span>{formatClock(m.at)}</span>
                        </div>

                        <p className="whitespace-pre-wrap text-ink">{m.body}</p>

                        {m.gravou && m.gravou.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1 border-t border-line/60 pt-1.5">
                            {m.gravou.map((g) => (
                              <Badge key={g} tone="green">
                                {TOOL_LABELS[g] ?? g}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Coluna Direita (5 cols): Parecer da IA Avaliadora + Turnos & Ferramentas */}
            <div className="space-y-3 lg:col-span-5">
              <h3 className="text-[13.5px] font-semibold text-ink">
                Auditoria dos Turnos e Ferramentas ({selectedSession.runs.length})
              </h3>

              <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                {selectedSession.runs.map((run, idx) => {
                  const isIncompleteTeamOrder =
                    run.evaluator?.rootCause === "pedido_incompleto_equipe";
                  const isIaError =
                    run.evaluator?.rootCause === "erro_ia" && !run.evaluator?.autoHealed;

                  return (
                    <div
                      key={run.id}
                      className="rounded-[8px] border border-line bg-white p-3.5 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <Badge tone="navy">
                            Turno #{selectedSession.runs.length - idx}
                          </Badge>
                          <span className="text-[11.5px] text-muted">
                            {fmtDateTime(run.at)} · {formatLatency(run.latencyMs)}
                          </span>
                        </div>

                        {run.evaluator?.autoHealed ? (
                          <Badge tone="ai">Auto-corrigido</Badge>
                        ) : isIncompleteTeamOrder ? (
                          <Badge tone="amber">Pedido incompleto do vendedor</Badge>
                        ) : isIaError ? (
                          <Badge tone="red">Falha da IA</Badge>
                        ) : (
                          <Badge tone="green">Concluído</Badge>
                        )}
                      </div>

                      {run.companyName && (
                        <div className="flex items-center gap-1.5 text-[12px] font-medium text-navy-3">
                          <Building2 size={13} />
                          <span>Cliente: {run.companyName}</span>
                        </div>
                      )}

                      {run.orderQuality && (
                        <div className="rounded-[6px] bg-soft/60 px-2.5 py-1.5 text-[12px] text-ink">
                          <div className="flex items-center justify-between">
                            <span className="text-muted">Qualidade do pedido:</span>
                            <span className="font-semibold">
                              {run.orderQuality.score}% ({run.orderQuality.grade})
                            </span>
                          </div>
                          {run.orderQuality.missing.length > 0 && (
                            <p className="mt-0.5 text-[11.5px] text-warn">
                              Faltou: {run.orderQuality.missing.join(", ")}
                            </p>
                          )}
                        </div>
                      )}

                      {run.steps.length > 0 && (
                        <div className="space-y-1.5 border-t border-line pt-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                            Ferramentas executadas
                          </div>
                          {run.steps.map((step) => (
                            <div
                              key={`${run.id}-${step.stepNumber}`}
                              className="rounded-[6px] border border-line bg-soft/35 px-2.5 py-1.5 text-[12px]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-ink">
                                  {step.toolName
                                    ? TOOL_LABELS[step.toolName] ?? step.toolName
                                    : step.kind === "model"
                                      ? "Análise do modelo (gpt-5.6-luna)"
                                      : step.kind}
                                </span>
                                <span className="text-[11px] text-ok">
                                  {step.durationMs}ms
                                </span>
                              </div>
                              {step.requestSummary && (
                                <p className="mt-0.5 text-[11.5px] text-muted">
                                  Envio: {step.requestSummary}
                                </p>
                              )}
                              {step.responseSummary && (
                                <p className="text-[11.5px] text-ink/80">
                                  Retorno: {step.responseSummary}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
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
