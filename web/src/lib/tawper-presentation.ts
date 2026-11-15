import type { ProposalDocumentInput } from "./proposal";
import { money } from "./utils";

export type PresentationDeckMode = "executive" | "complete";

export interface SlideDescriptor {
  index: number;
  id: string;
  title: string;
  chapter: string;
  isCustom?: boolean;
  customKey?: "cover" | "diagnosis" | "scope" | "commercial" | "closing";
}

function esc(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return "";
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    const [d, m, y] = raw.split("/").map(Number);
    base = new Date(y, m - 1, d);
  } else {
    base = new Date(`${raw}T12:00:00`);
  }
  if (Number.isNaN(base.getTime())) return raw;
  base.setDate(base.getDate() + Math.max(0, days));
  return `${String(base.getDate()).padStart(2, "0")}/${String(base.getMonth() + 1).padStart(2, "0")}/${base.getFullYear()}`;
}

export function buildTawperPresentationDeck(
  input: ProposalDocumentInput,
  options?: {
    mode?: PresentationDeckMode;
    baseUrl?: string;
    initialSlideIndex?: number;
  }
): {
  html: string;
  slides: SlideDescriptor[];
} {
  const baseUrl = (options?.baseUrl ?? "/apresentacao-tawper").replace(/\/$/, "");
  const initialIndex = Math.max(0, Math.min(7, options?.initialSlideIndex ?? 0));

  const { cliente, vendedor, frota, orcamento, termos } = input;
  const nomeCliente = cliente.nomeFantasia || cliente.razaoSocial || "Cliente Parceiro";
  const emissaoFmt = fmtDateBr(termos.dataEmissao);
  const validadeFmt = addDaysBr(termos.dataEmissao, termos.validadeDias);
  const totalSlides = 8;

  const showValor = Boolean(termos.mostrarValores && orcamento.valorTotal && orcamento.valorTotal > 0);
  const valorFmt = showValor && orcamento.valorTotal ? money(orcamento.valorTotal) : "Conforme Orçamento ERP Anexo";

  const sections: Array<{
    id: string;
    title: string;
    chapter: string;
    customKey?: SlideDescriptor["customKey"];
    html: string;
  }> = [
    // SLIDE 01 — CAPA A4 SEM BORDAS
    {
      id: "slide-01",
      title: `Capa · ${nomeCliente}`,
      chapter: "Abertura",
      customKey: "cover",
      html: `<section class="slide page-dark active" id="slide-01">
  <div class="accent-bar"></div>
  <div class="cover-hero">
    <img src="${baseUrl}/assets/geradas/14-capa-terminais-catalogo.png" alt="Conjuntos hidráulicos Tawper" class="cover-photo"/>
    <div class="cover-scrim"></div>
    <header class="cover-top">
      <img src="${baseUrl}/assets/marca/tawper.svg" alt="Tawper" class="logo-svg"/>
      <span class="badge-code">${esc(termos.codigo)} · PROPOSTA COMERCIAL</span>
    </header>
    <div class="cover-copy">
      <p class="kicker">PREPARADA PARA ${esc(nomeCliente.toUpperCase())}</p>
      <h1>Soluções completas em mangueiras hidráulicas para safra contínua.</h1>
      <p class="lead">Tecnologia de linha pesada, padronização de oficina, fornecimento programado e rastreabilidade operacional para a <strong>${esc(nomeCliente)}</strong>.</p>
    </div>
  </div>
  <div class="cover-body">
    <div class="dark-panel highlight-left">
      <span class="mini-label">DESTINATÁRIO & UNIDADE</span>
      <h2>${esc(nomeCliente)}</h2>
      <p class="muted-light">${esc(cliente.razaoSocial)} · CNPJ: ${esc(cliente.cnpj)} · ${esc(cliente.cidadeUf)}</p>
      <p class="white-line">A/C: <strong>${esc(cliente.destinatarioNome)}</strong> (${esc(cliente.destinatarioCargo)})${cliente.destinatarioFone ? ` · ${esc(cliente.destinatarioFone)}` : ""}</p>
    </div>

    <div class="metrics-row">
      <div class="dark-panel">
        <span class="mini-label">FROTA MAPEADA</span>
        <strong>${frota.numColhedoras} máquinas</strong>
        <p>${esc(frota.marcaFrota)}</p>
      </div>
      <div class="dark-panel">
        <span class="mini-label">CONDIÇÃO PADRÃO</span>
        <strong>${esc(termos.condicaoPagamento)}</strong>
        <p>${esc(termos.frete)} · ${esc(termos.prazoEntrega)}</p>
      </div>
      <div class="dark-panel">
        <span class="mini-label">${showValor ? "ORÇAMENTO ERP" : "VALIDADE"}</span>
        <strong>${esc(showValor ? valorFmt : `${termos.validadeDias} dias`)}</strong>
        <p>${orcamento.numeroExterno ? `Orçamento ERP ${esc(orcamento.numeroExterno)}` : `Válida até ${esc(validadeFmt)}`}</p>
      </div>
    </div>

    <div class="dark-panel seller-panel">
      <div>
        <span class="mini-label">CONSULTOR TAWPER RESPONSÁVEL</span>
        <h3>${esc(vendedor.nome)} — ${esc(vendedor.cargo)}</h3>
        <p class="white-line">WhatsApp Comercial: <strong>${esc(vendedor.telefone || "A confirmar")}</strong> · E-mail: ${esc(vendedor.email)}</p>
      </div>
      <div class="date-col">
        <span>Emissão: ${esc(emissaoFmt)}</span>
        <span>Validade: ${esc(validadeFmt)}</span>
      </div>
    </div>
  </div>
  <footer class="slide-foot dark-foot">
    <span>TAWPER MANGUEIRAS E CONEXÕES · FORMATO A4 EXECUTIVO</span>
    <span>01 / ${String(totalSlides).padStart(2, "0")}</span>
  </footer>
</section>`,
    },

    // SLIDE 02 — DIAGNÓSTICO DE FROTA
    {
      id: "slide-02",
      title: `Diagnóstico de Frota · ${nomeCliente}`,
      chapter: "Diagnóstico",
      customKey: "diagnosis",
      html: `<section class="slide page-light" id="slide-02">
  <header class="band-head">
    <div class="band-meta"><span class="red-kicker">02 · DIAGNÓSTICO DA OPERAÇÃO</span><span>02 / 08</span></div>
    <h2>Cenário técnico e riscos operacionais em ${esc(nomeCliente)}</h2>
  </header>
  <div class="page-pad">
    <div class="spec-grid">
      <div class="spec-box"><span>Frota Ativa</span><strong>${frota.numColhedoras} colhedoras / máquinas</strong></div>
      <div class="spec-box"><span>Fabricantes / Linhas</span><strong>${esc(frota.marcaFrota)}</strong></div>
      <div class="spec-box"><span>Prensa em Oficina</span><strong>${esc(frota.prensa)}</strong></div>
      <div class="spec-box"><span>Terminais / Roscas</span><strong>${esc(frota.conector)}</strong></div>
      <div class="spec-box"><span>Proteção / Espiral</span><strong>${esc(frota.espiral)}</strong></div>
      <div class="spec-box"><span>Fornecedor / Base</span><strong>${esc(frota.fornecedorAtual)}</strong></div>
    </div>

    <div class="alert-box">
      <span class="red-kicker">FOCO PRIORITÁRIO DO PROJETO</span>
      <p>${esc(frota.gargaloPrincipal)}</p>
    </div>

    <h3 class="sec-sub">Por que a mangueira é peça crítica na disponibilidade de colheita?</h3>
    <div class="risk-stack">
      <div class="risk-card">
        <strong>1. Parada em pico de safra</strong>
        <p>Um único rompimento hidráulico trava a colhedora no talhão, exige deslocamento de mecânico e reduz o ritmo da frente de corte.</p>
      </div>
      <div class="risk-card">
        <strong>2. Erro de montagem ou prensagem</strong>
        <p>Prensagem sem precisão, comprimento incorreto ou terminal fora do padrão causam vazamento precoce sob pico de pressão.</p>
      </div>
      <div class="risk-card">
        <strong>3. Falta de padronização visual na oficina</strong>
        <p>Sem identificação rápida de bitola e aplicação, o time perde minutos preciosos medindo peças ou mantendo estoque ocioso.</p>
      </div>
    </div>
  </div>
  <footer class="slide-foot">
    <span>${esc(termos.codigo)} · ${esc(nomeCliente)} · Consultor: ${esc(vendedor.nome)}</span>
    <span>02 / 08</span>
  </footer>
</section>`,
    },

    // SLIDE 03 — PORTFÓLIO TÉCNICO TAWPER
    {
      id: "slide-03",
      title: "Engenharia de Linha Tawper",
      chapter: "Portfólio",
      customKey: "scope",
      html: `<section class="slide page-light" id="slide-03">
  <header class="band-head">
    <div class="band-meta"><span class="red-kicker">03 · ENGENHARIA DE LINHA TAWPER</span><span>03 / 08</span></div>
    <h2>Mangueiras de alta performance, terminais e proteção externa</h2>
  </header>
  <div class="page-pad">
    <div class="photo-banner">
      <img src="${baseUrl}/assets/geradas/17-mangueiras-catalogo.png" alt="Mangueiras Tawper"/>
    </div>
    <div class="quad-grid">
      <div class="pillar-card">
        <span class="red-kicker">MANGUEIRA 2 TRAMAS (15x ISO)</span>
        <h4>Resistência à fadiga por impulso</h4>
        <p>Desenvolvida para suportar ciclos severos de vibração e pressão muito acima do requisito ISO padrão em sistemas agrícolas.</p>
      </div>
      <div class="pillar-card">
        <span class="red-kicker">ESPIRALADA 4SH / R13</span>
        <h4>Alta pressão para linha pesada</h4>
        <p>Estabilidade térmica, raio de curvatura controlado e confiabilidade em circuitos principais de colhedoras e tratores.</p>
      </div>
      <div class="pillar-card">
        <span class="red-kicker">TERMINAIS JIC / ORFS / SAE</span>
        <h4>Vedação precisa sem gambiarras</h4>
        <p>Compatibilidade direta com plataformas Case, John Deere e implementos pesados para montagem limpa e segura.</p>
      </div>
      <div class="pillar-card">
        <span class="red-kicker">ESPIRAL ANTICHAMA & CAPA</span>
        <h4>Proteção contra abrasão e calor</h4>
        <p>Preserva o conjunto montado contra atrito mecânico contínuo, radiação solar e áreas quentes de motor e transmissão.</p>
      </div>
    </div>
    <div class="dark-strip">
      <strong>Modalidades flexíveis de atendimento:</strong> Venda Direta, Comodato de Prensa/Estrutura, Locação ou Programas Técnicos — itens e valores oficiais no orçamento ERP anexo.
    </div>
  </div>
  <footer class="slide-foot">
    <span>${esc(termos.codigo)} · ${esc(nomeCliente)} · Consultor: ${esc(vendedor.nome)}</span>
    <span>03 / 08</span>
  </footer>
</section>`,
    },

    // SLIDE 04 — SISTEMA DE CORES & LACRE
    {
      id: "slide-04",
      title: "Sistema de Cores & Lacre",
      chapter: "Padronização",
      html: `<section class="slide page-light" id="slide-04">
  <header class="band-head">
    <div class="band-meta"><span class="red-kicker">04 · PADRONIZAÇÃO VISUAL EM CAMPO</span><span>04 / 08</span></div>
    <h2>Sistema de Cores Tawper, Pistola Térmica e Lacre de Proteção</h2>
  </header>
  <div class="page-pad">
    <div class="photo-banner tall">
      <img src="${baseUrl}/assets/geradas/06-sistema-cores.png" alt="Sistema de Cores Tawper"/>
    </div>
    <div class="stack-cards">
      <div class="border-card red-left">
        <h4>01. Identificação visual instantânea por cor</h4>
        <p>Cada bitola e linha recebe cor padronizada. Mecânico e almoxarife identificam o conjunto certo em segundos, eliminando erro de separação.</p>
      </div>
      <div class="border-card dark-left">
        <h4>02. Pistola Térmica & Lacre Termoencolhível Tawper</h4>
        <p>Sela a junção contra entrada de poeira, umidade e contaminação durante o transporte ao talhão e protege a gravação técnica da peça.</p>
      </div>
      <div class="border-card gray-left">
        <h4>03. Bancada organizada & reposição ágil</h4>
        <p>Reduz o estoque parado por erro de compra e acelera a entrega no balcão da oficina em turnos de safra 24 horas.</p>
      </div>
    </div>
  </div>
  <footer class="slide-foot">
    <span>${esc(termos.codigo)} · ${esc(nomeCliente)} · Consultor: ${esc(vendedor.nome)}</span>
    <span>04 / 08</span>
  </footer>
</section>`,
    },

    // SLIDE 05 — PRENSA COM SENSOR FIM DE CURSO
    {
      id: "slide-05",
      title: "Prensa com Sensor Fim de Curso",
      chapter: "Oficina",
      html: `<section class="slide page-light" id="slide-05">
  <header class="band-head">
    <div class="band-meta"><span class="red-kicker">05 · OFICINA DE ALTA CONFIABILIDADE</span><span>05 / 08</span></div>
    <h2>Prensa Hidráulica Tawper com Sensor Fim de Curso</h2>
  </header>
  <div class="page-pad">
    <div class="photo-banner tall">
      <img src="${baseUrl}/assets/geradas/18-prensa-catalogo.png" alt="Prensa Hidráulica Tawper"/>
    </div>
    <div class="dark-banner">
      <span class="mini-label">PRECISÃO REPETITIVA</span>
      <p>O sensor de fim de curso interrompe o ciclo exatamente no diâmetro calibrado pela engenharia Tawper — padronizando a qualidade da montagem independente do turno ou operador.</p>
    </div>
    <div class="quad-grid">
      <div class="spec-box"><span>Zero subprensagem</span><p>Evita escape de terminal ou vazamento prematuro sob pico de pressão.</p></div>
      <div class="spec-box"><span>Implantação assistida</span><p>Modelos sob medida para aquisição ou comodato conforme projeto aprovado.</p></div>
      <div class="spec-box"><span>Troca ágil de castanhas</span><p>Tabela visual junto à máquina para operação rápida em emergências.</p></div>
      <div class="spec-box"><span>Disponibilidade da frota</span><p>Menos retrabalho na oficina significa mais horas efetivas no campo.</p></div>
    </div>
  </div>
  <footer class="slide-foot">
    <span>${esc(termos.codigo)} · ${esc(nomeCliente)} · Consultor: ${esc(vendedor.nome)}</span>
    <span>05 / 08</span>
  </footer>
</section>`,
    },

    // SLIDE 06 — TAWPER ACADEMY & HYDRASENSE
    {
      id: "slide-06",
      title: "Tawper Academy & HydraSense",
      chapter: "Capacitação & Digital",
      html: `<section class="slide page-light" id="slide-06">
  <header class="band-head">
    <div class="band-meta"><span class="red-kicker">06 · CAPACITAÇÃO & INTELIGÊNCIA DIGITAL</span><span>06 / 08</span></div>
    <h2>Tawper Academy + HydraSense: equipe treinada e frota rastreada</h2>
  </header>
  <div class="page-pad">
    <div class="split-photos">
      <img src="${baseUrl}/assets/geradas/20-academy-catalogo.png" alt="Tawper Academy"/>
      <img src="${baseUrl}/assets/geradas/22-hydrasense-vertical.png" alt="HydraSense"/>
    </div>
    <div class="two-cols">
      <div class="col-card light">
        <span class="red-kicker">TAWPER ACADEMY</span>
        <h4>Treinamento prático in-loco</h4>
        <ul>
          <li>Capacitação presencial de mecânicos e almoxarifes na própria oficina.</li>
          <li>Boas práticas de corte, descascamento, prensagem e roteamento sem torção.</li>
          <li>Certificação prática da equipe para manter o padrão em todos os turnos.</li>
        </ul>
      </div>
      <div class="col-card dark">
        <span class="mini-label">HYDRASENSE</span>
        <h4>Rastreabilidade por máquina</h4>
        <ul>
          <li>Identificação individual de pontos críticos por QR Code / tag na colhedora.</li>
          <li>Histórico de trocas por equipamento para manutenção preventiva inteligente.</li>
          <li>Consulta imediata em campo e relatórios de confiabilidade para a usina.</li>
        </ul>
      </div>
    </div>
  </div>
  <footer class="slide-foot">
    <span>${esc(termos.codigo)} · ${esc(nomeCliente)} · Consultor: ${esc(vendedor.nome)}</span>
    <span>06 / 08</span>
  </footer>
</section>`,
    },

    // SLIDE 07 — ORÇAMENTO ERP & CONDIÇÕES COMERCIAIS
    {
      id: "slide-07",
      title: "Orçamento ERP & Condições Comerciais",
      chapter: "Comercial",
      customKey: "commercial",
      html: `<section class="slide page-light" id="slide-07">
  <header class="band-head">
    <div class="band-meta"><span class="red-kicker">07 · INVESTIMENTO & CONDIÇÕES</span><span>07 / 08</span></div>
    <h2>Orçamento oficial do ERP Tawper e diretrizes comerciais</h2>
  </header>
  <div class="page-pad">
    <div class="erp-card">
      <div class="erp-head">
        <div>
          <span class="red-kicker">ORÇAMENTO VINCULADO (ERP TAWPER)</span>
          <h3>${orcamento.numeroExterno ? `Orçamento Nº ${esc(orcamento.numeroExterno)}` : "Escopo Oficial conforme Orçamento ERP Anexo"}</h3>
        </div>
        ${showValor ? `<div class="erp-total">${esc(valorFmt)}</div>` : ""}
      </div>
      <p class="erp-summary">${esc(orcamento.resumoEscopo)}</p>
      <ul class="erp-bullets">
        ${orcamento.destaques.slice(0, 4).map((d) => `<li>+ ${esc(d)}</li>`).join("")}
      </ul>
      <div class="erp-attach">
        ${orcamento.paginasAnexo > 0
          ? `Anexo integrante no PDF: ${orcamento.paginasAnexo} página(s) original(is) do orçamento ERP anexada(s) ao final do documento.`
          : "Detalhamento de códigos, quantidades e valores unitários conforme orçamento emitido no ERP Tawper."}
      </div>
    </div>

    <h3 class="sec-sub">Condições Comerciais</h3>
    <table class="terms-table">
      <tbody>
        <tr><th>Pagamento</th><td>${esc(termos.condicaoPagamento)}</td></tr>
        <tr><th>Validade</th><td>${termos.validadeDias} dias corridos (até ${esc(validadeFmt)})</td></tr>
        <tr><th>Frete & Logística</th><td>${esc(termos.frete)}</td></tr>
        <tr><th>Prazo de Entrega</th><td>${esc(termos.prazoEntrega)}</td></tr>
        <tr><th>Garantia</th><td>${esc(termos.garantia)}</td></tr>
      </tbody>
    </table>
    ${termos.observacoes ? `<p class="obs-line"><strong>Observações:</strong> ${esc(termos.observacoes)}</p>` : ""}
  </div>
  <footer class="slide-foot">
    <span>${esc(termos.codigo)} · ${esc(nomeCliente)} · Consultor: ${esc(vendedor.nome)}</span>
    <span>07 / 08</span>
  </footer>
</section>`,
    },

    // SLIDE 08 — PRÓXIMOS PASSOS & CONTATO / ACEITE
    {
      id: "slide-08",
      title: "Próximos Passos & Aceite",
      chapter: "Fechamento",
      customKey: "closing",
      html: `<section class="slide page-light" id="slide-08">
  <header class="band-head">
    <div class="band-meta"><span class="red-kicker">08 · PRÓXIMOS PASSOS & ACEITE</span><span>08 / 08</span></div>
    <h2>Implantação em 4 etapas e contato direto Tawper</h2>
  </header>
  <div class="page-pad">
    <div class="steps-list">
      <div class="step-row"><span>01</span><div><strong>Aprovação do Orçamento ERP & Frota</strong><p>Validação do orçamento ${esc(orcamento.numeroExterno || "oficial")} e criticidades das ${frota.numColhedoras} máquinas.</p></div></div>
      <div class="step-row"><span>02</span><div><strong>Entrega Programada & Oficina</strong><p>Envio conforme prazo (${esc(termos.prazoEntrega)}), instalação de prensa e kits por sistema de cores.</p></div></div>
      <div class="step-row"><span>03</span><div><strong>Capacitação Tawper Academy</strong><p>Treinamento prático presencial da equipe mecânica e aplicação dos lacres de proteção.</p></div></div>
      <div class="step-row"><span>04</span><div><strong>Acompanhamento HydraSense</strong><p>Revisões periódicas, indicadores de reposição e suporte direto ao time da unidade.</p></div></div>
    </div>

    <div class="dark-banner cta-box">
      <span class="mini-label">ATENDIMENTO DIRETO TAWPER</span>
      <h3>${esc(vendedor.nome)} — ${esc(vendedor.cargo)}</h3>
      <p>WhatsApp Comercial: <strong>${esc(vendedor.telefone || "Solicitar número")}</strong> · E-mail: <strong>${esc(vendedor.email)}</strong></p>
    </div>

    <div class="sign-grid">
      <div class="sign-col">
        <div class="sign-line"></div>
        <strong>${esc(cliente.destinatarioNome || nomeCliente)}</strong>
        <span>${esc(nomeCliente)} · Data: ____/____/______</span>
      </div>
      <div class="sign-col">
        <div class="sign-line"></div>
        <strong>${esc(vendedor.nome)}</strong>
        <span>Tawper Mangueiras e Conexões</span>
      </div>
    </div>
  </div>
  <footer class="slide-foot">
    <span>${esc(termos.codigo)} · ${esc(nomeCliente)} · Documento A4 Sem Bordas</span>
    <span>08 / 08</span>
  </footer>
</section>`,
    },
  ];

  const slidesMeta: SlideDescriptor[] = sections.map((sec, idx) => ({
    index: idx,
    id: sec.id,
    title: sec.title,
    chapter: sec.chapter,
    isCustom: Boolean(sec.customKey),
    customKey: sec.customKey,
  }));

  const slidesHtml = sections
    .map((sec, idx) =>
      sec.html
        .replace('class="slide ', idx === initialIndex ? 'class="slide active ' : 'class="slide ')
        .replace("active active", "active")
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Proposta Comercial ${esc(termos.codigo)} · ${esc(nomeCliente)}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #14171f; color: #161922; font-family: "Manrope", "Inter", system-ui, -apple-system, sans-serif; }
  .deck-toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 40; height: 50px;
    background: #0d1016; border-bottom: 1px solid #262b38; color: #fff;
    display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-size: 13px;
  }
  .deck-toolbar .grp { display: flex; align-items: center; gap: 8px; }
  .deck-toolbar button {
    background: #1d222e; color: #fff; border: 1px solid #30374a; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .deck-toolbar button.primary { background: #c81421; border-color: #c81421; }
  .deck-stage {
    padding: 68px 16px 32px; display: flex; flex-direction: column; align-items: center; gap: 24px;
  }
  .slide {
    width: 210mm; min-height: 297mm; height: 297mm; background: #fff; position: relative;
    overflow: hidden; box-shadow: 0 18px 45px rgba(0,0,0,0.45); display: flex; flex-direction: column;
    page-break-after: always; break-after: page;
  }
  .slide:last-child { page-break-after: auto; break-after: auto; }
  .page-dark { background: #0e1016; color: #fff; }
  .accent-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4.5mm; background: #c81421; z-index: 4; }
  .cover-hero { position: relative; height: 118mm; overflow: hidden; padding: 12mm 15mm 10mm 18mm; display: flex; flex-direction: column; justify-content: space-between; }
  .cover-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
  .cover-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(14,16,22,0.72), rgba(14,16,22,0.88)); z-index: 2; }
  .cover-top, .cover-copy { position: relative; z-index: 3; }
  .cover-top { display: flex; justify-content: space-between; align-items: center; }
  .logo-svg { height: 28px; width: auto; }
  .badge-code { font-size: 10px; font-weight: 700; letter-spacing: .12em; color: #b8c0cc; }
  .kicker { font-size: 10.5px; font-weight: 800; letter-spacing: .12em; color: #ff8a92; margin-bottom: 8px; }
  .cover-copy h1 { font-size: 31px; line-height: 1.15; font-weight: 800; color: #fff; margin-bottom: 10px; }
  .cover-copy .lead { font-size: 13px; line-height: 1.48; color: #cbd2dd; max-width: 92%; }
  .cover-body { flex: 1; padding: 9mm 15mm 6mm 18mm; display: flex; flex-direction: column; gap: 5mm; }
  .dark-panel { background: #1a1d26; border: 1px solid #2b3140; border-radius: 6px; padding: 4.5mm 5mm; }
  .highlight-left { border-left: 4px solid #c81421; }
  .mini-label { display: block; font-size: 9px; font-weight: 800; letter-spacing: .1em; color: #ff8a92; margin-bottom: 4px; text-transform: uppercase; }
  .dark-panel h2 { font-size: 19px; color: #fff; margin-bottom: 4px; }
  .dark-panel h3 { font-size: 16px; color: #fff; margin-bottom: 4px; }
  .muted-light { font-size: 11px; color: #9ea8b8; margin-bottom: 6px; }
  .white-line { font-size: 11.5px; color: #eef2f7; }
  .metrics-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .metrics-row strong { display: block; font-size: 15px; color: #fff; margin: 3px 0; }
  .metrics-row p { font-size: 10.5px; color: #9ea8b8; line-height: 1.35; }
  .seller-panel { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: auto; }
  .date-col { text-align: right; font-size: 11px; color: #cbd2dd; display: flex; flex-direction: column; gap: 3px; white-space: nowrap; }

  .band-head { background: #0e1016; color: #fff; padding: 9mm 14mm 8mm; border-bottom: 3.5px solid #c81421; }
  .band-meta { display: flex; justify-content: space-between; align-items: center; font-size: 10px; font-weight: 700; color: #b8c0cc; margin-bottom: 5px; }
  .red-kicker { font-size: 9.5px; font-weight: 800; letter-spacing: .11em; color: #c81421; text-transform: uppercase; display: block; margin-bottom: 3px; }
  .band-head .red-kicker { color: #ff8a92; margin-bottom: 0; }
  .band-head h2 { font-size: 21px; line-height: 1.22; font-weight: 800; }

  .page-pad { flex: 1; padding: 8mm 14mm 5mm; display: flex; flex-direction: column; gap: 4.5mm; }
  .spec-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3.5mm; }
  .spec-box { background: #f6f7fa; border: 1px solid #e0e4ec; border-radius: 6px; padding: 3.5mm 4.5mm; }
  .spec-box span { display: block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #5f6878; margin-bottom: 2px; }
  .spec-box strong { font-size: 13px; color: #161922; }
  .spec-box p { font-size: 11px; color: #5f6878; line-height: 1.4; margin-top: 3px; }
  .alert-box { background: #fef2f2; border: 1px solid #f5c3c6; border-left: 4px solid #c81421; border-radius: 6px; padding: 4mm 5mm; }
  .alert-box p { font-size: 12px; color: #161922; line-height: 1.45; }
  .sec-sub { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: #161922; margin-top: 2px; }
  .risk-stack { display: flex; flex-direction: column; gap: 3mm; }
  .risk-card { border: 1px solid #e0e4ec; border-radius: 6px; padding: 3.5mm 4.5mm; }
  .risk-card strong { display: block; font-size: 12px; color: #c81421; margin-bottom: 3px; }
  .risk-card p { font-size: 11px; color: #363d4d; line-height: 1.4; }

  .photo-banner { height: 58mm; border-radius: 6px; overflow: hidden; border-bottom: 3px solid #c81421; }
  .photo-banner.tall { height: 74mm; }
  .photo-banner img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .quad-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3.5mm; }
  .pillar-card { background: #f6f7fa; border: 1px solid #e0e4ec; border-top: 3px solid #c81421; border-radius: 6px; padding: 4mm; }
  .pillar-card h4 { font-size: 13px; color: #161922; margin: 4px 0 5px; }
  .pillar-card p { font-size: 11px; color: #525b6d; line-height: 1.42; }
  .dark-strip { background: #0e1016; color: #fff; border-radius: 6px; padding: 3.8mm 4.5mm; font-size: 11px; line-height: 1.42; margin-top: auto; }
  .dark-banner { background: #0e1016; color: #fff; border-radius: 6px; padding: 4.5mm 5mm; border-left: 4px solid #c81421; }
  .dark-banner p { font-size: 11.5px; color: #e2e7f0; line-height: 1.45; }

  .stack-cards { display: flex; flex-direction: column; gap: 4mm; }
  .border-card { background: #f6f7fa; border: 1px solid #e0e4ec; border-radius: 6px; padding: 4.5mm 5mm; }
  .red-left { border-left: 5px solid #c81421; }
  .dark-left { border-left: 5px solid #0e1016; }
  .gray-left { border-left: 5px solid #5f6878; }
  .border-card h4 { font-size: 14px; color: #161922; margin-bottom: 4px; }
  .border-card p { font-size: 11.5px; color: #464e60; line-height: 1.45; }

  .split-photos { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; height: 64mm; }
  .split-photos img { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; border-bottom: 3px solid #c81421; }
  .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; flex: 1; }
  .col-card { border-radius: 6px; padding: 5mm; border-top: 4px solid #c81421; }
  .col-card.light { background: #f6f7fa; border: 1px solid #e0e4ec; border-top: 4px solid #c81421; }
  .col-card.dark { background: #0e1016; color: #fff; }
  .col-card h4 { font-size: 15px; margin: 4px 0 8px; }
  .col-card ul { padding-left: 16px; display: flex; flex-direction: column; gap: 7px; font-size: 11.5px; line-height: 1.42; }
  .col-card.dark ul { color: #cfd6e3; }

  .erp-card { background: #f6f7fa; border: 1px solid #d5dbe6; border-top: 4px solid #c81421; border-radius: 6px; padding: 5mm; }
  .erp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
  .erp-head h3 { font-size: 17px; color: #161922; }
  .erp-total { font-size: 20px; font-weight: 800; color: #c81421; white-space: nowrap; }
  .erp-summary { font-size: 11.5px; color: #2b3140; line-height: 1.45; margin-bottom: 8px; }
  .erp-bullets { list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 600; color: #161922; margin-bottom: 8px; }
  .erp-attach { font-size: 10.5px; font-weight: 700; color: #167a44; padding-top: 6px; border-top: 1px solid #dce1ea; }

  .terms-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .terms-table th, .terms-table td { border: 1px solid #e0e4ec; padding: 3mm 4mm; text-align: left; }
  .terms-table th { width: 34%; background: #f6f7fa; color: #4f5869; font-weight: 700; }
  .terms-table td { font-weight: 600; color: #161922; }
  .obs-line { font-size: 10.5px; color: #5f6878; line-height: 1.4; }

  .steps-list { display: flex; flex-direction: column; gap: 3.5mm; }
  .step-row { display: flex; align-items: stretch; border: 1px solid #e0e4ec; border-radius: 6px; overflow: hidden; background: #f6f7fa; }
  .step-row span { width: 13mm; background: #0e1016; color: #fff; font-size: 16px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .step-row div { padding: 3.5mm 4.5mm; flex: 1; }
  .step-row strong { display: block; font-size: 12.5px; color: #161922; margin-bottom: 2px; }
  .step-row p { font-size: 11px; color: #525b6d; line-height: 1.38; }
  .cta-box h3 { font-size: 17px; color: #fff; margin: 2px 0 4px; }
  .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; border: 1px solid #e0e4ec; border-radius: 6px; padding: 8mm 6mm 5mm; margin-top: auto; }
  .sign-col { display: flex; flex-direction: column; gap: 3px; font-size: 10.5px; color: #5f6878; }
  .sign-col strong { color: #161922; font-size: 11.5px; }
  .sign-line { border-top: 1px solid #161922; margin-bottom: 5px; margin-top: 8mm; }

  .slide-foot {
    height: 10mm; padding: 0 14mm; background: #f6f7fa; border-top: 1px solid #e0e4ec;
    display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; font-weight: 700; color: #5f6878;
  }
  .slide-foot.dark-foot { background: #0e1016; border-top-color: #262b38; color: #9ea8b8; }

  @media print {
    html, body { background: #fff !important; }
    .deck-toolbar { display: none !important; }
    .deck-stage { padding: 0 !important; gap: 0 !important; }
    .slide { box-shadow: none !important; margin: 0 !important; width: 210mm !important; height: 297mm !important; }
  }
</style>
</head>
<body>
<div class="deck-toolbar">
  <div class="grp">
    <strong>Tawper A4 Executivo (8 páginas)</strong>
    <span style="color:#9ea8b8">· ${esc(nomeCliente)}</span>
  </div>
  <div class="grp">
    <button onclick="window.print()" class="primary">Imprimir A4 Sem Bordas</button>
  </div>
</div>
<main class="deck-stage">
${slidesHtml}
</main>
</body>
</html>`;

  return { html, slides: slidesMeta };
}
