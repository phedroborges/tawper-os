"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FileUp,
  Lock,
  Maximize2,
  Printer,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
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
  Textarea,
} from "@/components/ui/primitives";
import { DEFAULT_PROPOSAL_STANDARD, type ProposalStandardConfig } from "@/lib/config";
import { papelRotulo } from "@/lib/constants";
import {
  buildInitialProposalInput,
  buildProposalPdfBytes,
  defaultSellerEmail,
  type ProposalBudgetMeta,
  type ProposalDocumentInput,
} from "@/lib/proposal";
import { openDealOf, visibleCompanies } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { buildTawperPresentationDeck } from "@/lib/tawper-presentation";
import type { Quote } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn, normalize } from "@/lib/utils";

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
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return undefined;
  }
}

async function loadCompressedJpgBytes(urlPath: string, maxWidth = 1050): Promise<Uint8Array | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Falha ao carregar ${urlPath}`));
      img.src = urlPath;
    });
    const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#141d35";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const jpgBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.78));
    if (!jpgBlob) return undefined;
    return new Uint8Array(await jpgBlob.arrayBuffer());
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

interface ParsedErpResponse {
  ok: boolean;
  usedAi?: boolean;
  fileName?: string;
  pageCount?: number;
  numeroOrcamento?: string;
  valorTotal?: number | null;
  condicaoDetectada?: string | null;
  resumoExecutivo?: string;
  destaques?: string[];
  error?: string;
}

interface PdfAssetBundle {
  logoPngBytes?: Uint8Array | null;
  capaHeroBytes?: Uint8Array | null;
  reliabilityBytes?: Uint8Array | null;
  terminaisBytes?: Uint8Array | null;
  coresBytes?: Uint8Array | null;
  prensaBytes?: Uint8Array | null;
  hydrasenseBytes?: Uint8Array | null;
}

function PropostasInner() {
  const s = useStore();
  const user = useCurrentUser();
  const { toast } = useUI();
  const params = useSearchParams();
  const initialCompanyId = params.get("empresa");

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
    () =>
      s.users.filter(
        (u) =>
          u.role === "vendedor" ||
          u.role === "representante" ||
          u.role === "gestor" ||
          u.role === "admin" ||
          u.id === company?.ownerId,
      ),
    [s.users, company?.ownerId],
  );

  const [draftOverridesByCompany, setDraftOverridesByCompany] = useState<Record<string, ProposalDocumentInput>>({});
  const [selectedContactIdByCompany, setSelectedContactIdByCompany] = useState<Record<string, string>>({});
  const [selectedSellerIdByCompany, setSelectedSellerIdByCompany] = useState<Record<string, string>>({});
  const [erpFileByCompany, setErpFileByCompany] = useState<
    Record<string, { file: File; bytes: Uint8Array; usedAi: boolean } | undefined>
  >({});
  const [erpMetaByCompany, setErpMetaByCompany] = useState<Record<string, Partial<ProposalBudgetMeta> | undefined>>({});
  const [termsOverrideByCompany, setTermsOverrideByCompany] = useState<
    Record<string, Partial<ProposalDocumentInput["termos"]> | undefined>
  >({});

  const [readingErp, setReadingErp] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  const assetCacheRef = useRef<PdfAssetBundle | null>(null);
  const erpInputRef = useRef<HTMLInputElement | null>(null);
  const deckFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && typeof data === "object" && data.type === "TAWPER_DECK_SLIDE_CHANGE" && typeof data.index === "number") {
        setActiveSlideIndex(data.index);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const activeContactId = company
    ? selectedContactIdByCompany[company.id] ?? contacts[0]?.id ?? ""
    : "";
  const activeContact = contacts.find((c) => c.id === activeContactId) ?? contacts[0];

  const activeSellerId = company
    ? selectedSellerIdByCompany[company.id] ?? deal?.ownerId ?? company.ownerId ?? user.id
    : user.id;
  const activeSeller = s.users.find((u) => u.id === activeSellerId) ?? user;

  const standard = useMemo<ProposalStandardConfig>(() => {
    const raw = s.config.proposalStandard;
    if (!raw) return DEFAULT_PROPOSAL_STANDARD;
    return {
      ...DEFAULT_PROPOSAL_STANDARD,
      ...raw,
      condicoesPagamento: raw.condicoesPagamento?.length
        ? raw.condicoesPagamento
        : DEFAULT_PROPOSAL_STANDARD.condicoesPagamento,
      validadesDias: raw.validadesDias?.length
        ? raw.validadesDias
        : DEFAULT_PROPOSAL_STANDARD.validadesDias,
      opcoesFrete: raw.opcoesFrete?.length
        ? raw.opcoesFrete
        : DEFAULT_PROPOSAL_STANDARD.opcoesFrete,
      opcoesEntrega: raw.opcoesEntrega?.length
        ? raw.opcoesEntrega
        : DEFAULT_PROPOSAL_STANDARD.opcoesEntrega,
    };
  }, [s.config.proposalStandard]);

  const baseDraft = useMemo(() => {
    if (!company) return null;
    const base = buildInitialProposalInput({
      company,
      contact: activeContact ?? null,
      contacts,
      owner: activeSeller,
      deal,
      standard,
    });
    const erpMeta = erpMetaByCompany[company.id];
    const termsOver = termsOverrideByCompany[company.id];
    return {
      ...base,
      orcamento: erpMeta ? { ...base.orcamento, ...erpMeta } : base.orcamento,
      termos: termsOver ? { ...base.termos, ...termsOver } : base.termos,
    };
  }, [company, activeContact, contacts, activeSeller, deal, standard, erpMetaByCompany, termsOverrideByCompany]);

  const draft: ProposalDocumentInput | null = useMemo(() => {
    if (!company || !baseDraft) return null;
    if (!canEditStandard) return baseDraft;
    const custom = draftOverridesByCompany[company.id];
    if (!custom) return baseDraft;
    return {
      ...custom,
      orcamento: erpMetaByCompany[company.id]
        ? { ...custom.orcamento, ...erpMetaByCompany[company.id] }
        : custom.orcamento,
      termos: termsOverrideByCompany[company.id]
        ? { ...custom.termos, ...termsOverrideByCompany[company.id] }
        : custom.termos,
    };
  }, [company, baseDraft, canEditStandard, draftOverridesByCompany, erpMetaByCompany, termsOverrideByCompany]);

  const builtDeck = useMemo(() => {
    if (!draft) return null;
    return buildTawperPresentationDeck(draft, {
      mode: "executive",
      baseUrl: "/apresentacao-tawper",
      initialSlideIndex: 0,
    });
  }, [draft]);

  const patchDraft = (updater: (cur: ProposalDocumentInput) => ProposalDocumentInput) => {
    if (!canEditStandard || !company || !draft) return;
    setDraftOverridesByCompany((prev) => ({
      ...prev,
      [company.id]: updater(draft),
    }));
  };

  const patchTermos = (patch: Partial<ProposalDocumentInput["termos"]>) => {
    if (!company) return;
    setTermsOverrideByCompany((prev) => ({
      ...prev,
      [company.id]: { ...prev[company.id], ...patch },
    }));
  };

  const patchOrcamento = (patch: Partial<ProposalBudgetMeta>) => {
    if (!company) return;
    setErpMetaByCompany((prev) => ({
      ...prev,
      [company.id]: { ...prev[company.id], ...patch },
    }));
  };

  const handleChooseClient = (id: string) => {
    setCompanyId(id);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setActiveSlideIndex(0);
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
        destinatarioNome: found.nome || cur.cliente.destinatarioNome,
        destinatarioCargo: found.cargo || cur.cliente.destinatarioCargo,
        destinatarioPapel: papelRotulo(found.papel),
        destinatarioFone: found.whatsapp || cur.cliente.destinatarioFone,
        destinatarioEmail: found.email || cur.cliente.destinatarioEmail,
      },
    }));
  };

  const handleSelectSeller = (sellerId: string) => {
    if (!company) return;
    setSelectedSellerIdByCompany((prev) => ({ ...prev, [company.id]: sellerId }));
    const found = s.users.find((u) => u.id === sellerId);
    if (!found || !canEditStandard) return;
    patchDraft((cur) => ({
      ...cur,
      vendedor: {
        userId: found.id,
        nome: found.name,
        cargo: found.title || papelRotulo(found.role),
        telefone: found.phone || "",
        email: defaultSellerEmail(found),
        regiao: found.regions?.join(" · ") || cur.vendedor.regiao,
      },
    }));
  };

  const handleErpPdfUpload = async (file: File | null) => {
    if (!file || !company) return;
    if (file.size > 10 * 1024 * 1024) {
      toast("Arquivo excede 10 MB", { tone: "warn", sub: "Reduza ou compacte o PDF do ERP antes de anexar." });
      return;
    }

    setReadingErp(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const form = new FormData();
      form.set("arquivo", file);
      const res = await fetch("/api/propostas/ler-orcamento", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as ParsedErpResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Não foi possível ler o PDF do orçamento.");
      }

      setErpFileByCompany((prev) => ({
        ...prev,
        [company.id]: { file, bytes, usedAi: Boolean(data.usedAi) },
      }));

      patchOrcamento({
        numeroExterno: data.numeroOrcamento || "",
        nomeArquivo: data.fileName || file.name,
        valorTotal: typeof data.valorTotal === "number" ? data.valorTotal : null,
        resumoEscopo:
          data.resumoExecutivo ||
          "Escopo técnico-comercial conforme orçamento oficial emitido no ERP Tawper.",
        destaques:
          data.destaques && data.destaques.length > 0
            ? data.destaques
            : [
                "Orçamento oficial emitido no ERP Tawper anexado integralmente ao final do documento",
                "Padronização de mangueiras, terminais, sistema de cores e suporte técnico em campo",
              ],
        condicaoDetectada: data.condicaoDetectada || "",
        paginasAnexo: data.pageCount || 1,
      });

      if (data.condicaoDetectada) {
        const matched = standard.condicoesPagamento.find(
          (c) => normalize(c) === normalize(data.condicaoDetectada || ""),
        );
        if (matched) patchTermos({ condicaoPagamento: matched });
      }

      toast(`Orçamento ERP anexado (${data.pageCount || 1} pág.)`, {
        sub: data.usedAi
          ? "IA leu o PDF, resumiu o escopo no slide comercial e anexou as páginas originais."
          : "PDF validado e pronto para ser anexado no final da proposta.",
      });
    } catch (e) {
      toast("Erro ao processar PDF do ERP", {
        tone: "warn",
        sub: e instanceof Error ? e.message : "Verifique se o arquivo é um PDF válido.",
      });
    } finally {
      setReadingErp(false);
    }
  };

  const removeErpAttachment = () => {
    if (!company) return;
    setErpFileByCompany((prev) => ({ ...prev, [company.id]: undefined }));
    setErpMetaByCompany((prev) => ({ ...prev, [company.id]: undefined }));
  };

  const saveAsOfficialStandard = async () => {
    if (!isAdmin || !draft) return;
    setSavingStandard(true);
    try {
      const nextStandard: ProposalStandardConfig = {
        ...standard,
        validadeDias: draft.termos.validadeDias,
        condicaoPagamento: draft.termos.condicaoPagamento,
        prazoEntrega: draft.termos.prazoEntrega,
        frete: draft.termos.frete,
        mostrarValores: draft.termos.mostrarValores,
        observacoesPadrao: draft.termos.observacoes,
      };
      await s.saveConfig("proposalStandard", nextStandard);
      setAdminUnlocked(false);
      toast("Padrão oficial atualizado", {
        sub: "Condições comerciais e diretrizes aplicadas às novas propostas.",
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

  const loadAssetsOnce = async (): Promise<PdfAssetBundle> => {
    if (assetCacheRef.current) return assetCacheRef.current;
    const [
      logoPngBytes,
      capaHeroBytes,
      reliabilityBytes,
      terminaisBytes,
      coresBytes,
      prensaBytes,
      hydrasenseBytes,
    ] = await Promise.all([
      getLogoPngBytes(),
      loadCompressedJpgBytes("/apresentacao-tawper/assets/geradas/14-capa-terminais-catalogo.png", 1100),
      loadCompressedJpgBytes("/apresentacao-tawper/assets/geradas/23-confiabilidade-cana-usina.png", 1050),
      loadCompressedJpgBytes("/apresentacao-tawper/assets/geradas/17-mangueiras-catalogo.png", 1000),
      loadCompressedJpgBytes("/apresentacao-tawper/assets/geradas/06-sistema-cores.png", 1000),
      loadCompressedJpgBytes("/apresentacao-tawper/assets/geradas/18-prensa-catalogo.png", 1000),
      loadCompressedJpgBytes("/apresentacao-tawper/assets/geradas/22-hydrasense-vertical.png", 1000),
    ]);
    const bundle: PdfAssetBundle = {
      logoPngBytes: logoPngBytes ?? null,
      capaHeroBytes: capaHeroBytes ?? null,
      reliabilityBytes: reliabilityBytes ?? null,
      terminaisBytes: terminaisBytes ?? null,
      coresBytes: coresBytes ?? null,
      prensaBytes: prensaBytes ?? null,
      hydrasenseBytes: hydrasenseBytes ?? null,
    };
    assetCacheRef.current = bundle;
    return bundle;
  };

  const generatePdf = async (mode: "download" | "preview") => {
    if (!draft || !company) return;
    setBusyPdf(true);
    try {
      const assets = await loadAssetsOnce();
      const attached = erpFileByCompany[company.id];
      const bytes = await buildProposalPdfBytes(draft, {
        ...assets,
        erpPdfBytes: attached?.bytes ?? null,
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const fileName = `Proposta-${slugFileName(draft.termos.codigo || "Tawper")}-${slugFileName(
        draft.cliente.nomeFantasia || "Cliente",
      )}.pdf`;

      if (mode === "download") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast("Proposta em PDF baixada", {
          sub: attached
            ? `9 slides Tawper + ${draft.orcamento.paginasAnexo} pág(s). do orçamento ERP (${fileName})`
            : fileName,
        });
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

  const sendDeckCommand = (payload: Record<string, unknown>) => {
    deckFrameRef.current?.contentWindow?.postMessage(payload, "*");
  };

  const printHtmlPresentation = () => {
    if (deckFrameRef.current?.contentWindow) {
      deckFrameRef.current.contentWindow.focus();
      deckFrameRef.current.contentWindow.print();
    }
  };

  const already = Boolean(deal?.checklist.proposta_enviada);
  const saveAndMarkSent = async () => {
    if (!deal || !company || !draft) {
      toast("Sem negócio aberto", { tone: "warn", sub: "Abra ou retome a oportunidade na empresa." });
      return;
    }

    const attached = erpFileByCompany[company.id];
    const hasValor = typeof draft.orcamento.valorTotal === "number" && draft.orcamento.valorTotal > 0;
    const numeroErp = draft.orcamento.numeroExterno.trim() || draft.termos.codigo;

    setSavingQuote(true);
    try {
      if (attached && hasValor) {
        const form = new FormData();
        form.set("arquivo", attached.file);
        form.set("companyId", company.id);
        form.set("dealId", deal.id);
        form.set("numero", numeroErp);
        form.set("valor", String(draft.orcamento.valorTotal));
        form.set("condicao", draft.termos.condicaoPagamento);
        form.set("validade", String(draft.termos.validadeDias));
        form.set("contactId", activeContact?.id ?? "");
        form.set("observacoes", draft.orcamento.resumoEscopo);

        const res = await fetch("/api/quotes", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { error?: string; quote?: Quote };
        if (res.ok && data.quote) {
          s.upsertQuote(data.quote);
          s.afterQuoteSent(data.quote);
        }
      }

      s.setChecklist(deal.id, { proposta_enviada: true });
      toast("Proposta registrada como enviada", {
        sub: attached
          ? "Orçamento ERP vinculado e etapa do funil atualizada."
          : "Critério do funil atualizado.",
      });
    } catch (e) {
      toast("Não foi possível salvar no funil", {
        tone: "warn",
        sub: e instanceof Error ? e.message : "Erro ao registrar envio.",
      });
    } finally {
      setSavingQuote(false);
    }
  };

  const attachedErp = company ? erpFileByCompany[company.id] : undefined;
  const totalPdfPages = 9 + (draft?.orcamento.paginasAnexo || 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <PageHeader
        kicker="Comercial · Apresentação Oficial Tawper (9 Slides)"
        title="Gerador de Proposta Comercial Tawper"
        subtitle="Apresentação oficial em HTML resumida em 9 slides (< 10), personalizada com os dados do cliente, condições comerciais e orçamento do ERP anexo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Link href="/configuracoes/propostas">
                <Button variant="outline" size="xs">
                  <Settings size={13} /> Condições comerciais
                </Button>
              </Link>
            )}
            <Badge tone={canEditStandard ? "amber" : "navy"}>
              {canEditStandard ? <Unlock size={12} /> : <Lock size={12} />}
              {canEditStandard ? "Modo Administrador" : "Padrão Oficial Bloqueado"}
            </Badge>
          </div>
        }
      />

      {/* Stepper */}
      <div className="grid grid-cols-3 gap-1.5 rounded-[10px] border border-line bg-white p-2 shadow-2xs sm:gap-3 sm:p-3">
        {[
          { n: 1 as const, label: "Passo 1", title: company ? company.nome : "Escolher o Cliente", enabled: true },
          { n: 2 as const, label: "Passo 2", title: "Orçamento ERP & Condições", enabled: Boolean(company) },
          { n: 3 as const, label: "Passo 3", title: "Apresentação & PDF Prontos", enabled: Boolean(company && draft) },
        ].map((st) => (
          <button
            key={st.n}
            type="button"
            disabled={!st.enabled}
            onClick={() => st.enabled && setStep(st.n)}
            className={cn(
              "flex min-w-0 flex-col items-start gap-1.5 rounded-[8px] border-t-2 px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-2.5",
              step === st.n
                ? "border-brand bg-paper"
                : step > st.n
                  ? "border-navy bg-soft/30 hover:bg-soft/60"
                  : "border-line text-muted",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
                step === st.n
                  ? "bg-brand text-white"
                  : step > st.n
                    ? "bg-navy text-white"
                    : "bg-soft text-muted",
              )}
            >
              0{st.n}
            </span>
            <div className="w-full min-w-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.1em] text-muted uppercase">{st.label}</div>
              <div className="truncate text-[13.5px] font-bold text-ink">{st.title}</div>
            </div>
          </button>
        ))}
      </div>

      {/* PASSO 1: ESCOLHER O CLIENTE */}
      {step === 1 && (
        <Card>
          <CardHeader
            kicker="Passo 01 · Selecionar Cliente"
            title="Para qual empresa ou usina é esta proposta?"
            action={
              <Checkbox
                checked={onlyWithDeal}
                onChange={(v) => setOnlyWithDeal(v)}
                label="Somente com negócio em aberto"
              />
            }
          />
          <div className="space-y-4 border-t border-line/70 px-5 py-4">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome fantasia, razão social, CNPJ ou cidade…"
                className="pl-9"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {companies.map((c) => {
                const d = openDealOf(s, c.id);
                const selected = c.id === companyId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleChooseClient(c.id)}
                    className={cn(
                      "flex min-w-0 items-center justify-between gap-3 rounded-[8px] border px-4 py-3 text-left transition-colors",
                      selected
                        ? "border-brand bg-brand/5"
                        : "border-line bg-white hover:border-navy/40 hover:bg-soft/40",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold text-ink">{c.nome}</div>
                      <div className="truncate text-[12px] text-muted">
                        {[c.cidade, c.uf].filter(Boolean).join("/") || "—"}
                        {c.colhedoras ? ` · ${c.colhedoras} colhedoras` : ""}
                        {c.modelos ? ` · ${c.modelos}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {d && <StagePill deal={d} />}
                      <ArrowRight size={15} className="text-muted" />
                    </div>
                  </button>
                );
              })}
              {companies.length === 0 && (
                <div className="col-span-full py-10 text-center text-[13px] text-muted">
                  Nenhuma empresa encontrada com os filtros atuais.
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* PASSO 2: ORÇAMENTO ERP + DESTINATÁRIO + CONDIÇÕES */}
      {step === 2 && company && draft && (
        <div className="space-y-4">
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
                  <span className="font-normal text-muted">({draft.cliente.cidadeUf})</span>
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
                  <Button variant="outline" size="sm" onClick={() => setAdminUnlocked(false)}>
                    <Lock size={14} /> Bloquear modelo
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
                Ver Apresentação Pronta (9 Slides) <ArrowRight size={14} />
              </Button>
            </div>
          </div>

          {/* Bloco 1: Upload Orçamento ERP + Leitura IA */}
          <Card className="border-t-4 border-brand">
            <CardHeader
              kicker="1 · Orçamento Oficial do Sistema Externo (ERP)"
              title="Anexar orçamento em PDF e alimentar o slide comercial"
              action={<FileText size={16} className="text-brand" />}
            />
            <div className="space-y-4 border-t border-line/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-line bg-soft/40 p-4">
                <div className="space-y-1">
                  <div className="text-[13.5px] font-bold text-ink">
                    {attachedErp
                      ? `${attachedErp.file.name} (${draft.orcamento.paginasAnexo} pág. originais)`
                      : "Nenhum orçamento PDF do ERP anexado ainda"}
                  </div>
                  <p className="text-[12px] text-muted">
                    A IA extrai número, valor total e resumo qualitativo para o Slide 08 da apresentação, e anexa as páginas originais do orçamento ERP ao final do PDF.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={erpInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      void handleErpPdfUpload(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                  {attachedErp && (
                    <Button variant="outline" size="sm" onClick={removeErpAttachment}>
                      <Trash2 size={14} /> Remover PDF
                    </Button>
                  )}
                  <Button
                    variant="dark"
                    size="sm"
                    disabled={readingErp}
                    onClick={() => erpInputRef.current?.click()}
                  >
                    <FileUp size={14} />
                    {readingErp
                      ? "Lendo PDF com IA…"
                      : attachedErp
                        ? "Substituir orçamento (PDF)"
                        : "Adicionar orçamento em PDF (ERP)"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Número do Orçamento (ERP)">
                  <Input
                    value={draft.orcamento.numeroExterno}
                    placeholder="Ex.: 004512"
                    onChange={(e) => patchOrcamento({ numeroExterno: e.target.value })}
                  />
                </Field>
                <Field
                  label="Valor Total do Orçamento (R$)"
                  hint={draft.termos.mostrarValores ? "Exibido no Slide 08" : "Oculto na proposta"}
                >
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.orcamento.valorTotal ?? ""}
                    placeholder="Ex.: 28500.00"
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      patchOrcamento({ valorTotal: Number.isFinite(raw) && raw > 0 ? raw : null });
                    }}
                  />
                </Field>
                <Field label="Exibição de Valores">
                  <div className="flex h-9 items-center rounded-[6px] border border-line bg-white px-3">
                    <Checkbox
                      checked={draft.termos.mostrarValores}
                      onChange={(v) => patchTermos({ mostrarValores: v })}
                      label="Mostrar valor total no Slide 08"
                    />
                  </div>
                </Field>
              </div>

              <Field
                label="Resumo Executivo do Escopo (exibido no Slide 08 Comercial)"
                hint={attachedErp?.usedAi ? "Extraído pela IA" : undefined}
              >
                <Textarea
                  rows={3}
                  value={draft.orcamento.resumoEscopo}
                  onChange={(e) => patchOrcamento({ resumoEscopo: e.target.value })}
                />
              </Field>

              {attachedErp && (
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-good">
                  <Sparkles size={14} />
                  <span>
                    PDF consolidado terá{" "}
                    <strong>
                      9 slides oficiais Tawper + {draft.orcamento.paginasAnexo} página(s) do orçamento ERP = {totalPdfPages} páginas
                    </strong>
                    .
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Bloco 2: Destinatário e Consultor */}
          <Card>
            <CardHeader
              kicker="2 · Destinatário & Consultor Comercial"
              title="Dados que vão na Capa (Slide 01), Diagnóstico (Slide 02) e Contato (Slide 09)"
              action={<Building2 size={16} className="text-navy-3" />}
            />
            <div className="space-y-4 border-t border-line/70 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Contato Destinatário (A/C)">
                  <Select value={activeContactId} onChange={(e) => handleSelectContact(e.target.value)}>
                    {contacts.length === 0 && <option value="">Equipe Técnica & Compras</option>}
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} {c.cargo ? `— ${c.cargo}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Consultor Responsável">
                  <Select value={activeSellerId} onChange={(e) => handleSelectSeller(e.target.value)}>
                    {sellers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="WhatsApp Comercial do Consultor">
                  <div
                    className={cn(
                      "flex h-9 items-center justify-between rounded-[6px] border px-3 text-[13px]",
                      draft.vendedor.telefone
                        ? "border-line bg-soft/40 font-semibold text-ink"
                        : "border-warn/40 bg-warn-soft/50 text-warn",
                    )}
                  >
                    <span>{draft.vendedor.telefone || "Não cadastrado no perfil"}</span>
                    {!draft.vendedor.telefone && <AlertTriangle size={14} />}
                  </div>
                </Field>
              </div>

              {canEditStandard && (
                <div className="grid gap-3 rounded-[8px] border border-warn/30 bg-warn-soft/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Nome Fantasia na Capa">
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
                  <Field label="CNPJ">
                    <Input
                      value={draft.cliente.cnpj}
                      onChange={(e) =>
                        patchDraft((cur) => ({
                          ...cur,
                          cliente: { ...cur.cliente, cnpj: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <Field label="WhatsApp do Consultor (Override)">
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
                  <Field label="E-mail do Consultor">
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
              )}
            </div>
          </Card>

          {/* Bloco 3: Frota & Condições Comerciais */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                kicker="3 · Diagnóstico de Frota (Slide 02)"
                title="Dados técnicos puxados do cliente"
                action={<Wrench size={16} className="text-navy-3" />}
              />
              <div className="space-y-3 border-t border-line/70 px-5 py-4">
                <div className="grid grid-cols-2 gap-3 text-[12.5px]">
                  <div className="rounded-[6px] border border-line/80 bg-soft/40 p-2.5">
                    <div className="text-[10.5px] font-bold text-muted uppercase">Colhedoras / Máquinas</div>
                    <div className="font-bold text-ink">{draft.frota.numColhedoras} unidade(s)</div>
                  </div>
                  <div className="rounded-[6px] border border-line/80 bg-soft/40 p-2.5">
                    <div className="text-[10.5px] font-bold text-muted uppercase">Modelos / Frota</div>
                    <div className="truncate font-bold text-ink">{draft.frota.marcaFrota}</div>
                  </div>
                  <div className="rounded-[6px] border border-line/80 bg-soft/40 p-2.5">
                    <div className="text-[10.5px] font-bold text-muted uppercase">Prensa Atual</div>
                    <div className="truncate font-bold text-ink">{draft.frota.prensa}</div>
                  </div>
                  <div className="rounded-[6px] border border-line/80 bg-soft/40 p-2.5">
                    <div className="text-[10.5px] font-bold text-muted uppercase">Fornecedor / Base</div>
                    <div className="truncate font-bold text-ink">{draft.frota.fornecedorAtual}</div>
                  </div>
                </div>
                {canEditStandard && (
                  <Field label="Objetivo técnico / diretrizes da implantação">
                    <Textarea
                      rows={2}
                      value={draft.frota.gargaloPrincipal}
                      onChange={(e) =>
                        patchDraft((cur) => ({
                          ...cur,
                          frota: { ...cur.frota, gargaloPrincipal: e.target.value },
                        }))
                      }
                    />
                  </Field>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                kicker="4 · Condições Comerciais (Slide 08)"
                title="Condições editáveis nas Configurações"
                action={
                  isAdmin ? (
                    <Link href="/configuracoes/propostas" className="text-[11.5px] font-semibold text-brand hover:underline">
                      Adicionar / editar opções →
                    </Link>
                  ) : (
                    <UserRound size={16} className="text-navy-3" />
                  )
                }
              />
              <div className="space-y-3 border-t border-line/70 px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Condição de Pagamento">
                    <Select
                      value={draft.termos.condicaoPagamento}
                      onChange={(e) => patchTermos({ condicaoPagamento: e.target.value })}
                    >
                      {!standard.condicoesPagamento.includes(draft.termos.condicaoPagamento) && (
                        <option value={draft.termos.condicaoPagamento}>{draft.termos.condicaoPagamento}</option>
                      )}
                      {standard.condicoesPagamento.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Validade (dias)">
                    <Select
                      value={String(draft.termos.validadeDias)}
                      onChange={(e) => patchTermos({ validadeDias: Number(e.target.value) || 15 })}
                    >
                      {!standard.validadesDias.includes(draft.termos.validadeDias) && (
                        <option value={String(draft.termos.validadeDias)}>{draft.termos.validadeDias} dias</option>
                      )}
                      {standard.validadesDias.map((d) => (
                        <option key={d} value={String(d)}>
                          {d} dias
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Frete & Logística">
                    <Select value={draft.termos.frete} onChange={(e) => patchTermos({ frete: e.target.value })}>
                      {!standard.opcoesFrete.includes(draft.termos.frete) && (
                        <option value={draft.termos.frete}>{draft.termos.frete}</option>
                      )}
                      {standard.opcoesFrete.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Prazo de Entrega">
                    <Select
                      value={draft.termos.prazoEntrega}
                      onChange={(e) => patchTermos({ prazoEntrega: e.target.value })}
                    >
                      {!standard.opcoesEntrega.includes(draft.termos.prazoEntrega) && (
                        <option value={draft.termos.prazoEntrega}>{draft.termos.prazoEntrega}</option>
                      )}
                      {standard.opcoesEntrega.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft size={14} /> Voltar aos clientes
            </Button>
            <Button variant="primary" size="lg" onClick={() => setStep(3)}>
              Avançar para Apresentação Oficial Pronta (9 Slides) <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* PASSO 3: APRESENTAÇÃO HTML OFICIAL (9 SLIDES) + PDF */}
      {step === 3 && company && draft && builtDeck && (
        <div className="space-y-4">
          {/* Barra de ações principal */}
          <Card className="overflow-hidden border-line bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-t-4 border-brand bg-navy px-6 py-4 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-brand" />
                  <span className="text-[11px] font-extrabold tracking-[0.14em] text-white/85 uppercase">
                    Apresentação Oficial Tawper · {draft.termos.codigo} · 9 Slides
                  </span>
                </div>
                <h2 className="mt-1 text-[19px] font-extrabold tracking-tight">
                  {draft.cliente.nomeFantasia}{" "}
                  <span className="text-[13px] font-normal text-white/75">
                    · A/C {draft.cliente.destinatarioNome} · Consultor: {draft.vendedor.nome}
                  </span>
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={printHtmlPresentation}>
                  <Printer size={14} /> Salvar / Imprimir Apresentação (HTML → PDF)
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busyPdf}
                  onClick={() => void generatePdf("download")}
                >
                  <Download size={14} />{" "}
                  {busyPdf
                    ? "Gerando PDF…"
                    : attachedErp
                      ? `Baixar PDF + Orçamento ERP (${totalPdfPages} págs.)`
                      : "Baixar PDF Direto (9 slides)"}
                </Button>
                <Button
                  variant={already ? "success" : "dark"}
                  size="sm"
                  disabled={!deal || already || savingQuote}
                  onClick={() => void saveAndMarkSent()}
                >
                  <Check size={14} />{" "}
                  {savingQuote
                    ? "Salvando…"
                    : already
                      ? "Marcada como enviada"
                      : attachedErp
                        ? "Salvar orçamento & marcar enviada"
                        : "Marcar enviada"}
                </Button>
              </div>
            </div>

            {/* Atalhos rápidos dos 9 slides da apresentação oficial */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-soft/40 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {builtDeck.slides.map((sl) => (
                  <button
                    key={sl.id}
                    type="button"
                    onClick={() => {
                      setActiveSlideIndex(sl.index);
                      sendDeckCommand({ type: "TAWPER_DECK_GOTO", index: sl.index });
                    }}
                    className={cn(
                      "rounded-[5px] px-2.5 py-1 text-[11.5px] font-bold transition-colors",
                      activeSlideIndex === sl.index
                        ? "bg-brand text-white"
                        : "bg-white text-ink border border-line hover:border-navy/40",
                    )}
                  >
                    {String(sl.index + 1).padStart(2, "0")} · {sl.chapter}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => sendDeckCommand({ type: "TAWPER_DECK_FULLSCREEN" })}
                >
                  <Maximize2 size={13} /> Tela cheia
                </Button>
                <Button variant="ghost" size="xs" disabled={busyPdf} onClick={() => void generatePdf("preview")}>
                  <Eye size={13} /> Ver PDF com Anexo
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setStep(2)}>
                  <ArrowLeft size={13} /> Voltar
                </Button>
              </div>
            </div>

            {/* Palco 16:9 com a apresentação HTML original exata */}
            <div className="relative aspect-video w-full overflow-hidden bg-[#0c101a]">
              <iframe
                ref={deckFrameRef}
                srcDoc={builtDeck.html}
                title={`Apresentação Comercial Tawper · ${draft.cliente.nomeFantasia}`}
                className="h-full w-full border-0"
              />
            </div>
          </Card>
        </div>
      )}

      {previewUrl && draft && (
        <Modal
          title={`PDF Consolidado · ${draft.termos.codigo} (${draft.cliente.nomeFantasia})`}
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
              title={`Pré-visualização da proposta ${draft.termos.codigo}`}
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
