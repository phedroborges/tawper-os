import type { Company, Contact, Deal, User } from "./types";

/** Páginas do deck oficial (PDF v4) em /public/proposta/deck — 16:9. */
export const DECK_PAGE_COUNT = 33;

export type ProposalInput = {
  company: Company;
  contact: Contact;
  deal?: Deal;
  owner?: User;
  notas?: string;
  geradoEm?: string;
  /** Origem absoluta, ex.: https://app... — necessário porque a proposta abre em about:blank. */
  baseUrl: string;
};

function loc(company: Company) {
  const parts = [company.cidade, company.uf].filter(Boolean);
  return parts.length ? parts.join(" / ") : company.regiao || "Brasil";
}

function frota(company: Company) {
  const bits = [
    company.colhedoras != null ? `${company.colhedoras} colhedora(s)` : null,
    company.modelos ? `modelos: ${company.modelos}` : null,
    company.prensa ? `prensa: ${company.prensa}` : null,
    company.marcaAtual ? `fornecedor atual: ${company.marcaAtual}` : null,
    company.potencial ? `potencial ${company.potencial}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Operação a qualificar em campo";
}

function deckSrc(baseUrl: string, page: number) {
  const n = String(page).padStart(2, "0");
  return `${baseUrl.replace(/\/$/, "")}/proposta/deck/${n}.jpg`;
}

/**
 * Proposta comercial = deck oficial Tawper (33 páginas do PDF) +
 * slides personalizados (destinatário e fechamento) com empresa e contato.
 */
export function buildProposalHtml(input: ProposalInput) {
  const { company, contact, owner, notas, baseUrl } = input;
  const when = input.geradoEm ?? new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const lugar = loc(company);
  const resumo = frota(company);
  const nota = (notas || "").trim();
  const totalSlides = DECK_PAGE_COUNT + 2; // destinatário + fechamento

  const deckSlides = Array.from({ length: DECK_PAGE_COUNT }, (_, i) => {
    const page = i + 1;
    const num = i + 2; // após o slide destinatário
    return `
    <section class="slide deck" aria-label="Deck ${page} de ${DECK_PAGE_COUNT}">
      <img src="${deckSrc(baseUrl, page)}" alt="Tawper — slide ${page} de ${DECK_PAGE_COUNT}" width="1200" height="675" />
      <span class="sr">Slide ${num} / ${totalSlides}</span>
    </section>`;
  }).join("\n");

  const contatoLinha = [
    contact.nome,
    contact.cargo || null,
    contact.papel || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const contatoContato = [contact.whatsapp, contact.email].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Proposta Tawper — ${escapeHtml(company.nome)}</title>
<style>
  :root {
    --navy: #0b1f4a;
    --navy-2: #123a7b;
    --ink: #1a2438;
    --brand: #d41624;
    --muted: #8a93a6;
    --soft: #f3f5f8;
    --line: rgba(255,255,255,.14);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #070d18; color: #fff; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
  .toolbar {
    position: sticky; top: 0; z-index: 20; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    padding: 12px 16px; background: rgba(7,13,24,.94); border-bottom: 1px solid rgba(255,255,255,.08);
    backdrop-filter: blur(8px);
  }
  .toolbar .meta { flex: 1; min-width: 180px; font-size: 13px; color: #c5cddd; }
  .toolbar button, .toolbar a {
    appearance: none; border: 0; border-radius: 6px; padding: 10px 14px; font: inherit; font-weight: 650;
    cursor: pointer; text-decoration: none; color: #fff;
  }
  .primary { background: var(--brand); }
  .ghost { background: #1c2a48; }
  .deck-wrap { max-width: 1200px; margin: 0 auto; padding: 16px 12px 72px; }
  .slide {
    position: relative; width: 100%; aspect-ratio: 1200 / 675; margin: 0 0 14px;
    border-radius: 8px; overflow: hidden; background: #0a1428;
    box-shadow: 0 18px 50px rgba(0,0,0,.35);
  }
  .slide.deck img {
    display: block; width: 100%; height: 100%; object-fit: cover;
  }
  .custom {
    display: grid; grid-template-columns: 1.05fr .95fr; min-height: 0; height: 100%;
    background:
      linear-gradient(115deg, rgba(8,18,40,.94) 0%, rgba(8,18,40,.72) 46%, rgba(8,18,40,.35) 100%),
      radial-gradient(circle at 78% 42%, #2a4f86, #07101f 68%);
  }
  .custom .copy { padding: clamp(28px, 4.5vw, 52px); display: flex; flex-direction: column; justify-content: space-between; }
  .brand { font-weight: 800; letter-spacing: .01em; font-size: clamp(18px, 2vw, 22px); }
  .brand span { color: var(--brand); }
  .brand small { display: block; font-weight: 500; font-size: 11px; letter-spacing: .04em; color: #b7c0d4; margin-top: 2px; text-transform: lowercase; }
  .kicker { display: flex; align-items: center; gap: 10px; color: #ff7a6e; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin: 22px 0 12px; }
  .kicker::before { content: ""; width: 28px; height: 2px; background: var(--brand); }
  h1 { margin: 0; font-size: clamp(28px, 4.2vw, 44px); line-height: 1.08; font-weight: 800; max-width: 14ch; }
  .sub { margin: 14px 0 0; color: #d5dbeb; font-size: clamp(14px, 1.6vw, 17px); line-height: 1.45; max-width: 36ch; }
  .panel {
    margin: clamp(18px, 3vw, 28px); border: 1px solid var(--line); border-radius: 10px;
    background: rgba(255,255,255,.06); padding: clamp(18px, 2.5vw, 26px); align-self: stretch;
    display: flex; flex-direction: column; gap: 14px; justify-content: center;
  }
  .panel .label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9eabc4; }
  .panel .value { font-size: clamp(18px, 2.2vw, 24px); font-weight: 750; line-height: 1.25; }
  .panel .muted { color: #c5cddd; font-size: 13.5px; line-height: 1.45; }
  .facts { display: grid; gap: 10px; margin-top: 8px; }
  .fact { border-top: 1px solid var(--line); padding-top: 10px; }
  .fact b { display: block; color: #fff; font-size: 13px; margin-bottom: 2px; }
  .foot { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: #8e9bb3; margin-top: 18px; }
  .close-grid { display: grid; grid-template-columns: 1.1fr .9fr; height: 100%; }
  .close-grid .left { padding: clamp(28px, 4.5vw, 52px); display: flex; flex-direction: column; justify-content: space-between; background: #fff; color: var(--ink); }
  .close-grid .left .brand { color: var(--navy-2); }
  .close-grid .left .brand span { color: var(--brand); }
  .close-grid .left .brand small { color: #7a8499; }
  .close-grid .left .kicker { color: var(--brand); }
  .close-grid .left .kicker::before { background: var(--brand); }
  .close-grid .left h1 { color: var(--navy-2); max-width: 16ch; font-size: clamp(26px, 3.6vw, 38px); }
  .close-grid .left .sub { color: #4b5568; }
  .close-grid .right { background: var(--navy); padding: clamp(28px, 4vw, 44px); display: flex; flex-direction: column; justify-content: center; gap: 16px; }
  .close-grid .right .box { border-top: 1px solid rgba(255,255,255,.15); padding-top: 14px; }
  .close-grid .right .box:first-child { border-top: 0; padding-top: 0; }
  .close-grid .right .label { color: #ff7a6e; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; }
  .close-grid .right .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .close-grid .right .muted { color: #c5cddd; font-size: 13.5px; margin-top: 4px; line-height: 1.45; }
  .close-grid .foot { color: #8a93a6; }
  @media (max-width: 860px) {
    .custom, .close-grid { grid-template-columns: 1fr; }
    .slide { aspect-ratio: auto; min-height: 420px; }
    .slide.deck { aspect-ratio: 1200 / 675; min-height: 0; }
  }
  @media print {
    @page { size: 320mm 180mm; margin: 0; }
    body { background: #fff; }
    .toolbar { display: none !important; }
    .deck-wrap { max-width: none; padding: 0; margin: 0; }
    .slide {
      margin: 0; border-radius: 0; box-shadow: none;
      width: 100vw; height: 100vh; aspect-ratio: auto;
      page-break-after: always; break-after: page;
    }
    .slide.deck img { width: 100%; height: 100%; object-fit: contain; background: #000; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="meta">Proposta Tawper · ${escapeHtml(company.nome)} · ${escapeHtml(contact.nome)} · ${DECK_PAGE_COUNT} slides do deck + personalização</div>
    <button class="primary" onclick="window.print()">Exportar / imprimir PDF</button>
    <a class="ghost" href="${escapeHtml(baseUrl.replace(/\/$/, ""))}/propostas">Voltar</a>
  </div>

  <div class="deck-wrap">
    <section class="slide custom" aria-label="Destinatário">
      <div class="copy">
        <div>
          <div class="brand"><span>T</span>awper<small>mangueiras e conexões</small></div>
          <div class="kicker">Proposta comercial</div>
          <h1>Preparada para ${escapeHtml(company.nome)}</h1>
          <p class="sub">Deck oficial Tawper — soluções completas em mangueiras hidráulicas — personalizado para esta conta.</p>
        </div>
        <div class="foot"><span>TAWPER — MANGUEIRAS E CONEXÕES</span><span>01 / ${totalSlides}</span></div>
      </div>
      <aside class="panel">
        <div>
          <div class="label">Destinatário</div>
          <div class="value">${escapeHtml(contatoLinha)}</div>
          ${contatoContato ? `<div class="muted">${escapeHtml(contatoContato)}</div>` : ""}
        </div>
        <div class="facts">
          <div class="fact"><b>Local</b><span class="muted">${escapeHtml(lugar)}</span></div>
          <div class="fact"><b>Operação</b><span class="muted">${escapeHtml(resumo)}</span></div>
          <div class="fact"><b>Data</b><span class="muted">${escapeHtml(when)}</span></div>
          <div class="fact"><b>Responsável Tawper</b><span class="muted">${escapeHtml(owner?.name ?? "Equipe comercial")}${owner?.phone ? ` · ${escapeHtml(owner.phone)}` : ""}</span></div>
          ${nota ? `<div class="fact"><b>Observações</b><span class="muted">${escapeHtml(nota)}</span></div>` : ""}
        </div>
      </aside>
    </section>

    ${deckSlides}

    <section class="slide" aria-label="Fechamento">
      <div class="close-grid">
        <div class="left">
          <div>
            <div class="brand"><span>T</span>awper<small>mangueiras e conexões</small></div>
            <div class="kicker">Próximo passo</div>
            <h1>Seguir com ${escapeHtml(company.nome)}</h1>
            <p class="sub">Validar o circuito prioritário, agendar visita ou teste e registrar a evidência no Tawper OS. Esta proposta é o deck padrão da Tawper, endereçado a ${escapeHtml(contact.nome)}.</p>
          </div>
          <div class="foot"><span>TAWPER — MANGUEIRAS E CONEXÕES</span><span>${totalSlides} / ${totalSlides}</span></div>
        </div>
        <div class="right">
          <div class="box">
            <div class="label">Contato na conta</div>
            <div class="value">${escapeHtml(contact.nome)}</div>
            <div class="muted">${escapeHtml([contact.cargo, contact.papel].filter(Boolean).join(" · ") || "Contato comercial")}${contatoContato ? `<br/>${escapeHtml(contatoContato)}` : ""}</div>
          </div>
          <div class="box">
            <div class="label">Empresa</div>
            <div class="value">${escapeHtml(company.nome)}</div>
            <div class="muted">${escapeHtml(lugar)} · ${escapeHtml(resumo)}</div>
          </div>
          <div class="box">
            <div class="label">Tawper</div>
            <div class="value">${escapeHtml(owner?.name ?? "Equipe comercial")}</div>
            <div class="muted">${escapeHtml(owner?.phone ?? "")}${owner?.title ? `<br/>${escapeHtml(owner.title)}` : ""}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
