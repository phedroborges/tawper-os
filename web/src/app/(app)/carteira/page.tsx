"use client";

import { AlertTriangle, LayoutGrid, List, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DaysInStage, DueLabel, QualityMeter, StagePill, StatusBadge, UserAvatar, userName } from "@/components/crm/crm";
import { Badge, Card, Input, LinkButton, PageHeader, Segmented, Select } from "@/components/ui/primitives";
import { FUNNELS, MARCAS, PRENSAS, REGIOES, isManager } from "@/lib/constants";
import { fmtAgo } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { alertsOf, currentDealOf, isStagnant, lastInteractionAt, nextStepOf, qualityOf, visibleCompanies } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { cn, normalize } from "@/lib/utils";

export default function CarteiraPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const router = useRouter();
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

  const alerts = useMemo(() => alertsOf(s, { now }), [s, now]);
  const riskIds = useMemo(() => new Set(alerts.filter((a) => a.tipo === "atraso" || a.tipo === "estagnacao" || a.tipo === "sem_proximo_passo" || a.tipo === "recorrencia").map((a) => a.companyId)), [alerts]);

  const rows = useMemo(() => {
    const n = normalize(q);
    return visibleCompanies(s, user)
      .map((c) => ({ c, deal: currentDealOf(s, c.id), next: nextStepOf(s, c.id), quality: qualityOf(s, c), last: lastInteractionAt(s, c.id) }))
      .filter(({ c, deal }) => {
        if (status === "ativas" && !(c.status === "ativa" || c.status === "espera")) return false;
        if (status === "espera" && c.status !== "espera") return false;
        if (status === "perdidas" && c.status !== "perdida") return false;
        if (owner && c.ownerId !== owner) return false;
        if (regiao && c.regiao !== regiao) return false;
        if (funil && deal?.funnel !== funil) return false;
        if (etapa && deal?.stageId !== etapa) return false;
        if (marca && c.marcaAtual !== marca) return false;
        if (prensa && c.prensa !== prensa) return false;
        if (risco && !riskIds.has(c.id)) return false;
        if (n && !normalize(`${c.nome} ${c.razaoSocial} ${c.cidade ?? ""} ${c.codigo}`).includes(n) && !s.contacts.some((ct) => ct.companyId === c.id && normalize(ct.nome).includes(n))) return false;
        return true;
      })
      .sort((a, b) => {
        const ra = riskIds.has(a.c.id) ? 0 : 1;
        const rb = riskIds.has(b.c.id) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return (a.next?.dueAt ?? "9").localeCompare(b.next?.dueAt ?? "9");
      });
  }, [s, user, q, owner, regiao, funil, etapa, status, marca, prensa, risco, riskIds]);

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
  };
  const hasFilters = q || owner || regiao || funil || etapa || marca || prensa || risco || status !== "ativas";

  return (
    <div>
      <PageHeader
        kicker={manager ? "Carteira completa" : "Minha carteira"}
        title="Carteira"
        subtitle={`${rows.length} contas · ordenadas por risco e próximo vencimento`}
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

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, cidade, código ou contato" className="pl-9" />
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
            <option value="espera">Só em espera</option>
            <option value="perdidas">Perdidas</option>
            <option value="todas">Todas</option>
          </Select>
          <button
            type="button"
            onClick={() => setRisco((v) => !v)}
            className={cn("inline-flex h-10 items-center gap-1.5 rounded-[6px] border px-3 text-[12.5px]", risco ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:text-ink")}
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
          <Select value={regiao} onChange={(e) => setRegiao(e.target.value)} className="w-auto">
            <option value="">Todas as regiões</option>
            {REGIOES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
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
                <tr className="border-b border-line bg-soft/40 text-left">
                  {["Empresa", "Responsável", "Etapa", "Próximo passo", "Última interação", "Cadastro"].map((h) => (
                    <th key={h} className="label px-4 py-2.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, deal, next, quality, last }) => {
                  const risk = riskIds.has(c.id);
                  return (
                    <tr key={c.id} onClick={() => router.push(`/empresas/${c.id}`)} className="cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-soft/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {risk && <span className="size-2 shrink-0 rounded-full bg-brand" title="Conta com risco" />}
                          <Link href={`/empresas/${c.id}`} className="text-[13.5px] font-semibold text-ink hover:text-brand" onClick={(e) => e.stopPropagation()}>
                            {c.nome}
                          </Link>
                          {c.status !== "ativa" && <StatusBadge c={c} />}
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
                      <td className="max-w-[280px] px-4 py-3">
                        {c.status === "espera" ? (
                          <span className="text-[12px] text-warn">Em espera · {c.standby?.motivo}</span>
                        ) : next ? (
                          <>
                            <div className="truncate font-medium text-ink">{next.titulo}</div>
                            <DueLabel iso={next.dueAt} />
                          </>
                        ) : c.status === "ativa" ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-brand">
                            <AlertTriangle size={13} /> Sem próximo passo
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{last ? fmtAgo(last, now) : "—"}</td>
                      <td className="w-36 px-4 py-3">
                        <QualityMeter score={quality.score} missing={quality.missing} hideLabel />
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
          {rows.map(({ c, deal, next, quality }) => (
            <Link key={c.id} href={`/empresas/${c.id}`} className={cn("rounded-[6px] border bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop", riskIds.has(c.id) ? "border-brand/35" : "border-line")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ink">{c.nome}</div>
                  <div className="text-[11.5px] text-muted">
                    {c.cidade}/{c.uf} · {c.colhedoras ? `${c.colhedoras} colhedoras` : "frota ?"}
                  </div>
                </div>
                <UserAvatar userId={c.ownerId} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StagePill deal={deal} />
                {deal?.status === "aberta" && <DaysInStage deal={deal} />}
                {deal && isStagnant(deal, now) && <Badge tone="red">parada</Badge>}
              </div>
              <div className="mt-3 min-h-[38px] rounded-[5px] bg-soft/40 px-2.5 py-2 text-[12px]">
                {next ? (
                  <>
                    <div className="truncate font-medium text-ink">{next.titulo}</div>
                    <DueLabel iso={next.dueAt} />
                  </>
                ) : c.status === "espera" ? (
                  <span className="text-warn">Em espera · reavaliação agendada</span>
                ) : (
                  <span className="font-semibold text-brand">Sem próximo passo</span>
                )}
              </div>
              <div className="mt-3">
                <QualityMeter score={quality.score} missing={quality.missing} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
