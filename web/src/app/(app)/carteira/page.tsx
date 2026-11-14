"use client";

import { AlertTriangle, ArrowUpDown, LayoutGrid, List, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DaysInStage, DueLabel, StagePill, StatusBadge, UserAvatar, userName, RegionSelect } from "@/components/crm/crm";
import { Badge, Card, Input, LinkButton, PageHeader, Segmented, Select } from "@/components/ui/primitives";
import { FUNNELS, MARCAS, PRENSAS, isManager } from "@/lib/constants";
import { matchesRegionFilter } from "@/lib/regions";
import { dayDiff, fmtAgo } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { alertsOf, currentDealOf, isStagnant, lastInteractionAt, nextStepOf, visibleCompanies, inSupport } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { digitsQueryMatch } from "@/lib/br-ids";
import { cn, normalize } from "@/lib/utils";

function KpiCard({
  label,
  value,
  sub,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  sub: string;
  active?: boolean;
  tone?: "danger" | "warn" | "neutral";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[10px] border p-3.5 text-left transition hover:border-navy-3/40",
        active
          ? "border-navy bg-navy text-white shadow-sm"
          : tone === "danger" && value > 0
          ? "border-brand/30 bg-brand-soft/40 text-ink"
          : "border-line bg-white text-ink"
      )}
    >
      <div className={cn("text-[11.5px] font-medium", active ? "text-white/80" : "text-muted")}>{label}</div>
      <div className={cn("mt-1 text-[26px] font-bold tracking-tight", active ? "text-white" : tone === "danger" && value > 0 ? "text-brand" : "text-ink")}>
        {value}
      </div>
      <div className={cn("mt-0.5 truncate text-[11px]", active ? "text-white/70" : "text-muted")}>{sub}</div>
    </button>
  );
}

export default function CarteiraPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const router = useRouter();
  const { open } = useUI();
  const manager = isManager(user);
  const [view, setView] = useState<"tabela" | "cartoes">("tabela");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [regiao, setRegiao] = useState("");
  const [funil, setFunil] = useState("");
  const [etapa, setEtapa] = useState("");
  const [status, setStatus] = useState("ativas");
  const [marca, setMarca] = useState("");
  const [prensa, setPrensa] = useState("");
  const [risco, setRisco] = useState(false);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [sortField, setSortField] = useState<"risco" | "nome" | "etapa" | "proximo" | "interacao">("risco");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const alerts = useMemo(() => alertsOf(s, { now }), [s, now]);
  const riskIds = useMemo(() => new Set(alerts.filter((a) => a.tipo === "atraso" || a.tipo === "estagnacao" || a.tipo === "sem_proximo_passo" || a.tipo === "recorrencia").map((a) => a.companyId)), [alerts]);

  const allVisible = useMemo(() => visibleCompanies(s, user), [s, user]);
  const countTotal = allVisible.length;
  const countRisco = useMemo(() => allVisible.filter((c) => riskIds.has(c.id)).length, [allVisible, riskIds]);
  const countSemProximo = useMemo(() => allVisible.filter((c) => c.status === "ativa" && !nextStepOf(s, c.id)).length, [allVisible, s]);
  const countEspera = useMemo(() => allVisible.filter((c) => c.status === "espera").length, [allVisible]);

  const rows = useMemo(() => {
    const n = normalize(q);
    return allVisible
      .map((c) => ({
        c,
        deal: currentDealOf(s, c.id),
        next: nextStepOf(s, c.id),
        last: lastInteractionAt(s, c.id),
      }))
      .filter(({ c, deal, next }) => {
        if (status === "so_ativas" && c.status !== "ativa") return false;
        if (status === "sem_proximo" && (c.status !== "ativa" || next)) return false;
        if (status === "ativas" && !(c.status === "ativa" || c.status === "espera")) return false;
        if (status === "espera" && c.status !== "espera") return false;
        if (status === "perdidas" && c.status !== "perdida") return false;
        if (owner && c.ownerId !== owner) return false;
        if (!matchesRegionFilter(regiao, c.uf)) return false;
        if (funil && deal?.funnel !== funil) return false;
        if (etapa && deal?.stageId !== etapa) return false;
        if (marca && c.marcaAtual !== marca) return false;
        if (prensa && c.prensa !== prensa) return false;
        if (risco && !riskIds.has(c.id)) return false;
        if (n) {
          const haystack = normalize(
            `${c.nome} ${c.razaoSocial ?? ""} ${c.cidade ?? ""} ${c.uf ?? ""} ${c.codigo ?? ""} ${c.cnpj ?? ""} ${c.ramo ?? ""}`
          );
          const hasText = haystack.includes(n);
          const hasDigits = digitsQueryMatch(q, c.cnpj, ...s.contacts.filter((ct) => ct.companyId === c.id).map((ct) => ct.whatsapp));
          const hasContact = s.contacts.some((ct) => ct.companyId === c.id && normalize(ct.nome).includes(n));
          if (!hasText && !hasDigits && !hasContact) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1;
        if (sortField === "nome") {
          return mul * a.c.nome.localeCompare(b.c.nome, "pt-BR");
        }
        if (sortField === "etapa") {
          const sa = a.deal?.stageId ?? "";
          const sb = b.deal?.stageId ?? "";
          return mul * sa.localeCompare(sb);
        }
        if (sortField === "interacao") {
          const ta = a.last ? new Date(a.last).getTime() : 0;
          const tb = b.last ? new Date(b.last).getTime() : 0;
          return mul * (ta - tb);
        }
        if (sortField === "proximo") {
          const da = a.next?.dueAt ?? "9999";
          const db = b.next?.dueAt ?? "9999";
          return mul * da.localeCompare(db);
        }
        const ra = riskIds.has(a.c.id) ? 0 : 1;
        const rb = riskIds.has(b.c.id) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return (a.next?.dueAt ?? "9").localeCompare(b.next?.dueAt ?? "9");
      });
  }, [allVisible, s, q, owner, regiao, funil, etapa, status, marca, prensa, risco, riskIds, sortField, sortDir]);

  const stages = funil ? FUNNELS[funil as "aquisicao"].stages : [...FUNNELS.aquisicao.stages, ...FUNNELS.recorrencia.stages];
  const limpar = () => {
    setQ("");
    setOwner("");
    setRegiao("");
    setFunil("");
    setEtapa("");
    setMarca("");
    setPrensa("");
    setRisco(false);
    setStatus("ativas");
    setSortField("risco");
    setSortDir("asc");
  };
  const hasFilters = q || owner || regiao || funil || etapa || marca || prensa || risco || status !== "ativas" || sortField !== "risco";

  return (
    <div>
      <PageHeader
        kicker={manager ? "Carteira completa" : "Minha carteira"}
        title="Carteira"
        subtitle={`${rows.length} de ${countTotal} contas · clique nas colunas para ordenar`}
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "tabela", label: <span className="inline-flex items-center gap-1.5"><List size={14} /> Tabela</span> },
                { value: "cartoes", label: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={14} /> Cartões</span> },
              ]}
            />
            <LinkButton href="/empresas/nova" variant="primary">
              <Plus size={16} /> Nova empresa
            </LinkButton>
          </>
        }
      />

      {/* Cards de métricas rápidas e filtros da carteira */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total da carteira"
          value={countTotal}
          sub="todas as contas sob gestão"
          active={status === "todas" && !risco}
          onClick={() => {
            setStatus("todas");
            setRisco(false);
          }}
        />
        <KpiCard
          label="Contas com risco"
          value={countRisco}
          sub="atrasadas ou estagnadas"
          tone="danger"
          active={risco}
          onClick={() => {
            setRisco(!risco);
            if (status === "todas" || status === "perdidas") setStatus("ativas");
          }}
        />
        <KpiCard
          label="Sem próximo passo"
          value={countSemProximo}
          sub="precisam de atividade urgente"
          tone="danger"
          active={status === "sem_proximo"}
          onClick={() => {
            setStatus(status === "sem_proximo" ? "ativas" : "sem_proximo");
            setRisco(false);
          }}
        />
        <KpiCard
          label="Em espera"
          value={countEspera}
          sub="negociações pausadas"
          tone="warn"
          active={status === "espera"}
          onClick={() => {
            setStatus(status === "espera" ? "ativas" : "espera");
            setRisco(false);
          }}
        />
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, cidade, UF, código ou contato" className="pl-9" />
          </div>
          {manager && (
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto min-w-[140px]">
              <option value="">Todos os responsáveis</option>
              {s.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.short}
                </option>
              ))}
            </Select>
          )}
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
            <option value="ativas">Ativas e em espera</option>
            <option value="so_ativas">Só ativas</option>
            <option value="sem_proximo">Sem próximo passo</option>
            <option value="espera">Só em espera</option>
            <option value="perdidas">Perdidas</option>
            <option value="todas">Todas</option>
          </Select>
          <button
            type="button"
            onClick={() => setRisco((v) => !v)}
            className={cn("inline-flex h-10 items-center gap-1.5 rounded-[6px] border px-3 text-[12.5px] transition", risco ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:text-ink")}
          >
            <AlertTriangle size={14} /> Só com risco
          </button>
          <button type="button" onClick={() => setMaisFiltros((v) => !v)} className="inline-flex h-10 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] text-muted hover:text-ink">
            <SlidersHorizontal size={14} /> {maisFiltros ? "menos filtros" : "mais filtros"}
          </button>
          {hasFilters && (
            <button type="button" onClick={limpar} className="inline-flex h-10 items-center gap-1 px-2 text-[12.5px] text-muted hover:text-ink">
              <X size={14} /> limpar
            </button>
          )}
        </div>
        {maisFiltros && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <RegionSelect value={regiao} onChange={setRegiao} ufs={s.companies.map((c) => c.uf)} />
          <Select value={funil} onChange={(e) => { setFunil(e.target.value); setEtapa(""); }} className="w-auto">
            <option value="">Os dois funis</option>
            <option value="aquisicao">Aquisição</option>
            <option value="recorrencia">Recorrência</option>
          </Select>
          <Select value={etapa} onChange={(e) => setEtapa(e.target.value)} className="w-auto">
            <option value="">Todas as etapas</option>
            {stages.filter((st) => !st.terminal).map((st) => (
              <option key={`${st.funnel}-${st.id}`} value={st.id}>
                {st.nome}
              </option>
            ))}
          </Select>
          <Select value={marca} onChange={(e) => setMarca(e.target.value)} className="w-auto">
            <option value="">Todas as marcas</option>
            {MARCAS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <Select value={prensa} onChange={(e) => setPrensa(e.target.value)} className="w-auto">
            <option value="">Qualquer prensa</option>
            {PRENSAS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </div>
        )}
      </Card>

      {view === "tabela" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-soft/40 text-left select-none">
                  <th className="label px-4 py-2.5 cursor-pointer hover:text-ink" onClick={() => toggleSort("nome")}>
                    <span className="inline-flex items-center gap-1">Empresa {sortField === "nome" ? (sortDir === "asc" ? "↑" : "↓") : <ArrowUpDown size={11} className="text-muted/60" />}</span>
                  </th>
                  <th className="label px-4 py-2.5">Responsável</th>
                  <th className="label px-4 py-2.5 cursor-pointer hover:text-ink" onClick={() => toggleSort("etapa")}>
                    <span className="inline-flex items-center gap-1">Etapa {sortField === "etapa" ? (sortDir === "asc" ? "↑" : "↓") : <ArrowUpDown size={11} className="text-muted/60" />}</span>
                  </th>
                  <th className="label px-4 py-2.5 cursor-pointer hover:text-ink" onClick={() => toggleSort("proximo")}>
                    <span className="inline-flex items-center gap-1">Próximo passo {sortField === "proximo" ? (sortDir === "asc" ? "↑" : "↓") : <ArrowUpDown size={11} className="text-muted/60" />}</span>
                  </th>
                  <th className="label px-4 py-2.5 cursor-pointer hover:text-ink" onClick={() => toggleSort("interacao")}>
                    <span className="inline-flex items-center gap-1">Última interação {sortField === "interacao" ? (sortDir === "asc" ? "↑" : "↓") : <ArrowUpDown size={11} className="text-muted/60" />}</span>
                  </th>
                  <th className="label px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, deal, next, last }) => {
                  const risk = riskIds.has(c.id);
                  const daysAgo = last ? dayDiff(last, now) : null;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/empresas/${c.id}`)}
                      className={cn(
                        "cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-soft/40 transition",
                        risk && "bg-brand-soft/20 hover:bg-brand-soft/35"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/empresas/${c.id}`} className="text-[13.5px] font-semibold text-ink hover:text-brand" onClick={(e) => e.stopPropagation()}>
                            {c.nome}
                          </Link>
                          {risk && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-brand">
                              <AlertTriangle size={11} /> risco
                            </span>
                          )}
                          {c.status !== "ativa" && <StatusBadge c={c} />}
                          {inSupport(s, c.id) && <Badge tone="amber">em suporte</Badge>}
                          {c.importadoDe && <Badge tone="outline">{c.importadoDe}</Badge>}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-muted">
                          {c.cidade ? `${c.cidade}/${c.uf}` : "cidade não informada"}
                          {c.potencial ? ` · potencial ${c.potencial.toLowerCase()}` : ""}
                          {c.colhedoras ? ` · ${c.colhedoras} colhedoras` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <UserAvatar userId={c.ownerId} size={24} />
                          {userName(s.users, c.ownerId)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StagePill deal={deal} />
                        {deal?.status === "aberta" && (
                          <div className="mt-1">
                            <DaysInStage deal={deal} />
                          </div>
                        )}
                      </td>
                      <td className="min-w-[220px] px-4 py-3">
                        {c.status === "espera" ? (
                          <span className="text-[12px] text-warn">Em espera · {c.standby?.motivo ?? "pausada"}</span>
                        ) : next ? (
                          <>
                            <div className="truncate font-medium text-ink">{next.titulo}</div>
                            <DueLabel iso={next.dueAt} />
                          </>
                        ) : c.status === "ativa" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              open({ kind: "newActivity", companyId: c.id });
                            }}
                            className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                            title="Agendar próximo passo"
                          >
                            <AlertTriangle size={13} /> Sem próximo passo
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12.5px]">
                        {last ? (
                          daysAgo !== null && daysAgo < -15 ? (
                            <span className="rounded bg-brand-soft px-1.5 py-0.5 font-medium text-brand" title={`Sem contato há mais de 15 dias`}>
                              {fmtAgo(last, now)}
                            </span>
                          ) : daysAgo !== null && daysAgo < -8 ? (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900" title={`Sem contato há mais de 8 dias`}>
                              {fmtAgo(last, now)}
                            </span>
                          ) : (
                            <span className="text-muted">{fmtAgo(last, now)}</span>
                          )
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => open({ kind: "quick", companyId: c.id })}
                            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-navy/20 bg-navy/5 px-2.5 text-[12px] font-medium text-navy transition hover:border-navy hover:bg-navy hover:text-white"
                            title={`Registrar atividade com ${c.nome}`}
                          >
                            <Sparkles size={13} />
                            <span>Registrar atividade</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="px-4 py-12 text-center text-[13px] text-muted">Nenhuma conta com esses filtros.</div>}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ c, deal, next, last }) => (
            <Link
              key={c.id}
              href={`/empresas/${c.id}`}
              className={cn(
                "rounded-[6px] border bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop",
                riskIds.has(c.id) ? "border-brand/40 bg-brand-soft/10" : "border-line"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-ink">{c.nome}</span>
                    {riskIds.has(c.id) && (
                      <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        risco
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-muted">
                    {c.cidade}/{c.uf} · {c.colhedoras ? `${c.colhedoras} colhedoras` : "frota ?"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <UserAvatar userId={c.ownerId} />
                  <span className="text-[12px] text-ink/80 font-medium hidden sm:inline">{userName(s.users, c.ownerId)}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StagePill deal={deal} />
                {deal?.status === "aberta" && <DaysInStage deal={deal} />}
                {deal && isStagnant(deal, now) && <Badge tone="red">parada</Badge>}
                {c.status !== "ativa" && <StatusBadge c={c} />}
              </div>
              <div className="mt-3 min-h-[38px] rounded-[5px] bg-soft/40 px-2.5 py-2 text-[12px]">
                {next ? (
                  <>
                    <div className="truncate font-medium text-ink">{next.titulo}</div>
                    <DueLabel iso={next.dueAt} />
                  </>
                ) : c.status === "espera" ? (
                  <span className="text-warn">Em espera · {c.standby?.motivo ?? "pausada"}</span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      open({ kind: "newActivity", companyId: c.id });
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                    title="Agendar próximo passo"
                  >
                    <AlertTriangle size={12} /> Sem próximo passo
                  </button>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-2.5 text-[12px] text-muted">
                <span>{last ? `Contato: ${fmtAgo(last, now)}` : "Sem contato"}</span>
                <div className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                  <button
                    type="button"
                    onClick={() => open({ kind: "quick", companyId: c.id })}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[5px] border border-navy/20 bg-navy/5 px-2.5 text-[11.5px] font-medium text-navy hover:border-navy hover:bg-navy hover:text-white"
                    title={`Registrar atividade com ${c.nome}`}
                  >
                    <Sparkles size={12} /> Registrar atividade
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
