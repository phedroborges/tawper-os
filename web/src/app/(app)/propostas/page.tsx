"use client";

import {
  Building2,
  Check,
  Download,
  Eye,
  FileText,
  Plus,
  Search,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { StagePill } from "@/components/crm/crm";
import { Modal } from "@/components/ui/overlay";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { CONDICOES_PAGAMENTO, papelRotulo } from "@/lib/constants";
import {
  buildInitialProposalInput,
  buildProposalPdfBytes,
  calcProposalTotals,
  defaultSellerEmail,
  MODE_LABEL,
  PROPOSAL_EQUIPMENT_PRESETS,
  type EquipmentPreset,
  type ProposalDocumentInput,
  type ProposalLineItem,
  type ProposalMode,
} from "@/lib/proposal";
import { openDealOf, visibleCompanies } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, money, normalize } from "@/lib/utils";

async function loadWhiteLogoPng(): Promise<Uint8Array | undefined> {
  try {
    const res = await fetch("/brand/tawper-logo-white.png");
    if (!res.ok) return undefined;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return undefined;
  }
}

function slugFileName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function PropostasInner() {
  const s = useStore();
  const user = useCurrentUser();
  const { toast } = useUI();
  const search = useSearchParams();

  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState(() => search.get("empresa") ?? "");
  const [draftsByCompany, setDraftsByCompany] = useState<Record<string, ProposalDocumentInput>>({});
  const [selectedContactByCompany, setSelectedContactByCompany] = useState<Record<string, string>>({});
  const [selectedSellerByCompany, setSelectedSellerByCompany] = useState<Record<string, string>>({});
  const [busyPdf, setBusyPdf] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const logoCacheRef = useRef<Uint8Array | null | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const companies = useMemo(() => {
    const n = normalize(q);
    return visibleCompanies(s, user)
      .filter((c) => c.status === "ativa" || c.status === "espera")
      .filter(
        (c) =>
          !n ||
          normalize(`${c.nome} ${c.razaoSocial ?? ""} ${c.cnpj ?? ""} ${c.cidade ?? ""} ${c.codigo}`).includes(n),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [s, user, q]);

  const company = useMemo(() => {
    if (companyId) return s.companies.find((c) => c.id === companyId);
    const fromUrl = search.get("empresa");
    return fromUrl ? s.companies.find((c) => c.id === fromUrl) : undefined;
  }, [companyId, search, s.companies]);

  const deal = company ? openDealOf(s, company.id) : undefined;
  const contacts = useMemo(() => {
    if (!company) return [];
    return s.contacts
      .filter((c) => c.companyId === company.id && c.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [s.contacts, company]);

  const sellers = useMemo(
    () => s.users.filter((u) => u.role === "vendedor" || u.role === "representante" || u.id === company?.ownerId),
    [s.users, company?.ownerId],
  );

  const activeContactId = company
    ? selectedContactByCompany[company.id] ?? contacts[0]?.id ?? ""
    : "";
  const activeContact = contacts.find((c) => c.id === activeContactId) ?? contacts[0];

  const activeSellerId = company
    ? selectedSellerByCompany[company.id] ?? company.ownerId ?? user.id
    : user.id;
  const activeSeller = s.users.find((u) => u.id === activeSellerId) ?? user;

  const baseDraft = useMemo(() => {
    if (!company) return null;
    const fallbackContact = activeContact ?? {
      id: "manual",
      companyId: company.id,
      nome: "",
      cargo: "",
      papel: "Decisor" as const,
      influencia: 2 as const,
      canal: "WhatsApp" as const,
      autorizaContato: true,
      ativo: true,
    };
    return buildInitialProposalInput({
      company,
      contact: fallbackContact,
      owner: activeSeller,
      deal,
    });
  }, [company, activeContact, activeSeller, deal]);

  const draft = company ? (draftsByCompany[company.id] ?? baseDraft) : null;

  const patchDraft = (updater: (cur: ProposalDocumentInput) => ProposalDocumentInput) => {
    if (!company || !draft) return;
    setDraftsByCompany((prev) => ({
      ...prev,
      [company.id]: updater(prev[company.id] ?? draft),
    }));
  };

  const handleSelectCompany = (id: string) => {
    setCompanyId(id);
  };

  const handleSelectContact = (cid: string) => {
    if (!company) return;
    setSelectedContactByCompany((prev) => ({ ...prev, [company.id]: cid }));
    const found = contacts.find((c) => c.id === cid);
    if (!found) return;
    patchDraft((cur) => ({
      ...cur,
      cliente: {
        ...cur.cliente,
        contatoNome: found.nome,
        contatoCargo: found.cargo ?? "",
        contatoPapel: found.papel ? papelRotulo(found.papel) : "",
        contatoWhatsapp: found.whatsapp ?? "",
        contatoEmail: found.email ?? "",
      },
    }));
  };

  const handleSelectSeller = (uid: string) => {
    if (!company) return;
    setSelectedSellerByCompany((prev) => ({ ...prev, [company.id]: uid }));
    const found = s.users.find((u) => u.id === uid);
    if (!found) return;
    patchDraft((cur) => ({
      ...cur,
      vendedor: {
        nome: found.name,
        cargo: found.title || "Consultor Técnico Comercial",
        telefone: found.phone || "",
        email: defaultSellerEmail(found),
        regiao: found.regions?.join(", ") || cur.vendedor.regiao,
      },
    }));
  };

  const addPresetItem = (preset?: EquipmentPreset) => {
    patchDraft((cur) => ({
      ...cur,
      itens: [
        ...cur.itens,
        {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          equipamento: preset?.equipamento ?? "Equipamento / Item Personalizado",
          especificacao: preset?.especificacao ?? "",
          modalidade: preset?.modalidade ?? "venda",
          unidade: preset?.unidade ?? "un",
          qtd: preset?.qtd ?? 1,
          valorUnitario: preset?.valorUnitario ?? 0,
        },
      ],
    }));
  };

  const updateItem = (itemId: string, patch: Partial<ProposalLineItem>) => {
    patchDraft((cur) => ({
      ...cur,
      itens: cur.itens.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    }));
  };

  const removeItem = (itemId: string) => {
    patchDraft((cur) => ({
      ...cur,
      itens: cur.itens.filter((it) => it.id !== itemId),
    }));
  };

  const generatePdf = async (mode: "preview" | "download") => {
    if (!company || !draft) {
      toast("Escolha um cliente", { tone: "warn", sub: "Selecione a empresa à esquerda antes de gerar o PDF." });
      return;
    }
    if (!draft.cliente.contatoNome.trim()) {
      toast("Informe o destinatário", { tone: "warn", sub: "Preencha o nome do contato destinatário na proposta." });
      return;
    }
    if (draft.itens.length === 0) {
      toast("Adicione ao menos 1 equipamento ou item", { tone: "warn" });
      return;
    }

    setBusyPdf(true);
    try {
      if (logoCacheRef.current === undefined) {
        logoCacheRef.current = (await loadWhiteLogoPng()) ?? null;
      }
      const bytes = await buildProposalPdfBytes(draft, {
        logoWhitePng: logoCacheRef.current ?? undefined,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const fileName = `Proposta-${slugFileName(draft.termos.numero || "Tawper")}-${slugFileName(draft.cliente.nomeFantasia || "Cliente")}.pdf`;

      if (mode === "download") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast("PDF baixado", { sub: fileName });
      } else {
        const nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      }
    } catch (e) {
      toast("Erro ao gerar PDF", {
        tone: "warn",
        sub: e instanceof Error ? e.message : "Não foi possível montar o arquivo PDF.",
      });
    } finally {
      setBusyPdf(false);
    }
  };

  const already = Boolean(deal?.checklist.proposta_enviada);
  const marcarEnviada = () => {
    if (!deal) {
      toast("Sem negócio aberto", { tone: "warn", sub: "Abra ou retome a oportunidade na empresa." });
      return;
    }
    s.setChecklist(deal.id, { proposta_enviada: true });
    toast("Proposta marcada como enviada", { sub: "Critério do funil atualizado." });
  };

  const totals = draft ? calcProposalTotals(draft.itens, draft.termos.descontoPct) : null;

  return (
    <div>
      <PageHeader
        kicker="Comercial · PDF Real"
        title="Gerador de Proposta Comercial"
        subtitle="Monte e exporte a proposta oficial em PDF real com dados completos do cliente, do vendedor, parque de equipamentos e soluções."
        actions={
          company && draft ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={busyPdf} onClick={() => void generatePdf("preview")}>
                <Eye size={14} /> {busyPdf ? "Gerando…" : "Visualizar PDF"}
              </Button>
              <Button variant="primary" size="sm" disabled={busyPdf} onClick={() => void generatePdf("download")}>
                <Download size={14} /> {busyPdf ? "Gerando…" : "Baixar PDF"}
              </Button>
              <Button variant={already ? "success" : "dark"} size="sm" disabled={!deal || already} onClick={marcarEnviada}>
                <Check size={14} /> {already ? "Proposta enviada" : "Marcar como enviada"}
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[310px_minmax(0,1fr)]">
        {/* Lista de Clientes */}
        <Card className="self-start">
          <div className="border-b border-line/70 p-3">
            <div className="label mb-2">1. Selecionar cliente</div>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <Input
                className="h-9 pl-8 text-[12.5px]"
                placeholder="Buscar empresa, cidade ou CNPJ…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <ul className="scrollbar-thin max-h-[68vh] overflow-y-auto">
            {companies.length === 0 && (
              <li className="px-4 py-8 text-center text-[12.5px] text-muted">Nenhuma empresa encontrada.</li>
            )}
            {companies.map((c) => {
              const d = openDealOf(s, c.id);
              const active = c.id === company?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectCompany(c.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-line/60 px-4 py-3 text-left last:border-b-0 hover:bg-soft/60",
                      active && "bg-soft ring-1 ring-inset ring-navy/25",
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

        {/* Formulário completo da Proposta */}
        {!company || !draft ? (
          <Card className="grid min-h-[420px] place-items-center p-8 text-center">
            <div className="max-w-md space-y-2">
              <FileText size={32} className="mx-auto text-brand" />
              <div className="text-[16px] font-semibold text-ink">Escolha um cliente na lista ao lado</div>
              <p className="text-[13px] text-muted">
                Ao selecionar a conta, preenchemos automaticamente os dados do cliente, do vendedor responsável e os
                equipamentos da frota para você ajustar e gerar o PDF real.
              </p>
            </div>
          </Card>
        ) : (
          <div className="min-w-0 space-y-4">
            {/* Bloco 1: Dados do Cliente & Destinatário */}
            <Card>
              <CardHeader
                kicker="Bloco 1 · Dados que saem na capa da proposta"
                title="Dados do Cliente e Destinatário"
                action={<Building2 size={16} className="text-navy-3" />}
              />
              <div className="space-y-3 border-t border-line/70 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Nome Fantasia" required>
                    <Input
                      value={draft.cliente.nomeFantasia}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, nomeFantasia: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Razão Social">
                    <Input
                      value={draft.cliente.razaoSocial}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, razaoSocial: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="CNPJ">
                    <Input
                      value={draft.cliente.cnpj}
                      placeholder="00.000.000/0001-00"
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, cnpj: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Cidade / UF">
                    <Input
                      value={draft.cliente.cidadeUf}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, cidadeUf: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Endereço">
                    <Input
                      value={draft.cliente.endereco}
                      placeholder="Rodovia, Rua, Km…"
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, endereco: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="CEP">
                    <Input
                      value={draft.cliente.cep}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, cep: e.target.value } }))
                      }
                    />
                  </Field>
                </div>

                <div className="border-t border-line/60 pt-3">
                  {contacts.length > 0 && (
                    <div className="mb-3">
                      <Field label="Puxar contato cadastrado">
                        <Select value={activeContactId} onChange={(e) => handleSelectContact(e.target.value)}>
                          {contacts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                              {c.cargo ? ` · ${c.cargo}` : ""}
                              {c.whatsapp ? ` · ${c.whatsapp}` : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Destinatário" required>
                      <Input
                        value={draft.cliente.contatoNome}
                        placeholder="Nome do responsável"
                        onChange={(e) =>
                          patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, contatoNome: e.target.value } }))
                        }
                      />
                    </Field>
                    <Field label="Cargo / Papel">
                      <Input
                        value={draft.cliente.contatoCargo}
                        placeholder="Ex.: Gerente de Manutenção"
                        onChange={(e) =>
                          patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, contatoCargo: e.target.value } }))
                        }
                      />
                    </Field>
                    <Field label="WhatsApp / Telefone">
                      <Input
                        value={draft.cliente.contatoWhatsapp}
                        placeholder="(00) 90000-0000"
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            cliente: { ...cur.cliente, contatoWhatsapp: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="E-mail">
                      <Input
                        value={draft.cliente.contatoEmail}
                        placeholder="contato@empresa.com.br"
                        onChange={(e) =>
                          patchDraft((cur) => ({ ...cur, cliente: { ...cur.cliente, contatoEmail: e.target.value } }))
                        }
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </Card>

            {/* Bloco 2: Dados do Vendedor */}
            <Card>
              <CardHeader
                kicker="Bloco 2 · Consultor responsável pela proposta"
                title="Dados do Vendedor Tawper"
                action={<UserRound size={16} className="text-brand" />}
              />
              <div className="space-y-3 border-t border-line/70 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Vendedor da equipe">
                    <Select value={activeSellerId} onChange={(e) => handleSelectSeller(e.target.value)}>
                      {sellers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Nome na proposta" required>
                    <Input
                      value={draft.vendedor.nome}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, vendedor: { ...cur.vendedor, nome: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Cargo / Função">
                    <Input
                      value={draft.vendedor.cargo}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, vendedor: { ...cur.vendedor, cargo: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Telefone / WhatsApp">
                    <Input
                      value={draft.vendedor.telefone}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, vendedor: { ...cur.vendedor, telefone: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="E-mail comercial">
                    <Input
                      value={draft.vendedor.email}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, vendedor: { ...cur.vendedor, email: e.target.value } }))
                      }
                    />
                  </Field>
                </div>
              </div>
            </Card>

            {/* Bloco 3: Parque de Equipamentos + Itens/Equipamentos da Proposta */}
            <Card>
              <CardHeader
                kicker="Bloco 3 · Escopo técnico e itens da proposta"
                title="Equipamentos, Frota e Soluções"
                action={<Wrench size={16} className="text-navy-3" />}
              />
              <div className="space-y-4 border-t border-line/70 px-4 py-4">
                <div className="grid gap-3 rounded-[8px] border border-line bg-soft/35 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Qtd. Colhedoras / Máquinas">
                    <Input
                      value={draft.frota.colhedoras}
                      placeholder="Ex.: 18"
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, frota: { ...cur.frota, colhedoras: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Modelos dos Equipamentos">
                    <Input
                      value={draft.frota.modelos}
                      placeholder="Ex.: Case A8800, John Deere CH570"
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, frota: { ...cur.frota, modelos: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Sistema de Prensa">
                    <Input
                      value={draft.frota.prensa}
                      placeholder="Comodato Tawper / Própria"
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, frota: { ...cur.frota, prensa: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Marca / Fornecedor Atual">
                    <Input
                      value={draft.frota.marcaAtual}
                      placeholder="Ex.: Parker, Gates…"
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, frota: { ...cur.frota, marcaAtual: e.target.value } }))
                      }
                    />
                  </Field>
                </div>

                {/* Presets rápidos de equipamentos/soluções */}
                <div>
                  <div className="label mb-2">Adicionar equipamento ou solução rápida</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PROPOSAL_EQUIPMENT_PRESETS.map((preset) => (
                      <Button key={preset.key} type="button" size="xs" variant="outline" onClick={() => addPresetItem(preset)}>
                        {preset.label}
                      </Button>
                    ))}
                    <Button type="button" size="xs" variant="ghost" onClick={() => addPresetItem()}>
                      <Plus size={12} /> Item personalizado
                    </Button>
                  </div>
                </div>

                {/* Lista editável de itens */}
                <div className="space-y-2.5">
                  {draft.itens.map((item, idx) => (
                    <div key={item.id} className="rounded-[8px] border border-line bg-paper/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Badge tone="navy">Item {String(idx + 1).padStart(2, "0")}</Badge>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-brand"
                          title="Remover item"
                        >
                          <Trash2 size={13} /> Remover
                        </button>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_90px_90px_130px]">
                        <Field label="Equipamento / Produto">
                          <Input
                            value={item.equipamento}
                            onChange={(e) => updateItem(item.id, { equipamento: e.target.value })}
                          />
                        </Field>
                        <Field label="Modalidade">
                          <Select
                            value={item.modalidade}
                            onChange={(e) => updateItem(item.id, { modalidade: e.target.value as ProposalMode })}
                          >
                            {(Object.keys(MODE_LABEL) as ProposalMode[]).map((m) => (
                              <option key={m} value={m}>
                                {MODE_LABEL[m]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Qtd.">
                          <Input
                            type="number"
                            min={1}
                            value={item.qtd}
                            onChange={(e) =>
                              updateItem(item.id, { qtd: Math.max(1, Number(e.target.value) || 1) })
                            }
                          />
                        </Field>
                        <Field label="Unid.">
                          <Input
                            value={item.unidade}
                            onChange={(e) => updateItem(item.id, { unidade: e.target.value })}
                          />
                        </Field>
                        <Field label="Valor Unit. (R$)">
                          <Input
                            type="number"
                            min={0}
                            step="100"
                            disabled={item.modalidade === "cortesia" || !draft.termos.mostrarValores}
                            value={item.modalidade === "cortesia" ? 0 : item.valorUnitario}
                            onChange={(e) =>
                              updateItem(item.id, { valorUnitario: Math.max(0, Number(e.target.value) || 0) })
                            }
                          />
                        </Field>
                      </div>
                      <div className="mt-2">
                        <Field label="Especificação técnica / Aplicação">
                          <Input
                            value={item.especificacao}
                            placeholder="Norma, bitola, modelo compatível ou escopo…"
                            onChange={(e) => updateItem(item.id, { especificacao: e.target.value })}
                          />
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Controle de exibição de preço e resumo financeiro */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-line bg-soft/45 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-5">
                    <Checkbox
                      checked={draft.termos.mostrarValores}
                      onChange={(on) =>
                        patchDraft((cur) => ({ ...cur, termos: { ...cur.termos, mostrarValores: on } }))
                      }
                      label="Exibir valores comerciais (R$) no PDF"
                      sub="Desmarque para proposta técnica sem preço"
                    />
                    {draft.termos.mostrarValores && (
                      <div className="flex items-center gap-2 text-[12.5px]">
                        <span className="text-muted">Desconto (%):</span>
                        <Input
                          type="number"
                          min={0}
                          max={90}
                          value={draft.termos.descontoPct}
                          onChange={(e) =>
                            patchDraft((cur) => ({
                              ...cur,
                              termos: { ...cur.termos, descontoPct: Math.max(0, Math.min(90, Number(e.target.value) || 0)) },
                            }))
                          }
                          className="h-8 w-20 text-right"
                        />
                      </div>
                    )}
                  </div>

                  {draft.termos.mostrarValores && totals && (
                    <div className="text-right">
                      {totals.descontoPct > 0 && (
                        <div className="text-[11.5px] text-muted">
                          Subtotal {money(totals.subtotal)} · Desc. -{money(totals.descontoValor)}
                        </div>
                      )}
                      <div className="text-[18px] font-bold tabular-nums text-navy">Total: {money(totals.total)}</div>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Bloco 4: Condições Comerciais & Notas */}
            <Card>
              <CardHeader kicker="Bloco 4 · Validade, prazos e acabamento do PDF" title="Condições Comerciais" />
              <div className="space-y-3 border-t border-line/70 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Nº da Proposta">
                    <Input
                      value={draft.termos.numero}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, termos: { ...cur.termos, numero: e.target.value } }))
                      }
                    />
                  </Field>
                  <Field label="Validade (dias)">
                    <Input
                      type="number"
                      min={1}
                      max={180}
                      value={draft.termos.validadeDias}
                      onChange={(e) =>
                        patchDraft((cur) => ({
                          ...cur,
                          termos: { ...cur.termos, validadeDias: Math.max(1, Number(e.target.value) || 15) },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Condição de Pagamento">
                    <Select
                      value={draft.termos.condicaoPagamento}
                      onChange={(e) =>
                        patchDraft((cur) => ({
                          ...cur,
                          termos: { ...cur.termos, condicaoPagamento: e.target.value },
                        }))
                      }
                    >
                      {CONDICOES_PAGAMENTO.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="Comodato mediante consumo mínimo">Comodato mediante consumo mínimo</option>
                    </Select>
                  </Field>
                  <Field label="Frete / Entrega">
                    <Input
                      value={draft.termos.frete}
                      onChange={(e) =>
                        patchDraft((cur) => ({ ...cur, termos: { ...cur.termos, frete: e.target.value } }))
                      }
                    />
                  </Field>
                </div>

                <Field label="Prazo de Entrega / Implantação">
                  <Input
                    value={draft.termos.prazoEntrega}
                    onChange={(e) =>
                      patchDraft((cur) => ({ ...cur, termos: { ...cur.termos, prazoEntrega: e.target.value } }))
                    }
                  />
                </Field>

                <Field label="Observações e Diferenciais da Proposta">
                  <Textarea
                    rows={3}
                    value={draft.termos.observacoes}
                    placeholder="Detalhes de atendimento in-loco, prazo de instalação da prensa, circuito prioritário..."
                    onChange={(e) =>
                      patchDraft((cur) => ({ ...cur, termos: { ...cur.termos, observacoes: e.target.value } }))
                    }
                  />
                </Field>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <Checkbox
                    checked={draft.termos.incluirInstitucional}
                    onChange={(on) =>
                      patchDraft((cur) => ({ ...cur, termos: { ...cur.termos, incluirInstitucional: on } }))
                    }
                    label="Incluir página institucional Tawper (4 pilares técnicos)"
                    sub="Adiciona folha executiva vetorial ao final do PDF"
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busyPdf} onClick={() => void generatePdf("preview")}>
                      <Eye size={14} /> Visualizar PDF
                    </Button>
                    <Button variant="primary" disabled={busyPdf} onClick={() => void generatePdf("download")}>
                      <Download size={14} /> Baixar PDF Real
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Modal de Pré-visualização Real do PDF */}
      {previewUrl && draft && (
        <Modal
          title={`PDF da Proposta · ${draft.termos.numero} (${draft.cliente.nomeFantasia})`}
          onClose={() => {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }}
          size="xl"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
              >
                Fechar
              </Button>
              <Button variant="primary" onClick={() => void generatePdf("download")}>
                <Download size={14} /> Baixar PDF
              </Button>
            </>
          }
        >
          <div className="h-[72vh] w-full overflow-hidden rounded-[6px] border border-line bg-soft">
            <iframe
              src={previewUrl}
              title={`Pré-visualização da proposta ${draft.termos.numero}`}
              className="h-full w-full"
            />
          </div>
        </Modal>
      )}
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
