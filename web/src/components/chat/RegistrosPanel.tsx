"use client";

import {
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  Megaphone,
  Mic,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { CompanyLink, PeriodFilter, UserAvatar } from "@/components/crm/crm";
import { Badge, Button, Card, CardHeader, Empty, Input, Progress, Select } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import { fmtDateTime, inPeriod, presetPeriod, type Period } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import {
  ACTION_LABEL,
  formatRecordMark,
  recordResult,
  sellerActivityInRange,
  type AgentRecord,
} from "@/lib/registros";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, normalize } from "@/lib/utils";

const RESULT_BADGE: Record<"gravado" | "consulta" | "erro", { label: string; tone: "green" | "outline" | "red" }> = {
  gravado: { label: "gravado", tone: "green" },
  consulta: { label: "só consulta", tone: "outline" },
  erro: { label: "com problema", tone: "red" },
};

type QuickFilter = "todos" | "gravado" | "audio" | "comercial" | "consulta" | "erro";

const COMMERCIAL_ACTIONS = new Set([
  "mover_etapa",
  "ganhar_negocio",
  "perder_negocio",
  "criar_cliente",
]);

/** Aba Registros do Atendimento IA: o que cada vendedor informou pelo WhatsApp e o que virou ação no CRM. */
export function RegistrosPanel() {
  const user = useCurrentUser();
  const now = useNow();
  const users = useStore((s) => s.users);
  const companies = useStore((s) => s.companies);
  const openModal = useUI((u) => u.open);

  const [records, setRecords] = useState<AgentRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [error, setError] = useState("");
  const [who, setWho] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");
  const [period, setPeriod] = useState<Period>(() => presetPeriod("30"));
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const manager = isManager(user);

  useEffect(() => {
    if (!manager) return;
    let off = false;
    fetch("/api/registros", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { records?: AgentRecord[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Falha ao ler os registros.");
        if (!off) {
          setRecords(data.records ?? []);
          setError("");
        }
      })
      .catch((e: unknown) => !off && setError(e instanceof Error ? e.message : "Falha ao ler os registros."))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [manager, reloadTick]);

  const handleRefresh = () => {
    setLoading(true);
    setReloadTick((n) => n + 1);
  };

  // Filtra apenas vendedores/representantes (ou quem realmente registrou no período selecionado) para não exibir admins ociosos como "parados".
  const periodRecords = useMemo(
    () => (records ?? []).filter((r) => inPeriod(r.at, period)),
    [records, period],
  );

  const team = useMemo(
    () =>
      users.filter(
        (u) =>
          u.role === "vendedor" ||
          u.role === "representante" ||
          periodRecords.some((r) => r.userId === u.id),
      ),
    [users, periodRecords],
  );

  const resumo = useMemo(
    () => sellerActivityInRange(records ?? [], team.map((u) => u.id), now, (at) => inPeriod(at, period)),
    [records, team, now, period],
  );

  const totalTeamWrites = useMemo(
    () => Math.max(1, resumo.reduce((sum, r) => sum + r.registros, 0)),
    [resumo],
  );

  // Contagens das pílulas de filtro, no período selecionado
  const pulse = useMemo(() => {
    const base = who ? periodRecords.filter((r) => r.userId === who) : periodRecords;
    const total = base.length;
    const gravados = base.filter((r) => recordResult(r) === "gravado");
    const consultas = base.filter((r) => recordResult(r) === "consulta");
    const erros = base.filter((r) => recordResult(r) === "erro");
    const audios = base.filter((r) => r.audio);
    const comerciais = base.filter((r) => r.gravou.some((g) => COMMERCIAL_ACTIONS.has(g)));

    return {
      total,
      gravados: gravados.length,
      consultas: consultas.length,
      erros: erros.length,
      audios: audios.length,
      comerciais: comerciais.length,
    };
  }, [periodRecords, who]);

  const rows = useMemo(() => {
    const n = normalize(q.trim());
    return periodRecords.filter((r) => {
      if (who && r.userId !== who) return false;
      if (quickFilter === "gravado" && recordResult(r) !== "gravado") return false;
      if (quickFilter === "consulta" && recordResult(r) !== "consulta") return false;
      if (quickFilter === "erro" && recordResult(r) !== "erro") return false;
      if (quickFilter === "audio" && !r.audio) return false;
      if (quickFilter === "comercial" && !r.gravou.some((g) => COMMERCIAL_ACTIONS.has(g))) return false;
      if (!n) return true;
      const company = companies.find((c) => c.id === r.companyId)?.nome ?? "";
      const seller = users.find((u) => u.id === r.userId)?.short ?? "";
      const actionsText = r.gravou.map((g) => ACTION_LABEL[g] ?? g).join(" ");
      return normalize(`${r.pergunta} ${r.resposta} ${company} ${seller} ${actionsText}`).includes(n);
    });
  }, [periodRecords, who, quickFilter, q, companies, users]);

  if (!manager) {
    return (
      <Empty
        icon={<ClipboardCheck size={20} />}
        title="Área do gestor"
        text="Os registros mostram o que a equipe informou pelo WhatsApp. Só gestores acessam."
      />
    );
  }

  const hasFilters = Boolean(who || quickFilter !== "todos" || q.trim());

  return (
    <div>
      {/* Quem está reportando (sincronizado com o período + cobrança rápida) */}
      <Card className="mb-4">
        <CardHeader
          kicker="Disciplina de uso do WhatsApp · clique no vendedor para filtrar"
          title="Quem está reportando"
          action={
            <div className="flex shrink-0 items-center gap-3">
              {who && (
                <button type="button" onClick={() => setWho("")} className="text-[12px] font-semibold text-brand hover:underline">
                  Mostrar toda a equipe
                </button>
              )}
              <Button variant="outline" size="xs" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={13} className={cn(loading && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          }
        />
        <div className="grid gap-px overflow-hidden border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {resumo.length === 0 && (
            <div className="bg-white px-4 py-5 text-[12.5px] text-muted sm:col-span-2 xl:col-span-4">
              Ninguém na equipe de vendas ainda.
            </div>
          )}
          {resumo.map((r) => {
            const u = users.find((x) => x.id === r.userId);
            const parado = r.diasSemRegistrar === undefined || r.diasSemRegistrar >= 3;
            const selected = who === r.userId;
            const sharePct = Math.round((r.registros / totalTeamWrites) * 100);
            const sampleCompany = companies.find((c) => c.ownerId === r.userId && (c.status === "ativa" || c.status === "espera"));

            return (
              <div
                key={r.userId}
                role="button"
                tabIndex={0}
                onClick={() => setWho(selected ? "" : r.userId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setWho(selected ? "" : r.userId);
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col justify-between gap-2.5 bg-white px-4 py-3 text-left transition hover:bg-soft/40",
                  selected && "bg-soft/80 ring-1 ring-inset ring-navy/25",
                )}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar userId={r.userId} size={34} />
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-ink">{u?.short ?? "—"}</div>
                      <div className={cn("text-[11.5px]", parado ? "font-semibold text-brand" : "text-ok")}>
                        {r.diasSemRegistrar === undefined
                          ? "nunca registrou"
                          : r.diasSemRegistrar === 0
                            ? "registrou hoje"
                            : `${r.diasSemRegistrar} ${r.diasSemRegistrar === 1 ? "dia" : "dias"} sem registrar`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[20px] font-bold leading-none tabular-nums text-ink">{r.registros}</div>
                    <div className="text-[10.5px] text-muted">gravados</div>
                  </div>
                </div>

                <div>
                  <Progress
                    value={r.registros > 0 ? Math.max(8, sharePct) : 0}
                    tone={parado ? "red" : "green"}
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>
                      {r.audios} áudios · {r.consultas} consultas
                      {r.erros > 0 && <b className="ml-1 text-brand">· {r.erros} erro(s)</b>}
                    </span>
                    {parado && sampleCompany && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal({ kind: "cobranca", companyId: sampleCompany.id });
                        }}
                        className="inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-bold text-brand hover:bg-brand hover:text-white"
                      >
                        <Megaphone size={10} /> Cobrar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Barra de filtros + Pílulas rápidas */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "todos", label: `Todos ${pulse.total}` },
              { id: "gravado", label: `Gravou ${pulse.gravados}` },
              { id: "audio", label: `Áudios ${pulse.audios}` },
              { id: "comercial", label: `Funil/Vendas ${pulse.comerciais}` },
              { id: "consulta", label: `Consultas ${pulse.consultas}` },
              { id: "erro", label: `Com problema ${pulse.erros}` },
            ] as { id: QuickFilter; label: string }[]
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setQuickFilter(pill.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-semibold transition",
                quickFilter === pill.id
                  ? pill.id === "erro"
                    ? "bg-brand text-white"
                    : "bg-navy text-white"
                  : "bg-white border border-line text-navy-3 hover:bg-soft",
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-auto" aria-label="Vendedor">
            <option value="">Toda a equipe</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short}
              </option>
            ))}
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="relative min-w-[220px]">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente, vendedor ou mensagem..."
              className="pl-8"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setWho("");
                setQuickFilter("todos");
                setQ("");
              }}
              className="inline-flex h-10 items-center gap-1 rounded-[6px] px-2 text-[12.5px] text-muted hover:text-ink"
            >
              <X size={14} /> limpar
            </button>
          )}
        </div>
      </div>

      {/* Tabela de auditoria de mensagens */}
      <Card className="overflow-x-auto">
        {error && (
          <div className="px-4 py-6 text-[13px] text-brand" role="alert">
            {error}
          </div>
        )}
        {!error && records === null && (
          <div className="px-4 py-6 text-[13px] text-muted" role="status">
            Lendo os registros…
          </div>
        )}
        {!error && records !== null && rows.length === 0 && (
          <Empty
            icon={<ClipboardCheck size={20} />}
            title="Nenhum registro neste filtro"
            text="Quando alguém da equipe falar com o agente pelo WhatsApp, a mensagem e o que foi gravado aparecem aqui."
          />
        )}
        {rows.length > 0 && (
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] tracking-wide text-muted uppercase">
                <th className="px-4 py-2.5 font-medium">Quando</th>
                <th className="px-3 py-2.5 font-medium">Quem</th>
                <th className="px-3 py-2.5 font-medium">O que informou no WhatsApp</th>
                <th className="px-3 py-2.5 font-medium">O que o sistema gravou</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Resultado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r) => {
                const resType = recordResult(r);
                const res = RESULT_BADGE[resType];
                const isOpen = openId === r.id;
                const company = companies.find((c) => c.id === r.companyId);

                return (
                  <Fragment key={r.id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-b border-line/70 align-top transition-colors hover:bg-soft/40",
                        isOpen && "bg-soft/50",
                      )}
                      onClick={() => setOpenId(isOpen ? null : r.id)}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fmtDateTime(r.at)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2 font-medium text-ink">
                          <UserAvatar userId={r.userId} size={22} /> {users.find((u) => u.id === r.userId)?.short ?? "—"}
                        </span>
                      </td>
                      <td className="max-w-[360px] px-3 py-2.5 text-ink">
                        <span className={cn(!isOpen && "line-clamp-2")}>
                          {r.audio && (
                            <span className="mr-1.5 inline-flex items-center gap-0.5 rounded bg-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-navy-3">
                              <Mic size={11} /> Áudio
                            </span>
                          )}
                          {r.pergunta || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.gravou.length === 0 && <span className="text-muted">nada gravado</span>}
                          {r.gravou.map((g, i) => (
                            <Badge key={`${g}-${i}`} tone={COMMERCIAL_ACTIONS.has(g) ? "green" : "navy"}>
                              {ACTION_LABEL[g] ?? g}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {r.companyId ? <CompanyLink company={company} className="text-[13px]" /> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={res.tone}>{res.label}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-muted">
                        <ChevronDown size={15} className={cn("transition-transform", isOpen && "rotate-180")} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-line/70 bg-soft/30">
                        <td colSpan={7} className="px-4 py-3.5">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-[8px] border border-line bg-white p-3">
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                                  Mensagem enviada ({r.audio ? "Áudio transcrito" : "Texto"})
                                </span>
                                <span className="text-[11px] text-muted">{fmtDateTime(r.at)}</span>
                              </div>
                              <p className="text-[13px] whitespace-pre-wrap text-ink">{r.pergunta || "—"}</p>
                            </div>

                            <div className="rounded-[8px] border border-line bg-white p-3">
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                                  Resposta e execução do Agente IA
                                </span>
                                {company && (
                                  <Link
                                    href={`/empresas/${company.id}`}
                                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-navy-3 hover:text-brand"
                                  >
                                    Abrir {company.nome} <ExternalLink size={11} />
                                  </Link>
                                )}
                              </div>
                              <p className="text-[12.5px] whitespace-pre-wrap text-ink/85">{r.resposta || "—"}</p>
                              {r.marcas.length > 0 && (
                                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line/70 pt-2">
                                  {r.marcas.map((m, idx) => (
                                    <span
                                      key={`${m}-${idx}`}
                                      className="inline-flex items-center gap-1 rounded bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand"
                                    >
                                      <AlertTriangle size={11} /> {formatRecordMark(m)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {rows.length > 200 && (
          <div className="border-t border-line px-4 py-2.5 text-[12px] text-muted">
            Mostrando os 200 mais recentes de {rows.length}. Use os filtros para afinar.
          </div>
        )}
      </Card>
      <p className="mt-3 text-[12px] text-muted">
        “Com problema” reúne as mensagens em que o vendedor respondeu que o agente errou ou em que a gravação falhou. Vale abrir e conferir no{" "}
        <Link href="/configuracoes/auditoria" className="font-medium text-navy-3 hover:underline">
          histórico de alterações
        </Link>
        .
      </p>
    </div>
  );
}
