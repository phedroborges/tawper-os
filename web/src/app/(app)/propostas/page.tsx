"use client";

import { Check, ExternalLink, FileText, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { StagePill } from "@/components/crm/crm";
import { Button, Card, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { DECK_PAGE_COUNT, buildProposalHtml } from "@/lib/proposal";
import { papelRotulo } from "@/lib/constants";
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
  const [contactId, setContactId] = useState("");
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
  const contacts = useMemo(() => {
    if (!company) return [];
    return s.contacts.filter((c) => c.companyId === company.id && c.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [s.contacts, company]);

  useEffect(() => {
    if (!companyId) {
      setContactId("");
      return;
    }
    if (contactId && contacts.some((c) => c.id === contactId)) return;
    setContactId(contacts[0]?.id ?? "");
  }, [companyId, contacts, contactId]);

  const contact = contacts.find((c) => c.id === contactId);
  const owner = company ? s.users.find((u) => u.id === company.ownerId) : undefined;
  const already = Boolean(deal?.checklist.proposta_enviada);
  const canGenerate = Boolean(company && contact);

  const gerar = () => {
    if (!company) {
      toast("Escolha o cliente", { tone: "warn", sub: "Selecione a empresa na lista à esquerda." });
      return;
    }
    if (!contact) {
      toast("Escolha o contato", { tone: "warn", sub: "A proposta precisa do destinatário dentro da conta." });
      return;
    }
    const html = buildProposalHtml({
      company,
      contact,
      deal,
      owner,
      notas,
      baseUrl: window.location.origin,
    });
    const win = window.open("", "_blank");
    if (!win) {
      toast("Popup bloqueado", { tone: "warn", sub: "Permita pop-ups para abrir a proposta." });
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    toast(`Proposta de ${company.nome}`, { sub: `Para ${contact.nome} · ${DECK_PAGE_COUNT} slides do deck Tawper.` });
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
        subtitle={`Deck oficial Tawper (${DECK_PAGE_COUNT} páginas do PDF), personalizado com cliente e contato. Sem preço.`}
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="self-start shadow-none">
          <div className="border-b border-line/70 p-3">
            <div className="label mb-2">1. Cliente</div>
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
                      active && "bg-soft ring-1 ring-inset ring-navy/20",
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
                Escolha o <b>cliente</b> à esquerda. Depois escolha o <b>contato</b> destinatário.
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <div>
                  <div className="label">Cliente selecionado</div>
                  <div className="mt-1 text-[20px] font-semibold text-ink">{company.nome}</div>
                  <div className="mt-1 text-[12.5px] text-muted">
                    {[company.cidade, company.uf].filter(Boolean).join("/") || company.regiao || "Local a completar"}
                    {owner ? ` · responsável ${owner.name}` : ""}
                    {deal ? ` · ${deal.titulo}` : " · sem negócio aberto"}
                  </div>
                </div>

                <div>
                  <div className="label mb-1.5">2. Contato destinatário</div>
                  {contacts.length === 0 ? (
                    <div className="rounded-[6px] border border-dashed border-warn/40 bg-warn-soft px-3 py-3 text-[12.5px] text-warn">
                      Esta empresa não tem contato ativo. Cadastre um contato no perfil da conta antes de gerar a proposta.
                    </div>
                  ) : (
                    <Select value={contactId} onChange={(e) => setContactId(e.target.value)} className="w-full">
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                          {c.cargo ? ` · ${c.cargo}` : ""}
                          {c.papel ? ` · ${papelRotulo(c.papel)}` : ""}
                          {c.whatsapp ? ` · ${c.whatsapp}` : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>

                <div>
                  <div className="label mb-1.5">3. Notas na capa (opcional)</div>
                  <Textarea
                    rows={3}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Circuito prioritário, visita combinada, o que destacar para este contato…"
                  />
                </div>

                <div className="rounded-[6px] border border-line bg-soft/50 px-3 py-3 text-[12.5px] text-muted">
                  A geração monta o <b>deck oficial</b> ({DECK_PAGE_COUNT} slides do PDF Tawper, com fotos e história da empresa) mais capa e fechamento personalizados com este cliente e contato.
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" disabled={!canGenerate} onClick={gerar}>
                    <ExternalLink size={14} /> Gerar proposta
                  </Button>
                  <Button variant={already ? "success" : "dark"} disabled={!deal || already} onClick={marcarEnviada}>
                    <Check size={14} /> {already ? "Já marcada como enviada" : "Marcar proposta enviada"}
                  </Button>
                </div>
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
