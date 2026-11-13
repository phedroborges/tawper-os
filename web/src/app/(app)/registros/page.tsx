"use client";

import { ChevronDown, ClipboardCheck, MessageCircle, Mic, Search } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { CompanyLink, PeriodFilter, UserAvatar } from "@/components/crm/crm";
import { Badge, Card, CardHeader, Empty, Input, LinkButton, PageHeader, Select } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import { fmtDateTime, inPeriod, presetPeriod, type Period } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { ACTION_LABEL, recordResult, sellerActivity, type AgentRecord, type RecordResult } from "@/lib/registros";
import { useCurrentUser, useStore } from "@/lib/store";
import { cn, normalize } from "@/lib/utils";

const RESULT: Record<RecordResult, { label: string; tone: "green" | "outline" | "red" }> = {
  gravado: { label: "gravado", tone: "green" },
  consulta: { label: "só consulta", tone: "outline" },
  erro: { label: "com problema", tone: "red" },
};

/** Registros: auditoria do que cada vendedor informou pelo WhatsApp e do que o sistema gravou com isso. */
export default function RegistrosPage() {
  const user = useCurrentUser();
  const now = useNow();
  const users = useStore((s) => s.users);
  const companies = useStore((s) => s.companies);
  const [records, setRecords] = useState<AgentRecord[] | null>(null);
  const [error, setError] = useState("");
  const [who, setWho] = useState("");
  const [result, setResult] = useState<"" | RecordResult>("");
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
        if (!off) setRecords(data.records ?? []);
      })
      .catch((e: unknown) => !off && setError(e instanceof Error ? e.message : "Falha ao ler os registros."));
    return () => {
      off = true;
    };
  }, [manager]);

  const team = useMemo(() => users.filter((u) => (records ?? []).some((r) => r.userId === u.id) || u.role === "vendedor" || u.role === "representante"), [users, records]);
  const resumo = useMemo(() => sellerActivity(records ?? [], team.map((u) => u.id), now, 7), [records, team, now]);
  const rows = useMemo(() => {
    const n = normalize(q);
    return (records ?? []).filter((r) => {
      if (who && r.userId !== who) return false;
      if (result && recordResult(r) !== result) return false;
      if (!inPeriod(r.at, period)) return false;
      if (!n) return true;
      const company = companies.find((c) => c.id === r.companyId)?.nome ?? "";
      return normalize(`${r.pergunta} ${r.resposta} ${company}`).includes(n);
    });
  }, [records, who, result, period, q, companies]);

  if (!manager) return <Empty icon={<ClipboardCheck size={20} />} title="Área do gestor" text="Os registros mostram o que a equipe informou pelo WhatsApp. Só gestores acessam." />;

  return (
    <div>
      <PageHeader
        title="Registros"
        subtitle="Cada vendedor usa o próprio WhatsApp e informa o sistema por mensagem. Aqui você confere o que foi dito e o que ficou gravado."
        actions={
          <LinkButton href="/conversas" variant="outline">
            <MessageCircle size={15} /> Conversas do número da empresa
          </LinkButton>
        }
      />

      <Card className="mb-5">
        <CardHeader kicker="Últimos 7 dias" title="Quem está reportando" />
        <div className="grid gap-px overflow-hidden border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {resumo.length === 0 && <div className="bg-white px-4 py-5 text-[12.5px] text-muted sm:col-span-2 xl:col-span-4">Ninguém na equipe de vendas ainda.</div>}
          {resumo.map((r) => {
            const u = users.find((x) => x.id === r.userId);
            const parado = r.diasSemRegistrar === undefined || r.diasSemRegistrar >= 3;
            return (
              <button key={r.userId} type="button" onClick={() => setWho(who === r.userId ? "" : r.userId)} className={cn("flex items-center gap-3 bg-white px-4 py-3 text-left hover:bg-soft/50", who === r.userId && "bg-soft")}>
                <UserAvatar userId={r.userId} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">{u?.short ?? "—"}</div>
                  <div className={cn("text-[11.5px]", parado ? "font-medium text-brand" : "text-muted")}>
                    {r.diasSemRegistrar === undefined ? "nunca registrou" : r.diasSemRegistrar === 0 ? "registrou hoje" : `${r.diasSemRegistrar} ${r.diasSemRegistrar === 1 ? "dia" : "dias"} sem registrar`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[20px] leading-none font-semibold text-ink">{r.registros}</div>
                  <div className="text-[10.5px] text-muted">registros{r.erros ? ` · ${r.erros} com problema` : ""}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-auto" aria-label="Vendedor">
          <option value="">Toda a equipe</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>
              {u.short}
            </option>
          ))}
        </Select>
        <Select value={result} onChange={(e) => setResult(e.target.value as "" | RecordResult)} className="w-auto" aria-label="Resultado">
          <option value="">Todos os resultados</option>
          <option value="gravado">Gravou algo</option>
          <option value="consulta">Só consulta</option>
          <option value="erro">Com problema</option>
        </Select>
        <PeriodFilter value={period} onChange={setPeriod} />
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente ou texto da mensagem" className="pl-9" />
        </div>
      </div>

      <Card className="overflow-x-auto">
        {error && <div className="px-4 py-6 text-[13px] text-brand" role="alert">{error}</div>}
        {!error && records === null && <div className="px-4 py-6 text-[13px] text-muted" role="status">Lendo os registros…</div>}
        {!error && records !== null && rows.length === 0 && <Empty icon={<ClipboardCheck size={20} />} title="Nenhum registro neste filtro" text="Quando alguém da equipe falar com o agente pelo WhatsApp, a mensagem aparece aqui." />}
        {rows.length > 0 && (
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11.5px] tracking-wide text-muted uppercase">
                <th className="px-4 py-2.5 font-medium">Quando</th>
                <th className="px-3 py-2.5 font-medium">Quem</th>
                <th className="px-3 py-2.5 font-medium">O que informou</th>
                <th className="px-3 py-2.5 font-medium">O que o sistema gravou</th>
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Resultado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r) => {
                const res = RESULT[recordResult(r)];
                const open = openId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className={cn("cursor-pointer border-b border-line/70 align-top hover:bg-soft/40", open && "bg-soft/40")} onClick={() => setOpenId(open ? null : r.id)}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fmtDateTime(r.at)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <UserAvatar userId={r.userId} size={22} /> {users.find((u) => u.id === r.userId)?.short ?? "—"}
                        </span>
                      </td>
                      <td className="max-w-[340px] px-3 py-2.5 text-ink">
                        <span className={cn(!open && "line-clamp-2")}>
                          {r.audio && <Mic size={12} className="mr-1 inline text-muted" aria-label="áudio" />}
                          {r.pergunta || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.gravou.length === 0 && <span className="text-muted">nada</span>}
                          {r.gravou.map((g, i) => (
                            <Badge key={`${g}-${i}`} tone="navy">
                              {ACTION_LABEL[g] ?? g}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {r.companyId ? <CompanyLink company={companies.find((c) => c.id === r.companyId)} className="text-[13px]" /> : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={res.tone}>{res.label}</Badge>
                      </td>
                      <td className="px-2 py-2.5 text-muted">
                        <ChevronDown size={15} className={cn("transition-transform", open && "rotate-180")} />
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-line/70 bg-soft/40">
                        <td />
                        <td colSpan={6} className="px-3 pt-0 pb-3">
                          <div className="label mb-1">Resposta do agente</div>
                          <p className="max-w-3xl text-[12.5px] whitespace-pre-wrap text-ink/85">{r.resposta || "—"}</p>
                          {r.marcas.length > 0 && <div className="mt-2 text-[11.5px] text-brand">Sinais: {r.marcas.join(", ")}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {rows.length > 200 && <div className="border-t border-line px-4 py-2.5 text-[12px] text-muted">Mostrando os 200 mais recentes de {rows.length}. Use os filtros para afinar.</div>}
      </Card>
      <p className="mt-3 text-[12px] text-muted">
        “Com problema” reúne as mensagens em que o vendedor respondeu que o agente errou ou em que a gravação falhou. Vale abrir e conferir no <Link href="/configuracoes/auditoria" className="font-medium text-navy-3 hover:underline">histórico de alterações</Link>.
      </p>
    </div>
  );
}
