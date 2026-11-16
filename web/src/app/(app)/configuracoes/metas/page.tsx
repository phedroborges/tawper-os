"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { UserAvatar } from "@/components/crm/crm";
import { Button, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import type { ActivityTarget, AwardWeightsConfig, Goals, RecordGoalConfig } from "@/lib/config";
import { ACTIVITY_TYPES, isAdmin } from "@/lib/constants";
import { annualGoalOf, DEFAULT_AWARD_CONFIG, DEFAULT_RECORD_GOAL, periodGoal, salesOf, sellersOf, TARGET_UNIT } from "@/lib/goals";
import { useNow } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { ActivityType } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { useAction } from "@/lib/use-action";
import { money } from "@/lib/utils";

const SUGESTAO: ActivityTarget[] = [
  { tipo: "Ligação", quantidade: 10, por: "dia" },
  { tipo: "Visita", quantidade: 2, por: "mes" },
  { tipo: "Reunião", quantidade: 3, por: "mes" },
];

const reais = (v: string) => Math.max(0, Math.round(Number(v.replace(/\D/g, "")) || 0));

/** Metas (só administrador): meta anual da empresa, divisão por vendedor e metas de atividade. */
export default function MetasConfigPage() {
  const now = useNow();
  const saved = useStore((s) => s.config.goals);
  const users = useStore((s) => s.users);
  const deals = useStore((s) => s.deals);
  const saveConfig = useStore((s) => s.saveConfig);
  const toast = useUI((s) => s.toast);
  const action = useAction();
  const [g, setG] = useState<Goals>(
    saved ?? {
      ano: now.getFullYear(),
      anual: 0,
      porVendedor: {},
      participantes: [],
      atividades: SUGESTAO,
      registros: DEFAULT_RECORD_GOAL,
    },
  );
  const regCfg: RecordGoalConfig = g.registros ?? DEFAULT_RECORD_GOAL;
  const setRegCfg = (patch: Partial<RecordGoalConfig>) => setG({ ...g, registros: { ...regCfg, ...patch } });
  const awardCfg: AwardWeightsConfig = { ...DEFAULT_AWARD_CONFIG, ...(g.premiacao ?? {}) };
  const setAwardCfg = (patch: Partial<AwardWeightsConfig>) => setG({ ...g, premiacao: { ...awardCfg, ...patch } });
  const somaPesos = awardCfg.pesoVendas + awardCfg.pesoAtividades + awardCfg.pesoRegistros + awardCfg.pesoQualidadeIA;
  const sellers = useMemo(() => sellersOf(users, g.participantes), [users, g.participantes]);
  const gestores = useMemo(() => users.filter((u) => u.role === "gestor" || u.role === "admin"), [users]);
  const sales = useMemo(() => salesOf(deals), [deals]);
  const somaVendedores = sellers.reduce((sum, u) => sum + annualGoalOf(g, sellers, u.id), 0);
  const setTarget = (i: number, patch: Partial<ActivityTarget>) => setG({ ...g, atividades: g.atividades.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const save = () =>
    void action.run(async () => {
      await saveConfig("goals", g);
      toast("Metas salvas", { sub: "O painel de metas já mostra os novos números para toda a equipe" });
    });

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Metas"
        subtitle="Informe a meta do ano. O sistema calcula o que precisa ser feito por mês, trimestre e semestre e redistribui sozinho o que não foi vendido."
        actions={
          <Button variant="primary" onClick={save} disabled={action.busy || g.anual <= 0}>
            <Save size={15} /> {action.busy ? "Salvando…" : "Salvar metas"}
          </Button>
        }
      />
      {action.error && <div className="mb-3 rounded-[6px] bg-brand-soft px-3 py-2 text-[12.5px] font-medium text-brand">{action.error}</div>}

      <Card className="mb-5">
        <CardHeader title="Meta da empresa" kicker="Venda total no ano" />
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-[120px_minmax(0,1fr)]">
          <Field label="Ano">
            <Input type="number" min={2024} max={2100} value={g.ano} onChange={(e) => setG({ ...g, ano: Number(e.target.value) || g.ano })} />
          </Field>
          <Field label="Meta anual (R$)" hint="Ex.: 2.400.000" required>
            <Input inputMode="numeric" value={g.anual ? g.anual.toLocaleString("pt-BR") : ""} onChange={(e) => setG({ ...g, anual: reais(e.target.value) })} placeholder="2.400.000" />
          </Field>
        </div>
        {g.anual > 0 && (
          <div className="grid grid-cols-3 gap-2 border-t border-line px-4 py-3 text-center">
            {(["mes", "trimestre", "semestre"] as const).map((p) => (
              <div key={p} className="rounded-[6px] bg-soft/60 px-2 py-2">
                <div className="label">{p === "mes" ? "Este mês" : p === "trimestre" ? "Este trimestre" : "Este semestre"}</div>
                <div className="text-[14px] font-semibold text-ink">{money(periodGoal(g.anual, sales, p, now))}</div>
                <div className="text-[11px] text-muted">já descontado o que foi vendido antes</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {gestores.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Gestores com meta de vendas" kicker="Vendedores e representantes (inclusive administradores) já entram automaticamente. Marque aqui apenas se algum gestor também tiver meta individual." />
          <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-4">
            {gestores.map((u) => (
              <Checkbox
                key={u.id}
                checked={(g.participantes ?? []).includes(u.id)}
                onChange={(on) => setG({ ...g, participantes: on ? [...(g.participantes ?? []), u.id] : (g.participantes ?? []).filter((id) => id !== u.id) })}
                label={u.name}
                sub={u.title}
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader
          title="Meta de cada vendedor"
          kicker={g.anual > 0 ? `Soma: ${money(somaVendedores)} de ${money(g.anual)}` : "Defina a meta da empresa primeiro"}
          action={
            <Button size="xs" variant="outline" onClick={() => setG({ ...g, porVendedor: {} })} title="Apaga os valores digitados: cada vendedor fica com uma parte igual">
              Dividir por igual
            </Button>
          }
        />
        {sellers.length === 0 && <div className="px-4 pb-4 text-[13px] text-muted">Nenhum vendedor ou representante ativo. Cadastre a equipe em Configurações › Equipe.</div>}
        <ul>
          {sellers.map((u) => {
            const anual = annualGoalOf(g, sellers, u.id);
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 border-t border-line/70 px-4 py-2.5">
                <UserAvatar userId={u.id} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">
                    {u.name}
                    {isAdmin(u) && <span className="ml-2 rounded-[4px] bg-navy/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-navy">Admin</span>}
                    {u.title && <span className="ml-2 text-[11.5px] font-normal text-muted">· {u.title}</span>}
                  </div>
                  <div className="text-[11.5px] text-muted">
                    {money(anual / 12)} por mês em média · {money(periodGoal(anual, sales, "mes", now, u.id))} neste mês
                  </div>
                </div>
                <Input
                  inputMode="numeric"
                  className="h-9 w-40 text-right text-[13px]"
                  value={g.porVendedor[u.id] ? g.porVendedor[u.id].toLocaleString("pt-BR") : ""}
                  placeholder={Math.round(anual).toLocaleString("pt-BR")}
                  onChange={(e) => {
                    const v = reais(e.target.value);
                    const next = { ...g.porVendedor };
                    if (v > 0) next[u.id] = v;
                    else delete next[u.id];
                    setG({ ...g, porVendedor: next });
                  }}
                  aria-label={`Meta anual de ${u.name}`}
                />
              </li>
            );
          })}
        </ul>
        {g.anual > 0 && Math.abs(somaVendedores - g.anual) > 1 && sellers.length > 0 && (
          <div className="border-t border-line bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-950">A soma dos vendedores ({money(somaVendedores)}) está diferente da meta da empresa ({money(g.anual)}). Campo vazio recebe uma parte igual do que sobra.</div>
        )}
      </Card>

      <Card className="mb-5">
        <CardHeader title="Meta de registros da equipe" kicker="Constância diária de registros que sustenta a regressão e garante o fechamento da meta" />
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-[140px_180px_minmax(0,1fr)]">
          <Field label="Quantidade padrão">
            <Input
              type="number"
              min={1}
              max={1000}
              value={regCfg.meta}
              onChange={(e) => setRegCfg({ meta: Math.max(1, Math.min(1000, Number(e.target.value) || 1)) })}
            />
          </Field>
          <Field label="Janela base">
            <Select
              value={regCfg.por}
              onChange={(e) => setRegCfg({ por: e.target.value as RecordGoalConfig["por"] })}
            >
              {(Object.keys(TARGET_UNIT) as RecordGoalConfig["por"][]).map((p) => (
                <option key={p} value={p}>
                  {TARGET_UNIT[p]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end pb-1 text-[12px] text-muted">
            O painel calcula automaticamente quantos registros por dia útil cada vendedor precisa fazer para bater a meta do período.
          </div>
        </div>
        {sellers.length > 0 && (
          <ul className="border-t border-line">
            {sellers.map((u) => {
              const individual = regCfg.porVendedor?.[u.id];
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-3 border-t border-line/70 px-4 py-2 first:border-t-0">
                  <UserAvatar userId={u.id} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{u.name}</div>
                    <div className="text-[11px] text-muted">
                      {individual ? `Meta individual: ${individual} ${TARGET_UNIT[regCfg.por]}` : `Usando padrão da equipe: ${regCfg.meta} ${TARGET_UNIT[regCfg.por]}`}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    className="h-8 w-28 text-right text-[13px]"
                    value={individual ?? ""}
                    placeholder={String(regCfg.meta)}
                    onChange={(e) => {
                      const v = Math.max(0, Math.round(Number(e.target.value) || 0));
                      const next = { ...(regCfg.porVendedor ?? {}) };
                      if (v > 0) next[u.id] = v;
                      else delete next[u.id];
                      setRegCfg({ porVendedor: next });
                    }}
                    aria-label={`Meta de registros de ${u.name}`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mb-5">
        <CardHeader title="Metas de atividade" kicker="O que cada vendedor precisa fazer para chegar na venda" />
        <ul>
          {g.atividades.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 border-t border-line/70 px-4 py-2.5">
              <input
                type="number"
                min={1}
                max={500}
                value={t.quantidade}
                onChange={(e) => setTarget(i, { quantidade: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
                className="h-9 w-20 rounded-[6px] border border-line px-2 text-center text-[13px] text-ink"
                aria-label="Quantidade"
              />
              <Select value={t.tipo} onChange={(e) => setTarget(i, { tipo: e.target.value as ActivityType })} className="h-9 w-40 text-[13px]" aria-label="Tipo de atividade">
                {ACTIVITY_TYPES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
              <Select value={t.por} onChange={(e) => setTarget(i, { por: e.target.value as ActivityTarget["por"] })} className="h-9 w-36 text-[13px]" aria-label="Frequência">
                {(Object.keys(TARGET_UNIT) as ActivityTarget["por"][]).map((p) => (
                  <option key={p} value={p}>
                    {TARGET_UNIT[p]}
                  </option>
                ))}
              </Select>
              <button type="button" className="ml-auto text-muted hover:text-brand" aria-label="Remover meta de atividade" onClick={() => setG({ ...g, atividades: g.atividades.filter((_, j) => j !== i) })}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-3">
          <Button size="sm" variant="outline" onClick={() => setG({ ...g, atividades: [...g.atividades, { tipo: "Ligação", quantidade: 5, por: "dia" }] })}>
            <Plus size={14} /> Incluir meta de atividade
          </Button>
          <p className="mt-2 text-[12px] text-muted">Exemplo: 10 ligações por dia, 2 visitas por mês, 3 reuniões por mês. Cada vendedor vê o próprio andamento na tela Metas.</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Premiação multidimensional e qualidade"
          kicker="Como os pontos do vendedor são calculados além da venda (peso ideal = 100%)"
          action={
            <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${somaPesos === 100 ? "bg-ok-soft text-ok" : "bg-amber-100 text-amber-900"}`}>
              Soma dos pesos: {somaPesos}%
            </span>
          }
        />
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Peso · Vendas (%)" hint="Faturamento">
            <Input
              type="number"
              min={0}
              max={100}
              value={awardCfg.pesoVendas}
              onChange={(e) => setAwardCfg({ pesoVendas: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field label="Peso · Atividades (%)" hint="Volume + no prazo">
            <Input
              type="number"
              min={0}
              max={100}
              value={awardCfg.pesoAtividades}
              onChange={(e) => setAwardCfg({ pesoAtividades: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field label="Peso · Registros (%)" hint="Uso ativo no CRM">
            <Input
              type="number"
              min={0}
              max={100}
              value={awardCfg.pesoRegistros}
              onChange={(e) => setAwardCfg({ pesoRegistros: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field label="Peso · WhatsApp & IA (%)" hint="Conversas + clareza">
            <Input
              type="number"
              min={0}
              max={100}
              value={awardCfg.pesoQualidadeIA}
              onChange={(e) => setAwardCfg({ pesoQualidadeIA: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          </Field>
        </div>

        <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-3">
          <Field label="Meta de clareza com a IA (%)" hint="Pedidos bem estruturados">
            <Input
              type="number"
              min={0}
              max={100}
              value={awardCfg.metaQualidadeIA}
              onChange={(e) => setAwardCfg({ metaQualidadeIA: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field label="Meta de registros no WhatsApp" hint="Por mês">
            <Input
              type="number"
              min={1}
              max={500}
              value={awardCfg.metaConversasWhatsApp}
              onChange={(e) => setAwardCfg({ metaConversasWhatsApp: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })}
            />
          </Field>
          <Field label="Pontualidade mínima (%)" hint="Atividades no prazo">
            <Input
              type="number"
              min={0}
              max={100}
              value={awardCfg.metaPontualidade}
              onChange={(e) => setAwardCfg({ metaPontualidade: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          </Field>
        </div>

        <div className="border-t border-line px-4 py-3">
          <Field label="Título / Regra da premiação exibida em Metas">
            <Input
              value={awardCfg.premioDescricao ?? ""}
              onChange={(e) => setAwardCfg({ premioDescricao: e.target.value })}
              placeholder="Ex.: Bônus Integral Tawper — Vendas, Execução, Registros e Qualidade IA"
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
