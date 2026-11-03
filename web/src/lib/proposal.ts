import { PRODUCT_NAMES } from "./constants";
import type { Company, Contact, Deal, User } from "./types";

export type ProposalInput = {
  company: Company;
  deal?: Deal;
  contacts: Contact[];
  owner?: User;
  /** Texto livre que o vendedor ajusta antes de gerar. */
  notas?: string;
  geradoEm?: string;
};

function loc(company: Company) {
  const parts = [company.cidade, company.uf].filter(Boolean);
  return parts.length ? parts.join("/") : company.regiao || "Brasil";
}

function frota(company: Company) {
  const bits = [
    company.colhedoras != null ? `${company.colhedoras} colhedora(s)` : null,
    company.prensa ? `prensa: ${company.prensa}` : null,
    company.marcaAtual ? `fornecedor atual: ${company.marcaAtual}` : null,
    company.potencial ? `potencial ${company.potencial}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Operação a qualificar em campo";
}

/** Monta o HTML da proposta comercial (padrão Tawper, personalizado com o cliente). */
export function buildProposalHtml(input: ProposalInput) {
  const { company, contacts, owner, notas } = input;
  const when = input.geradoEm ?? new Date().toLocaleDateString("pt-BR");
  const contato = contacts.find((c) => c.ativo) ?? contacts[0];
  const lugar = loc(company);
  const resumo = frota(company);
  const nota = (notas || company.observacoes || "").trim();
  const produtos = PRODUCT_NAMES.map((nome) => `<li>${escapeHtml(nome)}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Proposta Tawper — ${escapeHtml(company.nome)}</title>
<style>
  :root {
    --navy: #123a7b;
    --ink: #1a2438;
    --brand: #d41624;
    --muted: #657087;
    --soft: #f4f6f8;
    --line: #e2e6ee;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); background: #0b1220; }
  .deck { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 0; background: #0b1220; }
  .toolbar button, .toolbar a {
    appearance: none; border: 0; border-radius: 6px; padding: 10px 14px; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none;
  }
  .primary { background: var(--brand); color: #fff; }
  .ghost { background: #1c2944; color: #fff; }
  .slide {
    background: #fff; border-radius: 10px; overflow: hidden; margin-bottom: 18px;
    min-height: 560px; display: grid; box-shadow: 0 12px 40px rgba(0,0,0,.25);
  }
  .cover {
    background:
      linear-gradient(105deg, rgba(10,20,40,.88) 0%, rgba(10,20,40,.55) 48%, rgba(10,20,40,.2) 100%),
      radial-gradient(circle at 70% 40%, #2a4a7a, #0b1220 70%);
    color: #fff; padding: 48px 56px; align-content: space-between;
  }
  .cover .eyebrow { display: inline-block; width: 36px; height: 3px; background: var(--brand); margin-bottom: 18px; }
  .cover h1 { font-size: clamp(32px, 5vw, 52px); line-height: 1.05; margin: 0 0 14px; max-width: 14ch; }
  .cover .sub { opacity: .9; font-size: 18px; margin: 0 0 36px; }
  .cover .for {
    border-top: 1px solid rgba(255,255,255,.2); padding-top: 18px; display: grid; gap: 4px; max-width: 42ch;
  }
  .cover .for strong { font-size: 22px; }
  .cover .for span { opacity: .85; font-size: 14px; }
  .brand { font-weight: 800; letter-spacing: .02em; }
  .brand span { color: var(--brand); }
  .split { grid-template-columns: 1.15fr .85fr; }
  .pad { padding: 42px 48px; }
  .kicker { color: var(--brand); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .kicker::before { content: ""; width: 28px; height: 2px; background: var(--brand); }
  h2 { margin: 0 0 16px; font-size: 34px; line-height: 1.15; color: var(--navy); }
  p { margin: 0 0 12px; line-height: 1.55; color: #334155; }
  .panel { background: var(--navy); color: #fff; padding: 42px 36px; }
  .panel ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 18px; }
  .panel li { display: grid; grid-template-columns: 42px 1fr; gap: 12px; }
  .panel .n { color: #ff7a6e; font-weight: 800; }
  .facts { display: grid; gap: 10px; margin-top: 22px; }
  .fact { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .fact b { display: block; color: var(--navy); margin-bottom: 2px; }
  .products { columns: 2; gap: 24px; margin: 0; padding-left: 18px; }
  .products li { margin-bottom: 8px; break-inside: avoid; }
  .footer { margin-top: auto; padding-top: 28px; font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; gap: 12px; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .deck { padding: 0; max-width: none; }
    .slide { box-shadow: none; border-radius: 0; page-break-after: always; min-height: 100vh; margin: 0; }
  }
  @media (max-width: 860px) {
    .split { grid-template-columns: 1fr; }
    .cover, .pad, .panel { padding: 28px 22px; }
    .products { columns: 1; }
  }
</style>
</head>
<body>
  <div class="deck">
    <div class="toolbar">
      <button class="primary" onclick="window.print()">Exportar / imprimir PDF</button>
      <a class="ghost" href="/propostas">Voltar</a>
    </div>

    <section class="slide cover">
      <div>
        <div class="brand"><span>T</span>awper</div>
        <div class="eyebrow"></div>
        <h1>Soluções completas em mangueiras hidráulicas</h1>
        <p class="sub">Tecnologia, rastreabilidade e confiabilidade.</p>
      </div>
      <div class="for">
        <strong>Preparada para ${escapeHtml(company.nome)}</strong>
        <span>${escapeHtml(lugar)} · ${escapeHtml(when)}${owner ? ` · ${escapeHtml(owner.name)}` : ""}</span>
        <span>${escapeHtml(resumo)}</span>
      </div>
    </section>

    <section class="slide split">
      <div class="pad">
        <div class="kicker">Contexto do cliente</div>
        <h2>O que já sabemos sobre ${escapeHtml(company.nome)}</h2>
        <p>Esta proposta usa o cadastro do Tawper OS. Sem preço: é a apresentação da solução para alinhar manutenção, frota e próximo passo.</p>
        <div class="facts">
          <div class="fact"><b>Local</b>${escapeHtml(lugar)}</div>
          <div class="fact"><b>Operação</b>${escapeHtml(resumo)}</div>
          <div class="fact"><b>Contato</b>${contato ? escapeHtml(`${contato.nome}${contato.cargo ? ` · ${contato.cargo}` : ""}`) : "A mapear"}</div>
          ${nota ? `<div class="fact"><b>Observações</b>${escapeHtml(nota)}</div>` : ""}
        </div>
        <div class="footer"><span>TAWPER — MANGUEIRAS E CONEXÕES</span><span>Proposta comercial</span></div>
      </div>
      <div class="panel">
        <div class="kicker" style="color:#ff7a6e">Próximo passo</div>
        <h2 style="color:#fff;font-size:28px">Da conversa à homologação</h2>
        <ol>
          <li><span class="n">01</span><div><b>Alinhar a aplicação</b><br/>Onde a falha dói na colhedora e qual circuito priorizar.</div></li>
          <li><span class="n">02</span><div><b>Provar em campo</b><br/>Teste controlado com leitura de horas e evidência.</div></li>
          <li><span class="n">03</span><div><b>Padronizar o conjunto</b><br/>Especificação, montagem e rastreabilidade Tawper.</div></li>
        </ol>
      </div>
    </section>

    <section class="slide pad">
      <div class="kicker">A Tawper</div>
      <h2>Como a Tawper surgiu</h2>
      <p>A Tawper nasceu dentro da operação com mangueiras e conexões hidráulicas. A dificuldade de encontrar no Brasil um produto confiável e durável levou à consultoria internacional e ao desenvolvimento de uma linha própria.</p>
      <p>Mais de 8 anos de confiabilidade técnica, resultados consistentes e alto índice de sucesso nas homologações — informações da própria Tawper.</p>
      <div class="footer"><span>TAWPER — MANGUEIRAS E CONEXÕES</span><span>${escapeHtml(company.nome)}</span></div>
    </section>

    <section class="slide pad">
      <div class="kicker">O ponto de partida</div>
      <h2>Uma pequena falha.<br/>Uma operação inteira em risco.</h2>
      <p>Uma única mangueira pode interromper funções essenciais da colhedora. O impacto depende do ponto da falha, das condições de trabalho e do tempo de recuperação.</p>
      <p>Para ${escapeHtml(company.nome)} em ${escapeHtml(lugar)}, o objetivo desta conversa é reduzir esse risco com especificação certa, conjunto rastreável e suporte de montagem.</p>
      <div class="footer"><span>TAWPER — MANGUEIRAS E CONEXÕES</span><span>Diagnóstico</span></div>
    </section>

    <section class="slide pad">
      <div class="kicker">Da bancada ao campo</div>
      <h2>A solução começa antes da instalação.</h2>
      <ol style="padding-left:18px;line-height:1.6;color:#334155">
        <li><b>Especificação para a aplicação</b> — circuito, pressão e ambiente.</li>
        <li><b>Qualidade do conjunto</b> — mangueira, terminal e crimpagem alinhados.</li>
        <li><b>Montagem padronizada</b> — processo repetível na usina ou na bancada Tawper.</li>
      </ol>
      <div class="footer"><span>TAWPER — MANGUEIRAS E CONEXÕES</span><span>Solução</span></div>
    </section>

    <section class="slide pad">
      <div class="kicker">Linha Tawper</div>
      <h2>O que oferecemos</h2>
      <p>Contexto de produtos (somente nomes — sem preço nesta proposta):</p>
      <ul class="products">${produtos}</ul>
      <div class="footer"><span>TAWPER — MANGUEIRAS E CONEXÕES</span><span>${escapeHtml(when)}</span></div>
    </section>

    <section class="slide pad">
      <div class="kicker">Fechamento</div>
      <h2>Próximo passo com ${escapeHtml(company.nome)}</h2>
      <p>Validar o circuito prioritário, agendar visita ou teste e registrar a evidência no Tawper OS. Esta peça substitui o antigo catálogo/orçamento automático: é a apresentação comercial padrão da Tawper, personalizada para o cliente.</p>
      <p><b>Responsável Tawper:</b> ${owner ? escapeHtml(owner.name) : "Equipe comercial"}</p>
      ${contato ? `<p><b>Contato na conta:</b> ${escapeHtml(contato.nome)}${contato.whatsapp ? ` · ${escapeHtml(contato.whatsapp)}` : ""}</p>` : ""}
      <div class="footer"><span>TAWPER — MANGUEIRAS E CONEXÕES</span><span>Obrigado</span></div>
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
