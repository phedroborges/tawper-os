"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCode2,
  Layers,
  Maximize2,
  Minimize2,
  Plus,
  Printer,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { StagePill } from "@/components/crm/crm";
import { Modal } from "@/components/ui/overlay";
import {
  Badge,
  Button,
  Card,
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
import {
  buildTawperPresentationDeck,
  type PresentationDeckMode,
} from "@/lib/tawper-presentation";
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

type EditorTab = "cliente" | "escopo" | "condicoes" | "consultor";

function PropostasInner() {
  const s = useStore();
  const user = useCurrentUser();
  const { toast } = useUI();
  const params = useSearchParams();
  const initialCompanyId = params.get("empresa");

  const [q, setQ] = useState("");
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(
    initialCompanyId ?? s.companies[0]?.id ?? null,
  );

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

  const company = useMemo(
    () => s.companies.find((c) => c.id === companyId) ?? companies[0] ?? s.companies[0],
    [s.companies, companies, companyId],
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

  // Presentation deck controls
  const [deckMode, setDeckMode] = useState<PresentationDeckMode>("executive");
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [expandedStage, setExpandedStage] = useState<boolean>(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("cliente");

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [busyPdf, setBusyPdf] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const logoCacheRef = useRef<Uint8Array | null>(null);

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

  const draft: ProposalDocumentInput | null = company
    ? (draftsByCompany[company.id] ?? baseDraft)
    : null;

  // Build the live Tawper HTML Presentation Deck (without raffle, personalized for the client)
  const deck = useMemo(() => {
    if (!draft) return null;
    return buildTawperPresentationDeck(draft, {
      mode: deckMode,
      baseUrl: "/apresentacao-tawper",
      initialSlideIndex: activeSlideIndex,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, deckMode]);

  // Listen to slide change events coming from inside the presentation iframe
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "TAWPER_DECK_SLIDE_CHANGE" && typeof data.index === "number") {
        setActiveSlideIndex(data.index);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const goToSlide = (idx: number) => {
    if (!deck) return;
    const clamped = Math.max(0, Math.min(deck.slides.length - 1, idx));
    setActiveSlideIndex(clamped);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "TAWPER_DECK_GOTO", index: clamped },
      "*",
    );
  };

  const jumpToCustomSlide = (customKey: "cover" | "diagnosis" | "scope" | "commercial" | "closing") => {
    if (!deck) return;
    const target = deck.slides.find((sl) => sl.customKey === customKey);
    if (target) {
      goToSlide(target.index);
    }
  };

  const sendDeckCommand = (type: "TAWPER_DECK_PRINT" | "TAWPER_DECK_OVERVIEW" | "TAWPER_DECK_NOTES" | "TAWPER_DECK_FULLSCREEN") => {
    iframeRef.current?.contentWindow?.postMessage({ type }, "*");
  };

  const patchDraft = (updater: (cur: ProposalDocumentInput) => ProposalDocumentInput) => {
    if (!company || !draft) return;
    setDraftsByCompany((prev) => ({
      ...prev,
      [company.id]: updater(draft),
    }));
  };

  const handleSelectCompany = (id: string) => {
    setCompanyId(id);
    setCompanyPickerOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleSelectContact = (contactId: string) => {
    if (!company) return;
    setSelectedContactIdByCompany((prev) => ({ ...prev, [company.id]: contactId }));
    const found = contacts.find((c) => c.id === contactId);
    if (!found) return;
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
    if (!company) return;
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
    jumpToCustomSlide("scope");
  };

  const downloadHtmlDeck = () => {
    if (!draft || !deck) return;
    // Build a version with absolute origin URL so assets work when opened locally while server runs
    const originBase = typeof window !== "undefined" ? `${window.location.origin}/apresentacao-tawper` : "/apresentacao-tawper";
    const exported = buildTawperPresentationDeck(draft, {
      mode: deckMode,
      baseUrl: originBase,
      initialSlideIndex: 0,
    });
    const blob = new Blob([exported.html], { type: "text/html;charset=utf-8" });
    const fileName = `Apresentacao-Proposta-${slugFileName(draft.termos.numero)}-${slugFileName(draft.cliente.nomeFantasia)}.html`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Apresentação HTML baixada", { sub: fileName });
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
        toast("PDF Executivo A4 baixado", { sub: fileName });
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
  const currentSlide = deck?.slides[activeSlideIndex] ?? deck?.slides[0];

  const handleSelectEditorTab = (tab: EditorTab) => {
    setEditorTab(tab);
    if (tab === "cliente") jumpToCustomSlide("diagnosis");
    else if (tab === "escopo") jumpToCustomSlide("scope");
    else if (tab === "condicoes") jumpToCustomSlide("commercial");
    else if (tab === "consultor") jumpToCustomSlide("closing");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        kicker="Apresentação Comercial Oficial · Proposta Personalizada"
        title="Proposta & Apresentação Comercial Tawper"
        subtitle="Apresentação comercial oficial da Tawper (sem sorteio) integrada ao diagnóstico de frota, escopo de equipamentos, condições comerciais e consultor responsável."
        actions={
          company && draft ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendDeckCommand("TAWPER_DECK_PRINT")}
                title="Imprimir ou salvar os slides 16:9 em PDF de alta definição"
              >
                <Printer size={14} /> PDF Apresentação (16:9)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadHtmlDeck}
                title="Baixar arquivo HTML da apresentação personalizada"
              >
                <FileCode2 size={14} /> Baixar HTML
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busyPdf}
                onClick={() => void generatePdf("preview")}
                title="Visualizar proposta formal em folha A4 para Compras"
              >
                <Eye size={14} /> {busyPdf ? "Gerando…" : "Folha A4 (Compras)"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busyPdf}
                onClick={() => void generatePdf("download")}
              >
                <Download size={14} /> Baixar PDF A4
              </Button>
              <Button
                variant={already ? "success" : "dark"}
                size="sm"
                disabled={!deal || already}
                onClick={marcarEnviada}
              >
                <Check size={14} /> {already ? "Proposta enviada" : "Marcar enviada"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Faixa Editorial de Resumo da Proposta (seguindo o Design System da Apresentação Tawper) */}
      {company && draft && totals && (
        <div className="rounded-[10px] border border-line bg-white p-4 shadow-2xs">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 01 · Cliente Selecionado */}
            <div className="border-t-2 border-brand pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold tracking-[0.12em] text-brand uppercase">
                  01 · Cliente & Destinatário
                </span>
                <button
                  type="button"
                  onClick={() => setCompanyPickerOpen(true)}
                  className="text-[11.5px] font-semibold text-navy-3 hover:underline"
                >
                  Trocar cliente ▾
                </button>
              </div>
              <div className="mt-1 truncate text-[16px] font-bold tracking-tight text-ink">
                {draft.cliente.nomeFantasia}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                A/C {draft.cliente.contatoNome || "Responsável"} · {draft.cliente.cidadeUf || "—"}
              </div>
            </div>

            {/* 02 · Frota & Operação */}
            <div className="border-t-2 border-navy pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold tracking-[0.12em] text-navy-3 uppercase">
                  02 · Frota & Oficina
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectEditorTab("escopo")}
                  className="text-[11.5px] font-semibold text-muted hover:text-ink"
                >
                  Editar frota
                </button>
              </div>
              <div className="mt-1 truncate text-[16px] font-bold tracking-tight text-ink">
                {draft.frota.colhedoras || "—"} colhedora(s) / máquinas
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                {draft.frota.modelos} · Prensa: {draft.frota.prensa}
              </div>
            </div>

            {/* 03 · Escopo & Investimento */}
            <div className="border-t-2 border-navy pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold tracking-[0.12em] text-navy-3 uppercase">
                  03 · Escopo & Investimento
                </span>
                <span className="text-[11.5px] font-semibold text-muted">
                  {draft.itens.length} item(ns)
                </span>
              </div>
              <div className="mt-1 truncate text-[16px] font-bold tracking-tight text-navy tabular-nums">
                {draft.termos.mostrarValores ? money(totals.total) : "Comodato & Fornecimento"}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                {draft.termos.condicaoPagamento} · {draft.termos.frete}
              </div>
            </div>

            {/* 04 · Consultor & Modo da Apresentação */}
            <div className="border-t-2 border-navy pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold tracking-[0.12em] text-navy-3 uppercase">
                  04 · Consultor & Formato
                </span>
                <span className="text-[11.5px] font-semibold text-muted">
                  {draft.termos.numero}
                </span>
              </div>
              <div className="mt-1 truncate text-[16px] font-bold tracking-tight text-ink">
                {draft.vendedor.nome}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                Validade: {draft.termos.validadeDias} dias · {deck?.slides.length ?? 0} slides ativos
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Principal: Palco da Apresentação Comercial 16:9 + Inspetor de Personalização */}
      {company && draft && deck && (
        <div
          className={cn(
            "grid gap-4 items-start",
            expandedStage
              ? "grid-cols-1"
              : "lg:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.85fr)]",
          )}
        >
          {/* COLUNA ESQUERDA: PALCO INTERATIVO DOS SLIDES HTML 1600x900 */}
          <Card className="overflow-hidden border-line bg-white">
            {/* Barra Superior do Palco: Seletor de Modo (Executiva vs Completa) + Atalhos de Capítulos */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-soft/45 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 inline-flex items-center gap-1.5 text-[11.5px] font-extrabold tracking-[0.08em] text-ink uppercase">
                  <span className="inline-block h-2.5 w-2.5 bg-brand" />
                  Deck Comercial
                </span>
                <div className="inline-flex rounded-[6px] border border-line bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDeckMode("executive");
                      setActiveSlideIndex(0);
                    }}
                    className={cn(
                      "rounded-[4px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                      deckMode === "executive"
                        ? "bg-navy text-white"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    Proposta Executiva (14 slides)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeckMode("complete");
                      setActiveSlideIndex(0);
                    }}
                    className={cn(
                      "rounded-[4px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                      deckMode === "complete"
                        ? "bg-navy text-white"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    Apresentação Completa (35 slides)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => sendDeckCommand("TAWPER_DECK_OVERVIEW")}
                  title="Ver grade com todos os slides"
                >
                  <Layers size={12} /> Grade de Slides
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => sendDeckCommand("TAWPER_DECK_FULLSCREEN")}
                  title="Apresentar em tela cheia (F)"
                >
                  <Maximize2 size={12} /> Tela Cheia
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setExpandedStage((v) => !v)}
                  title={expandedStage ? "Mostrar painel de edição ao lado" : "Expandir palco na largura total"}
                >
                  {expandedStage ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                  {expandedStage ? "Dividir tela" : "Expandir palco"}
                </Button>
              </div>
            </div>

            {/* Atalhos Rápidos para os Slides Personalizados do Cliente & Capítulos Core */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line/70 bg-paper px-4 py-2">
              <span className="text-[11px] font-bold tracking-wider text-muted uppercase mr-1">
                Ir direto para:
              </span>
              <button
                type="button"
                onClick={() => jumpToCustomSlide("cover")}
                className={cn(
                  "rounded-[5px] border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  currentSlide?.customKey === "cover"
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-white text-ink hover:bg-soft",
                )}
              >
                ✦ Capa do Cliente
              </button>
              <button
                type="button"
                onClick={() => jumpToCustomSlide("diagnosis")}
                className={cn(
                  "rounded-[5px] border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  currentSlide?.customKey === "diagnosis"
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-white text-ink hover:bg-soft",
                )}
              >
                ✦ Diagnóstico & Frota
              </button>
              <button
                type="button"
                onClick={() => jumpToCustomSlide("scope")}
                className={cn(
                  "rounded-[5px] border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  currentSlide?.customKey === "scope"
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-white text-ink hover:bg-soft",
                )}
              >
                ✦ Escopo & Equipamentos ({draft.itens.length})
              </button>
              <button
                type="button"
                onClick={() => jumpToCustomSlide("commercial")}
                className={cn(
                  "rounded-[5px] border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  currentSlide?.customKey === "commercial"
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-white text-ink hover:bg-soft",
                )}
              >
                ✦ Investimento & Condições
              </button>
              <button
                type="button"
                onClick={() => jumpToCustomSlide("closing")}
                className={cn(
                  "rounded-[5px] border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  currentSlide?.customKey === "closing"
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line bg-white text-ink hover:bg-soft",
                )}
              >
                ✦ Contato & Aceite
              </button>
            </div>

            {/* Palco 16:9 Renderizando o HTML Oficial da Apresentação Tawper */}
            <div className="relative aspect-video w-full bg-[#0c101a]">
              <iframe
                ref={iframeRef}
                srcDoc={deck.html}
                title={`Apresentação Comercial Tawper · ${draft.cliente.nomeFantasia}`}
                className="h-full w-full border-0"
              />
            </div>

            {/* Barra Inferior de Navegação Rápida por Todos os Slides do Deck */}
            <div className="border-t border-line bg-white px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={activeSlideIndex <= 0}
                    onClick={() => goToSlide(activeSlideIndex - 1)}
                  >
                    <ChevronLeft size={13} /> Anterior
                  </Button>
                  <span className="text-[12px] font-bold tabular-nums text-ink">
                    Slide {String(activeSlideIndex + 1).padStart(2, "0")} de {String(deck.slides.length).padStart(2, "0")}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={activeSlideIndex >= deck.slides.length - 1}
                    onClick={() => goToSlide(activeSlideIndex + 1)}
                  >
                    Próximo <ChevronRight size={13} />
                  </Button>
                  {currentSlide && (
                    <span className="ml-2 hidden truncate text-[12px] text-muted sm:inline">
                      <strong className="text-ink">{currentSlide.chapter}:</strong> {currentSlide.title}
                    </span>
                  )}
                </div>
                {currentSlide?.isCustom && (
                  <Badge tone="red">
                    <Sparkles size={11} /> Slide Personalizado do Cliente
                  </Badge>
                )}
              </div>

              {/* Carrossel Horizontal de Slides */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {deck.slides.map((sl) => {
                  const isCurrent = sl.index === activeSlideIndex;
                  return (
                    <button
                      key={sl.id}
                      type="button"
                      onClick={() => goToSlide(sl.index)}
                      className={cn(
                        "flex min-w-[155px] max-w-[175px] shrink-0 flex-col justify-between rounded-[6px] border p-2 text-left transition-all",
                        isCurrent
                          ? "border-navy bg-soft ring-1 ring-navy/25"
                          : "border-line/80 bg-paper/60 hover:bg-soft/60",
                        sl.isCustom && "border-t-2 border-t-brand",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            "text-[10.5px] font-extrabold tracking-wider uppercase",
                            sl.isCustom ? "text-brand" : "text-navy-3",
                          )}
                        >
                          {String(sl.index + 1).padStart(2, "0")} · {sl.isCustom ? "Proposta" : sl.chapter}
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11.5px] font-semibold leading-snug text-ink">
                        {sl.title}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* COLUNA DIREITA: PERSONALIZADOR INTEGRADO EM 4 ABAS EDITORIAIS */}
          <Card className="overflow-hidden border-line bg-white">
            {/* Abas do Personalizador */}
            <div className="grid grid-cols-4 border-b border-line bg-soft/50">
              <button
                type="button"
                onClick={() => handleSelectEditorTab("cliente")}
                className={cn(
                  "flex flex-col items-start border-b-2 px-3 py-2.5 text-left transition-colors",
                  editorTab === "cliente"
                    ? "border-brand bg-white text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                <span className="text-[10px] font-extrabold tracking-[0.12em] text-brand uppercase">
                  01 · Conta
                </span>
                <span className="mt-0.5 text-[12.5px] font-bold">Cliente</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectEditorTab("escopo")}
                className={cn(
                  "flex flex-col items-start border-b-2 px-3 py-2.5 text-left transition-colors",
                  editorTab === "escopo"
                    ? "border-brand bg-white text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                <span className="text-[10px] font-extrabold tracking-[0.12em] text-brand uppercase">
                  02 · Frota
                </span>
                <span className="mt-0.5 text-[12.5px] font-bold">Escopo ({draft.itens.length})</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectEditorTab("condicoes")}
                className={cn(
                  "flex flex-col items-start border-b-2 px-3 py-2.5 text-left transition-colors",
                  editorTab === "condicoes"
                    ? "border-brand bg-white text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                <span className="text-[10px] font-extrabold tracking-[0.12em] text-brand uppercase">
                  03 · Termos
                </span>
                <span className="mt-0.5 text-[12.5px] font-bold">Condições</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectEditorTab("consultor")}
                className={cn(
                  "flex flex-col items-start border-b-2 px-3 py-2.5 text-left transition-colors",
                  editorTab === "consultor"
                    ? "border-brand bg-white text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                <span className="text-[10px] font-extrabold tracking-[0.12em] text-brand uppercase">
                  04 · Equipe
                </span>
                <span className="mt-0.5 text-[12.5px] font-bold">Consultor</span>
              </button>
            </div>

            {/* Conteúdo da Aba Ativa */}
            <div className="p-4">
              {/* ABA 1: CLIENTE & DESTINATÁRIO */}
              {editorTab === "cliente" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-2.5">
                    <div>
                      <div className="text-[11px] font-extrabold tracking-[0.1em] text-brand uppercase">
                        Personalização da Capa e Diagnóstico
                      </div>
                      <div className="text-[14px] font-bold text-ink">
                        Dados do Cliente e Interlocutor
                      </div>
                    </div>
                    <Button size="xs" variant="outline" onClick={() => setCompanyPickerOpen(true)}>
                      <Building2 size={12} /> Trocar empresa
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome Fantasia (Destaque nos slides)" required>
                      <Input
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
                        value={draft.cliente.cnpj}
                        placeholder="00.000.000/0001-00"
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
                        value={draft.cliente.cidadeUf}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            cliente: { ...cur.cliente, cidadeUf: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Endereço da Unidade">
                      <Input
                        value={draft.cliente.endereco}
                        placeholder="Rodovia, Km, Distrito…"
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            cliente: { ...cur.cliente, endereco: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="CEP">
                      <Input
                        value={draft.cliente.cep}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            cliente: { ...cur.cliente, cep: e.target.value },
                          }))
                        }
                      />
                    </Field>
                  </div>

                  <div className="border-t border-line/70 pt-3">
                    {contacts.length > 0 && (
                      <div className="mb-3">
                        <Field label="Puxar contato cadastrado da empresa">
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

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Destinatário (A/C)" required>
                        <Input
                          value={draft.cliente.contatoNome}
                          placeholder="Nome do gestor / comprador"
                          onChange={(e) =>
                            patchDraft((cur) => ({
                              ...cur,
                              cliente: { ...cur.cliente, contatoNome: e.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Cargo / Departamento">
                        <Input
                          value={draft.cliente.contatoCargo}
                          placeholder="Ex.: Gerente de Manutenção"
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
                          placeholder="contato@usina.com.br"
                          onChange={(e) =>
                            patchDraft((cur) => ({
                              ...cur,
                              cliente: { ...cur.cliente, contatoEmail: e.target.value },
                            }))
                          }
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-3">
                    <Button size="xs" variant="outline" onClick={() => jumpToCustomSlide("cover")}>
                      Ver Slide de Capa
                    </Button>
                    <Button size="xs" variant="primary" onClick={() => handleSelectEditorTab("escopo")}>
                      Próximo: Frota & Escopo →
                    </Button>
                  </div>
                </div>
              )}

              {/* ABA 2: FROTA & ESCOPO TÉCNICO */}
              {editorTab === "escopo" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-2.5">
                    <div>
                      <div className="text-[11px] font-extrabold tracking-[0.1em] text-brand uppercase">
                        Parque de Máquinas e Soluções
                      </div>
                      <div className="text-[14px] font-bold text-ink">
                        Frota Mapeada e Escopo da Proposta
                      </div>
                    </div>
                    <Wrench size={16} className="text-navy-3" />
                  </div>

                  {/* Dados técnicos da Frota */}
                  <div className="grid gap-2.5 rounded-[8px] border border-line bg-paper p-3 sm:grid-cols-2">
                    <Field label="Qtd. Colhedoras / Máquinas">
                      <Input
                        value={draft.frota.colhedoras}
                        placeholder="Ex.: 18"
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            frota: { ...cur.frota, colhedoras: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Modelos da Frota">
                      <Input
                        value={draft.frota.modelos}
                        placeholder="Case A8800, John Deere CH570"
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
                        value={draft.frota.prensa}
                        placeholder="Comodato Tawper / Própria"
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
                        value={draft.frota.marcaAtual}
                        placeholder="Ex.: Parker, Gates…"
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            frota: { ...cur.frota, marcaAtual: e.target.value },
                          }))
                        }
                      />
                    </Field>
                  </div>

                  {/* Presets de equipamentos */}
                  <div>
                    <div className="label mb-1.5">Adicionar solução Tawper ao escopo</div>
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

                  {/* Itens editáveis */}
                  <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
                    {draft.itens.map((item, idx) => (
                      <div key={item.id} className="rounded-[8px] border border-line bg-paper/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold tracking-[0.1em] text-brand uppercase">
                            Item {String(idx + 1).padStart(2, "0")}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-brand"
                          >
                            <Trash2 size={12} /> Remover
                          </button>
                        </div>

                        <div className="space-y-2">
                          <Field label="Equipamento / Conjunto">
                            <Input
                              value={item.equipamento}
                              onChange={(e) => updateItem(item.id, { equipamento: e.target.value })}
                            />
                          </Field>

                          <div className="grid grid-cols-3 gap-2">
                            <Field label="Modalidade">
                              <Select
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
                            <Field label={`Qtd. (${item.unidade})`}>
                              <Input
                                type="number"
                                min={1}
                                value={item.qtd}
                                onChange={(e) =>
                                  updateItem(item.id, { qtd: Math.max(1, Number(e.target.value) || 1) })
                                }
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
                                  updateItem(item.id, {
                                    valorUnitario: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                              />
                            </Field>
                          </div>

                          <Field label="Especificação técnica">
                            <Input
                              value={item.especificacao}
                              onChange={(e) => updateItem(item.id, { especificacao: e.target.value })}
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-3">
                    <Button size="xs" variant="outline" onClick={() => jumpToCustomSlide("diagnosis")}>
                      Ver Diagnóstico
                    </Button>
                    <Button size="xs" variant="primary" onClick={() => handleSelectEditorTab("condicoes")}>
                      Próximo: Condições & Valores →
                    </Button>
                  </div>
                </div>
              )}

              {/* ABA 3: CONDIÇÕES COMERCIAIS E INVESTIMENTO */}
              {editorTab === "condicoes" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-2.5">
                    <div>
                      <div className="text-[11px] font-extrabold tracking-[0.1em] text-brand uppercase">
                        Investimento, Prazos e Diretrizes
                      </div>
                      <div className="text-[14px] font-bold text-ink">
                        Condições Comerciais da Proposta
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[8px] border border-line bg-paper p-3 space-y-3">
                    <Checkbox
                      checked={draft.termos.mostrarValores}
                      onChange={(on) =>
                        patchDraft((cur) => ({
                          ...cur,
                          termos: { ...cur.termos, mostrarValores: on },
                        }))
                      }
                      label="Exibir valores em R$ nos slides e no PDF"
                      sub="Desmarque para apresentar no modelo técnico / comodato sem preço aberto"
                    />

                    {draft.termos.mostrarValores && totals && (
                      <div className="flex items-center justify-between gap-3 border-t border-line/70 pt-2.5">
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="font-semibold text-muted">Desconto (%):</span>
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
                        <div className="text-right">
                          <div className="text-[11px] text-muted">Total nos slides</div>
                          <div className="text-[17px] font-extrabold tabular-nums text-navy">
                            {money(totals.total)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nº da Proposta">
                      <Input
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
                  </div>

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
                      <option value="Comodato mediante consumo mínimo">
                        Comodato mediante consumo mínimo
                      </option>
                    </Select>
                  </Field>

                  <Field label="Frete / Logística">
                    <Input
                      value={draft.termos.frete}
                      onChange={(e) =>
                        patchDraft((cur) => ({
                          ...cur,
                          termos: { ...cur.termos, frete: e.target.value },
                        }))
                      }
                    />
                  </Field>

                  <Field label="Prazo de Entrega e Implantação">
                    <Input
                      value={draft.termos.prazoEntrega}
                      onChange={(e) =>
                        patchDraft((cur) => ({
                          ...cur,
                          termos: { ...cur.termos, prazoEntrega: e.target.value },
                        }))
                      }
                    />
                  </Field>

                  <Field label="Diretriz Técnica / Observações para o Cliente">
                    <Textarea
                      rows={3}
                      value={draft.termos.observacoes}
                      onChange={(e) =>
                        patchDraft((cur) => ({
                          ...cur,
                          termos: { ...cur.termos, observacoes: e.target.value },
                        }))
                      }
                    />
                  </Field>

                  <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-3">
                    <Button size="xs" variant="outline" onClick={() => jumpToCustomSlide("commercial")}>
                      Ver Slide de Investimento
                    </Button>
                    <Button size="xs" variant="primary" onClick={() => handleSelectEditorTab("consultor")}>
                      Próximo: Consultor →
                    </Button>
                  </div>
                </div>
              )}

              {/* ABA 4: CONSULTOR TAWPER & EXPORTAÇÃO */}
              {editorTab === "consultor" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2 border-b border-line/70 pb-2.5">
                    <div>
                      <div className="text-[11px] font-extrabold tracking-[0.1em] text-brand uppercase">
                        Slide de Fechamento e Assinatura
                      </div>
                      <div className="text-[14px] font-bold text-ink">
                        Consultor Responsável Tawper
                      </div>
                    </div>
                    <UserRound size={16} className="text-brand" />
                  </div>

                  <Field label="Selecionar consultor da equipe">
                    <Select value={activeSellerId} onChange={(e) => handleSelectSeller(e.target.value)}>
                      {sellers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role})
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome na apresentação" required>
                      <Input
                        value={draft.vendedor.nome}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            vendedor: { ...cur.vendedor, nome: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Cargo / Função">
                      <Input
                        value={draft.vendedor.cargo}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            vendedor: { ...cur.vendedor, cargo: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="WhatsApp / Telefone">
                      <Input
                        value={draft.vendedor.telefone}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            vendedor: { ...cur.vendedor, telefone: e.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="E-mail comercial">
                      <Input
                        value={draft.vendedor.email}
                        onChange={(e) =>
                          patchDraft((cur) => ({
                            ...cur,
                            vendedor: { ...cur.vendedor, email: e.target.value },
                          }))
                        }
                      />
                    </Field>
                  </div>

                  <div className="rounded-[8px] border border-line bg-paper p-3 space-y-2.5">
                    <div className="text-[11px] font-extrabold tracking-[0.1em] text-navy-3 uppercase">
                      Exportação da Proposta Comercial
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => sendDeckCommand("TAWPER_DECK_PRINT")}
                      >
                        <Printer size={14} /> Imprimir Slides PDF (16:9)
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadHtmlDeck}>
                        <FileCode2 size={14} /> Baixar Apresentação HTML
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyPdf}
                        onClick={() => void generatePdf("preview")}
                      >
                        <Eye size={14} /> Visualizar PDF A4
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyPdf}
                        onClick={() => void generatePdf("download")}
                      >
                        <Download size={14} /> Baixar PDF A4
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Modal de Seleção de Empresa do CRM */}
      {companyPickerOpen && (
        <Modal
          title="Selecionar Cliente para a Proposta Comercial"
          onClose={() => setCompanyPickerOpen(false)}
          size="md"
        >
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <Input
                className="pl-8"
                placeholder="Buscar por nome da usina/empresa, cidade ou CNPJ…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <ul className="max-h-[55vh] divide-y divide-line/60 overflow-y-auto rounded-[8px] border border-line">
              {companies.length === 0 && (
                <li className="px-4 py-8 text-center text-[13px] text-muted">
                  Nenhuma empresa encontrada.
                </li>
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
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-soft/60",
                        active && "bg-soft font-semibold",
                      )}
                    >
                      <div>
                        <div className="text-[13.5px] font-semibold text-ink">{c.nome}</div>
                        <div className="text-[12px] text-muted">
                          {[c.cidade, c.uf].filter(Boolean).join("/") || c.regiao || "—"}
                          {c.colhedoras != null ? ` · ${c.colhedoras} colhedora(s)` : ""}
                        </div>
                      </div>
                      {d && <StagePill deal={d} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Modal>
      )}

      {/* Modal de Pré-visualização Real do PDF A4 */}
      {previewUrl && draft && (
        <Modal
          title={`PDF Executivo A4 · ${draft.termos.numero} (${draft.cliente.nomeFantasia})`}
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
                <Download size={14} /> Baixar PDF A4
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
