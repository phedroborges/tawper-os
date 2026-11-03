"use client";

import { Check, ExternalLink, FileText, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { StagePill } from "@/components/crm/crm";
import { Button, Card, Input, PageHeader, Textarea } from "@/components/ui/primitives";
import { PRODUCT_NAMES } from "@/lib/constants";
import { buildProposalHtml } from "@/lib/proposal";
import { openDealOf, visibleCompanies } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, normalize } from "@/lib/utils";

function PropostasInner() {
  const s = useStore();
  const user = useCurrentUser();
  const { toast } = useUI();
  const search = useSearchParams();
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    const fromUrl = search.get("empresa");
    if (!fromUrl) return;
    const c = s.companies.find((x) => x.id === fromUrl);
    if (!c) return;
    setCompanyId(c.id);
    setNotas(c.observacoes ?? "");
  }, [search, s.companies]);

  const companies = useMemo(() => {
    const n = normalize(q);
    return visibleCompanies(s, user)
      .filter((c) => c.status === "ativa" || c.status === "espera")
      .filter((c) => !n || normalize(`${c.nome} ${c.cidade ?? ""} ${c.codigo}`).includes(n))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [s, user, q]);

  const company = s.companies.find((c) => c.id === companyId);
  const deal = company ? openDealOf(s, company.id) : undefined;
  const contacts = company ? s.contacts.filter((c) => c.companyId === company.id && c.ativo) : [];
  const owner = company ? s.users.find((u) => u.id === company.ownerId) : undefined;
  const already = Boolean(deal?.checklist.proposta_enviada);

  const gerar = () => {
    if (!company) {
      toast("Escolha uma empresa", { tone: "warn", sub: "A proposta usa o cadastro da conta." });
      return;
    }
    const html = buildProposalHtml({ company, deal, contacts, owner, notas });
    const win = window.open("", "_blank");
    if (!win) {
      toast("Popup bloqueado", { tone: "warn", sub: "Permita pop-ups para abrir a proposta." });
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    toast(`Proposta de ${company.nome} aberta`, { sub: "Use Exportar / imprimir PDF na barra da proposta." });
  };

  const marcarEnviada = () => {
    if (!deal) {
      toast("Sem negócio aberto", { tone: "warn", sub: "Abra ou retome a oportunidade na empresa." });
      return;
    }
    s.setChecklist(deal.id, { proposta_enviada: true });
    toast("Proposta marcada como enviada", { sub: "Critério do funil atualizado." });
  };

  return (
    <div>
      <PageHeader
        kicker="Comercial"
        title="Proposta comercial"
        subtitle="Gera o deck Tawper personalizado com o cadastro da conta. Sem preço — só a apresentação padrão."
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="self-start shadow-none">
          <div className="border-b border-line/70 p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <Input className="h-9 pl-8 text-[12.5px]" placeholder="Buscar empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <ul className="max-h-[62vh] overflow-y-auto">
            {companies.length === 0 && <li className="px-4 py-8 text-center text-[12.5px] text-muted">Nenhuma empresa nesta carteira.</li>}
            {companies.map((c) => {
              const d = openDealOf(s, c.id);
              const active = c.id === companyId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCompanyId(c.id);
                      setNotas(c.observacoes ?? "");
                    }}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-line/60 px-4 py-3 text-left last:border-b-0 hover:bg-soft/60",
                      active && "bg-soft",
                    )}
                  >
                    <span className="text-[13px] font-semibold text-ink">{c.nome}</span>
                    <span className="text-[11.5px] text-muted">
                      {[c.cidade, c.uf].filter(Boolean).join("/") || c.regiao || "—"}
                      {c.colhedoras != null ? ` · ${c.colhedoras} colhedora(s)` : ""}
                    </span>
                    {d && <StagePill deal={d} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-none">
            {!company ? (
              <div className="px-5 py-16 text-center text-[13px] text-muted">
                <FileText size={28} className="mx-auto mb-3 text-brand" />
                Escolha uma empresa à esquerda para gerar a proposta.
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <div>
                  <div className="label">Cliente</div>
                  <div className="mt-1 text-[20px] font-semibold text-ink">{company.nome}</div>
                  <div className="mt-1 text-[12.5px] text-muted">
                    {[company.cidade, company.uf].filter(Boolean).join("/") || company.regiao || "Local a completar"}
                    {owner ? ` · responsável ${owner.name}` : ""}
                    {deal ? ` · ${deal.titulo}` : " · sem negócio aberto"}
                  </div>
                </div>

                <div>
                  <div className="label mb-1.5">Notas na proposta (opcional)</div>
                  <Textarea
                    rows={4}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Circuito prioritário, visita combinada, o que alinhar na capa…"
                  />
                </div>

                <div className="rounded-[6px] border border-line bg-soft/50 px-3 py-3">
                  <div className="label mb-2">Produtos citados (só nomes — contexto Tawper)</div>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {PRODUCT_NAMES.map((nome) => (
                      <li key={nome} className="text-[12.5px] text-ink">
                        · {nome}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={gerar}>
                    <ExternalLink size={14} /> Gerar proposta
                  </Button>
                  <Button variant={already ? "success" : "dark"} disabled={!deal || already} onClick={marcarEnviada}>
                    <Check size={14} /> {already ? "Já marcada como enviada" : "Marcar proposta enviada"}
                  </Button>
                </div>
                <p className="text-[12px] text-muted">
                  A geração abre o HTML no navegador. De lá, use imprimir/salvar PDF. Marcar como enviada cumpre o critério da etapa Orçamento e pode avançar o funil.
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function PropostasPage() {
  return (
    <Suspense>
      <PropostasInner />
    </Suspense>
  );
}
