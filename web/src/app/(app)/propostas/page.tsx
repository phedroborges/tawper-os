"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Download,
  Eye,
  Lock,
  Plus,
  Printer,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  UserRound,
  Wrench,
} from "lucide-react";
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
} from "@/components/ui/primitives";
import { CONDICOES_PAGAMENTO, papelRotulo } from "@/lib/constants";
import type { ProposalStandardConfig } from "@/lib/config";
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
import { buildTawperPresentationDeck } from "@/lib/tawper-presentation";
import { useUI } from "@/lib/ui-store";
import { cn, money, normalize } from "@/lib/utils";

const TAWPER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 198.28 52.38" width="396" height="104"><path fill="#FFFFFF" d="M29.41,0L0,0l0,9.56l9.65,0l0,26.6l10.12,0l0,-26.6l9.64,0l0,-9.56Z"/><polygon fill="#E31C3F" points="10.97,52.38 0.25,52.38 11.4,40.31 22.13,40.31 10.97,52.38"/><path fill="#FFFFFF" d="M40.82,16.92c2.1,-2.22 5.29,-3.34 9.57,-3.34c4.32,0 7.51,1.03 9.58,3.08c2.07,2.06 3.1,5.02 3.1,8.88l0,16.57l-9.42,0l0,-3.44c-1.69,2.52 -4.38,3.79 -8.07,3.79c-2.99,0 -5.37,-0.8 -7.15,-2.41c-1.78,-1.6 -2.67,-3.72 -2.67,-6.35c0,-2.84 1.04,-5.02 3.11,-6.52c2.07,-1.5 5.14,-2.25 9.21,-2.25l5.42,0l0,-0.69c0,-1.44 -0.42,-2.54 -1.26,-3.3c-0.84,-0.76 -2.12,-1.14 -3.84,-1.14c-2.55,0 -4.29,0.99 -5.22,2.96l-8.46,-2.34c0.63,-1.35 1.33,-2.52 2.1,-3.5Zm10.02,16.65c1.1,0 2.02,-0.34 2.74,-1.02c0.73,-0.68 1.1,-1.56 1.1,-2.65l0,-1.28l-4.23,0c-2.79,0 -4.18,0.89 -4.18,2.67c0,0.72 0.29,1.29 0.87,1.7c0.58,0.41 1.35,0.58 2.7,0.58Z"/></svg>`;

async function getLogoPngBytes(): Promise<Uint8Array | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const blob = new Blob([TAWPER_LOGO_SVG], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao carregar SVG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 396;
    canvas.height = 104;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return undefined;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const pngBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!pngBlob) return undefined;
    const buf = await pngBlob.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return undefined;
  }
}

function slugFileName(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "Tawper"
  );
}

type WizardStep = 1 | 2 | 3;

function PropostasInner() {
  const s = useStore();
  const user = useCurrentUser();
  const { toast } = useUI();
  const params = useSearchParams();
  const initialCompanyId = params.get("empresa");

  // Regra de governança: proposta segue um padrão oficial; apenas Administrador altera o padrão/modelo.
  const isAdmin = user.role === "admin";
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const canEditStandard = isAdmin && adminUnlocked;
  const [savingStandard, setSavingStandard] = useState(false);

  const [step, setStep] = useState<WizardStep>(() => (initialCompanyId ? 2 : 1));
  const [q, setQ] = useState("");
  const [onlyWithDeal, setOnlyWithDeal] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId ?? null);

  const companies = useMemo(() => {
    const n = normalize(q);
    return visibleCompanies(s, user)
      .filter((c) => c.status === "ativa" || c.status === "espera")
      .filter((c) => !onlyWithDeal || Boolean(openDealOf(s, c.id)))
      .filter(
        (c) =>
          !n ||
          normalize(`${c.nome} ${c.razaoSocial ?? ""} ${c.cnpj ?? ""} ${c.cidade ?? ""} ${c.codigo}`).includes(n),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [s, user, q, onlyWithDeal]);

  const company = useMemo(
    () => (companyId ? s.companies.find((c) => c.id === companyId) : undefined),
    [s.companies, companyId],
  );

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

  const [draftsByCompany, setDraftsByCompany] = useState<Record<string, ProposalDocumentInput>>({});
  const [selectedContactIdByCompany, setSelectedContactIdByCompany] = useState<Record<string, string>>({});
  const [selectedSellerIdByCompany, setSelectedSellerIdByCompany] = useState<Record<string, string>>({});

  const [busyPdf, setBusyPdf] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const logoCacheRef = useRef<Uint8Array | null>(null);
  const hiddenPrintFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const activeContactId = company
    ? selectedContactIdByCompany[company.id] ?? contacts[0]?.id ?? ""
    : "";
  const activeContact = contacts.find((c) => c.id === activeContactId) ?? contacts[0];

  const activeSellerId = company
    ? selectedSellerIdByCompany[company.id] ??
      deal?.ownerId ??
      company.ownerId ??
      user.id
    : user.id;
  const activeSeller = s.users.find((u) => u.id === activeSellerId) ?? user;

  const standard = s.config.proposalStandard ?? null;

  const baseDraft = useMemo(() => {
    if (!company) return null;
    const fallbackContact = activeContact ?? {
      id: "manual",
      companyId: company.id,
      nome: "Gestão de Manutenção e Compras",
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
      standard,
    });
  }, [company, activeContact, activeSeller, deal, standard]);

  // Se não for Admin (ou se Admin não desbloqueou edição), usa estritamente o padrão oficial (baseDraft)
  const draft: ProposalDocumentInput | null = company
    ? (canEditStandard ? (draftsByCompany[company.id] ?? baseDraft) : baseDraft)
    : null;

  const patchDraft = (updater: (cur: ProposalDocumentInput) => ProposalDocumentInput) => {
    if (!canEditStandard || !company || !draft) return;
    setDraftsByCompany((prev) => ({
      ...prev,
      [company.id]: updater(draft),
    }));
  };

  const handleChooseClient = (id: string) => {
    setCompanyId(id);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setStep(2);
  };

  const handleSelectContact = (contactId: string) => {
    if (!company) return;
    setSelectedContactIdByCompany((prev) => ({ ...prev, [company.id]: contactId }));
    const found = contacts.find((c) => c.id === contactId);
    if (!found || !canEditStandard) return;
    patchDraft((cur) => ({
      ...cur,
      cliente: {
        ...cur.cliente,
        contatoNome: found.nome || cur.cliente.contatoNome,
        contatoCargo: found.cargo || cur.cliente.contatoCargo,
        contatoPapel: papelRotulo(found.papel),
        contatoWhatsapp: found.whatsapp || cur.cliente.contatoWhatsapp,
        contatoEmail: found.email || cur.cliente.contatoEmail,
      },
    }));
  };

  const handleSelectSeller = (sellerId: string) => {
    if (!canEditStandard || !company) return;
    setSelectedSellerIdByCompany((prev) => ({ ...prev, [company.id]: sellerId }));
    const found = s.users.find((u) => u.id === sellerId);
    if (!found) return;
    patchDraft((cur) => ({
      ...cur,
      vendedor: {
        nome: found.name,
        cargo: found.title || cur.vendedor.cargo,
        telefone: found.phone || cur.vendedor.telefone,
        email: defaultSellerEmail(found),
        regiao: found.regions?.join(" · ") || cur.vendedor.regiao,
      },
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
      itens: cur.itens.length > 1 ? cur.itens.filter((it) => it.id !== itemId) : cur.itens,
    }));
  };

  const addPresetItem = (preset?: EquipmentPreset) => {
    patchDraft((cur) => {
      const id = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const nextItem: ProposalLineItem = preset
        ? {
            id,
            equipamento: preset.equipamento,
            especificacao: preset.especificacao,
            qtd: preset.qtd,
            unidade: preset.unidade,
            modalidade: preset.modalidade,
            valorUnitario: preset.valorUnitario,
          }
        : {
            id,
            equipamento: "Novo equipamento / conjunto hidráulico",
            especificacao: "Especificar bitola, norma (4SH / R13 / 2SN), terminais ou aplicação",
            qtd: 1,
            unidade: "un",
            modalidade: "venda",
            valorUnitario: 1200,
          };
      return {
        ...cur,
        itens: [...cur.itens, nextItem],
      };
    });
  };

  const saveAsOfficialStandard = async () => {
    if (!isAdmin || !draft) return;
    setSavingStandard(true);
    try {
      const nextStandard: ProposalStandardConfig = {
        validadeDias: draft.termos.validadeDias,
        condicaoPagamento: draft.termos.condicaoPagamento,
        prazoEntrega: draft.termos.prazoEntrega,
        frete: draft.termos.frete,
        mostrarValores: draft.termos.mostrarValores,
        descontoMaxPct: draft.termos.descontoPct,
        incluirInstitucional: draft.termos.incluirInstitucional,
        observacoesPadrao: draft.termos.observacoes,
        itensPadrao: draft.itens.map((it) => ({ ...it })),
      };
      await s.saveConfig("proposalStandard", nextStandard);
      setAdminUnlocked(false);
      toast("Padrão oficial salvo", {
        sub: "Todas as novas propostas da equipe seguirão este modelo bloqueado.",
      });
    } catch (e) {
      toast("Erro ao salvar padrão", {
        tone: "warn",
        sub: e instanceof Error ? e.message : "Somente o administrador pode alterar o padrão.",
      });
    } finally {
      setSavingStandard(false);
    }
  };

  const generatePdf = async (mode: "download" | "preview") => {
    if (!draft) return;
    setBusyPdf(true);
    try {
      if (!logoCacheRef.current) {
        logoCacheRef.current = (await getLogoPngBytes()) ?? null;
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
        toast("Proposta em PDF baixada", { sub: fileName });
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

  const printWidescreenProposal = () => {
    if (!draft) return;
    const built = buildTawperPresentationDeck(draft, {
      mode: "executive",
      baseUrl: "/apresentacao-tawper",
      initialSlideIndex: 0,
    });
    const frame = hiddenPrintFrameRef.current;
    if (!frame) return;
    frame.srcdoc = built.html;
    frame.onload = () => {
      setTimeout(() => {
        frame.contentWindow?.print();
      }, 350);
    };
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
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      {/* Cabeçalho limpo sem nenhum link externo/aberto */}
      <PageHeader
        kicker="Comercial · Modelo Oficial Tawper"
        title="Gerador de Proposta Comercial"
        subtitle="Modelo padrão protegido pela política Tawper: escolha o cliente, confirme o destinatário e emita a proposta pronta."
        actions={
          <Badge tone={canEditStandard ? "amber" : "navy"}>
            {canEditStandard ? <Unlock size={12} /> : <Lock size={12} />}
            {canEditStandard
              ? "Modo Administrador (Edição Liberada)"
              : "Padrão Oficial Bloqueado"}
          </Badge>
        }
      />

      {/* Caminho de 3 Etapas (Stepper Editorial Tawper) */}
      <div className="grid grid-cols-3 gap-3 rounded-[10px] border border-line bg-white p-3 shadow-2xs">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={cn(
            "flex items-center gap-3 rounded-[8px] border-t-2 px-3.5 py-2.5 text-left transition-colors",
            step === 1
              ? "border-brand bg-paper"
              : step > 1
                ? "border-navy bg-soft/30 hover:bg-soft/60"
                : "border-line text-muted",
          )}
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
              step === 1
                ? "bg-brand text-white"
                : step > 1
                  ? "bg-navy text-white"
                  : "bg-soft text-muted",
            )}
          >
            01
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.1em] text-muted uppercase">
              Passo 1
            </div>
            <div className="truncate text-[13.5px] font-bold text-ink">
              {company ? company.nome : "Escolher o Cliente"}
            </div>
          </div>
        </button>

        <button
          type="button"
          disabled={!company}
          onClick={() => company && setStep(2)}
          className={cn(
            "flex items-center gap-3 rounded-[8px] border-t-2 px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            step === 2
              ? "border-brand bg-paper"
              : step > 2
                ? "border-navy bg-soft/30 hover:bg-soft/60"
                : "border-line text-muted",
          )}
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
              step === 2
                ? "bg-brand text-white"
                : step > 2
                  ? "bg-navy text-white"
                  : "bg-soft text-muted",
            )}
          >
            02
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.1em] text-muted uppercase">
              Passo 2
            </div>
            <div className="truncate text-[13.5px] font-bold text-ink">
              Conferir Padrão
            </div>
          </div>
        </button>

        <button
          type="button"
          disabled={!company || !draft}
          onClick={() => company && draft && setStep(3)}
          className={cn(
            "flex items-center gap-3 rounded-[8px] border-t-2 px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            step === 3 ? "border-brand bg-paper" : "border-line text-muted hover:bg-soft/40",
          )}
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
              step === 3 ? "bg-brand text-white" : "bg-soft text-muted",
            )}
          >
            03
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold tracking-[0.1em] text-muted uppercase">
              Passo 3
            </div>
            <div className="truncate text-[13.5px] font-bold text-ink">
              Proposta Pronta
            </div>
          </div>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* PASSO 1: ESCOLHER O CLIENTE                                           */}
      {/* ===================================================================== */}
      {step === 1 && (
        <Card className="overflow-hidden border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
            <div>
              <div className="text-[11px] font-extrabold tracking-[0.12em] text-brand uppercase">
                Passo 01 · Selecionar Conta
              </div>
              <h2 className="mt-0.5 text-[17px] font-bold tracking-tight text-ink">
                Para qual cliente vamos emitir a proposta padrão?
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-64 sm:w-72">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <Input
                  className="h-9 pl-8 text-[13px]"
                  placeholder="Buscar usina, cidade ou CNPJ…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setOnlyWithDeal((v) => !v)}
                className={cn(
                  "h-9 rounded-[6px] border px-3 text-[12px] font-semibold transition-colors",
                  onlyWithDeal
                    ? "border-navy bg-navy text-white"
                    : "border-line bg-white text-muted hover:text-ink",
                )}
              >
                Com negócio aberto
              </button>
            </div>
          </div>

          <div className="p-5">
            {companies.length === 0 ? (
              <div className="py-12 text-center text-[13.5px] text-muted">
                Nenhuma empresa encontrada para o filtro informado.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {companies.map((c) => {
                  const d = openDealOf(s, c.id);
                  const active = c.id === company?.id;
                  const ownerUser = s.users.find((u) => u.id === (d?.ownerId || c.ownerId));
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleChooseClient(c.id)}
                      className={cn(
                        "group flex flex-col justify-between rounded-[8px] border border-t-2 p-4 text-left transition-all hover:border-navy hover:bg-soft/40",
                        active
                          ? "border-navy border-t-brand bg-paper shadow-2xs"
                          : "border-line border-t-navy/60 bg-white",
                      )}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[14.5px] font-bold leading-snug text-ink group-hover:text-navy">
                            {c.nome}
                          </span>
                          {d && <StagePill deal={d} />}
                        </div>
                        <div className="text-[12px] text-muted">
                          {[c.cidade, c.uf].filter(Boolean).join(" / ") || c.regiao || "—"}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-2.5 text-[11.5px] text-muted">
                        <span>
                          {c.colhedoras != null ? `${c.colhedoras} colhedora(s)` : "Frota a mapear"}
                        </span>
                        <span className="font-semibold text-navy group-hover:translate-x-0.5 transition-transform">
                          Selecionar →
                        </span>
                      </div>
                      {ownerUser && (
                        <div className="mt-1 text-[11px] text-muted/80">
                          Consultor: {ownerUser.name}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ===================================================================== */}
      {/* PASSO 2: CONFERÊNCIA DO PADRÃO OFICIAL (BLOQUEADO PARA NÃO-ADMIN)     */}
      {/* ===================================================================== */}
      {step === 2 && company && draft && (
        <div className="space-y-5">
          {/* Barra superior da Etapa 2 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-5 py-3.5 shadow-2xs">
            <div className="flex items-center gap-3">
              <Button size="xs" variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft size={13} /> Trocar cliente
              </Button>
              <div>
                <div className="text-[11px] font-extrabold tracking-[0.1em] text-brand uppercase">
                  Cliente selecionado
                </div>
                <div className="text-[15px] font-bold text-ink">
                  {draft.cliente.nomeFantasia}{" "}
                  <span className="font-normal text-muted">({draft.cliente.cidadeUf || "—"})</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && !adminUnlocked && (
                <Button variant="outline" size="sm" onClick={() => setAdminUnlocked(true)}>
                  <ShieldCheck size={14} /> Editar Padrão (Admin)
                </Button>
              )}
              {isAdmin && adminUnlocked && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdminUnlocked(false)}
                  >
                    <Lock size={14} /> Bloquear novamente
                  </Button>
                  <Button
                    variant="dark"
                    size="sm"
                    disabled={savingStandard}
                    onClick={() => void saveAsOfficialStandard()}
                  >
                    <Save size={14} /> {savingStandard ? "Salvando…" : "Salvar Padrão Oficial"}
                  </Button>
                </>
              )}
              <Button variant="primary" size="sm" onClick={() => setStep(3)}>
                Gerar Proposta Pronta <ArrowRight size={14} />
              </Button>
            </div>
          </div>

          {/* Aviso de Governança / Travamento */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-[8px] border px-4 py-3 text-[12.5px]",
              canEditStandard
                ? "border-warn/40 bg-warn-soft/50 text-ink"
                : "border-navy/20 bg-soft/60 text-ink",
            )}
          >
            <div className="flex items-center gap-2.5">
              {canEditStandard ? (
                <Unlock size={16} className="shrink-0 text-warn" />
              ) : (
                <Lock size={16} className="shrink-0 text-navy" />
              )}
              <span>
                {canEditStandard ? (
                  <>
                    <strong>Modo Administrador ativo:</strong> você pode ajustar equipamentos, preços e condições e clicar em{" "}
                    <strong>&quot;Salvar Padrão Oficial&quot;</strong> para aplicar à toda a equipe.
                  </>
                ) : (
                  <>
                    <strong>Proposta Padrão Tawper:</strong> os equipamentos, valores, condições comerciais e textos são padronizados. Apenas um <strong>Administrador</strong> pode alterar o modelo padrão.
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Bloco 1: Cliente, Destinatário e Consultor */}
          <Card>
            <CardHeader
              kicker="1 · Identificação na Proposta"
              title="Cliente, Destinatário e Consultor Tawper"
              action={<Building2 size={16} className="text-navy-3" />}
            />
            <div className="space-y-4 border-t border-line/70 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Nome Fantasia">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.cliente.nomeFantasia}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        cliente: { ...cur.cliente, nomeFantasia: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Razão Social">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.cliente.razaoSocial}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        cliente: { ...cur.cliente, razaoSocial: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="CNPJ">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.cliente.cnpj}
                    placeholder="Conforme cadastro no CRM"
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        cliente: { ...cur.cliente, cnpj: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Cidade / UF">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.cliente.cidadeUf}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        cliente: { ...cur.cliente, cidadeUf: e.target.value },
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="grid gap-4 border-t border-line/60 pt-4 lg:grid-cols-2">
                {/* Destinatário no Cliente (Vendedor pode selecionar um contato já cadastrado no CRM) */}
                <div className="space-y-3 rounded-[8px] border border-line/80 bg-paper/60 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold tracking-[0.1em] text-navy-3 uppercase">
                      Destinatário Cadastrado (A/C)
                    </span>
                    {contacts.length > 0 && (
                      <select
                        value={activeContactId}
                        onChange={(e) => handleSelectContact(e.target.value)}
                        className="rounded border border-line bg-white px-2 py-1 text-[12px] font-semibold text-ink"
                      >
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome} {c.cargo ? `(${c.cargo})` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <Field label="Nome do Responsável">
                      <Input
                        disabled={!canEditStandard}
                        value={draft.cliente.contatoNome}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            cliente: { ...cur.cliente, contatoNome: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Cargo / Setor">
                      <Input
                        disabled={!canEditStandard}
                        value={draft.cliente.contatoCargo}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            cliente: { ...cur.cliente, contatoCargo: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="WhatsApp / Telefone">
                      <Input
                        disabled={!canEditStandard}
                        value={draft.cliente.contatoWhatsapp}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            cliente: { ...cur.cliente, contatoWhatsapp: e.target.value },
                          }))
                        }
                      />
                    </Field>
                  </div>
                </div>

                {/* Consultor Tawper */}
                <div className="space-y-3 rounded-[8px] border border-line/80 bg-paper/60 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold tracking-[0.1em] text-brand uppercase">
                      Consultor Responsável Tawper
                    </span>
                    {canEditStandard && (
                      <select
                        value={activeSellerId}
                        onChange={(e) => handleSelectSeller(e.target.value)}
                        className="rounded border border-line bg-white px-2 py-1 text-[12px] font-medium text-ink"
                      >
                        {sellers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <Field label="Consultor">
                      <Input
                        disabled={!canEditStandard}
                        value={draft.vendedor.nome}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            vendedor: { ...cur.vendedor, nome: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Cargo">
                      <Input
                        disabled={!canEditStandard}
                        value={draft.vendedor.cargo}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            vendedor: { ...cur.vendedor, cargo: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="WhatsApp Comercial">
                      <Input
                        disabled={!canEditStandard}
                        value={draft.vendedor.telefone}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            vendedor: { ...cur.vendedor, telefone: e.target.value },
                          }))
                        }
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Bloco 2: Frota do Cliente & Escopo Padrão Tawper */}
          <Card>
            <CardHeader
              kicker="2 · Diagnóstico Técnico e Escopo Padrão"
              title="Parque de Máquinas e Soluções Tawper"
              action={<Wrench size={16} className="text-navy-3" />}
            />
            <div className="space-y-4 border-t border-line/70 px-5 py-4">
              <div className="grid gap-3 rounded-[8px] border border-line bg-soft/35 p-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Qtd. Colhedoras / Máquinas">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.frota.colhedoras}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        frota: { ...cur.frota, colhedoras: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Modelos dos Equipamentos">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.frota.modelos}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        frota: { ...cur.frota, modelos: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Sistema de Prensa">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.frota.prensa}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        frota: { ...cur.frota, prensa: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Marca / Fornecedor Atual">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.frota.marcaAtual}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        frota: { ...cur.frota, marcaAtual: e.target.value },
                      }))
                    }
                  />
                </Field>
              </div>

              {canEditStandard && (
                <div>
                  <div className="label mb-2">Adicionar equipamento ou solução padrão (Somente Admin)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PROPOSAL_EQUIPMENT_PRESETS.map((preset) => (
                      <Button
                        key={preset.key}
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => addPresetItem(preset)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    <Button type="button" size="xs" variant="ghost" onClick={() => addPresetItem()}>
                      <Plus size={12} /> Item personalizado
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                {draft.itens.map((item, idx) => (
                  <div key={item.id} className="rounded-[8px] border border-line bg-paper/60 p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge tone="navy">Item {String(idx + 1).padStart(2, "0")}</Badge>
                      {canEditStandard && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-brand"
                        >
                          <Trash2 size={13} /> Remover
                        </button>
                      )}
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_90px_90px_130px]">
                      <Field label="Equipamento / Solução">
                        <Input
                          disabled={!canEditStandard}
                          value={item.equipamento}
                          onChange={(e) => updateItem(item.id, { equipamento: e.target.value })}
                        />
                      </Field>
                      <Field label="Modalidade">
                        <Select
                          disabled={!canEditStandard}
                          value={item.modalidade}
                          onChange={(e) =>
                            updateItem(item.id, { modalidade: e.target.value as ProposalMode })
                          }
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
                          disabled={!canEditStandard}
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
                          disabled={!canEditStandard}
                          value={item.unidade}
                          onChange={(e) => updateItem(item.id, { unidade: e.target.value })}
                        />
                      </Field>
                      <Field label="Valor Unit. (R$)">
                        <Input
                          type="number"
                          min={0}
                          step="100"
                          disabled={!canEditStandard || item.modalidade === "cortesia" || !draft.termos.mostrarValores}
                          value={item.modalidade === "cortesia" ? 0 : item.valorUnitario}
                          onChange={(e) =>
                            updateItem(item.id, {
                              valorUnitario: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-2">
                      <Field label="Especificação técnica / Aplicação">
                        <Input
                          disabled={!canEditStandard}
                          value={item.especificacao}
                          onChange={(e) => updateItem(item.id, { especificacao: e.target.value })}
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Bloco 3: Condições Comerciais Padrão */}
          <Card>
            <CardHeader
              kicker="3 · Termos e Condições Padronizadas"
              title="Condições Comerciais Oficiais"
              action={<UserRound size={16} className="text-brand" />}
            />
            <div className="space-y-4 border-t border-line/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[8px] border border-line bg-soft/45 px-4 py-3">
                <div className="flex flex-wrap items-center gap-5">
                  {canEditStandard ? (
                    <Checkbox
                      checked={draft.termos.mostrarValores}
                      onChange={(on) =>
                        patchDraft((cur) => ({
                          ...cur,
                          termos: { ...cur.termos, mostrarValores: on },
                        }))
                      }
                      label="Exibir valores financeiros (R$) na proposta"
                      sub="Somente Administrador define política de preço aberto/comodato"
                    />
                  ) : (
                    <div className="text-[12.5px] font-semibold text-ink">
                      Política de exibição de preço:{" "}
                      <span className="text-navy">
                        {draft.termos.mostrarValores
                          ? "Com valores comerciais (R$)"
                          : "Modelo técnico / Comodato (sem preço aberto)"}
                      </span>
                    </div>
                  )}

                  {draft.termos.mostrarValores && canEditStandard && (
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
                            termos: {
                              ...cur.termos,
                              descontoPct: Math.max(0, Math.min(90, Number(e.target.value) || 0)),
                            },
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
                    <div className="text-[18px] font-bold tabular-nums text-navy">
                      Total: {money(totals.total)}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Nº da Proposta">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.termos.numero}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        termos: { ...cur.termos, numero: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Validade (dias)">
                  <Input
                    disabled={!canEditStandard}
                    type="number"
                    min={1}
                    max={180}
                    value={draft.termos.validadeDias}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        termos: {
                          ...cur.termos,
                          validadeDias: Math.max(1, Number(e.target.value) || 15),
                        },
                      }))
                    }
                  />
                </Field>
                <Field label="Condição de Pagamento">
                  <Select
                    disabled={!canEditStandard}
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
                    <option value="Comodato mediante consumo mínimo">
                      Comodato mediante consumo mínimo
                    </option>
                  </Select>
                </Field>
                <Field label="Frete / Entrega">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.termos.frete}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        termos: { ...cur.termos, frete: e.target.value },
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prazo de Entrega / Implantação">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.termos.prazoEntrega}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        termos: { ...cur.termos, prazoEntrega: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Observações Padrão da Proposta">
                  <Input
                    disabled={!canEditStandard}
                    value={draft.termos.observacoes}
                    onChange={(e) =>
                      patchDraft((cur) => ({
                        ...cur,
                        termos: { ...cur.termos, observacoes: e.target.value },
                      }))
                    }
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft size={14} /> Escolher outro cliente
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  {canEditStandard && (
                    <Button
                      variant="dark"
                      disabled={savingStandard}
                      onClick={() => void saveAsOfficialStandard()}
                    >
                      <Save size={14} /> {savingStandard ? "Salvando…" : "Salvar Padrão Oficial"}
                    </Button>
                  )}
                  <Button variant="primary" onClick={() => setStep(3)}>
                    Finalizar e Gerar Proposta Pronta <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PASSO 3: PROPOSTA PRONTA (SEM POLUIÇÃO VISUAL, SÓ AÇÕES DIRETAS)      */}
      {/* ===================================================================== */}
      {step === 3 && company && draft && totals && (
        <div className="mx-auto max-w-3xl space-y-5">
          <Card className="overflow-hidden border-line bg-white shadow-sm">
            {/* Cabeçalho Editorial de Proposta Pronta */}
            <div className="border-t-4 border-brand bg-navy px-6 py-6 text-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-extrabold tracking-[0.14em] text-white/85 uppercase">
                  <CheckCircle2 size={15} className="text-brand" />
                  Proposta Oficial Pronta · {draft.termos.numero}
                </span>
                <span className="text-[12px] text-white/75">
                  Validade: {draft.termos.validadeDias} dias
                </span>
              </div>
              <h2 className="mt-2 text-[24px] font-extrabold tracking-tight">
                {draft.cliente.nomeFantasia}
              </h2>
              <p className="mt-1 text-[13.5px] text-white/80">
                A/C {draft.cliente.contatoNome || "Responsável"}
                {draft.cliente.contatoCargo ? ` (${draft.cliente.contatoCargo})` : ""} ·{" "}
                {draft.cliente.cidadeUf || "—"} · Consultor Tawper:{" "}
                <strong className="text-white">{draft.vendedor.nome}</strong>
              </p>
            </div>

            {/* Resumo Limpo das Informações Alinhadas */}
            <div className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="border-t-2 border-navy pt-2.5">
                  <div className="text-[10.5px] font-extrabold tracking-[0.12em] text-brand uppercase">
                    01 · Frota Mapeada
                  </div>
                  <div className="mt-1 text-[14.5px] font-bold text-ink">
                    {draft.frota.colhedoras || "—"} máquina(s)
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {draft.frota.modelos || "Frota agroindustrial"} · Prensa: {draft.frota.prensa || "Padrão Tawper"}
                  </div>
                </div>

                <div className="border-t-2 border-navy pt-2.5">
                  <div className="text-[10.5px] font-extrabold tracking-[0.12em] text-brand uppercase">
                    02 · Escopo Técnico
                  </div>
                  <div className="mt-1 text-[14.5px] font-bold text-ink">
                    {draft.itens.length} item(ns) padrão Tawper
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    Apresentação oficial + Rastreabilidade HydraSense
                  </div>
                </div>

                <div className="border-t-2 border-navy pt-2.5">
                  <div className="text-[10.5px] font-extrabold tracking-[0.12em] text-brand uppercase">
                    03 · Condição Comercial
                  </div>
                  <div className="mt-1 text-[15.5px] font-extrabold tabular-nums text-navy">
                    {draft.termos.mostrarValores ? money(totals.total) : "Comodato & Fornecimento"}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {draft.termos.condicaoPagamento} · {draft.termos.frete}
                  </div>
                </div>
              </div>

              {/* Lista enxuta dos itens incluídos */}
              <div className="rounded-[8px] border border-line bg-paper p-4">
                <div className="mb-2.5 text-[11px] font-extrabold tracking-[0.1em] text-navy-3 uppercase">
                  Itens da proposta oficial
                </div>
                <ul className="divide-y divide-line/60 text-[13px]">
                  {draft.itens.map((it, idx) => (
                    <li key={it.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <span className="mr-2 font-bold text-brand">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="font-semibold text-ink">{it.equipamento}</span>
                        <span className="ml-2 text-[11.5px] text-muted">
                          ({MODE_LABEL[it.modalidade]} · {it.qtd} {it.unidade})
                        </span>
                      </div>
                      {draft.termos.mostrarValores && (
                        <span className="shrink-0 font-bold tabular-nums text-ink">
                          {it.modalidade === "cortesia" || it.valorUnitario === 0
                            ? "Incluso"
                            : money(it.qtd * it.valorUnitario)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Botões Principais de Entrega */}
              <div className="grid gap-3 pt-2 sm:grid-cols-2">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={busyPdf}
                  onClick={() => void generatePdf("download")}
                  className="w-full justify-center"
                >
                  <Download size={16} /> {busyPdf ? "Gerando PDF…" : "Baixar Proposta em PDF"}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={printWidescreenProposal}
                  className="w-full justify-center"
                >
                  <Printer size={16} /> Imprimir Apresentação Comercial
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                    <ArrowLeft size={14} /> Voltar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyPdf}
                    onClick={() => void generatePdf("preview")}
                  >
                    <Eye size={14} /> Visualizar PDF
                  </Button>
                </div>

                <Button
                  variant={already ? "success" : "dark"}
                  size="sm"
                  disabled={!deal || already}
                  onClick={marcarEnviada}
                >
                  <Check size={14} /> {already ? "Proposta já marcada como enviada" : "Marcar como enviada no Funil"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Iframe oculto apenas para disparo de impressão widescreen quando solicitado */}
      <iframe
        ref={hiddenPrintFrameRef}
        title="Impressão da Proposta Tawper"
        className="pointer-events-none fixed -left-[9999px] top-0 h-[900px] w-[1600px] opacity-0"
      />

      {/* Modal de Pré-visualização Real do PDF */}
      {previewUrl && draft && (
        <Modal
          title={`Proposta Comercial · ${draft.termos.numero} (${draft.cliente.nomeFantasia})`}
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
