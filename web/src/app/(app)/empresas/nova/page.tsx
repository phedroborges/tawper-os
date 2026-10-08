"use client";

import { AlertTriangle, ArrowLeft, Check, GitMerge, MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AIBadge, AIPanel, AIThinking } from "@/components/ai/ai";
import { StagePill } from "@/components/crm/crm";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { extractLead } from "@/lib/ai";
import { ACTIVITY_TYPES, MARCAS, ORIGENS, PAPEIS, PRENSAS, RAMOS, REGIOES, UFS } from "@/lib/constants";
import { fmtDate, fromInputDate, rel, toInputDate } from "@/lib/dates";
import { currentDealOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import type { ActivityType, Company, Papel, Prensa, Prioridade, Urgencia } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, digits, nameSimilarity, normalize } from "@/lib/utils";

const CITY_REGION: Record<string, string> = {
  "pereira barreto": "Noroeste Paulista",
  "monte aprazivel": "Noroeste Paulista",
  "sao jose do rio preto": "Noroeste Paulista",
  catanduva: "Noroeste Paulista",
  votuporanga: "Noroeste Paulista",
  olimpia: "Norte Paulista",
  bebedouro: "Norte Paulista",
  assis: "Paranapanema",
  ourinhos: "Paranapanema",
  frutal: "Triângulo Mineiro",
  uberaba: "Triângulo Mineiro",
};

function NovaEmpresa() {
  const params = useSearchParams();
  const convId = params.get("conv") ?? undefined;
  const s = useStore();
  const user = useCurrentUser();
  const router = useRouter();
  const toast = useUI((u) => u.toast);
  const conv = s.conversations.find((c) => c.id === convId);
  const lead = useMemo(() => (conv ? extractLead(conv) : undefined), [conv]);

  const [reading, setReading] = useState(Boolean(lead));
  const [filled, setFilled] = useState(false);
  const [f, setF] = useState({
    nome: "", razaoSocial: "", cnpj: "", cidade: "", uf: "SP", regiao: "", ramo: "", origem: "Visita de prospecção", ownerId: user.id,
    urgencia: "Média" as Urgencia, colhedoras: "", prensa: "" as Prensa | "", marcaAtual: "", observacoes: "",
  });
  const [ct, setCt] = useState({ nome: "", cargo: "", papel: "Comprador" as Papel, whatsapp: "", email: "" });
  const [next, setNext] = useState({ titulo: "Qualificar: frota, prensa e fornecedor atual", tipo: "WhatsApp" as ActivityType, due: toInputDate(rel(0)), prioridade: "Alta" as Prioridade });
  const [decision, setDecision] = useState<{ kind: "merge"; id: string } | { kind: "new" } | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!lead || !conv || filled) return;
    const t = setTimeout(() => {
      const cityKey = normalize(lead.cidade);
      setF((x) => ({
        ...x,
        nome: lead.empresa,
        cidade: lead.cidade,
        uf: lead.uf,
        regiao: CITY_REGION[cityKey] ?? "",
        ramo: /usina/i.test(lead.empresa) ? "Usina sucroenergética" : x.ramo,
        origem: lead.origem,
        ownerId: conv.ownerId,
        urgencia: lead.dor ? "Alta" : "Média",
        observacoes: [lead.indicacao && `Indicação: ${lead.indicacao}.`, lead.dor && `Dor relatada: ${lead.dor.toLowerCase()}.`, `Interesse: ${lead.interesse}.`].filter(Boolean).join(" "),
      }));
      setCt((x) => ({ ...x, nome: lead.contatoNome, cargo: lead.cargo, papel: lead.papel, whatsapp: conv.telefone }));
      setNext((x) => ({ ...x, titulo: `Responder ${lead.contatoNome} e qualificar frota, prensa e fornecedor`, tipo: "WhatsApp" }));
      setReading(false);
      setFilled(true);
    }, 1900);
    return () => clearTimeout(t);
  }, [lead, conv, filled]);

  const dups = useMemo(() => {
    if (f.nome.trim().length < 4 && digits(f.cnpj).length < 8 && digits(ct.whatsapp).length < 8) return [];
    return s.companies
      .map((c) => {
        let score = nameSimilarity(f.nome, c.nome);
        const reasons: string[] = [];
        if (score >= 0.6) reasons.push("nome parecido");
        if (f.cidade && c.cidade && f.cidade.toLowerCase() === c.cidade.toLowerCase() && score >= 0.5) {
          score += 0.2;
          reasons.push("mesma cidade");
        }
        if (digits(f.cnpj).length >= 8 && digits(c.cnpj) === digits(f.cnpj)) {
          score = 1.5;
          reasons.push("mesmo CNPJ");
        }
        const phone = digits(ct.whatsapp).slice(-8);
        if (phone.length === 8 && s.contacts.some((x) => x.companyId === c.id && digits(x.whatsapp).endsWith(phone))) {
          score = Math.max(score, 1.2);
          reasons.push("mesmo telefone");
        }
        return { c, score, reasons };
      })
      .filter((x) => x.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [f.nome, f.cnpj, f.cidade, ct.whatsapp, s.companies, s.contacts]);

  const needsDecision = dups.length > 0 && !decision;
  const valid = f.nome.trim() && f.cidade.trim() && ct.nome.trim() && next.titulo.trim();

    const save = async () => {
    setTouched(true);
    if (!valid || needsDecision) return;
    const company: Partial<Company> & { nome: string } = {
      nome: f.nome.trim(),
      razaoSocial: f.razaoSocial.trim() || f.nome.trim(),
      cnpj: f.cnpj || undefined,
      cidade: f.cidade.trim(),
      uf: f.uf,
      regiao: f.regiao || undefined,
      ramo: f.ramo || undefined,
      origem: f.origem,
      ownerId: f.ownerId,
      urgencia: f.urgencia,
      colhedoras: f.colhedoras ? Number(f.colhedoras) : undefined,
      prensa: (f.prensa || undefined) as Prensa | undefined,
      marcaAtual: f.marcaAtual || undefined,
      observacoes: f.observacoes || undefined,
    };
    const payload = {
      company,
      contacts: [{ nome: ct.nome.trim(), cargo: ct.cargo || ct.papel, papel: ct.papel, influencia: 2 as const, whatsapp: ct.whatsapp || undefined, email: ct.email || undefined, canal: "WhatsApp" as const, autorizaContato: true, ativo: true }],
      firstActivity: { tipo: next.tipo, titulo: next.titulo, dueAt: fromInputDate(next.due, 10), prioridade: next.prioridade, ownerId: f.ownerId },
      conversationId: convId,
    };
    if (decision?.kind === "merge" || process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE !== "true") {
      const id = decision?.kind === "merge" ? s.mergeIntoCompany(decision.id, payload) : s.createCompany(payload);
      toast(decision?.kind === "merge" ? "Registros unidos — histórico preservado" : "Empresa cadastrada", { sub: "Oportunidade criada em Lead desconhecido com o primeiro próximo passo" });
      router.push(`/empresas/${id}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createCompany", actorId: user.id, ...payload }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error ?? "Não foi possível salvar no banco", { tone: "warn" });
        return;
      }
      s.adoptSaved(body);
      toast("Empresa cadastrada no banco", { sub: "Oportunidade criada em Lead desconhecido com o primeiro próximo passo" });
      router.push(`/empresas/${body.company.id}`);
    } catch {
      toast("Não foi possível salvar no banco", { tone: "warn" });
    } finally {
      setSaving(false);
    }
  };

  const req = (v: string) => touched && !v.trim();

  return (
    <div>
      <Link href={conv ? `/conversas?c=${conv.id}` : "/carteira"} className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted hover:text-ink">
        <ArrowLeft size={14} /> {conv ? "Voltar para a conversa" : "Carteira"}
      </Link>
      <PageHeader kicker="Fluxo 7.1 · Entrada de novo cliente" title="Nova empresa" subtitle="Dados mínimos, verificação de duplicidade e o primeiro próximo passo. O resto a conta ganha ao longo da jornada." />

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-5">
          {conv && (
            <AIPanel title={reading ? "Lendo a conversa do WhatsApp…" : `Dados extraídos da conversa com ${conv.contatoNome}`} action={!reading && <AIBadge label="preenchido pela IA" />}>
              {reading ? (
                <AIThinking steps={["Lendo as mensagens do contato", "Identificando empresa, cidade e papel", "Buscando cadastros parecidos", "Preenchendo o formulário"]} className="border-0 bg-transparent p-0" />
              ) : (
                <div className="space-y-2">
                  <div className="rounded-[5px] border border-line bg-soft/40 p-2.5 text-[12.5px] text-ink/80">
                    <MessageCircle size={13} className="mr-1 inline text-ok" />“{conv.messages.filter((m) => m.from === "cliente").at(-1)?.text}”
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[12px]">
                    {[
                      ["Empresa", lead?.empresa],
                      ["Cidade", `${lead?.cidade}/${lead?.uf}`],
                      ["Contato", `${lead?.contatoNome} · ${lead?.papel}`],
                      ["Origem", lead?.indicacao ? `indicação (${lead.indicacao})` : lead?.origem],
                      ["Interesse", lead?.interesse],
                    ].map(([k, v]) => (
                      <span key={k} className="rounded-[4px] bg-ai-soft px-2 py-1 text-ai">
                        <b>{k}:</b> {v}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11.5px] text-muted">Confira e complete. Nada é salvo sem sua confirmação.</p>
                </div>
              )}
            </AIPanel>
          )}

          <Card>
            <CardHeader title="Dados da empresa" />
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="Nome fantasia" required className="lg:col-span-4">
                <Input value={f.nome} onChange={(e) => { setF({ ...f, nome: e.target.value }); setDecision(null); }} className={cn(req(f.nome) && "border-brand")} placeholder="Ex.: Usina Vale do Sol Bioenergia" />
              </Field>
              <Field label="CNPJ" hint="opcional" className="lg:col-span-2">
                <Input value={f.cnpj} onChange={(e) => { setF({ ...f, cnpj: e.target.value }); setDecision(null); }} placeholder="00.000.000/0000-00" />
              </Field>
              <Field label="Cidade" required className="lg:col-span-3">
                <Input value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} className={cn(req(f.cidade) && "border-brand")} />
              </Field>
              <Field label="UF" className="lg:col-span-1">
                <Select value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value })}>
                  {UFS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Região" className="lg:col-span-2">
                <Select value={f.regiao} onChange={(e) => setF({ ...f, regiao: e.target.value })}>
                  <option value="">Selecione…</option>
                  {REGIOES.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Ramo de atividade" className="lg:col-span-3">
                <Select value={f.ramo} onChange={(e) => setF({ ...f, ramo: e.target.value })}>
                  <option value="">Selecione…</option>
                  {RAMOS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Origem" className="lg:col-span-3">
                <Select value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })}>
                  {ORIGENS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsável" className="lg:col-span-2">
                <Select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
                  {s.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Urgência" className="lg:col-span-2">
                <Select value={f.urgencia} onChange={(e) => setF({ ...f, urgencia: e.target.value as Urgencia })}>
                  <option>Alta</option>
                  <option>Média</option>
                  <option>Baixa</option>
                </Select>
              </Field>
              <Field label="Nº de colhedoras" hint="se já souber" className="lg:col-span-2">
                <Input type="number" value={f.colhedoras} onChange={(e) => setF({ ...f, colhedoras: e.target.value })} />
              </Field>
              <Field label="Tipo de prensa" className="lg:col-span-3">
                <Select value={f.prensa} onChange={(e) => setF({ ...f, prensa: e.target.value as Prensa })}>
                  <option value="">Ainda não sei</option>
                  {PRENSAS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Marca atual" className="lg:col-span-3">
                <Select value={f.marcaAtual} onChange={(e) => setF({ ...f, marcaAtual: e.target.value })}>
                  <option value="">Ainda não sei</option>
                  {MARCAS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Observações" className="lg:col-span-6">
                <Textarea value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} rows={2} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Contato" kicker="Pelo menos um" />
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Nome" required className="lg:col-span-2">
                <Input value={ct.nome} onChange={(e) => setCt({ ...ct, nome: e.target.value })} className={cn(req(ct.nome) && "border-brand")} />
              </Field>
              <Field label="Cargo">
                <Input value={ct.cargo} onChange={(e) => setCt({ ...ct, cargo: e.target.value })} />
              </Field>
              <Field label="Papel">
                <Select value={ct.papel} onChange={(e) => setCt({ ...ct, papel: e.target.value as Papel })}>
                  {PAPEIS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </Field>
              <Field label="WhatsApp">
                <Input value={ct.whatsapp} onChange={(e) => { setCt({ ...ct, whatsapp: e.target.value }); setDecision(null); }} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Próximo passo" kicker="A conta já nasce com uma ação agendada" />
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="O que fazer" required className="lg:col-span-6">
                <Input value={next.titulo} onChange={(e) => setNext({ ...next, titulo: e.target.value })} />
              </Field>
              <Field label="Tipo" className="lg:col-span-2">
                <Select value={next.tipo} onChange={(e) => setNext({ ...next, tipo: e.target.value as ActivityType })}>
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Vencimento" className="lg:col-span-2">
                <Input type="date" value={next.due} onChange={(e) => setNext({ ...next, due: e.target.value })} />
              </Field>
              <Field label="Prioridade" className="lg:col-span-2">
                <Select value={next.prioridade} onChange={(e) => setNext({ ...next, prioridade: e.target.value as Prioridade })}>
                  <option>Alta</option>
                  <option>Média</option>
                  <option>Baixa</option>
                </Select>
              </Field>
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-20 xl:self-start">
          <Card className={cn(dups.length ? "border-warn/40" : "")}>
            <CardHeader kicker="O sistema compara nome, CNPJ e telefone" title={dups.length ? `${dups.length} ${dups.length === 1 ? "cadastro parecido" : "cadastros parecidos"}` : "Nenhum cadastro parecido"} />
            <div className="p-4">
              {dups.length === 0 && <p className="text-[12.5px] text-muted">O sistema verifica nome, CNPJ e telefone em toda a base (inclusive dados importados do Moskit) enquanto você digita.</p>}
              <div className="space-y-3">
                {dups.map(({ c, reasons }) => {
                  const deal = currentDealOf(s, c.id);
                  const nc = s.contacts.filter((x) => x.companyId === c.id).length;
                  const selected = decision?.kind === "merge" && decision.id === c.id;
                  return (
                    <div key={c.id} className={cn("rounded-[6px] border p-3", selected ? "border-navy bg-soft/60" : "border-warn/30 bg-warn-soft/40")}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-ink">{c.nome}</div>
                          <div className="text-[11.5px] text-muted">
                            {c.codigo} · {c.cidade}/{c.uf} · criado em {fmtDate(c.createdAt)}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {reasons.map((r) => (
                              <Badge key={r} tone="amber">
                                {r}
                              </Badge>
                            ))}
                            {c.importadoDe && <Badge tone="outline">importado do {c.importadoDe}</Badge>}
                            <StagePill deal={deal} />
                          </div>
                          <div className="mt-1 text-[11.5px] text-muted">
                            {nc} contato(s) · {c.observacoes ?? "sem observações"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Button size="xs" variant={selected ? "dark" : "outline"} onClick={() => setDecision({ kind: "merge", id: c.id })}>
                          <GitMerge size={13} /> É a mesma — unir registros
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {dups.length > 0 && (
                <button type="button" onClick={() => setDecision({ kind: "new" })} className={cn("mt-3 w-full rounded-[5px] border px-3 py-2 text-[12.5px] font-semibold", decision?.kind === "new" ? "border-navy bg-navy text-white" : "border-line text-ink hover:border-navy/40")}>
                  É outra empresa — cadastrar como nova
                </button>
              )}
              {decision?.kind === "merge" && (
                <p className="mt-3 flex items-start gap-1.5 text-[12px] text-ink/75">
                  <Sparkles size={13} className="mt-0.5 shrink-0 text-ai" /> Ao unir, o cadastro antigo recebe os dados novos. Contatos, atividades e histórico são preservados e a união fica na auditoria.
                </p>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="label mb-2">Ao salvar, o sistema</div>
            <ul className="square-list space-y-1.5 text-[12.5px] text-ink/80">
              <li>Cria a oportunidade em <b>Lead desconhecido</b> (funil de Aquisição).</li>
              <li>Agenda o primeiro próximo passo para o responsável.</li>
              <li>{conv ? "Vincula a conversa do WhatsApp à empresa e ao contato." : "Coloca o cliente na agenda do responsável."}</li>
              <li>Registra a criação na auditoria.</li>
            </ul>
            <Button variant="primary" size="lg" className="mt-4 w-full" onClick={save} disabled={reading || saving}>
              <Check size={16} /> {saving ? "Salvando no banco…" : decision?.kind === "merge" ? "Unir e salvar" : "Cadastrar empresa"}
            </Button>
            {touched && needsDecision && <p className="mt-2 text-[12px] font-semibold text-warn">Decida sobre a possível duplicidade antes de salvar.</p>}
            {touched && !valid && <p className="mt-2 text-[12px] font-semibold text-brand">Preencha nome, cidade, contato e próximo passo.</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function NovaEmpresaPage() {
  return (
    <Suspense>
      <NovaEmpresa />
    </Suspense>
  );
}
