import institutionalSlidesData from "./tawper-slides-data.json";
import type { ProposalDocumentInput } from "./proposal";

export type PresentationDeckMode = "executive" | "complete";

export interface SlideDescriptor {
  index: number;
  id: string;
  title: string;
  chapter: string;
  isCustom?: boolean;
  customKey?: "cover" | "diagnosis" | "commercial" | "closing";
}

interface RawInstitutionalSlide {
  originalNum: number;
  title: string;
  chapter: string;
  notes: string;
  sources: string;
  visual: string;
  html: string;
}

const INSTITUTIONAL_SLIDES = institutionalSlidesData as RawInstitutionalSlide[];

function esc(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateBr(raw: string): string {
  if (!raw) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function addDaysBr(raw: string, days: number): string {
  let base: Date;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split("/");
    base = new Date(`${y}-${m}-${d}T12:00:00`);
  } else {
    base = raw ? new Date(`${raw}T12:00:00`) : new Date();
  }
  if (Number.isNaN(base.getTime())) base = new Date();
  base.setDate(base.getDate() + (Number.isFinite(days) ? days : 15));
  return base.toISOString().slice(0, 10).split("-").reverse().join("/");
}

function cleanPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "5517991252896";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/**
 * Slides institucionais originais selecionados para a Proposta Executiva (9 slides no total, < 10 slides):
 * 01. Capa Oficial Personalizada (Slide 1 original adaptado com cliente/consultor)
 * 02. Diagnóstico Operacional & Frota do Cliente (Layout Slide 2 original .company-story)
 * 03. Qualidade da linha Tawper (+8 anos no mercado - Slide 3 original)
 * 04. A mangueira é apenas uma parte da conta (R$ 7.700 / 9,1% - Slide 9 original)
 * 05. Mangueiras de tecnologia europeia (ISO · MSHA · CCS / 15x ISO - Slide 12 original)
 * 06. Prensagem padronizada & Sistema de Cores (Prensa com final de curso + guia de cores - Slide 16 original)
 * 07. HydraSense: O DNA de cada mangueira (Rastreabilidade em campo - Slide 22 original)
 * 08. Investimento (Orçamento ERP) & Condições Comerciais (Layout .simulation original)
 * 09. Fale com a Tawper, Consultor Responsável & Aceite Formal (Layout Slide 32 original)
 */
const EXECUTIVE_INSTITUTIONAL_NUMS = [
  3,  // Qualidade da linha Tawper (+8 anos)
  9,  // A mangueira é apenas uma parte da conta (R$ 7.700 / 9,1%)
  12, // Mangueiras de tecnologia europeia (ISO · MSHA · CCS)
  16, // Prensagem padronizada + guia visual do sistema de cores
  22, // HydraSense: O DNA de cada mangueira
];

/**
 * Caso o administrador solicite a apresentação completa (sem sorteio).
 */
const COMPLETE_INSTITUTIONAL_NUMS = Array.from({ length: 30 }, (_, i) => i + 2); // 2..31

function rewriteSlideAssets(sectionHtml: string, baseUrl: string, slideNumber: number, totalSlides: number): string {
  const cleanBase = baseUrl.replace(/\/$/, "");
  let out = sectionHtml
    .replace(/src="assets\//g, `src="${cleanBase}/assets/`)
    .replace(/url\('assets\//g, `url('${cleanBase}/assets/`)
    .replace(/url\("assets\//g, `url("${cleanBase}/assets/`);

  out = out.replace(/class="slide\s+([^"]*?)\bactive\b([^"]*)"/, 'class="slide $1$2"');
  out = out.replace(/aria-hidden="false"/, 'aria-hidden="true"');
  const pageStr = `${String(slideNumber).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;
  out = out.replace(/<span class="page"[^>]*>[\s\S]*?<\/span>/, `<span class="page">${pageStr}</span>`);
  out = out.replace(/id="slide-\d+"/, `id="slide-${String(slideNumber).padStart(2, "0")}"`);
  return out;
}

export function buildTawperPresentationDeck(
  input: ProposalDocumentInput,
  options?: {
    mode?: PresentationDeckMode;
    baseUrl?: string;
    initialSlideIndex?: number;
  },
): {
  html: string;
  slides: SlideDescriptor[];
} {
  const mode: PresentationDeckMode = options?.mode ?? "executive";
  const baseUrl = (options?.baseUrl ?? "/apresentacao-tawper").replace(/\/$/, "");
  const initialIndex = Math.max(0, options?.initialSlideIndex ?? 0);

  const { cliente, vendedor, frota, orcamento, termos } = input;
  const emissaoFmt = fmtDateBr(termos.dataEmissao);
  const validadeFmt = addDaysBr(termos.dataEmissao, termos.validadeDias);
  const nomeCliente = cliente.nomeFantasia || cliente.razaoSocial || "Cliente Parceiro";

  const institutionalNums = mode === "complete" ? COMPLETE_INSTITUTIONAL_NUMS : EXECUTIVE_INSTITUTIONAL_NUMS;
  const selectedInstitutional = institutionalNums
    .map((n) => INSTITUTIONAL_SLIDES.find((s) => s.originalNum === n))
    .filter((s): s is RawInstitutionalSlide => Boolean(s));

  // Total slides no modo executivo = 1 (Capa) + 1 (Diagnóstico) + 5 (Institucionais Core) + 1 (Comercial/ERP) + 1 (Fechamento) = 9 slides (< 10)
  const totalSlides = 1 + selectedInstitutional.length + 3;

  const builtSections: Array<{
    id: string;
    title: string;
    chapter: string;
    notes: string;
    sources: string;
    visual: string;
    html: string;
    isCustom?: boolean;
    customKey?: SlideDescriptor["customKey"];
  }> = [];

  // 1. SLIDE 01: CAPA OFICIAL PERSONALIZADA
  const coverPage = `01 / ${String(totalSlides).padStart(2, "0")}`;
  builtSections.push({
    id: "slide-01",
    title: `Proposta Comercial · ${nomeCliente}`,
    chapter: "Abertura & Proposta",
    isCustom: true,
    customKey: "cover",
    notes: `Apresentação e Proposta Comercial preparada exclusivamente para ${nomeCliente} (${cliente.cidadeUf || "Operação"}). Responsável técnico/comercial: ${vendedor.nome} (${vendedor.telefone || "WhatsApp Comercial"}).`,
    sources: `CRM Tawper · Proposta ${termos.codigo} emitida em ${emissaoFmt}.`,
    visual: "Capa oficial Tawper com conjuntos hidráulicos e prensa ao fundo, personalizada para o cliente.",
    html: `<section aria-hidden="false" aria-label="Slide 1 de ${totalSlides}: Proposta Comercial ${esc(nomeCliente)}" class="slide dark cover cover-revised proposal-cover" data-chapter="Abertura" data-title="Proposta Comercial · ${esc(nomeCliente)}" id="slide-01">
<header class="topbar"><img alt="Tawper — mangueiras e conexões" class="logo" src="${baseUrl}/assets/marca/tawper.svg"/><span class="topic">PROPOSTA COMERCIAL · ${esc(termos.codigo)}</span></header>
<img alt="Conjuntos de mangueiras Tawper de dimensões reais sobre bancada, com prensa ao fundo." class="full-photo" draggable="false" loading="eager" src="${baseUrl}/assets/geradas/14-capa-terminais-catalogo.png"/>
<div class="veil"></div>
<div class="cover-title">
  <p class="eyebrow kicker proposal-cover-kicker">PREPARADO PARA ${esc(nomeCliente.toUpperCase())}${cliente.cidadeUf ? ` · ${esc(cliente.cidadeUf.toUpperCase())}` : ""}</p>
  <h1><span style="font-size: 88px !important;">Soluções completas<br/>em mangueiras hidráulicas</span></h1>
  <p class="subtitle">Tecnologia, padronização de oficina, fornecimento direto e rastreabilidade para a operação da <strong>${esc(nomeCliente)}</strong>.</p>
</div>
<div class="cover-bottom">
  <p><strong>A/C ${esc(cliente.destinatarioNome || "Gestão de Manutenção e Suprimentos")}</strong>${cliente.destinatarioCargo ? ` (${esc(cliente.destinatarioCargo)})` : ""} &nbsp;·&nbsp; Consultor Tawper: <strong>${esc(vendedor.nome)}</strong>${vendedor.telefone ? ` (${esc(vendedor.telefone)})` : ""} &nbsp;·&nbsp; Emissão: ${esc(emissaoFmt)}</p>
</div>
<footer class="slide-footer"><span>TAWPER · PROPOSTA ${esc(termos.codigo)} · ${esc(nomeCliente.toUpperCase())}</span><span class="page">${coverPage}</span></footer>
</section>`,
  });

  // SLIDE PERSONALIZADO: DIAGNÓSTICO OPERACIONAL & FROTA DO CLIENTE
  const buildDiagnosisSlide = (slideNum: number) => {
    const pageStr = `${String(slideNum).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;
    return {
      id: `slide-${String(slideNum).padStart(2, "0")}`,
      title: `Diagnóstico Operacional · ${nomeCliente}`,
      chapter: "Proposta Personalizada",
      isCustom: true,
      customKey: "diagnosis" as const,
      notes: `Confirmar com ${cliente.destinatarioNome || "o cliente"} os dados mapeados da frota (${frota.numColhedoras} máquinas · ${frota.marcaFrota}), o modelo de prensa (${frota.prensa}) e os pontos críticos atuais.`,
      sources: `Ficha técnica do cliente ${nomeCliente} no Tawper CRM.`,
      visual: "Layout editorial inspirado no slide 'Como a Tawper surgiu', conectando dados cadastrais do cliente e diagnóstico de frota.",
      html: `<section aria-hidden="true" aria-label="Diagnóstico Operacional ${esc(nomeCliente)}" class="slide white company-story proposal-diagnosis" data-chapter="Proposta Personalizada" data-title="Diagnóstico Operacional · ${esc(nomeCliente)}" id="slide-${String(slideNum).padStart(2, "0")}">
<header class="topbar"><img alt="Tawper — mangueiras e conexões" class="logo" src="${baseUrl}/assets/marca/tawper.svg"/><span class="topic">DIAGNÓSTICO DO CLIENTE · ${esc(termos.codigo)}</span></header>
<div class="title-block"><p class="eyebrow kicker">Cenário operacional mapeado</p><h2>A operação da <span class="blue-text">${esc(nomeCliente)}</span><br/>no centro da proposta.</h2></div>
<div class="proposal-diag-left">
  <div class="proposal-meta-grid">
    <div class="proposal-meta-cell">
      <span class="meta-idx">01 · UNIDADE / EMPRESA</span>
      <strong>${esc(cliente.razaoSocial || nomeCliente)}</strong>
      <span>CNPJ: ${esc(cliente.cnpj || "Sob cadastro")}</span>
    </div>
    <div class="proposal-meta-cell">
      <span class="meta-idx">02 · LOCALIZAÇÃO</span>
      <strong>${esc(cliente.cidadeUf || "Operação Agroindustrial")}</strong>
      <span>${esc(cliente.endereco || "Unidade operacional")}${cliente.cep ? ` · CEP ${esc(cliente.cep)}` : ""}</span>
    </div>
    <div class="proposal-meta-cell">
      <span class="meta-idx">03 · DESTINATÁRIO / INTERLOCUTOR</span>
      <strong>${esc(cliente.destinatarioNome || "Gestão de Manutenção e Compras")}</strong>
      <span>${esc(cliente.destinatarioCargo || "Responsável Técnico / Comercial")}</span>
    </div>
    <div class="proposal-meta-cell">
      <span class="meta-idx">04 · CONSULTOR DEDICADO</span>
      <strong>${esc(vendedor.nome)}</strong>
      <span>WhatsApp: ${esc(vendedor.telefone || "Atendimento direto")}</span>
    </div>
  </div>
  <div class="proposal-diag-Focus">
    <span class="focus-label">OBJETIVO TÉCNICO E DIRETRIZES DA IMPLANTAÇÃO</span>
    <p>${esc(frota.gargaloPrincipal || termos.observacoes || "Padronização da montagem de conjuntos hidráulicos na unidade, redução do tempo de máquina parada por rompimento e rastreabilidade individual HydraSense.")}</p>
  </div>
</div>
<div class="story-path proposal-fleet-panel">
  <div>
    <p class="story-number">01</p>
    <h3>Frota mapeada: ${esc(frota.numColhedoras || "Sob medição")} máquina(s)</h3>
    <p>Equipamentos de referência: <strong>${esc(frota.marcaFrota || "Colhedoras, tratores e transbordos")}</strong>.</p>
  </div>
  <div>
    <p class="story-number">02</p>
    <h3>Estrutura de prensagem na oficina</h3>
    <p>Configuração prevista: <strong>${esc(frota.prensa || "Prensa Hidráulica Tawper com Sensor")}</strong> com sistema visual de cores.</p>
  </div>
  <div>
    <p class="story-number">03</p>
    <h3>Padrão atual e evolução Tawper</h3>
    <p>Referência atual (<strong>${esc(frota.fornecedorAtual || "Multimarcas")}</strong>) → Padronização Tawper + Lacre + HydraSense.</p>
  </div>
</div>
<footer class="slide-footer"><span>TAWPER · DIAGNÓSTICO OPERACIONAL · ${esc(nomeCliente.toUpperCase())}</span><span class="page">${pageStr}</span></footer>
</section>`,
    };
  };

  // SLIDE PERSONALIZADO: ORÇAMENTO ERP & CONDIÇÕES COMERCIAIS
  const buildCommercialSlide = (slideNum: number) => {
    const pageStr = `${String(slideNum).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;
    const hasValor = Boolean(termos.mostrarValores && orcamento.valorTotal && orcamento.valorTotal > 0);
    const destaquesList = (orcamento.destaques ?? []).slice(0, 3);
    const erpBadge = orcamento.numeroExterno
      ? `ORÇAMENTO ERP Nº ${orcamento.numeroExterno}`
      : "ESCOPO & CONDIÇÕES COMERCIAIS";

    return {
      id: `slide-${String(slideNum).padStart(2, "0")}`,
      title: `Investimento & Condições Comerciais · ${termos.codigo}`,
      chapter: "Proposta Personalizada",
      isCustom: true,
      customKey: "commercial" as const,
      notes: `Apresentar o orçamento oficial (${orcamento.numeroExterno || "ERP Tawper"}) e as condições comerciais da proposta ${termos.codigo}: pagamento (${termos.condicaoPagamento}), prazo de entrega (${termos.prazoEntrega}), frete (${termos.frete}) e validade (${termos.validadeDias} dias).`,
      sources: `Condições comerciais Tawper · Proposta ${termos.codigo}.`,
      visual: "Diagramação baseada nos slides 'A mangueira é apenas uma parte da conta' e 'Mais simples e mais lucrativo'.",
      html: `<section aria-hidden="true" aria-label="Investimento e Condições Comerciais" class="slide white simulation proposal-commercial" data-chapter="Proposta Personalizada" data-title="Investimento &amp; Condições Comerciais · ${esc(termos.codigo)}" id="slide-${String(slideNum).padStart(2, "0")}">
<header class="topbar"><img alt="Tawper — mangueiras e conexões" class="logo" src="${baseUrl}/assets/marca/tawper.svg"/><span class="topic">INVESTIMENTO E CONDIÇÕES · ${esc(termos.codigo)}</span></header>
<div class="title-block"><p class="eyebrow kicker">Fornecimento direto de importadora · sem intermediação</p><h2 style="font-size:62px;">Condições comerciais e<br/><span class="blue-text">orçamento oficial Tawper.</span></h2></div>
<div class="proposal-commercial-left">
  <span class="comm-kicker">${esc(erpBadge)}</span>
  ${
    hasValor && orcamento.valorTotal
      ? `<div class="comm-amount">${esc(fmtMoney(orcamento.valorTotal))}</div>`
      : `<div class="comm-amount comm-text-mode">${esc(orcamento.numeroExterno ? `Orçamento #${orcamento.numeroExterno}` : "Fornecimento & Comodato")}</div>`
  }
  <p class="comm-caption">${esc(orcamento.resumoEscopo || `Fornecimento programado de mangueiras, terminais, estruturação de oficina e rastreabilidade para ${nomeCliente}.`)}</p>
  <div class="comm-direct-callout">
    <strong>${
      orcamento.paginasAnexo > 0
        ? `Orçamento ERP original anexo (${orcamento.paginasAnexo} página${orcamento.paginasAnexo > 1 ? "s" : ""})`
        : `Importação direta Tawper → ${esc(nomeCliente)}`
    }</strong>
    <p>${
      destaquesList.length > 0
        ? esc(destaquesList.join(" · "))
        : "Detalhamento de itens, códigos e quantidades conforme orçamento emitido no ERP da Tawper."
    }</p>
  </div>
</div>
<div class="proposal-terms-grid">
  <div class="proposal-term-card">
    <span class="term-idx">01 · CONDIÇÃO DE PAGAMENTO</span>
    <h3>${esc(termos.condicaoPagamento)}</h3>
    <p>Faturamento direto pela Tawper conforme cronograma acordado com compras.</p>
  </div>
  <div class="proposal-term-card">
    <span class="term-idx">02 · PRAZO DE ENTREGA E IMPLANTAÇÃO</span>
    <h3>${esc(termos.prazoEntrega)}</h3>
    <p>Inclui entrega técnica, orientação de bancada e capacitação da equipe na unidade.</p>
  </div>
  <div class="proposal-term-card">
    <span class="term-idx">03 · FRETE E LOGÍSTICA</span>
    <h3>${esc(termos.frete)}</h3>
    <p>Atendimento logístico pelas unidades de Monte Aprazível/SP e Maceió/AL.</p>
  </div>
  <div class="proposal-term-card">
    <span class="term-idx">04 · VALIDADE DA PROPOSTA</span>
    <h3>${termos.validadeDias} dias corridos</h3>
    <p>Emitida em ${esc(emissaoFmt)} · Válida até <strong>${esc(validadeFmt)}</strong>.</p>
  </div>
</div>
<p class="sim-note">Proposta Comercial Nº ${esc(termos.codigo)}${orcamento.numeroExterno ? ` · Orçamento ERP Nº ${esc(orcamento.numeroExterno)}` : ""} · Destinada a ${esc(nomeCliente)} (CNPJ ${esc(cliente.cnpj || "sob consulta")}) · Responsável Tawper: ${esc(vendedor.nome)}.</p>
<footer class="slide-footer"><span>TAWPER · CONDIÇÕES COMERCIAIS · ${esc(termos.codigo)}</span><span class="page">${pageStr}</span></footer>
</section>`,
    };
  };

  if (mode === "executive") {
    builtSections.push(buildDiagnosisSlide(2));
    selectedInstitutional.forEach((inst) => {
      const num = builtSections.length + 1;
      builtSections.push({
        id: `slide-${String(num).padStart(2, "0")}`,
        title: inst.title,
        chapter: inst.chapter,
        notes: inst.notes,
        sources: inst.sources,
        visual: inst.visual,
        html: rewriteSlideAssets(inst.html, baseUrl, num, totalSlides),
      });
    });
    builtSections.push(buildCommercialSlide(builtSections.length + 1));
  } else {
    selectedInstitutional.forEach((inst) => {
      const num = builtSections.length + 1;
      builtSections.push({
        id: `slide-${String(num).padStart(2, "0")}`,
        title: inst.title,
        chapter: inst.chapter,
        notes: inst.notes,
        sources: inst.sources,
        visual: inst.visual,
        html: rewriteSlideAssets(inst.html, baseUrl, num, totalSlides),
      });
    });
    builtSections.push(buildDiagnosisSlide(builtSections.length + 1));
    builtSections.push(buildCommercialSlide(builtSections.length + 1));
  }

  // SLIDE FINAL (09): CONTATO PERSONALIZADO & ACEITE FORMAL (Substitui o Slide 32 e elimina o Sorteio)
  const closingNum = builtSections.length + 1;
  const closingPage = `${String(closingNum).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;
  builtSections.push({
    id: `slide-${String(closingNum).padStart(2, "0")}`,
    title: `Fale com a Tawper & Aceite · ${vendedor.nome}`,
    chapter: "Fechamento & Contato",
    isCustom: true,
    customKey: "closing",
    notes: `Slide final de fechamento comercial com os dados diretos do consultor ${vendedor.nome}, contatos da diretoria Tawper e bloco de aceite da proposta ${termos.codigo}.`,
    sources: `Proposta Comercial ${termos.codigo} · Contatos oficiais Tawper.`,
    visual: "Layout oficial de contatos da Tawper personalizado com o consultor responsável e termo de aceite.",
    html: `<section aria-hidden="true" aria-label="Fale com a Tawper e Formalização" class="slide white contacts-only proposal-closing" data-chapter="Contato" data-title="Fale com a Tawper · ${esc(vendedor.nome)}" id="slide-${String(closingNum).padStart(2, "0")}">
<header class="topbar"><img alt="Tawper — mangueiras e conexões" class="logo" src="${baseUrl}/assets/marca/tawper.svg"/><span class="topic">CONTATO E FORMALIZAÇÃO · ${esc(termos.codigo)}</span></header>
<div class="title-block"><p class="eyebrow kicker">Próximo passo com a ${esc(nomeCliente)}</p><h2>Fale com a Tawper</h2></div>
<div class="contact-names">
  <div class="contact-name featured-consultant">
    <span class="consultant-pill">CONSULTOR RESPONSÁVEL</span>
    <h3>${esc(vendedor.nome || "Consultor Tawper")}</h3>
    <span class="region">${esc(vendedor.cargo || "Consultor Técnico Comercial")} · ${esc(vendedor.regiao || "Atendimento Dedicado")}</span>
    <a href="https://wa.me/${cleanPhone(vendedor.telefone)}" rel="noopener" target="_blank">${esc(vendedor.telefone || "(17) 9 9125-2896")}</a>
    <span class="consultant-email">${esc(vendedor.email || "tawper@tawper.com.br")}</span>
  </div>
  <div class="contact-name">
    <span class="consultant-pill muted-pill">COORDENAÇÃO SÃO PAULO</span>
    <h3>Murilo &amp; Nilton</h3>
    <span class="region">Monte Aprazível · São Paulo</span>
    <a href="https://wa.me/5517991252896" rel="noopener" target="_blank">(17) 9 9125-2896</a>
    <span class="consultant-email">Nilton: (17) 9 8230-2700</span>
  </div>
  <div class="contact-name">
    <span class="consultant-pill muted-pill">UNIDADE NORDESTE</span>
    <h3>Douglas</h3>
    <span class="region">Maceió · Alagoas</span>
    <a href="https://wa.me/5517981640028" rel="noopener" target="_blank">(17) 9 8164-0028</a>
    <span class="consultant-email">Ponto de apoio Nordeste</span>
  </div>
</div>
<div class="proposal-closing-footer">
  <div class="closing-address">
    <a href="mailto:tawper@tawper.com.br">tawper@tawper.com.br</a>
    Av. Santos Dumont, 1845 · Jardim Melo · Monte Aprazível, São Paulo
  </div>
  <div class="closing-acceptance">
    <span class="acc-title">DE ACORDO / ACEITE DA PROPOSTA ${esc(termos.codigo)}</span>
    <p><strong>${esc(nomeCliente)}</strong> · A/C ${esc(cliente.destinatarioNome || "Responsável")}</p>
    <div class="acc-sign-row">
      <span>Assinatura / Carimbo: ___________________________</span>
      <span>Data: ____/____/2026</span>
    </div>
  </div>
</div>
<footer class="slide-footer"><span>TAWPER · MANGUEIRAS E CONEXÕES</span><span class="page">${closingPage}</span></footer>
</section>`,
  });

  const clampedInitial = Math.max(0, Math.min(builtSections.length - 1, initialIndex));

  const slidesMeta: SlideDescriptor[] = builtSections.map((s, idx) => ({
    index: idx,
    id: s.id,
    title: s.title,
    chapter: s.chapter,
    isCustom: s.isCustom,
    customKey: s.customKey,
  }));

  const speakerJson = JSON.stringify(
    builtSections.map((s) => ({
      title: s.title,
      chapter: s.chapter,
      notes: s.notes,
      sources: s.sources,
      visual: s.visual,
    })),
  ).replace(/</g, "\\u003c");

  const customProposalCss = `
/* Extensões do Design System Oficial Tawper para os Slides Personalizados da Proposta */
@font-face{font-family:Manrope;src:url('${baseUrl}/assets/fontes/Manrope-Variable.ttf') format('truetype');font-weight:200 800;font-display:swap}
.failures-reference .failure-reference-photo{background-image:url('${baseUrl}/assets/referencias/falhas-mangueiras-referencia.png')!important}
.reliability-statement .reliability-photo{position:absolute;inset:0;width:1600px;height:900px;object-fit:cover;z-index:-3}
.reliability-statement .reliability-shade{position:absolute;inset:0;z-index:-2;background:linear-gradient(90deg,#29387f 0%,#29387f 42%,rgba(41,56,127,.94) 48%,rgba(41,56,127,.48) 59%,rgba(14,26,51,.12) 75%,rgba(14,26,51,.1) 100%)}
.reliability-statement .title-block{right:auto;width:760px}
.reliability-statement .title-block h2{font-size:52px}
.reliability-statement .reliability-copy{position:absolute;left:80px;width:710px;top:350px}
.reliability-statement .reliability-copy h3{font-size:46px;line-height:1.24;letter-spacing:-.035em;font-weight:500;color:#fff}
.reliability-statement .reliability-years{display:block;font-size:87px;line-height:1.13;font-weight:800;letter-spacing:-.055em}
.reliability-statement .topbar .topic{color:#fff;opacity:1;text-shadow:0 1px 5px #141d35}
.reliability-statement .slide-footer .page{color:#fff;text-shadow:0 1px 5px #141d35}
.reliability-statement .quality-foot{font-size:17px;bottom:84px}

.proposal-cover-kicker{color:#fff;margin-bottom:18px;font-size:16px!important;letter-spacing:.15em}
.proposal-cover .cover-title{top:210px;width:1020px}
.proposal-cover .subtitle{width:760px;margin-top:26px;font-size:28px;line-height:1.38;color:#e4e9f5}
.proposal-cover .subtitle strong{color:#fff}
.proposal-cover .cover-bottom{bottom:102px;background:#141d35d9;padding:14px 24px;border-left:5px solid var(--red)}
.proposal-cover .cover-bottom:before{display:none}
.proposal-cover .cover-bottom p{font-size:19px;color:#dbe3f4}
.proposal-cover .cover-bottom strong{color:#fff}

/* Slide Diagnóstico do Cliente */
.proposal-diagnosis .proposal-diag-left{position:absolute;left:80px;top:330px;width:675px}
.proposal-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px 32px}
.proposal-meta-cell{border-top:2px solid var(--blue);padding-top:14px;display:flex;flex-direction:column;gap:5px}
.proposal-meta-cell .meta-idx{font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--red);text-transform:uppercase}
.proposal-meta-cell strong{font-size:22px;line-height:1.22;color:var(--ink);letter-spacing:-.025em}
.proposal-meta-cell span:last-child{font-size:17px;color:var(--muted);line-height:1.3}
.proposal-diag-Focus{margin-top:28px;border-left:5px solid var(--red);background:var(--paper);padding:18px 22px}
.proposal-diag-Focus .focus-label{display:block;font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--blue);margin-bottom:8px}
.proposal-diag-Focus p{font-size:20px!important;line-height:1.38!important;color:var(--ink)}
.proposal-fleet-panel strong{color:#fff;font-weight:800}

/* Slide Comercial & Investimento */
.proposal-commercial-left{position:absolute;left:80px;top:340px;width:540px}
.comm-kicker{display:block;font-size:16px;font-weight:800;letter-spacing:.14em;color:var(--red);text-transform:uppercase}
.comm-amount{font-size:74px;line-height:1.04;font-weight:800;letter-spacing:-.055em;color:var(--blue);margin-top:10px}
.comm-amount.comm-text-mode{font-size:56px;line-height:1.08}
.comm-caption{font-size:20px!important;line-height:1.38!important;color:var(--ink);margin-top:16px}
.comm-direct-callout{margin-top:26px;border-left:5px solid var(--red);padding:14px 20px;background:var(--paper)}
.comm-direct-callout strong{display:block;font-size:20px;color:var(--ink);letter-spacing:-.02em}
.comm-direct-callout p{font-size:17px!important;line-height:1.36!important;color:var(--muted);margin-top:6px}
.proposal-terms-grid{position:absolute;left:680px;right:80px;top:340px;display:grid;grid-template-columns:1fr 1fr;gap:26px 38px}
.proposal-term-card{border-top:2px solid var(--blue);padding-top:16px}
.proposal-term-card .term-idx{display:block;font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--red);margin-bottom:10px}
.proposal-term-card h3{font-size:26px;line-height:1.18;color:var(--ink)}
.proposal-term-card p{font-size:18px!important;line-height:1.36!important;color:var(--muted);margin-top:10px}

/* Slide Fechamento e Aceite */
.proposal-closing .contact-names{top:338px!important}
.proposal-closing .contact-name{border-top:2px solid var(--line);padding-top:20px}
.proposal-closing .contact-name.featured-consultant{border-top:4px solid var(--red);background:var(--paper);padding:20px 24px 22px}
.consultant-pill{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.12em;padding:4px 10px;background:var(--red);color:#fff;margin-bottom:12px;text-transform:uppercase}
.consultant-pill.muted-pill{background:#e4e8f0;color:var(--blue)}
.proposal-closing .contact-name h3{font-size:34px!important;line-height:1.15}
.proposal-closing .contact-name a{font-size:26px!important;color:var(--blue);margin-top:18px!important}
.consultant-email{display:block;font-size:17px;color:var(--muted);margin-top:8px}
.proposal-closing-footer{position:absolute;left:80px;right:80px;bottom:86px;border-top:1px solid var(--line);padding-top:20px;display:flex;align-items:flex-end;justify-content:space-between;gap:40px}
.closing-address{font-size:20px;line-height:1.45;color:#657084}
.closing-address a{display:block;text-decoration:none;color:var(--blue);font-size:26px;font-weight:800;margin-bottom:6px}
.closing-acceptance{background:var(--paper);border-left:4px solid var(--blue);padding:14px 22px;min-width:620px}
.closing-acceptance .acc-title{display:block;font-size:12px;font-weight:800;letter-spacing:.12em;color:var(--blue);margin-bottom:4px}
.closing-acceptance p{font-size:18px!important;color:var(--ink)}
.closing-acceptance .acc-sign-row{display:flex;justify-content:space-between;gap:24px;margin-top:10px;font-size:15px;color:var(--muted);font-weight:600}
`;

  const sectionsJoined = builtSections
    .map((s, idx) => {
      if (idx === clampedInitial) {
        return s.html
          .replace(/class="slide\s+/, 'class="slide active ')
          .replace(/aria-hidden="true"/, 'aria-hidden="false"');
      }
      return s.html;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width,initial-scale=1" name="viewport"/>
<meta content="#29387f" name="theme-color"/>
<title>Tawper — Proposta Comercial ${esc(termos.codigo)} · ${esc(nomeCliente)}</title>
<link href="${baseUrl}/apresentacao.css" rel="stylesheet"/>
<link href="${baseUrl}/refinamentos.css" rel="stylesheet"/>
<style>${customProposalCss}</style>
</head>
<body>
<main aria-label="Apresentação e Proposta Comercial Tawper" id="viewport">
  <div id="stage">
    ${sectionsJoined}
  </div>
</main>
<div aria-hidden="true" id="progress"></div>
<nav aria-label="Controles da apresentação" id="toolbar">
  <div class="toolbar-group">
    <button aria-label="Slide anterior" id="prev" title="Anterior (←)">←</button>
    <span aria-live="polite" id="slide-counter">${String(clampedInitial + 1).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}</span>
    <button aria-label="Próximo slide" id="next" title="Próximo (→)">→</button>
    <span id="slide-title">${esc(builtSections[clampedInitial]?.title || "")}</span>
  </div>
  <div class="toolbar-group">
    <button id="overview-button" title="Todos os slides (G)">▦ <span class="toolbar-label">Slides</span></button>
    <button aria-expanded="false" id="notes-button" title="Notas do apresentador (N)">≡ <span class="toolbar-label">Notas</span></button>
    <button id="fullscreen-button" title="Tela cheia (F)">⛶ <span class="toolbar-label">Tela cheia</span></button>
    <button id="print-button" title="Imprimir ou salvar como PDF">↓ <span class="toolbar-label">Salvar PDF</span></button>
  </div>
</nav>
<aside aria-label="Notas do apresentador" id="notes-panel">
  <button aria-label="Fechar notas" id="close-notes">×</button>
  <h2 id="notes-title"></h2>
  <p id="notes-text"></p>
  <p class="source-note" id="notes-sources"></p>
</aside>
<dialog id="overview">
  <div class="overview-top">
    <h2>Proposta Comercial ${esc(termos.codigo)} · ${esc(nomeCliente)} (${totalSlides} slides)</h2>
    <button id="close-overview">Fechar ×</button>
  </div>
  <div class="overview-grid" id="overview-grid"></div>
</dialog>
<div id="toast" role="status"></div>
<script id="speaker-data" type="application/json">${speakerJson}</script>
<script>
(() => {
  'use strict';
  const slides = [...document.querySelectorAll('.slide')];
  const notes = JSON.parse(document.getElementById('speaker-data').textContent);
  const $ = (id) => document.getElementById(id);
  const overview = $('overview');
  let index = ${clampedInitial};

  function fit() {
    const rect = $('viewport').getBoundingClientRect();
    document.documentElement.style.setProperty('--scale', Math.min(rect.width / 1600, rect.height / 900));
  }
  function updateNotes() {
    const n = notes[index] || { title: '', notes: '', sources: '', visual: '' };
    $('notes-title').textContent = String(index + 1).padStart(2, '0') + '. ' + n.title;
    $('notes-text').textContent = n.notes;
    $('notes-sources').textContent = 'Fontes: ' + n.sources + '\\n\\nVisual: ' + n.visual;
  }
  function show(n, notifyParent = true) {
    index = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
    });
    $('slide-counter').textContent = String(index + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
    $('slide-title').textContent = notes[index] ? notes[index].title : '';
    $('prev').disabled = index === 0;
    $('next').disabled = index === slides.length - 1;
    $('progress').style.width = ((index + 1) / slides.length * 100) + '%';
    updateNotes();
    document.querySelectorAll('.overview-card').forEach((card, i) => card.setAttribute('aria-current', String(i === index)));
    if (notifyParent && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'TAWPER_DECK_SLIDE_CHANGE',
        index,
        total: slides.length,
        title: notes[index] ? notes[index].title : '',
        chapter: notes[index] ? notes[index].chapter : ''
      }, '*');
    }
  }
  function toggleNotes() {
    const open = $('notes-panel').classList.toggle('open');
    $('notes-button').setAttribute('aria-expanded', String(open));
    updateNotes();
  }
  function openOverview() {
    if (!overview.open) overview.showModal();
    overview.querySelector('[aria-current="true"]')?.focus();
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {}
  }
  const grid = $('overview-grid');
  notes.forEach((n, i) => {
    const button = document.createElement('button');
    button.className = 'overview-card';
    button.style.padding = '14px';
    const badge = document.createElement('div');
    badge.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#ff8da3;font-weight:800;margin-bottom:6px';
    badge.textContent = String(i + 1).padStart(2, '0') + ' · ' + (n.chapter || 'Tawper');
    const label = document.createElement('span');
    label.style.cssText = 'padding:0;font-size:13.5px;font-weight:700;min-height:42px;color:#fff';
    label.textContent = n.title;
    button.append(badge, label);
    button.addEventListener('click', () => { show(i); overview.close(); });
    grid.append(button);
  });
  $('prev').addEventListener('click', () => show(index - 1));
  $('next').addEventListener('click', () => show(index + 1));
  $('notes-button').addEventListener('click', toggleNotes);
  $('close-notes').addEventListener('click', toggleNotes);
  $('overview-button').addEventListener('click', openOverview);
  $('close-overview').addEventListener('click', () => overview.close());
  $('fullscreen-button').addEventListener('click', fullscreen);
  $('print-button').addEventListener('click', () => window.print());
  overview.addEventListener('click', (event) => { if (event.target === overview) overview.close(); });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.target.isContentEditable) return;
    if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (overview.open) return;
    const actions = {
      ArrowRight: () => show(index + 1), PageDown: () => show(index + 1),
      ArrowLeft: () => show(index - 1), PageUp: () => show(index - 1),
      ' ': () => show(index + 1), Home: () => show(0), End: () => show(slides.length - 1),
      n: toggleNotes, N: toggleNotes, g: openOverview, G: openOverview, f: fullscreen, F: fullscreen
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'TAWPER_DECK_GOTO' && typeof data.index === 'number') {
      show(data.index, true);
    } else if (data.type === 'TAWPER_DECK_PRINT') {
      window.print();
    } else if (data.type === 'TAWPER_DECK_OVERVIEW') {
      openOverview();
    } else if (data.type === 'TAWPER_DECK_NOTES') {
      toggleNotes();
    } else if (data.type === 'TAWPER_DECK_FULLSCREEN') {
      fullscreen();
    }
  });
  window.addEventListener('resize', fit);
  fit();
  show(index, true);
})();
</script>
</body>
</html>`;

  return { html, slides: slidesMeta };
}
