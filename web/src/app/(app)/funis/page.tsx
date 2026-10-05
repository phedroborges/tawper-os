"use client";

import { AlertTriangle, GitMerge, GripVertical, Pause, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AIBadge } from "@/components/ai/ai";
import { DaysInStage, DueLabel, UserAvatar } from "@/components/crm/crm";
import { Badge, PageHeader, Segmented, Select } from "@/components/ui/primitives";
import { FUNNELS, REGIOES, isManager } from "@/lib/constants";
import { daysSince } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { canSeeCompany, isStagnant, nextStepOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import type { Deal, FunnelId } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, moneyShort } from "@/lib/utils";

function Kanban() {
  const params = useSearchParams();
  const router = useRouter();
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const open = useUI((u) => u.open);
  const [funnel, setFunnel] = useState<FunnelId>((params.get("f") as FunnelId) === "recorrencia" ? "recorrencia" : "aquisicao");
  const [owner, setOwner] = useState("");
  const [regiao, setRegiao] = useState("");
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const stages = FUNNELS[funnel].stages;
  const deals = useMemo(
    () =>
      s.deals.filter((d) => {
        if (d.funnel !== funnel) return false;
        const c = s.companies.find((x) => x.id === d.companyId);
        if (!c || !canSeeCompany(user, c)) return false;
        if (owner && c.ownerId !== owner) return false;
        if (regiao && c.regiao !== regiao) return false;
        if (d.status === "aberta") return c.status === "ativa" || c.status === "espera";
        if (d.status === "ganha") return d.closedAt ? daysSince(d.closedAt, now) <= 45 : false;
        return false;
      }),
    [s.deals, s.companies, funnel, user, owner, regiao, now],
  );

  const risky = (d: Deal) => {
    const next = nextStepOf(s, d.companyId);
    return isStagnant(d, now) || !next || (next && new Date(next.dueAt) < new Date(now.toDateString()));
  };

  const drop = (stageId: string) => {
    const d = s.deals.find((x) => x.id === dragId);
    setDragId(null);
    setOver(null);
    if (!d || d.stageId === stageId || d.status !== "aberta") return;
    const st = stages.find((x) => x.id === stageId)!;
    open(st.terminal ? { kind: "win", dealId: d.id } : { kind: "move", dealId: d.id, toStageId: stageId });
  };

  return (
    <div>
      <PageHeader
        kicker="Kanban · movimentação validada"
        title="Funis comerciais"
        subtitle="Arraste o cartão para mudar de etapa. O sistema valida o que falta e cria a tarefa da etapa seguinte."
        actions={
          <Segmented
            value={funnel}
            onChange={(v) => {
              setFunnel(v);
              router.replace(`/funis?f=${v}`);
            }}
            options={[
              { value: "aquisicao", label: "Aquisição" },
              { value: "recorrencia", label: "Recorrência" },
            ]}
          />
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isManager(user) && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto">
            <option value="">Todos os vendedores</option>
            {s.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short}
              </option>
            ))}
          </Select>
        )}
        <Select value={regiao} onChange={(e) => setRegiao(e.target.value)} className="w-auto">
          <option value="">Todas as regiões</option>
          {REGIOES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setOnlyRisk((v) => !v)}
          className={cn("inline-flex h-10 items-center gap-1.5 rounded-[6px] border px-3 text-[12.5px]", onlyRisk ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:text-ink")}
        >
          <AlertTriangle size={14} /> Só com risco
        </button>
        <span className="ml-auto text-[12px] text-muted">{FUNNELS[funnel].subtitulo}</span>
      </div>

      <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-4 md:-mx-7 md:px-7">
        <div className="flex min-w-max gap-3">
          {stages.map((st) => {
            const col = deals.filter((d) => d.stageId === st.id && (!onlyRisk || (d.status === "aberta" && risky(d))));
            const total = col.reduce((a, d) => a + (d.valorRealizado ?? d.valor ?? 0), 0);
            return (
              <section
                key={st.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(st.id);
                }}
                onDragLeave={() => setOver((o) => (o === st.id ? null : o))}
                onDrop={() => drop(st.id)}
                className={cn(
                  "flex w-[268px] shrink-0 flex-col rounded-[8px] border transition-colors",
                  st.terminal ? "border-line bg-ok-soft/30" : "border-line bg-soft/50",
                  over === st.id && "border-navy-3/40 bg-soft",
                )}
              >
                <header className="border-b border-line/80 px-3 pt-2.5 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                      {st.terminal && <Trophy size={14} className="text-ok" />}
                      {st.nome}
                    </h3>
                    <span className="rounded-full bg-white px-2 text-[11px] leading-5 font-bold text-navy-3">{col.length}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between text-[11px] text-muted">
                    <span>{total ? moneyShort(total) : "—"}</span>
                    <span>{st.terminal ? "últimos 45 dias" : `limite ${st.limiteDias}d`}</span>
                  </div>
                </header>
                <div className="scrollbar-thin flex max-h-[calc(100vh-290px)] min-h-[140px] flex-col gap-2 overflow-y-auto p-2">
                  {col.map((d) => {
                    const c = s.companies.find((x) => x.id === d.companyId)!;
                    const next = nextStepOf(s, d.companyId);
                    const stagnant = d.status === "aberta" && isStagnant(d, now);
                    const overdue = next && new Date(next.dueAt) < new Date(now.toDateString());
                    const sug = s.suggestions.some((x) => x.companyId === c.id && x.status === "pendente");
                    return (
                      <article
                        key={d.id}
                        draggable={d.status === "aberta"}
                        onDragStart={() => setDragId(d.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        className={cn(
                          "group rounded-[8px] border bg-white p-3 transition hover:border-navy-3/30",
                          d.status === "aberta" && "cursor-grab active:cursor-grabbing",
                          stagnant || (!next && c.status === "ativa") ? "border-brand/30" : "border-line",
                          dragId === d.id && "opacity-40",
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical size={14} className="mt-0.5 shrink-0 text-line group-hover:text-muted" />
                          <div className="min-w-0 flex-1">
                            <Link href={`/empresas/${c.id}`} className="block truncate text-[13px] leading-snug font-medium text-ink hover:underline">
                              {c.nome}
                            </Link>
                            <div className="truncate text-[11px] text-muted">
                              {c.cidade}/{c.uf} · {d.titulo}
                            </div>
                          </div>
                          <UserAvatar userId={c.ownerId} size={22} />
                        </div>
                        {d.status === "ganha" ? (
                          <div className="mt-2 flex items-center justify-between text-[12px]">
                            <Badge tone="green">{d.funnel === "aquisicao" ? "1ª venda" : `ciclo ${d.ciclo}`}</Badge>
                            <span className="font-bold text-ok">{moneyShort(d.valorRealizado ?? d.valor)}</span>
                          </div>
                        ) : (
                          <>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <DaysInStage deal={d} />
                              {c.status === "espera" && (
                                <Badge tone="amber">
                                  <Pause size={10} /> espera
                                </Badge>
                              )}
                              {c.influenciadoraId && (
                                <Badge tone="ai">
                                  <GitMerge size={10} /> dependente
                                </Badge>
                              )}
                              {sug && <AIBadge label="sugestão" />}
                              {d.valor ? <span className="ml-auto text-[11.5px] font-semibold text-ink">{moneyShort(d.valor)}</span> : null}
                            </div>
                            <div className={cn("mt-2 rounded-[6px] px-2 py-1.5 text-[11.5px]", overdue ? "bg-brand-soft/60" : "bg-soft/70")}>
                              {c.status === "espera" ? (
                                <span className="text-warn">{c.standby?.motivo}</span>
                              ) : next ? (
                                <>
                                  <div className="truncate font-medium text-ink">{next.titulo}</div>
                                  <DueLabel iso={next.dueAt} className="text-[11px]" />
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-semibold text-brand">
                                  <AlertTriangle size={11} /> Sem próximo passo
                                </span>
                              )}
                            </div>
                          </>
                        )}
                        {d.status === "aberta" && (
                          <button type="button" onClick={() => open({ kind: "move", dealId: d.id })} className="mt-1.5 w-full rounded-[4px] py-1 text-[11px] font-semibold text-navy-3 opacity-100 hover:bg-soft md:opacity-0 md:group-hover:opacity-100">
                            Mover etapa →
                          </button>
                        )}
                      </article>
                    );
                  })}
                  {col.length === 0 && <div className="grid flex-1 place-items-center py-6 text-[11.5px] text-muted/70">{over === st.id ? "Solte aqui" : "Vazio"}</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function FunisPage() {
  return (
    <Suspense>
      <Kanban />
    </Suspense>
  );
}
