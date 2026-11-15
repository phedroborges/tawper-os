import institutionalSlidesData from "./tawper-slides-data.json";
import type { ProposalDocumentInput } from "./proposal";

export type PresentationDeckMode = "executive" | "complete";

export interface SlideDescriptor {
  index: number;
  id: string;
  title: string;
  chapter: string;
  isCustom?: boolean;
  customKey?: "cover" | "diagnosis" | "portfolio-1" | "portfolio-2" | "commercial" | "closing";
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

interface PortfolioCardItem {
  num: string;
  tag: string;
  title: string;
  desc: string;
  img: string;
  iconSvg: string;
  accent?: "blue" | "red" | "orange";
}

const PORTFOLIO_PART_1: PortfolioCardItem[] = [
  {
    num: "01",
    tag: "ALTA PRESSÃO · ISO · MSHA · CCS",
    title: "Mangueiras de tecnologia europeia",
    desc: "Origem técnica inglesa para aplicações agrícolas, industriais, florestais e mineração (linhas 4SH, 4SP, R13, R15, 2SN e R17).",
    img: "assets/geradas/17-mangueiras-catalogo.png",
    accent: "red",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  },
  {
    num: "02",
    tag: "COMPONENTES DO CONJUNTO",
    title: "Terminais crimpados, adaptadores e conexões",
    desc: "Terminais retos, curvos e adaptadores definidos em conjunto com a mangueira e a capa para compatibilidade exata na montagem.",
    img: "assets/originais/terminais-folder.png",
    accent: "blue",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  },
  {
    num: "03",
    tag: "IDENTIFICAR → CONFERIR → MONTAR",
    title: "Sistema de cores Tawper (Mangueira + Castanha)",
    desc: "A cor da identificação na mangueira corresponde à cor da castanha da prensa (vermelho, verde, amarelo e roxo), reduzindo erros na oficina.",
    img: "assets/geradas/06-sistema-cores.png",
    accent: "red",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 5.81 17.46 2 12 2z"/></svg>`,
  },
  {
    num: "04",
    tag: "PREPARAÇÃO DA MANGUEIRA",
    title: "Máquina de corte Tawper",
    desc: "Equipamento próprio de bancada para corte preciso da mangueira no comprimento definido para cada conjunto antes da montagem dos terminais.",
    img: "assets/originais/maquina-corte-tawper.jpeg",
    accent: "blue",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/></svg>`,
  },
  {
    num: "05",
    tag: "PRENSA COM FINAL DE CURSO",
    title: "Prensagem padronizada sem micrômetro",
    desc: "Prensa hidráulica com final de curso que dispensa ajustes por micrômetro durante a prensagem: processo repetível, ágil e sem retrabalho.",
    img: "assets/geradas/18-prensa-catalogo.png",
    accent: "red",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
  },
  {
    num: "06",
    tag: "MONTAGEM → LIMPEZA INTERNA → PROTEÇÃO",
    title: "Pistola de descontaminação interna",
    desc: "Disparo de projéteis que remove resíduos internos de corte e borracha da mangueira antes da instalação, protegendo bombas e válvulas.",
    img: "assets/geradas/08-pistola-tawper.png",
    accent: "blue",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  },
];

const PORTFOLIO_PART_2: PortfolioCardItem[] = [
  {
    num: "07",
    tag: "ARMAZENAMENTO · TRANSPORTE · INSTALAÇÃO",
    title: "Lacre retrátil para proteção da extremidade",
    desc: "O lacre termoencolhível se ajusta ao terminal após a limpeza e protege a abertura da mangueira contra poeira e umidade até a instalação.",
    img: "assets/geradas/09-lacre-protecao.png",
    accent: "blue",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  },
  {
    num: "08",
    tag: "EQUIPAMENTO · POSIÇÃO · DATA",
    title: "Gravação a laser customizada no terminal",
    desc: "Identificação permanente gravada na capa metálica com os dados definidos para a sua operação e o código individual do conjunto.",
    img: "assets/originais/gravacao-laser-folder.png",
    accent: "red",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  },
  {
    num: "09",
    tag: "HYDRASENSE · IDENTIDADE INDIVIDUAL",
    title: "Lacre numerado & registro do conjunto",
    desc: "O número do lacre conecta a mangueira ao seu histórico: montador, terminais, comprimento, equipamento, técnico, horímetro e substituições.",
    img: "assets/originais/hydrasense-conjunto.jpg",
    accent: "orange",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  },
  {
    num: "10",
    tag: "HYDRASENSE · GESTÃO DA INFORMAÇÃO",
    title: "Painel de indicadores, recorrências e custos",
    desc: "Transforma ocorrências em decisões: compara motivos de substituição, organiza custos por máquina e apoia o planejamento da manutenção.",
    img: "assets/originais/hydrasense-indicadores.png",
    accent: "orange",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  },
  {
    num: "11",
    tag: "CAPACITAÇÃO DA EQUIPE & ENGENHARIA",
    title: "Tawper Academy & Catálogos customizados",
    desc: "Escola própria com treinamento teórico e prático em montagem, inspeção e conservação + catálogos personalizados para cada máquina da sua frota.",
    img: "assets/geradas/20-academy-catalogo.png",
    accent: "blue",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  },
  {
    num: "12",
    tag: "IMPORTAÇÃO DIRETA · SP & ALAGOAS",
    title: "Suporte técnico presencial & Fornecimento direto",
    desc: "Acompanhamento técnico nas unidades e no campo + fornecimento direto de importadora para grandes consumidores, sem intermediação.",
    img: "assets/geradas/24-manutencao-oficina.png",
    accent: "red",
    iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  },
];

/**
 * Slides institucionais originais integrados na Proposta Executiva (9 slides no total, < 10 slides):
 * 01. Capa Oficial Personalizada (Slide 1 original adaptado com cliente/consultor)
 * 02. Diagnóstico Operacional & Frota do Cliente (Layout sem sobreposição)
 * 03. Qualidade da linha Tawper (+8 anos no mercado - Slide 3 original)
 * 04. A mangueira é apenas uma parte da conta (R$ 7.700 / 9,1% - Slide 9 original)
 * 05. Portfólio Completo Tawper (Parte 1/2): Mangueiras, Terminais, Cores, Corte, Prensa e Pistola (6 itens com foto e ícone)
 * 06. Portfólio Completo Tawper (Parte 2/2): Lacre Retrátil, Gravação Laser, HydraSense, Academy, Catálogos e Suporte (6 itens com foto e ícone)
 * 07. HydraSense em Campo: O DNA de cada mangueira (Slide 22 original)
 * 08. Investimento (Orçamento ERP) & Condições Comerciais
 * 09. Fale com a Tawper, Consultor Responsável & Aceite Formal
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

function renderPortfolioCardsHtml(items: PortfolioCardItem[], baseUrl: string): string {
  return items
    .map((item) => {
      const accentClass = item.accent ? `accent-${item.accent}` : "accent-blue";
      return `<article class="portfolio-item-card ${accentClass}">
  <div class="portfolio-thumb">
    <img alt="${esc(item.title)}" class="photo" draggable="false" loading="eager" src="${baseUrl}/${item.img}"/>
    <span class="portfolio-icon-badge" aria-hidden="true">${item.iconSvg}</span>
    <span class="portfolio-num-badge">${esc(item.num)}</span>
  </div>
  <div class="portfolio-copy">
    <span class="portfolio-tag">${esc(item.tag)}</span>
    <h3>${esc(item.title)}</h3>
    <p>${esc(item.desc)}</p>
  </div>
</article>`;
    })
    .join("\n");
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

  const totalSlides = mode === "complete" ? 1 + COMPLETE_INSTITUTIONAL_NUMS.length + 3 : 9;

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

  // SLIDE PERSONALIZADO: DIAGNÓSTICO OPERACIONAL & FROTA DO CLIENTE (Flex/Grid sem risco de sobreposição)
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
      visual: "Layout editorial inspirado no slide 'Como a Tawper surgiu', estruturado em fluxo flex/grid para nunca sobrepor títulos longos.",
      html: `<section aria-hidden="true" aria-label="Diagnóstico Operacional ${esc(nomeCliente)}" class="slide white company-story proposal-diagnosis" data-chapter="Proposta Personalizada" data-title="Diagnóstico Operacional · ${esc(nomeCliente)}" id="slide-${String(slideNum).padStart(2, "0")}">
<header class="topbar"><img alt="Tawper — mangueiras e conexões" class="logo" src="${baseUrl}/assets/marca/tawper.svg"/><span class="topic">DIAGNÓSTICO DO CLIENTE · ${esc(termos.codigo)}</span></header>
<div class="proposal-stage-body">
  <div class="proposal-head">
    <p class="eyebrow kicker">Cenário operacional mapeado</p>
    <h2>A operação da <span class="blue-text">${esc(nomeCliente)}</span> no centro da proposta.</h2>
  </div>
  <div class="proposal-diag-grid">
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
  </div>
</div>
<footer class="slide-footer"><span>TAWPER · DIAGNÓSTICO OPERACIONAL · ${esc(nomeCliente.toUpperCase())}</span><span class="page">${pageStr}</span></footer>
</section>`,
    };
  };

  // SLIDE 05: PORTFÓLIO COMPLETO TAWPER (PARTE 1/2 — PRODUTOS, COMPONENTES E EQUIPAMENTOS DE BANCADA)
  const buildPortfolioPart1Slide = (slideNum: number) => {
    const pageStr = `${String(slideNum).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;
    return {
      id: `slide-${String(slideNum).padStart(2, "0")}`,
      title: "Portfólio Tawper (1/2) · Produtos, Terminais e Bancada",
      chapter: "Diferenciais & Portfólio",
      isCustom: true,
      customKey: "portfolio-1" as const,
      notes: "Apresenta todos os produtos e equipamentos de oficina da Tawper: 01 Mangueiras de tecnologia europeia (ISO/MSHA/CCS), 02 Terminais crimpados e conexões, 03 Sistema de cores (mangueira + castanha), 04 Máquina de corte Tawper, 05 Prensa com final de curso sem micrômetro e 06 Pistola de descontaminação.",
      sources: "Slides 12, 13, 14, 15, 16 e 17 da apresentação institucional Tawper.",
      visual: "Grade editorial 3x2 com foto real de cada equipamento/produto, ícone técnico e especificação.",
      html: `<section aria-hidden="true" aria-label="Portfólio Tawper Parte 1: Produtos e Equipamentos de Bancada" class="slide white proposal-portfolio" data-chapter="Diferenciais Tawper" data-title="Portfólio Tawper (1/2) · Produtos, Terminais e Bancada" id="slide-${String(slideNum).padStart(2, "0")}">
<header class="topbar"><img alt="Tawper — mangueiras e conexões" class="logo" src="${baseUrl}/assets/marca/tawper.svg"/><span class="topic">PORTFÓLIO COMPLETO TAWPER · PARTE 1 DE 2</span></header>
<div class="proposal-stage-body">
  <div class="proposal-head">
    <p class="eyebrow kicker">Da escolha do componente à montagem na bancada (Itens 01 a 06)</p>
    <h2>Produtos, conexões e <span class="blue-text">equipamentos de oficina Tawper.</span></h2>
  </div>
  <div class="proposal-portfolio-grid">
    ${renderPortfolioCardsHtml(PORTFOLIO_PART_1, baseUrl)}
  </div>
  <div class="portfolio-summary-strip">
    <span><strong>Fluxo de Bancada Tawper:</strong> Especificação correta (ISO · MSHA · CCS) &nbsp;→&nbsp; Corte no esquadro &nbsp;→&nbsp; Seleção por cor (Mangueira = Castanha) &nbsp;→&nbsp; Prensagem com final de curso &nbsp;→&nbsp; Descontaminação interna.</span>
  </div>
</div>
<footer class="slide-footer"><span>TAWPER · PORTFÓLIO DE PRODUTOS E EQUIPAMENTOS (1/2)</span><span class="page">${pageStr}</span></footer>
</section>`,
    };
  };

  // SLIDE 06: PORTFÓLIO COMPLETO TAWPER (PARTE 2/2 — PROTEÇÃO, IDENTIFICAÇÃO, HYDRASENSE & SUPORTE)
  const buildPortfolioPart2Slide = (slideNum: number) => {
    const pageStr = `${String(slideNum).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`;
    return {
      id: `slide-${String(slideNum).padStart(2, "0")}`,
      title: "Portfólio Tawper (2/2) · Proteção, HydraSense e Suporte",
      chapter: "Diferenciais & Portfólio",
      isCustom: true,
      customKey: "portfolio-2" as const,
      notes: "Apresenta todas as soluções de proteção, identificação, inteligência e serviço da Tawper: 07 Lacre retrátil para proteção, 08 Gravação a laser customizada, 09 HydraSense lacre numerado, 10 HydraSense painel de indicadores, 11 Tawper Academy e catálogos customizados e 12 Suporte técnico presencial e fornecimento direto.",
      sources: "Slides 18, 19, 20, 22, 24, 25 e 26 da apresentação institucional Tawper.",
      visual: "Grade editorial 3x2 com foto real de cada solução/tecnologia, ícone técnico e especificação.",
      html: `<section aria-hidden="true" aria-label="Portfólio Tawper Parte 2: Proteção, HydraSense e Suporte" class="slide white proposal-portfolio" data-chapter="Diferenciais Tawper" data-title="Portfólio Tawper (2/2) · Proteção, HydraSense e Suporte" id="slide-${String(slideNum).padStart(2, "0")}">
<header class="topbar"><img alt="Tawper — mangueiras e conexões" class="logo" src="${baseUrl}/assets/marca/tawper.svg"/><span class="topic">PORTFÓLIO COMPLETO TAWPER · PARTE 2 DE 2</span></header>
<div class="proposal-stage-body">
  <div class="proposal-head">
    <p class="eyebrow kicker">Proteção, rastreabilidade, capacitação e fornecimento direto (Itens 07 a 12)</p>
    <h2>Identificação, <span class="orange-text">HydraSense</span>, Academy e <span class="blue-text">suporte em campo.</span></h2>
  </div>
  <div class="proposal-portfolio-grid">
    ${renderPortfolioCardsHtml(PORTFOLIO_PART_2, baseUrl)}
  </div>
  <div class="portfolio-summary-strip">
    <span><strong>Ecossistema Integrado Tawper:</strong> Lacre retrátil + Gravação a laser &nbsp;→&nbsp; Rastreabilidade HydraSense em campo &nbsp;→&nbsp; Treinamento Tawper Academy &nbsp;→&nbsp; Importação e fornecimento direto sem intermediação.</span>
  </div>
</div>
<footer class="slide-footer"><span>TAWPER · PROTEÇÃO, INTELIGÊNCIA E SUPORTE TÉCNICO (2/2)</span><span class="page">${pageStr}</span></footer>
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
<div class="proposal-stage-body">
  <div class="proposal-head">
    <p class="eyebrow kicker">Fornecimento direto de importadora · sem intermediação</p>
    <h2>Condições comerciais e <span class="blue-text">orçamento oficial Tawper.</span></h2>
  </div>
  <div class="proposal-commercial-grid">
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
  </div>
  <p class="proposal-sim-note">Proposta Comercial Nº ${esc(termos.codigo)}${orcamento.numeroExterno ? ` · Orçamento ERP Nº ${esc(orcamento.numeroExterno)}` : ""} · Destinada a ${esc(nomeCliente)} (CNPJ ${esc(cliente.cnpj || "sob consulta")}) · Responsável Tawper: ${esc(vendedor.nome)}.</p>
</div>
<footer class="slide-footer"><span>TAWPER · CONDIÇÕES COMERCIAIS · ${esc(termos.codigo)}</span><span class="page">${pageStr}</span></footer>
</section>`,
    };
  };

  const pushInstitutionalByOriginalNum = (originalNum: number) => {
    const inst = INSTITUTIONAL_SLIDES.find((s) => s.originalNum === originalNum);
    if (!inst) return;
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
  };

  if (mode === "executive") {
    // 02: Diagnóstico Operacional do Cliente
    builtSections.push(buildDiagnosisSlide(2));
    // 03: Qualidade da linha Tawper (+8 anos)
    pushInstitutionalByOriginalNum(3);
    // 04: O impacto da parada (R$ 7.700 / 9,1%)
    pushInstitutionalByOriginalNum(9);
    // 05: Portfólio Completo Tawper (Parte 1/2): Produtos, Terminais, Cores, Corte, Prensa e Pistola
    builtSections.push(buildPortfolioPart1Slide(builtSections.length + 1));
    // 06: Portfólio Completo Tawper (Parte 2/2): Lacre Retrátil, Laser, HydraSense, Academy e Suporte
    builtSections.push(buildPortfolioPart2Slide(builtSections.length + 1));
    // 07: HydraSense em Campo: O DNA de cada mangueira
    pushInstitutionalByOriginalNum(22);
    // 08: Investimento (Orçamento ERP) & Condições Comerciais
    builtSections.push(buildCommercialSlide(builtSections.length + 1));
  } else {
    COMPLETE_INSTITUTIONAL_NUMS.forEach((n) => pushInstitutionalByOriginalNum(n));
    builtSections.push(buildDiagnosisSlide(builtSections.length + 1));
    builtSections.push(buildCommercialSlide(builtSections.length + 1));
  }

  // SLIDE FINAL (09): CONTATO PERSONALIZADO & ACEITE FORMAL
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
<div class="proposal-stage-body">
  <div class="proposal-head">
    <p class="eyebrow kicker">Próximo passo com a ${esc(nomeCliente)}</p>
    <h2>Fale com a Tawper</h2>
  </div>
  <div class="proposal-closing-contacts">
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

/* Container Flex/Grid anti-sobreposição para todos os slides personalizados */
.proposal-stage-body{position:absolute;top:120px;left:80px;right:80px;bottom:74px;display:flex;flex-direction:column;justify-content:space-between;gap:20px}
.proposal-head{flex-shrink:0}
.proposal-head .eyebrow{margin-bottom:12px}
.proposal-head h2{font-size:48px;line-height:1.1;letter-spacing:-.045em;max-width:1440px}

/* Slide 02: Diagnóstico do Cliente */
.proposal-diag-grid{flex:1;min-height:0;display:grid;grid-template-columns:1.08fr 0.92fr;gap:42px;align-items:stretch}
.proposal-diagnosis .proposal-diag-left{position:static!important;width:auto!important;display:flex;flex-direction:column;justify-content:space-between;gap:20px}
.proposal-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 30px}
.proposal-meta-cell{border-top:2px solid var(--blue);padding-top:12px;display:flex;flex-direction:column;gap:4px}
.proposal-meta-cell .meta-idx{font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--red);text-transform:uppercase}
.proposal-meta-cell strong{font-size:21px;line-height:1.2;color:var(--ink);letter-spacing:-.025em}
.proposal-meta-cell span:last-child{font-size:16.5px;color:var(--muted);line-height:1.3}
.proposal-diag-Focus{border-left:5px solid var(--red);background:var(--paper);padding:16px 20px}
.proposal-diag-Focus .focus-label{display:block;font-size:12.5px;font-weight:800;letter-spacing:.12em;color:var(--blue);margin-bottom:6px}
.proposal-diag-Focus p{font-size:19px!important;line-height:1.36!important;color:var(--ink)}
.proposal-diagnosis .story-path.proposal-fleet-panel{position:static!important;width:auto!important;background:var(--blue);color:#fff;padding:24px 36px;display:flex;flex-direction:column;justify-content:center}
.proposal-fleet-panel strong{color:#fff;font-weight:800}

/* Slides 05 e 06: Portfólio Completo de Produtos, Equipamentos e Soluções */
.proposal-portfolio-grid{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,1fr);gap:16px 26px}
.portfolio-item-card{display:flex;align-items:stretch;gap:16px;background:var(--paper);border:1px solid var(--line);border-top:3px solid var(--blue);padding:12px 16px;min-height:0;overflow:hidden}
.portfolio-item-card.accent-red{border-top-color:var(--red)}
.portfolio-item-card.accent-orange{border-top-color:var(--orange)}
.portfolio-thumb{position:relative;width:138px;flex-shrink:0;background:#fff;border:1px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center}
.portfolio-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.portfolio-icon-badge{position:absolute;left:6px;top:6px;width:30px;height:30px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,.22)}
.portfolio-item-card.accent-red .portfolio-icon-badge{background:var(--red)}
.portfolio-item-card.accent-orange .portfolio-icon-badge{background:var(--orange)}
.portfolio-item-card.accent-blue .portfolio-icon-badge{background:var(--blue)}
.portfolio-num-badge{position:absolute;right:6px;bottom:6px;background:#141d35d9;color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em;padding:2px 7px}
.portfolio-copy{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
.portfolio-tag{display:block;font-size:11.5px;font-weight:800;letter-spacing:.11em;color:var(--red);text-transform:uppercase;margin-bottom:4px}
.portfolio-item-card.accent-orange .portfolio-tag{color:var(--orange)}
.portfolio-item-card.accent-blue .portfolio-tag{color:var(--blue)}
.portfolio-copy h3{font-size:21px!important;line-height:1.16!important;font-weight:800!important;color:var(--ink);letter-spacing:-.025em}
.portfolio-copy p{font-size:15.5px!important;line-height:1.32!important;color:var(--muted);margin-top:5px}
.portfolio-summary-strip{flex-shrink:0;background:var(--ink);color:#fff;padding:11px 18px;border-left:5px solid var(--red);font-size:15.5px;line-height:1.35}
.portfolio-summary-strip strong{color:#ff8da3}

/* Slide 08: Comercial & Investimento */
.proposal-commercial-grid{flex:1;min-height:0;display:grid;grid-template-columns:0.95fr 1.05fr;gap:44px;align-items:center}
.proposal-commercial-left{position:static!important;width:auto!important}
.comm-kicker{display:block;font-size:15px;font-weight:800;letter-spacing:.14em;color:var(--red);text-transform:uppercase}
.comm-amount{font-size:68px;line-height:1.04;font-weight:800;letter-spacing:-.055em;color:var(--blue);margin-top:8px}
.comm-amount.comm-text-mode{font-size:52px;line-height:1.08}
.comm-caption{font-size:19.5px!important;line-height:1.36!important;color:var(--ink);margin-top:14px}
.comm-direct-callout{margin-top:22px;border-left:5px solid var(--red);padding:14px 18px;background:var(--paper)}
.comm-direct-callout strong{display:block;font-size:19px;color:var(--ink);letter-spacing:-.02em}
.comm-direct-callout p{font-size:16.5px!important;line-height:1.34!important;color:var(--muted);margin-top:6px}
.proposal-terms-grid{position:static!important;display:grid;grid-template-columns:1fr 1fr;gap:24px 34px}
.proposal-term-card{border-top:2px solid var(--blue);padding-top:14px}
.proposal-term-card .term-idx{display:block;font-size:12.5px;font-weight:800;letter-spacing:.12em;color:var(--red);margin-bottom:8px}
.proposal-term-card h3{font-size:24px;line-height:1.18;color:var(--ink)}
.proposal-term-card p{font-size:17px!important;line-height:1.34!important;color:var(--muted);margin-top:8px}
.proposal-sim-note{flex-shrink:0;font-size:15.5px!important;line-height:1.4!important;border-top:1px solid var(--line);padding-top:12px;color:#657084}

/* Slide 09: Fechamento e Aceite */
.proposal-closing-contacts{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,1fr);gap:44px;align-items:start;margin-top:6px}
.proposal-closing .contact-name{border-top:2px solid var(--line);padding-top:18px}
.proposal-closing .contact-name.featured-consultant{border-top:4px solid var(--red);background:var(--paper);padding:20px 24px 22px}
.consultant-pill{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.12em;padding:4px 10px;background:var(--red);color:#fff;margin-bottom:12px;text-transform:uppercase}
.consultant-pill.muted-pill{background:#e4e8f0;color:var(--blue)}
.proposal-closing .contact-name h3{font-size:34px!important;line-height:1.15}
.proposal-closing .contact-name a{display:block;font-size:26px!important;color:var(--blue);margin-top:16px!important;text-decoration:none;font-weight:700}
.consultant-email{display:block;font-size:17px;color:var(--muted);margin-top:8px}
.proposal-closing-footer{flex-shrink:0;border-top:1px solid var(--line);padding-top:18px;display:flex;align-items:flex-end;justify-content:space-between;gap:40px}
.closing-address{font-size:19px;line-height:1.45;color:#657084}
.closing-address a{display:block;text-decoration:none;color:var(--blue);font-size:25px;font-weight:800;margin-bottom:6px}
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
