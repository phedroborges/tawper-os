"use client";

import { Car, Check, MapPin, Route, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { AIBadge, AIThinking } from "@/components/ai/ai";
import { CompanyLink, StagePill, UserAvatar } from "@/components/crm/crm";
import { Badge, Button, Card, CardHeader, PageHeader, Select } from "@/components/ui/primitives";
import { REGIOES, isManager } from "@/lib/constants";
import { dayDiff, fmtDateShort, longToday } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { alertsOf, daysInStage, lastInteractionAt, openDealOf, stageOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

/** Planejamento de rota (fluxo 7.8): IA prioriza por urgência, potencial, etapa e atraso. */
export default function RotasPage() {
  const s = useStore();
  const user = useCurrentUser();
  const now = useNow();
  const toast = useUI((u) => u.toast);
  const [regiao, setRegiao] = useState(user.regions[0] ?? "Noroeste Paulista");
  const [thinking, setThinking] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);

  const candidates = useMemo(() => {
    const al = alertsOf(s, { now });
    return s.companies
      .filter((c) => c.regiao === regiao && (c.status === "ativa" || c.status === "espera"))
      .filter((c) => isManager(user) || c.ownerId === user.id)
      .map((c) => {
        const deal = openDealOf(s, c.id);
        const last = lastInteractionAt(s, c.id);
        const myAlerts = al.filter((a) => a.companyId === c.id);
        let score = 0;
        const motivos: string[] = [];
        if (c.urgencia === "Alta") { score += 3; motivos.push("urgência alta"); }
        if (c.potencial === "Alto") { score += 2; motivos.push("potencial alto"); }
        if (myAlerts.some((a) => a.tipo === "atraso")) { score += 3; motivos.push("atividade atrasada"); }
        if (myAlerts.some((a) => a.tipo === "estagnacao")) { score += 2; motivos.push("parada na etapa"); }
        if (deal && ["homologacao", "posvenda", "relacionamento", "negociacao"].includes(deal.stageId)) { score += 2; motivos.push(`etapa pede visita (${stageOf(deal).nome})`); }
        if (last && dayDiff(last, now) < -20) { score += 1; motivos.push("sem contato há mais de 20 dias"); }
        return { c, deal, score, motivos };
      })
      .sort((a, b) => b.score - a.score);
  }, [s, regiao, user, now]);

  const route = s.routes.find((r) => r.regiao === regiao && (isManager(user) || r.ownerId === user.id));

  const suggest = () => {
    setThinking(true);
    setTimeout(() => {
      setPicked(candidates.slice(0, 4).map((x) => x.c.id));
      setThinking(false);
    }, 1800);
  };

  const confirm = () => {
    if (!picked?.length) return;
    picked.forEach((id, i) => {
      const x = candidates.find((k) => k.c.id === id)!;
      s.addActivity({
        companyId: id,
        tipo: "Visita",
        titulo: `Visita na rota ${regiao}: ${x.motivos[0] ?? "relacionamento"}`,
        dueAt: new Date(new Date(now).setHours(8 + i * 2, 0, 0, 0) + 2 * 86_400_000).toISOString(),
        prioridade: "Média",
        origem: "ia",
        ownerId: x.c.ownerId,
      });
    });
    toast(`Rota confirmada: ${picked.length} visitas criadas`, { tone: "ai", sub: "Após cada visita, o vendedor registra resultado e próximo passo" });
    setPicked(null);
  };

  return (
    <div>
      <PageHeader
        kicker={`Visitas e rotas · ${longToday(now)}`}
        title="Rotas"
        subtitle="Selecione a região: a IA prioriza as contas que precisam de visita considerando urgência, potencial, etapa e atraso."
        actions={
          <Select value={regiao} onChange={(e) => { setRegiao(e.target.value); setPicked(null); }} className="w-auto min-w-[200px]">
            {REGIOES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card className="min-w-0">
          <CardHeader
            kicker={`${candidates.length} contas na região`}
            title="Contas com visita necessária ou recomendada"
            action={
              <Button size="sm" variant="ai" onClick={suggest} disabled={thinking || candidates.length === 0}>
                <Sparkles size={14} /> Montar rota com IA
              </Button>
            }
          />
          {thinking && <AIThinking steps={["Cruzando urgência, potencial e etapa", "Checando atrasos e último contato", "Ordenando por prioridade e distância"]} className="m-4" />}
          <ul>
            {candidates.map(({ c, deal, score, motivos }) => {
              const on = picked?.includes(c.id);
              return (
                <li key={c.id} className={cn("flex items-start gap-3 border-b border-line/70 px-4 py-3 last:border-b-0", on && "bg-ai-soft/50")}>
                  <button
                    type="button"
                    onClick={() => setPicked((p) => (p ?? []).includes(c.id) ? (p ?? []).filter((x) => x !== c.id) : [...(p ?? []), c.id])}
                    className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-[4px] border-2", on ? "border-ai bg-ai text-white" : "border-line text-transparent")}
                  >
                    <Check size={11} strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CompanyLink company={c} className="text-[13.5px]" />
                      <StagePill deal={deal} />
                      {deal && <span className="text-[11.5px] text-muted">{daysInStage(deal)}d na etapa</span>}
                    </div>
                    <div className="text-[12px] text-muted">
                      <MapPin size={11} className="mr-0.5 inline" />
                      {c.cidade}/{c.uf} · {c.colhedoras ? `${c.colhedoras} colhedoras` : "frota ?"}
                    </div>
                    {motivos.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{motivos.map((m) => <Badge key={m} tone="outline">{m}</Badge>)}</div>}
                  </div>
                  <div className="text-right">
                    <div className="label">prioridade</div>
                    <div className="text-[18px] font-bold text-ink">{score}</div>
                  </div>
                  <UserAvatar userId={c.ownerId} />
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="min-w-0 space-y-5">
          {picked && picked.length > 0 && (
            <Card className="border-ai/30">
              <CardHeader kicker="Rota sugerida" title={`${picked.length} visitas · ${regiao}`} action={<AIBadge label="IA" />} />
              <ol className="px-4 py-3">
                {picked.map((id, i) => {
                  const x = candidates.find((k) => k.c.id === id)!;
                  return (
                    <li key={id} className="flex gap-3 py-1.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ai text-[11px] font-bold text-white">{i + 1}</span>
                      <div className="text-[12.5px]">
                        <div className="font-semibold text-ink">{x.c.nome}</div>
                        <div className="text-muted">
                          {String(8 + i * 2).padStart(2, "0")}:00 · {x.motivos[0] ?? "relacionamento"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="flex items-center justify-between border-t border-line/70 px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                  <Car size={14} /> ~{picked.length * 85} km estimados
                </span>
                <Button size="sm" variant="primary" onClick={confirm}>
                  Confirmar e criar visitas
                </Button>
              </div>
            </Card>
          )}
          {route && (
            <Card>
              <CardHeader kicker={`Rota ${route.status} · ${fmtDateShort(route.data)}`} title={`${route.paradas.length} paradas · ${route.kmEstimado} km`} action={<Route size={16} className="text-muted" />} />
              <ol className="px-4 py-3">
                {route.paradas.map((p, i) => (
                  <li key={p.companyId} className="flex gap-3 py-1.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">{i + 1}</span>
                    <div className="text-[12.5px]">
                      <CompanyLink company={s.companies.find((c) => c.id === p.companyId)} className="text-[12.5px]" />
                      <div className="text-ink/75">{p.objetivo}</div>
                      <div className="text-[11px] text-muted">{p.motivo}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          <Card className="p-4 text-[12.5px] text-ink/75">
            <div className="label mb-1">Integração futura</div>
            Quilometragem real e custo por visita virão do rastreador dos veículos e da fonte financeira (Fase 4), para calcular retorno por rota e por vendedor.
          </Card>
        </div>
      </div>
    </div>
  );
}
