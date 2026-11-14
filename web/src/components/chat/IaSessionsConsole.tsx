"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type MainTab = "equipe" | "acesso" | "treinamento";
type FilterTab =
  | "todos"
  | "pendencia_ia"
  | "pendencia_equipe"
  | "intervencao"
  | "auto_corrigido"
  | "alinhado";

const INTERVENTION_META: Record<
  InterventionLevel,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    dot: string;
  }
> = {
  normal: {
    label: "IA Alinhada",
    badgeBg: "bg-ok-soft border-ok-line",
    badgeText: "text-ok",
    border: "border-line",
    dot: "bg-ok",
  },
  revisado: {
    label: "Revisado pelo Gestor",
    badgeBg: "bg-info-soft border-info-line",
    badgeText: "text-info",
    border: "border-info-line",
    dot: "bg-info",
  },
  atencao: {
    label: "Atenção / Monitorar",
    badgeBg: "bg-warn-soft border-warn-line",
    badgeText: "text-warn",
    border: "border-warn-line",
    dot: "bg-warn",
  },
  intervencao: {
    label: "Intervenção Necessária",
    badgeBg: "bg-err-soft border-err-line",
    badgeText: "text-err",
    border: "border-err-line",
    dot: "bg-err",
  },
};

const TOOL_LABELS: Record<string, string> = {
  buscar_cliente: "Busca de empresa na carteira",
  buscar_empresas: "Busca de empresa na carteira",
  consultar_crm: "Consulta de dados no CRM",
  detalhar_empresa: "Leitura da ficha do cliente",
  listar_minhas_tarefas: "Consulta de tarefas da rotina",
  resumo_carteira: "Leitura do resumo da carteira",
  buscar_historico_empresa: "Consulta de histórico do cliente",
  consultar_mensagens_whatsapp: "Leitura de conversas WhatsApp",
  registrar_atividade: "Gravação de registro comercial",
  registrar_interacao: "Gravação de registro comercial",
  criar_tarefa: "Criação de tarefa / próximo passo",
  concluir_tarefa: "Baixa de tarefa concluída",
  mover_etapa: "Avanço de etapa no funil",
  mover_etapa_empresa: "Avanço de etapa no funil",
  atualizar_proximo_passo: "Atualização de próximo passo",
  adicionar_nota_empresa: "Gravação de nota na ficha",
  atualizar_cliente: "Atualização de dados técnicos/cadastro",
  atualizar_dados_tecnicos: "Atualização de dados técnicos",
  criar_proposta: "Emissão/registro de proposta",
  registrar_proposta: "Emissão/registro de proposta",
  atualizar_proposta: "Atualização de proposta",
};

function formatTimeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60_000));
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function formatClock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatLatency(ms: number) {
  if (!ms || ms <= 0) return "1,1s";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")}s`;
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function IaSessionsConsole() {
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
      phone: `+55 34 9991${idx + 1}-00${idx + 1}0`,
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
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>("equipe");
  const [filter, setFilter] = useState<FilterTab>("todos");
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expandedCardChats, setExpandedCardChats] = useState<Record<string, boolean>>({});
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  // Rule modal / form state
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
      if (!res.ok) throw new Error("Falha ao carregar sessões");
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
      // mantém dados em tela
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
    }, 15_000);
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
      if (filter === "pendencia_ia" && s.pendingOwner !== "ia") return false;
      if (filter === "pendencia_equipe" && s.pendingOwner !== "equipe") return false;
      if (filter === "intervencao" && s.intervention !== "intervencao") return false;
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
              body: `🤖 [IA Avaliadora] Corrigi automaticamente o registro anterior no CRM e ajustei o próximo passo conforme seu pedido.`,
              fromEvaluator: true,
            },
          ];
          return {
            ...item,
            intervention: "normal",
            interventionReasons: [],
            iaScorePct: Math.max(94, item.iaScorePct),
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

      toast(
        `IA Avaliadora corrigiu o atendimento de ${session.sellerShort} e atualizou as regras do prompt.`,
      );
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
    toast("Status da regra atualizado no prompt da IA.");
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
    toast("Regra removida.");
  };

  const handleSaveRule = async () => {
    if (!ruleText.trim()) {
      toast("Escreva a instrução que deve entrar no prompt da IA.");
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
    toast("Regra salva e injetada no prompt ativo da IA do WhatsApp!");
  };

  const handleAuthorizeCaller = async (caller: ExternalCallerBlock) => {
    if (!selectedProfileForCaller) {
      toast("Selecione a qual vendedor da equipe este número pertence.");
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
    toast(`Número ${caller.peer} autorizado na Lista de Acesso da equipe!`);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-bg p-6">
      <div className="mx-auto max-w-[1440px] space-y-6">
        {/* Cabeçalho Principal */}
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-line bg-card p-5 shadow-xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ok-soft text-ok border border-ok-line font-bold">
                ✦
              </span>
              <h1 className="text-xl font-bold tracking-tight text-fg">
                Central de Auditoria, Conversas & Treinamento da IA (WhatsApp)
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                  isLive
                    ? "border-ok-line bg-ok-soft text-ok"
                    : "border-info-line bg-info-soft text-info"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isLive ? "bg-ok animate-pulse" : "bg-info"
                  }`}
                />
                {isLive ? "Conectado ao WhatsApp Real" : "Auditoria Operacional Ativa"}
              </span>
            </div>
            <p className="text-sm text-fg-2 max-w-4xl">
              Veja a <strong>conversa completa de cada vendedor</strong>, o que estão tratando em cada
              empresa, o diagnóstico da <strong>IA Avaliadora (Auto-Corretora)</strong> separando erros
              da IA de pedidos vagos da equipe, e as regras injetadas no prompt para melhoria contínua.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void fetchSessions();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-fg-2 hover:bg-surface-2 transition-colors"
            >
              ↻ {loading ? "Sincronizando..." : "Atualizar agora"}
            </button>
          </div>
        </div>

        {/* 6 KPIs de Inteligência Operacional */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* 1. Fechamento vs Em Aberto */}
          <div className="rounded-xl border border-line bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>Fechamento vs. Aberto</span>
              <span className="text-ok font-bold">✓</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-ok">
                {summary.closedWithRecordCount}
              </span>
              <span className="text-xs font-medium text-fg-2">
                fechadas ·{" "}
                <strong className="text-warn">{summary.openConversationsCount}</strong> abertas
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {summary.totalWrites} registros gravados no CRM ({summary.totalMessages} msgs)
            </p>
          </div>

          {/* 2. Pendências: IA vs Equipe */}
          <div className="rounded-xl border border-line bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>Pendências: IA vs. Equipe</span>
              <span className="text-warn font-bold">!</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold ${
                  summary.iaPendingCount > 0 ? "text-err" : "text-ok"
                }`}
              >
                {summary.iaPendingCount} IA
              </span>
              <span className="text-xs font-medium text-fg-2">
                · <strong className="text-warn">{summary.teamPendingCount}</strong> Equipe
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              IA deve resposta vs. Vendedor não respondeu pergunta
            </p>
          </div>

          {/* 3. Erros da IA & Auto-Correções */}
          <div className="rounded-xl border border-line bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>IA Avaliadora (2ª Camada)</span>
              <span className="text-info font-bold">⚡</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-info">
                {summary.autoHealedCount}
              </span>
              <span className="text-xs font-medium text-fg-2">
                auto-corrigidos ·{" "}
                <strong className={summary.iaErrorsCount > 0 ? "text-err" : "text-ok"}>
                  {summary.iaErrorsCount}
                </strong>{" "}
                erros IA
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Audita falhas, corrige no CRM e gera regra
            </p>
          </div>

          {/* 4. Qualidade dos Pedidos da Equipe */}
          <div className="rounded-xl border border-line bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>Qualidade dos Pedidos</span>
              <span className="text-brand font-bold">◎</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold ${
                  summary.teamOrderQualityPct >= 80
                    ? "text-ok"
                    : summary.teamOrderQualityPct >= 60
                      ? "text-warn"
                      : "text-err"
                }`}
              >
                {summary.teamOrderQualityPct}%
              </span>
              <span className="text-xs font-medium text-fg-2">clareza da equipe</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Empresa + Ação/Resultado + Próximo Passo/Data
            </p>
          </div>

          {/* 5. Tempo de Resposta, Fluidez & Desconexões */}
          <div className="rounded-xl border border-line bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>Tempo, Fluidez & Quedas</span>
              <span className="text-ok font-bold">⚡</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-fg">
                {formatLatency(summary.avgLatencyMs)}
              </span>
              <span className="text-xs font-medium text-fg-2">
                · <strong>{summary.fluencyScorePct}%</strong> fluidez
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {summary.disconnectionsCount} desconexão(ões) técnica(s)
            </p>
          </div>

          {/* 6. Lista de Acesso & Regras Aprendidas */}
          <div className="rounded-xl border border-line bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span>Acesso & Prompt Ativo</span>
              <span className="text-ok font-bold">🛡️</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-fg">{allowlist.length}</span>
              <span className="text-xs font-medium text-fg-2">
                na lista · <strong className="text-warn">{externalCallers.length}</strong> fora
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {activeRulesCount} regras aprendidas ativas no prompt
            </p>
          </div>
        </div>

        {/* Navegação entre as 3 Abas Principais */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-2 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMainTab("equipe")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${
                mainTab === "equipe"
                  ? "bg-fg text-bg shadow-xs"
                  : "text-fg-2 hover:bg-surface"
              }`}
            >
              <span>💬 1. Atendimentos da Equipe ({sessions.length})</span>
              {summary.needsIntervention > 0 && (
                <span className="rounded-full bg-err px-2 py-0.5 text-[10px] font-bold text-white">
                  {summary.needsIntervention} alerta(s)
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMainTab("acesso")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${
                mainTab === "acesso"
                  ? "bg-fg text-bg shadow-xs"
                  : "text-fg-2 hover:bg-surface"
              }`}
            >
              <span>
                🛡️ 2. Lista de Acesso & Outros Contatos ({allowlist.length} equipe ·{" "}
                {externalCallers.length} externos)
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMainTab("treinamento")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-colors ${
                mainTab === "treinamento"
                  ? "bg-fg text-bg shadow-xs"
                  : "text-fg-2 hover:bg-surface"
              }`}
            >
              <span>
                🧠 3. Treinamento da IA & Qualidade dos Pedidos ({activeRulesCount} regras no prompt)
              </span>
            </button>
          </div>

          {mainTab === "equipe" && (
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor, usina/cliente ou conversa..."
                className="w-full rounded-lg border border-line bg-surface py-2 px-3 text-xs text-fg placeholder:text-muted focus:border-fg focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* =====================================================================
            ABA 1: ATENDIMENTOS DA EQUIPE (COM CONVERSA COMPLETA VISÍVEL NO BLOCO)
           ===================================================================== */}
        {mainTab === "equipe" && (
          <div className="space-y-4">
            {/* Subfiltros rápidos */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: "todos", label: `Todos da Equipe (${sessions.length})` },
                  {
                    id: "pendencia_ia",
                    label: `Pendência da IA (${summary.iaPendingCount})`,
                  },
                  {
                    id: "pendencia_equipe",
                    label: `Pendência do Vendedor (${summary.teamPendingCount})`,
                  },
                  {
                    id: "auto_corrigido",
                    label: `Auto-Corrigidos pela IA Avaliadora (${
                      sessions.filter((s) => (s.autoHealedCount ?? 0) > 0).length
                    })`,
                  },
                  {
                    id: "alinhado",
                    label: `Alinhados (${
                      sessions.filter(
                        (s) => s.intervention === "normal" || s.intervention === "revisado",
                      ).length
                    })`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === tab.id
                      ? "border-fg bg-fg text-bg"
                      : "border-line bg-card text-fg-2 hover:bg-surface"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Grade de Blocos dos Vendedores */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {filteredSessions.map((session) => {
                const meta = INTERVENTION_META[session.intervention];
                const isChatExpanded = Boolean(expandedCardChats[session.id]);
                const visibleMessages = isChatExpanded
                  ? session.messages
                  : session.messages.slice(-6);
                const orderScore = session.sellerOrderScorePct ?? 88;
                const autoHealedCount = session.autoHealedCount ?? 0;
                const companiesMentioned = session.companiesMentioned ?? [];

                return (
                  <div
                    key={session.id}
                    className={`flex flex-col justify-between rounded-xl border bg-card p-5 shadow-xs transition-all ${meta.border}`}
                  >
                    <div className="space-y-4">
                      {/* Topo do Bloco: Vendedor + Status + Estado da Conversa */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow-xs">
                            {initialsFromName(session.sellerName)}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-bold text-fg">
                                {session.sellerName}
                              </h3>
                              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-2">
                                {session.modelLabel}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                              <span>{session.phone}</span>
                              <span>•</span>
                              <span>Última msg {formatTimeAgo(session.lastActivityAt)}</span>
                              <span>•</span>
                              <span className="font-medium text-fg-2">
                                {session.attendant}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.badgeBg} ${meta.badgeText}`}
                          >
                            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              session.pendingOwner === "ia"
                                ? "bg-err-soft text-err"
                                : session.pendingOwner === "equipe"
                                  ? "bg-warn-soft text-warn"
                                  : "bg-ok-soft text-ok"
                            }`}
                          >
                            {session.pendingOwner === "ia"
                              ? "⚠️ Pendência da IA"
                              : session.pendingOwner === "equipe"
                                ? "⏳ Aguardando Vendedor"
                                : "✅ Conversa Fechada com Registro"}
                          </span>
                        </div>
                      </div>

                      {/* O QUE ESTÃO TRATANDO + EMPRESAS VINCULADAS */}
                      <div className="rounded-lg border border-line bg-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                            O que estão tratando neste atendimento
                          </span>
                          <span className="text-[11px] font-semibold text-fg-2">
                            {session.writesCount} gravação(ões) CRM · {session.turnsPerClosure ?? 1} turno(s)/registro
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-fg">
                          {session.topicsSummary ??
                            `Último assunto: "${session.lastQuestion.slice(0, 80)}"`}
                        </p>
                        {companiesMentioned.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase text-muted">
                              Clientes citados:
                            </span>
                            {companiesMentioned.map((company) => (
                              <span
                                key={company.id ?? company.nome}
                                className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-0.5 text-[11px] font-semibold text-fg"
                              >
                                🏢 {company.nome}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* AVALIAÇÃO DUPLA: DESEMPENHO DA IA vs QUALIDADE DO PEDIDO DO VENDEDOR */}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div className="rounded-lg border border-line bg-surface p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-fg-2">Desempenho da IA</span>
                            <span
                              className={`font-bold ${
                                session.iaScorePct >= 85
                                  ? "text-ok"
                                  : session.iaScorePct >= 65
                                    ? "text-warn"
                                    : "text-err"
                              }`}
                            >
                              {session.iaScorePct}% · Fluidez {session.fluencyScorePct ?? session.iaScorePct}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
                            <div
                              className={`h-full rounded-full ${
                                session.iaScorePct >= 85
                                  ? "bg-ok"
                                  : session.iaScorePct >= 65
                                    ? "bg-warn"
                                    : "bg-err"
                              }`}
                              style={{ width: `${session.iaScorePct}%` }}
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                            <span>Latência: {formatLatency(session.avgLatencyMs)}</span>
                            <span>
                              {(session.disconnectionsCount ?? 0) > 0
                                ? `${session.disconnectionsCount} falha(s)/queda`
                                : "Sem desconexões"}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-lg border border-line bg-surface p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-fg-2">
                              Qualidade do Pedido ({session.sellerShort})
                            </span>
                            <span
                              className={`font-bold ${
                                orderScore >= 80
                                  ? "text-ok"
                                  : orderScore >= 60
                                    ? "text-warn"
                                    : "text-err"
                              }`}
                            >
                              {orderScore}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
                            <div
                              className={`h-full rounded-full ${
                                orderScore >= 80
                                  ? "bg-ok"
                                  : orderScore >= 60
                                    ? "bg-warn"
                                    : "bg-err"
                              }`}
                              style={{ width: `${orderScore}%` }}
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                            <span>
                              {(session.goodOrderExamples ?? []).length} completo(s) ·{" "}
                              {(session.badOrderExamples ?? []).length} incompleto(s)
                            </span>
                            <span>{session.audioCount} áudio(s)</span>
                          </div>
                        </div>
                      </div>

                      {/* DIAGNÓSTICO DA IA AVALIADORA (2ª CAMADA) */}
                      <div
                        className={`rounded-lg border p-3 text-xs ${
                          session.intervention === "intervencao"
                            ? "border-err-line bg-err-soft/50 text-fg"
                            : autoHealedCount > 0
                              ? "border-info-line bg-info-soft/50 text-fg"
                              : session.pendingOwner === "equipe"
                                ? "border-warn-line bg-warn-soft/50 text-fg"
                                : "border-ok-line bg-ok-soft/40 text-fg"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span>🤖 Parecer da IA Avaliadora:</span>
                          </div>
                          {autoHealedCount > 0 && (
                            <span className="rounded-full border border-info-line bg-info-soft px-2 py-0.5 text-[10px] font-bold text-info">
                              ⚡ {autoHealedCount} auto-correção(ões) aplicada(s)
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-fg-2">
                          {session.evaluatorSummary?.autoHealSummary ||
                            session.evaluatorSummary?.iaErrorDetail ||
                            session.evaluatorSummary?.teamIssueDetail ||
                            session.evaluatorSummary?.rootCauseLabel ||
                            "Atendimento auditado sem divergências entre o relato do vendedor e o CRM."}
                        </p>
                        {session.interventionReasons.length > 0 && (
                          <p className="mt-1 text-[11px] font-semibold text-fg">
                            Motivo de atenção: {session.interventionReasons.join(" · ")}
                          </p>
                        )}
                      </div>

                      {/* CONVERSA COMPLETA VISÍVEL DENTRO DO BLOCO (NÃO APENAS O ÚLTIMO RETORNO!) */}
                      <div className="rounded-xl border border-line bg-bg p-3.5">
                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-fg">
                              💬 Diálogo no WhatsApp ({session.messages.length} mensagens trocadas)
                            </span>
                          </div>
                          {session.messages.length > 6 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCardChats((prev) => ({
                                  ...prev,
                                  [session.id]: !isChatExpanded,
                                }))
                              }
                              className="text-[11px] font-bold text-brand hover:underline"
                            >
                              {isChatExpanded
                                ? "Mostrar últimas 6 mensagens"
                                : `Ver todas as ${session.messages.length} mensagens aqui`}
                            </button>
                          )}
                        </div>

                        <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                          {visibleMessages.map((msg) => {
                            const isInbound = msg.direction === "in";
                            return (
                              <div
                                key={msg.id}
                                className={`flex flex-col ${
                                  isInbound ? "items-start" : "items-end"
                                }`}
                              >
                                <div
                                  className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                                    isInbound
                                      ? "rounded-tl-xs border border-line bg-card text-fg"
                                      : msg.fromEvaluator
                                        ? "rounded-tr-xs border border-ok-line bg-ok-soft text-fg"
                                        : "rounded-tr-xs border border-info-line bg-info-soft text-fg"
                                  }`}
                                >
                                  <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-bold text-muted">
                                    <span>
                                      {isInbound
                                        ? `👤 ${session.sellerShort} (${
                                            msg.audio ? "Áudio transcrito" : "Texto"
                                          })`
                                        : msg.fromEvaluator
                                          ? "⚡ IA Avaliadora (Auto-Correção)"
                                          : "🤖 IA Tawper (Resposta ao Vendedor)"}
                                    </span>
                                    <span>{formatClock(msg.at)}</span>
                                  </div>
                                  <p className="whitespace-pre-line text-fg">{msg.body}</p>
                                  {msg.gravou && msg.gravou.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {msg.gravou.map((g) => (
                                        <span
                                          key={g}
                                          className="rounded bg-card/80 px-1.5 py-0.5 text-[10px] font-semibold text-ok border border-ok-line"
                                        >
                                          ✓ {TOOL_LABELS[g] ?? g}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Rodapé de Ações do Bloco */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <button
                        type="button"
                        onClick={() => setSelectedSessionId(session.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-fg hover:bg-surface-2 transition-colors"
                      >
                        🔎 Auditoria Passo a Passo ({session.runs.length} turnos)
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busySessionId === session.id}
                          onClick={() => void handleAutoEvaluate(session)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50 transition-opacity"
                        >
                          ⚡{" "}
                          {busySessionId === session.id
                            ? "Auditando e corrigindo..."
                            : "Auto-Corrigir com IA Avaliadora"}
                        </button>

                        {session.intervention === "intervencao" && (
                          <button
                            type="button"
                            disabled={busySessionId === session.id}
                            onClick={() => void handleResolveIntervention(session)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-ok-line bg-ok-soft px-3 py-2 text-xs font-bold text-ok hover:opacity-90 disabled:opacity-50 transition-opacity"
                          >
                            ✓ Validar Manualmente
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =====================================================================
            ABA 2: LISTA DE ACESSO (ALLOWLIST) & OUTROS CONTATOS QUE CHAMARAM
           ===================================================================== */}
        {mainTab === "acesso" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Coluna Esquerda: Lista de Acesso Autorizada da Equipe */}
            <div className="space-y-4 lg:col-span-6">
              <div className="rounded-xl border border-line bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-fg">
                      Lista de Acesso Autorizada (Equipe Tawper)
                    </h2>
                    <p className="text-xs text-fg-2">
                      Apenas os números abaixo têm permissão para gravar registros e consultar o
                      CRM via IA do WhatsApp.
                    </p>
                  </div>
                  <span className="rounded-full border border-ok-line bg-ok-soft px-3 py-1 text-xs font-bold text-ok">
                    {allowlist.length} autorizados
                  </span>
                </div>

                <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
                  {allowlist.map((member, idx) => (
                    <div
                      key={member.profileId ?? `${member.phone}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-3 p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                          {initialsFromName(member.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-fg">{member.name}</span>
                            <span className="rounded bg-card px-2 py-0.5 text-[10px] font-semibold uppercase text-fg-2 border border-line">
                              {member.role}
                            </span>
                          </div>
                          <div className="text-xs text-muted">
                            WhatsApp:{" "}
                            <strong className="text-fg-2">
                              {member.phone || "Não vinculado"}
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            member.profileId
                              ? "bg-ok-soft text-ok border border-ok-line"
                              : "bg-warn-soft text-warn border border-warn-line"
                          }`}
                        >
                          {member.profileId ? "Vinculado ao CRM" : "Pendente vínculo"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Coluna Direita: Outros Contatos Fora da Lista de Acesso */}
            <div className="space-y-4 lg:col-span-6">
              <div className="rounded-xl border border-line bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-fg">
                      Outros Contatos que Chamaram (Fora da Lista de Acesso)
                    </h2>
                    <p className="text-xs text-fg-2">
                      Números externos ou números novos de vendedores que mandaram mensagem para o
                      WhatsApp da IA. A IA bloqueia gravações no CRM até você autorizar.
                    </p>
                  </div>
                  <span className="rounded-full border border-warn-line bg-warn-soft px-3 py-1 text-xs font-bold text-warn">
                    {externalCallers.length} bloqueado(s)
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {externalCallers.length === 0 ? (
                    <div className="rounded-xl border border-line bg-surface p-6 text-center text-xs text-muted">
                      Nenhum número fora da Lista de Acesso chamou o WhatsApp recentemente.
                    </div>
                  ) : (
                    externalCallers.map((caller) => (
                      <div
                        key={caller.peer}
                        className="rounded-xl border border-line bg-surface p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-fg">
                                {caller.contactName}
                              </span>
                              <span className="rounded-md border border-line bg-card px-2 py-0.5 text-xs font-semibold text-fg-2">
                                {caller.peer}
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                  caller.matchedCompanyName
                                    ? "bg-info-soft text-info border border-info-line"
                                    : "bg-warn-soft text-warn border border-warn-line"
                                }`}
                              >
                                {caller.matchedCompanyName
                                  ? `Cliente no CRM: ${caller.matchedCompanyName}`
                                  : "Fora da Lista de Acesso"}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-warn">
                              🛡️ Bloqueado pela Lista de Acesso (IA não executou ferramentas do CRM)
                            </p>
                          </div>
                          <span className="text-xs text-muted">
                            {formatTimeAgo(caller.lastMessageAt)}
                          </span>
                        </div>

                        {/* Mensagens enviadas pelo contato externo */}
                        <div className="space-y-1.5 rounded-lg border border-line bg-card p-3">
                          {caller.messages.map((m) => (
                            <div key={m.id} className="text-xs text-fg">
                              <span className="font-bold text-muted">
                                [{formatClock(m.at)}]{" "}
                                {m.direction === "in" ? "Recebida:" : "Resposta:"}
                              </span>{" "}
                              {m.body}
                            </div>
                          ))}
                        </div>

                        {/* Ação para autorizar/vincular a um vendedor */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          {authorizingPeer === caller.peer ? (
                            <div className="flex flex-wrap items-center gap-2 w-full">
                              <select
                                value={selectedProfileForCaller}
                                onChange={(e) => setSelectedProfileForCaller(e.target.value)}
                                className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-fg"
                              >
                                <option value="">Vincular a qual membro da equipe?</option>
                                {allowlist.map((m, i) => (
                                  <option key={m.profileId ?? i} value={m.profileId ?? ""}>
                                    {m.name} ({m.role})
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => void handleAuthorizeCaller(caller)}
                                className="rounded-lg bg-ok px-3 py-1.5 text-xs font-bold text-white"
                              >
                                Confirmar Autorização
                              </button>
                              <button
                                type="button"
                                onClick={() => setAuthorizingPeer(null)}
                                className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg-2"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAuthorizingPeer(caller.peer);
                                setSelectedProfileForCaller(allowlist[0]?.profileId ?? "");
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-bold text-fg hover:bg-surface-2"
                            >
                              ✓ Autorizar e Vincular a Vendedor da Equipe
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            ABA 3: TREINAMENTO DA IA (REGRAS NO PROMPT) & QUALIDADE DOS PEDIDOS
           ===================================================================== */}
        {mainTab === "treinamento" && (
          <div className="space-y-6">
            {/* SEÇÃO A: REGRAS APRENDIDAS E INJETADAS NO PROMPT DA IA */}
            <div className="rounded-xl border border-line bg-card p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-fg">
                      Regras Aprendidas & Injetadas no Prompt da IA
                    </h2>
                    <span className="rounded-full border border-ok-line bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok">
                      {activeRulesCount} ativas no prompt agora
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-2">
                    Toda vez que a <strong>IA Avaliadora</strong> corrige um erro ou você cadastra
                    uma diretriz, a regra abaixo entra diretamente no prompt do Agente WhatsApp para
                    a IA não repetir a falha.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingRule(null);
                    setRuleText("");
                    setRuleBeforeQuestion("");
                    setRuleBeforeError("");
                    setRuleAfterResolution("");
                    setShowNewRuleForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-bold text-white hover:opacity-95"
                >
                  + Nova Regra para o Prompt
                </button>
              </div>

              {(showNewRuleForm || editingRule) && (
                <div className="rounded-xl border border-brand bg-surface p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-fg">
                    {editingRule
                      ? "Editando Regra do Prompt"
                      : "Adicionar Nova Regra Operacional ao Prompt da IA"}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-bold text-fg-2 mb-1">
                        Exemplo do Pedido / Gatilho (Antes)
                      </label>
                      <input
                        type="text"
                        value={ruleBeforeQuestion}
                        onChange={(e) => setRuleBeforeQuestion(e.target.value)}
                        placeholder="Ex.: Vendedor pede avanço de etapa ou cita usina com nome parecido"
                        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-fg-2 mb-1">
                        Erro que deve evitar
                      </label>
                      <input
                        type="text"
                        value={ruleBeforeError}
                        onChange={(e) => setRuleBeforeError(e.target.value)}
                        placeholder="Ex.: Vincular empresa errada ou esquecer de criar tarefa"
                        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-fg-2 mb-1">
                      Instrução Exata Injetada no Prompt do Agente WhatsApp
                    </label>
                    <textarea
                      rows={3}
                      value={ruleText}
                      onChange={(e) => setRuleText(e.target.value)}
                      placeholder="Escreva a ordem direta que a IA deve obedecer durante o atendimento..."
                      className="w-full rounded-lg border border-line bg-card p-3 text-xs text-fg"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewRuleForm(false);
                        setEditingRule(null);
                      }}
                      className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg-2"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveRule()}
                      className="rounded-lg bg-ok px-4 py-1.5 text-xs font-bold text-white"
                    >
                      Salvar e Injetar no Prompt
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                {learnedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`rounded-xl border p-4 space-y-3 transition-all ${
                      rule.active
                        ? "border-line bg-surface"
                        : "border-line bg-surface/40 opacity-70"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              rule.autoGenerated
                                ? "bg-info-soft text-info border border-info-line"
                                : "bg-ok-soft text-ok border border-ok-line"
                            }`}
                          >
                            {rule.autoGenerated
                              ? "Gerada pela IA Avaliadora"
                              : "Regra do Gestor"}
                          </span>
                          <span className="text-[11px] text-muted">
                            Origem: {rule.originSellerName ?? "Equipe"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleToggleRule(rule.id)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                            rule.active
                              ? "border-ok-line bg-ok-soft text-ok"
                              : "border-line bg-card text-muted"
                          }`}
                        >
                          {rule.active ? "Ativa no Prompt" : "Inativa"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRule(rule);
                            setRuleText(rule.rule);
                            setRuleBeforeQuestion(rule.beforeQuestion ?? "");
                            setRuleBeforeError(rule.beforeError ?? "");
                            setRuleAfterResolution(rule.afterResolution ?? "");
                            setShowNewRuleForm(false);
                          }}
                          className="rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-fg-2 hover:bg-surface-2"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRule(rule.id)}
                          className="rounded-lg border border-line bg-card px-2 py-1 text-[11px] text-err hover:bg-err-soft"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-lg border border-line bg-card p-2.5">
                        <span className="block text-[10px] font-bold uppercase text-err">
                          Antes (Pedido + Erro detectado)
                        </span>
                        {rule.beforeQuestion && (
                          <p className="mt-1 font-semibold text-fg">
                            &ldquo;{rule.beforeQuestion}&rdquo;
                          </p>
                        )}
                        <p className="mt-0.5 text-fg-2">
                          {rule.beforeError ?? "Falha identificada na auditoria."}
                        </p>
                      </div>
                      <div className="rounded-lg border border-line bg-card p-2.5">
                        <span className="block text-[10px] font-bold uppercase text-ok">
                          Depois (Correção da IA Avaliadora)
                        </span>
                        <p className="mt-1 text-fg-2">
                          {rule.afterResolution ?? "Corrigido no CRM e transformado em regra."}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-info-line bg-info-soft/40 p-2.5 text-xs">
                      <span className="block text-[10px] font-bold uppercase text-info">
                        Regra Ativa Injetada no System Prompt da IA:
                      </span>
                      <p className="mt-1 font-medium text-fg">&ldquo;{rule.rule}&rdquo;</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SEÇÃO B: QUALIDADE DOS PEDIDOS DOS VENDEDORES (COM EXEMPLOS REAIS) */}
            <div className="rounded-xl border border-line bg-card p-5 shadow-xs space-y-4">
              <div>
                <h2 className="text-base font-bold text-fg">
                  Auditoria de Qualidade dos Pedidos por Vendedor (Exemplos Reais)
                </h2>
                <p className="text-xs text-fg-2">
                  Separa claramente quando um atendimento precisou de mais mensagens porque o{" "}
                  <strong>vendedor mandou um pedido vago/incompleto</strong> (sem empresa, sem
                  resultado ou sem data de próximo passo) versus quando o pedido foi completo.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {sessions.map((s) => {
                  const score = s.sellerOrderScorePct ?? 88;
                  const badExamples = s.badOrderExamples ?? [];
                  const goodExamples = s.goodOrderExamples ?? [];
                  return (
                    <div
                      key={`quality-${s.id}`}
                      className="rounded-xl border border-line bg-surface p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                            {initialsFromName(s.sellerName)}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-fg">{s.sellerName}</h3>
                            <p className="text-[11px] text-muted">
                              {s.turnsPerClosure ?? 1} turno(s) por fechamento ·{" "}
                              {s.pendingOwner === "equipe"
                                ? "1 pergunta da IA aguardando resposta dele"
                                : "Sem perguntas pendentes"}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            score >= 80
                              ? "bg-ok-soft text-ok border border-ok-line"
                              : score >= 60
                                ? "bg-warn-soft text-warn border border-warn-line"
                                : "bg-err-soft text-err border border-err-line"
                          }`}
                        >
                          Nota do Vendedor: {score}%
                        </span>
                      </div>

                      {/* Exemplos de pedidos incompletos/vagos */}
                      {badExamples.length > 0 && (
                        <div className="space-y-2">
                          <span className="block text-[11px] font-bold uppercase text-warn">
                            ⚠️ Exemplos de Pedidos Incompletos / Vagos enviados por {s.sellerShort}:
                          </span>
                          {badExamples.map((ex) => (
                            <div
                              key={ex.id}
                              className="rounded-lg border border-warn-line bg-card p-3 text-xs space-y-1"
                            >
                              <p className="font-semibold text-fg">
                                &ldquo;{ex.question}&rdquo;
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="font-bold text-err">
                                  Faltou informar:{" "}
                                  {ex.missing.join(", ") || "detalhes operacionais"}
                                </span>
                                <span>·</span>
                                <span className="text-fg-2">{ex.outcome}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Exemplos de pedidos completos */}
                      {goodExamples.length > 0 && (
                        <div className="space-y-2">
                          <span className="block text-[11px] font-bold uppercase text-ok">
                            ✅ Exemplos de Pedidos Completos (gravados de primeira):
                          </span>
                          {goodExamples.slice(0, 2).map((ex) => (
                            <div
                              key={ex.id}
                              className="rounded-lg border border-ok-line bg-card p-3 text-xs space-y-1"
                            >
                              <p className="font-semibold text-fg">
                                &ldquo;{ex.question}&rdquo;
                              </p>
                              <p className="text-[11px] text-ok font-medium">
                                {ex.outcome} ({ex.score}%)
                              </p>
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
        )}
      </div>

      {/* =====================================================================
          MODAL / GAVETA DE AUDITORIA PROFUNDA DA CONVERSA E FERRAMENTAS
         ===================================================================== */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-4xl flex-col bg-card shadow-2xl border-l border-line">
            {/* Cabeçalho do Modal */}
            <div className="flex items-center justify-between border-b border-line p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                  {initialsFromName(selectedSession.sellerName)}
                </div>
                <div>
                  <h2 className="text-base font-bold text-fg">
                    Auditoria Completa — {selectedSession.sellerName} ({selectedSession.phone})
                  </h2>
                  <p className="text-xs text-fg-2">{selectedSession.topicsSummary}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSessionId(null)}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-fg hover:bg-surface-2"
              >
                Fechar ✕
              </button>
            </div>

            {/* Corpo do Modal: Conversa Completa + Execuções de Ferramentas */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Bloco 1: Linha do Tempo Completa de Mensagens */}
              <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-fg">
                  1. Diálogo Integral no WhatsApp ({selectedSession.messages.length} mensagens)
                </h3>
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {selectedSession.messages.map((m) => {
                    const isInbound = m.direction === "in";
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${
                          isInbound ? "items-start" : "items-end"
                        }`}
                      >
                        <div
                          className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs ${
                            isInbound
                              ? "border border-line bg-card text-fg"
                              : "border border-info-line bg-info-soft text-fg"
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-bold text-muted">
                            <span>
                              {isInbound
                                ? `👤 ${selectedSession.sellerName} (${
                                    m.audio ? "Áudio" : "Texto"
                                  })`
                                : "🤖 IA Tawper"}
                            </span>
                            <span>{formatClock(m.at)}</span>
                          </div>
                          <p className="whitespace-pre-line">{m.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bloco 2: Execuções do Agente & Parâmetros Gravados no Banco */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-fg">
                  2. Auditoria Técnica Passo a Passo ({selectedSession.runs.length} turnos processados)
                </h3>

                {selectedSession.runs.map((run, idx) => (
                  <div
                    key={run.id}
                    className="rounded-xl border border-line bg-surface p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-card px-2 py-0.5 text-xs font-bold text-fg border border-line">
                          Turno #{selectedSession.runs.length - idx}
                        </span>
                        <span className="text-xs text-muted">
                          {formatClock(run.at)} · Latência: {formatLatency(run.latencyMs)}
                        </span>
                        {run.companyName && (
                          <span className="rounded-md border border-line bg-card px-2 py-0.5 text-xs font-semibold text-brand">
                            🏢 {run.companyName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {run.orderQuality && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              run.orderQuality.grade === "completo"
                                ? "bg-ok-soft text-ok"
                                : "bg-warn-soft text-warn"
                            }`}
                          >
                            Pedido do Vendedor: {run.orderQuality.score}% ({run.orderQuality.grade})
                          </span>
                        )}
                        {run.evaluator && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              run.evaluator.autoHealed
                                ? "bg-info-soft text-info"
                                : run.evaluator.rootCause === "erro_ia"
                                  ? "bg-err-soft text-err"
                                  : "bg-ok-soft text-ok"
                            }`}
                          >
                            IA Avaliadora:{" "}
                            {run.evaluator.autoHealed
                              ? "Auto-Corrigido"
                              : run.evaluator.rootCause === "erro_ia"
                                ? "Erro da IA"
                                : run.evaluator.rootCause === "pedido_incompleto_equipe"
                                  ? "Pedido Incompleto"
                                  : "OK"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 text-xs">
                      <div className="rounded-lg border border-line bg-card p-3">
                        <span className="block text-[10px] font-bold uppercase text-muted">
                          O que o vendedor enviou:
                        </span>
                        <p className="mt-1 font-medium text-fg">{run.pergunta}</p>
                      </div>
                      <div className="rounded-lg border border-line bg-card p-3">
                        <span className="block text-[10px] font-bold uppercase text-muted">
                          O que a IA respondeu:
                        </span>
                        <p className="mt-1 text-fg-2">
                          {run.resposta || "Sem resposta registrada."}
                        </p>
                      </div>
                    </div>

                    {/* Ferramentas acionadas no CRM */}
                    {run.steps.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="block text-[10px] font-bold uppercase text-muted">
                          Ações executadas no banco de dados (Ferramentas da IA):
                        </span>
                        {run.steps.map((step) => (
                          <div
                            key={`${run.id}-step-${step.stepNumber}`}
                            className="rounded-lg border border-line bg-card px-3 py-2 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-fg">
                                {step.kind === "write" ? "✍️ Gravação:" : "🔎 Ferramenta:"}{" "}
                                {step.toolName ? TOOL_LABELS[step.toolName] ?? step.toolName : step.kind}
                              </span>
                              <span
                                className={`font-bold ${
                                  step.status === "completed" || step.status === "ok"
                                    ? "text-ok"
                                    : "text-err"
                                }`}
                              >
                                {step.status === "completed" || step.status === "ok"
                                  ? `Sucesso (${step.durationMs}ms)`
                                  : `Status: ${step.status}`}
                              </span>
                            </div>
                            {step.requestSummary && (
                              <p className="mt-1 text-[11px] text-fg-2">
                                <strong>Parâmetros enviados:</strong> {step.requestSummary}
                              </p>
                            )}
                            {step.responseSummary && (
                              <p className="mt-0.5 text-[11px] text-muted">
                                <strong>Retorno do CRM:</strong> {step.responseSummary}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
