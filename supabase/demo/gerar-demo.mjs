// Gera supabase/demo/dados-demonstracao.sql: carteira fictícia da Tawper para 2026.
// Uso: node supabase/demo/gerar-demo.mjs   (os números saem iguais toda vez: o sorteio tem semente fixa)
//
// Alvo: meta de R$ 8 mi no ano; vendido até 13/11 perto de R$ 6,6 mi (≈95% do ritmo), funil aberto para dezembro,
// o diretor (Murilo) vendendo também e cada vendedor com território, agenda e registros.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let seed = 20261113;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const between = (a, b) => a + rnd() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const pick = (list) => list[Math.floor(rnd() * list.length)];
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

// ---------------------------------------------------------------------------- calendário
const BASE = "2026-11-13"; // último dia com venda registrada (sexta-feira)
const FERIADOS = new Set(["2025-09-07", "2025-10-12", "2025-11-02", "2025-11-15", "2025-11-20", "2025-12-25", "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02"]);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const diff = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86_400_000);
const isBusiness = (s) => { const w = new Date(`${s}T12:00:00Z`).getUTCDay(); return w !== 0 && w !== 6 && !FERIADOS.has(s); };
function businessDays(from, to) {
  const out = [];
  for (let s = from; s <= to; s = addDays(s, 1)) if (isBusiness(s)) out.push(s);
  return out;
}

// ---------------------------------------------------------------------------- dados de base
// [cidade, UF, CEP, lat, lng, DDD]
const CIDADES = {
  quirinopolis: ["Quirinópolis", "GO", "75860000", -18.448, -50.452, "64"], jatai: ["Jataí", "GO", "75800000", -17.881, -51.714, "64"],
  rioverde: ["Rio Verde", "GO", "75900000", -17.798, -50.928, "64"], mineiros: ["Mineiros", "GO", "75830000", -17.569, -52.551, "64"],
  goiatuba: ["Goiatuba", "GO", "75600000", -18.012, -49.357, "64"], itumbiara: ["Itumbiara", "GO", "75500000", -18.409, -49.216, "64"],
  goianesia: ["Goianésia", "GO", "76380000", -15.311, -49.117, "62"], chapadao: ["Chapadão do Céu", "GO", "75828000", -18.386, -52.607, "64"],
  santahelena: ["Santa Helena de Goiás", "GO", "75920000", -17.813, -50.598, "64"], edeia: ["Edéia", "GO", "75940000", -17.338, -49.929, "64"],
  ituiutaba: ["Ituiutaba", "MG", "38300000", -18.969, -49.465, "34"], frutal: ["Frutal", "MG", "38200000", -20.025, -48.94, "34"],
  uberaba: ["Uberaba", "MG", "38000000", -19.748, -47.932, "34"], iturama: ["Iturama", "MG", "38280000", -19.728, -50.196, "34"],
  campinaverde: ["Campina Verde", "MG", "38270000", -19.538, -49.486, "34"], conceicao: ["Conceição das Alagoas", "MG", "38120000", -19.915, -48.384, "34"],
  navirai: ["Naviraí", "MS", "79950000", -23.065, -54.191, "67"], riobrilhante: ["Rio Brilhante", "MS", "79130000", -21.802, -54.546, "67"],
  andradinams: ["Nova Andradina", "MS", "79750000", -22.233, -53.343, "67"], paranaiba: ["Paranaíba", "MS", "79500000", -19.677, -51.191, "67"],
  maracaju: ["Maracaju", "MS", "79150000", -21.614, -55.168, "67"], sidrolandia: ["Sidrolândia", "MS", "79170000", -20.932, -54.961, "67"],
  ivinhema: ["Ivinhema", "MS", "79740000", -22.304, -53.819, "67"], rondonopolis: ["Rondonópolis", "MT", "78700000", -16.47, -54.636, "66"],
  olimpia: ["Olímpia", "SP", "15400000", -20.737, -48.915, "17"], catanduva: ["Catanduva", "SP", "15800000", -21.138, -48.973, "17"],
  bebedouro: ["Bebedouro", "SP", "14700000", -20.949, -48.479, "17"], votuporanga: ["Votuporanga", "SP", "15500000", -20.423, -49.973, "17"],
  novohorizonte: ["Novo Horizonte", "SP", "14960000", -21.468, -49.221, "17"], monteaprazivel: ["Monte Aprazível", "SP", "15150000", -20.772, -49.714, "17"],
  jaboticabal: ["Jaboticabal", "SP", "14870000", -21.254, -48.322, "16"], guariba: ["Guariba", "SP", "14840000", -21.36, -48.23, "16"],
  sertaozinho: ["Sertãozinho", "SP", "14160000", -21.137, -47.99, "16"], venceslau: ["Presidente Venceslau", "SP", "19400000", -21.876, -51.844, "18"],
  assis: ["Assis", "SP", "19800000", -22.661, -50.412, "18"], paraguacu: ["Paraguaçu Paulista", "SP", "19700000", -22.413, -50.576, "18"],
  pereirabarreto: ["Pereira Barreto", "SP", "15370000", -20.638, -51.109, "18"], martinopolis: ["Martinópolis", "SP", "19500000", -22.146, -51.171, "18"],
  candidomota: ["Cândido Mota", "SP", "19880000", -22.746, -50.387, "18"], ourinhos: ["Ourinhos", "SP", "19900000", -22.979, -49.871, "14"],
  lins: ["Lins", "SP", "16400000", -21.678, -49.743, "14"], penapolis: ["Penápolis", "SP", "16300000", -21.414, -50.077, "18"],
  valparaiso: ["Valparaíso", "SP", "16880000", -21.222, -50.866, "18"], andradina: ["Andradina", "SP", "16900000", -20.896, -51.378, "18"],
  paranavai: ["Paranavaí", "PR", "87700000", -23.073, -52.465, "44"], umuarama: ["Umuarama", "PR", "87500000", -23.766, -53.325, "44"],
};

// Donos: 0 = diretor (Murilo, contas-chave); 1..4 = vendedores, cada um no seu território.
const DONOS = [
  { nome: "Murilo", cidades: ["goianesia", "santahelena", "edeia", "sertaozinho", "catanduva", "uberaba", "rioverde", "jatai", "assis"], rc: 9, aq: 2, perdidas: 0, escala: [70_000, 115_000], share: 0.15 },
  { nome: "Douglas", cidades: ["olimpia", "catanduva", "bebedouro", "votuporanga", "novohorizonte", "monteaprazivel", "jaboticabal", "guariba", "sertaozinho"], rc: 13, aq: 3, perdidas: 1, escala: [35_000, 80_000], share: 0.23 },
  { nome: "Fernando", cidades: ["ituiutaba", "frutal", "uberaba", "iturama", "campinaverde", "conceicao", "itumbiara", "goiatuba", "quirinopolis"], rc: 13, aq: 3, perdidas: 1, escala: [35_000, 78_000], share: 0.22 },
  { nome: "Nilton", cidades: ["navirai", "riobrilhante", "andradinams", "paranaiba", "maracaju", "sidrolandia", "ivinhema", "mineiros", "chapadao", "rondonopolis"], rc: 13, aq: 3, perdidas: 1, escala: [33_000, 75_000], share: 0.19 },
  { nome: "Paulo", cidades: ["venceslau", "assis", "paraguacu", "pereirabarreto", "martinopolis", "candidomota", "ourinhos", "lins", "penapolis", "valparaiso", "andradina", "paranavai", "umuarama"], rc: 13, aq: 3, perdidas: 1, escala: [34_000, 76_000], share: 0.21 },
];

const LUGARES = [
  "Serra Dourada", "Vale do Araguaia", "Santa Helena", "Boa Esperança", "Planalto Verde", "Cristal do Vale", "Rio Claro", "Lagoa Dourada", "Pedra Branca", "Jequitibá",
  "Horizonte Verde", "Canaã", "Monte Alegre", "São Bento", "Nova Fronteira", "Alto Paraná", "Campo Belo", "Três Barras", "Santa Rita", "Ribeirão Fundo",
  "São Miguel", "Campo Largo", "Bela Vista", "Vale do Sol", "Colina Verde", "Alvorada", "Pontal", "Rio das Pedras", "Cerrado Mineiro", "Santa Clara",
  "São Jerônimo", "Ouro Branco", "Primavera", "Tropical do Oeste", "Santo Antônio", "Guarani", "Aroeira", "Barra Grande", "Cachoeira Alta", "Fazenda Nova",
  "Itapoã", "Lagoa Azul", "Paraíso", "Morro Azul", "Sol Nascente", "Água Limpa", "Estrela do Sul", "Nova Era", "Vale Verde", "Santa Maria",
  "Dois Irmãos", "Taquari", "Girassol", "Jatobá", "Ipê Amarelo", "Buritis", "Veredas", "Bom Jardim", "Serra Azul", "Rio Pardo",
  "Ponte Alta", "Capim Branco", "São Luiz", "Boa Sorte", "Mata Velha", "Cachoeirinha", "Santa Fé", "Bandeirantes", "Coqueiral", "Recanto",
  "Santa Luzia", "Três Lagoas", "Vista Alegre", "Bom Retiro", "Tabocas", "Pirapó", "Cascata", "Ribeirão Claro", "Santa Cruz", "Guaporé",
];
const PREFIXOS_GRANDE = ["Usina", "Usina", "Usina", "Grupo", "Agroindustrial", "Bioenergia"];
const PREFIXOS_MEDIO = ["Usina", "Destilaria", "CTT", "Fornecedora de Cana", "Agrícola", "Usina"];
const RAMO = { Usina: "Usina sucroenergética", Grupo: "Grupo sucroenergético", Agroindustrial: "Usina sucroenergética", Bioenergia: "Usina sucroenergética", Destilaria: "Destilaria", CTT: "Prestador de serviço (CTT)", "Fornecedora de Cana": "Fornecedor de cana", Agrícola: "Fornecedor de cana" };
const MODELOS = ["John Deere CH570", "John Deere CH570 e CH950", "Case A8800", "Case A8800 e A9000", "John Deere CH950", "Case A9000"];
const CONCORRENTES = ["Hidráulica Goiás", "Mangueiras Triângulo", "Hidráulica Paulista", "Sul Hidráulica", "Agro Hidráulica Oeste", "Revenda local", "Distribuidora Cana Forte"];
const MARCAS_CONC = ["Gates", "Parker", "Manuli", "Continental", "Eaton", "Copecar"];
const NOMES = ["Carlos", "Roberto", "Sérgio", "Marcelo", "Antônio", "Ricardo", "Fernando", "Eduardo", "Júlio", "Wagner", "Leandro", "Cristiano", "Adriano", "Márcio", "Rafael", "Gustavo", "Rodrigo", "André", "Fábio", "Luciano", "Patrícia", "Juliana", "Camila", "Vanessa", "Aline", "Renata", "Simone", "Tatiane", "Cláudia", "Daniela", "José", "Paulo", "Edson", "Valter", "Gilberto", "Anderson", "Thiago", "Diego", "Mauro", "Alexandre"];
const SOBRENOMES = ["Menezes", "Almeida", "Nogueira", "Tavares", "Furtado", "Pacheco", "Lacerda", "Brandão", "Bastos", "Moreira", "Pires", "Rocha", "Teles", "Cunha", "Dantas", "Lemos", "Prado", "Rezende", "Couto", "Barros", "Carvalho", "Siqueira", "Queiroz", "Freitas", "Machado", "Vieira", "Andrade", "Campos", "Ribeiro", "Duarte", "Fagundes", "Borges", "Guimarães", "Peixoto", "Xavier", "Sales", "Toledo", "Amaral", "Coelho", "Fonseca"];
// [cargo, papel no banco, influência, canal]
const PAPEIS = {
  D: ["Gerente industrial", "decision_maker", 3, "whatsapp"], T: ["Supervisor de manutenção", "technical", 2, "whatsapp"], C: ["Analista de compras", "buyer", 2, "email"],
  F: ["Analista financeiro", "financial", 2, "email"], A: ["Almoxarife", "warehouse", 1, "whatsapp"], M: ["Encarregado de oficina", "mechanic", 1, "whatsapp"],
};

function cnpj(n) {
  const base = String(41_000_000 + n * 370_913).padStart(8, "0").slice(0, 8) + "0001";
  const dv = (s, w) => { const r = s.split("").reduce((t, d, i) => t + Number(d) * w[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = dv(base, w1);
  return base + d1 + dv(base + d1, [6, ...w1]);
}

// ---------------------------------------------------------------------------- clientes
const clientes = [];
let lugar = 0;
DONOS.forEach((dono, slot) => {
  const tipos = [...Array(dono.rc).fill("rc"), ...Array(dono.aq).fill("aq"), ...Array(dono.perdidas).fill("perdida")];
  tipos.forEach((funil, i) => {
    const grande = slot === 0 || rnd() < 0.45;
    const prefixo = pick(grande ? PREFIXOS_GRANDE : PREFIXOS_MEDIO);
    const escala = Math.round(between(...dono.escala) * (grande ? 1.1 : 0.85) / 1000) * 1000;
    const cidade = CIDADES[dono.cidades[i % dono.cidades.length]];
    const marcaConc = pick(MARCAS_CONC);
    clientes.push({
      idx: clientes.length + 1, dono: slot, funil, escala,
      nome: `${prefixo} ${LUGARES[lugar++]}`, ramo: RAMO[prefixo], cidade,
      colhedoras: Math.max(5, Math.round(escala / 2600 + between(-3, 4))), modelos: pick(MODELOS),
      prensa: funil === "rc" ? pick(["tawper_loan", "tawper_loan", "own"]) : pick(["own", "competitor_loan", "none"]),
      marca: funil === "rc" ? (rnd() < 0.75 ? "Tawper" : marcaConc) : marcaConc, concorrente: pick(CONCORRENTES),
      potencial: escala > 70_000 ? "high" : escala > 45_000 ? "medium" : "low", urgencia: pick(["high", "medium", "medium", "low"]),
      vendas: [], hoje: false, atraso: 0,
    });
  });
});

// ---------------------------------------------------------------------------- vendas de 2026 (mês a mês)
const ALVO_MES = { 1: 440_000, 2: 520_000, 3: 640_000, 4: 570_000, 5: 620_000, 6: 600_000, 7: 680_000, 8: 640_000, 9: 740_000, 10: 800_000, 11: 350_000 };
const rcDe = (slot) => clientes.filter((c) => c.dono === slot && c.funil === "rc");
for (const [m, alvo] of Object.entries(ALVO_MES)) {
  const mes = String(m).padStart(2, "0");
  const fim = m === "11" ? BASE : addDays(`2026-${String(Number(m) + 1).padStart(2, "0")}-01`, -1);
  const dias = businessDays(`2026-${mes}-01`, fim);
  const eventos = [];
  for (let n = Math.round(alvo / 52_000); n > 0; n--) {
    let r = rnd(); let slot = 0;
    while (r > DONOS[slot].share && slot < DONOS.length - 1) { r -= DONOS[slot].share; slot++; }
    // Um cliente não compra duas vezes em menos de 35 dias: tenta outros dias e, por fim, outro cliente da empresa.
    const livresEm = (lista, dia) => lista.filter((c) => c.vendas.every((v) => Math.abs(diff(dia, v.dia)) >= 35));
    let dia = pick(dias);
    let livres = livresEm(rcDe(slot), dia);
    for (let t = 0; t < 12 && !livres.length; t++) livres = livresEm(rcDe(slot), (dia = pick(dias)));
    if (!livres.length) livres = livresEm(clientes.filter((c) => c.funil === "rc"), dia);
    const c = pick(livres);
    const venda = { dia, valor: c.escala * between(0.7, 1.3) };
    c.vendas.push(venda); // entra já: a próxima venda do mês enxerga esta
    eventos.push(venda);
  }
  const fator = alvo / eventos.reduce((t, e) => t + e.valor, 0);
  for (const e of eventos) e.valor = Math.round((e.valor * fator) / 10) * 10;
}
// Ajuste fino: aproxima a parte de cada pessoa do alvo (share) sem mudar o total de cada mês
// (ajustes alternados por pessoa e por mês até os dois baterem).
{
  const de2026 = clientes.flatMap((c) => c.vendas.map((v) => ({ v, dono: c.dono, mes: Number(v.dia.slice(5, 7)) })));
  const total = Object.values(ALVO_MES).reduce((a, b) => a + b, 0);
  for (let volta = 0; volta < 8; volta++) {
    DONOS.forEach((d, slot) => {
      const minhas = de2026.filter((x) => x.dono === slot);
      const f = (d.share * total) / minhas.reduce((t, x) => t + x.v.valor, 0);
      minhas.forEach((x) => (x.v.valor *= f));
    });
    for (const [m, alvo] of Object.entries(ALVO_MES)) {
      const doMes = de2026.filter((x) => x.mes === Number(m));
      const f = alvo / doMes.reduce((t, x) => t + x.v.valor, 0);
      doMes.forEach((x) => (x.v.valor *= f));
    }
  }
  de2026.forEach((x) => (x.v.valor = Math.round(x.v.valor / 10) * 10));
}
// Quem já era cliente antes de 2026 tem uma compra no fim de 2025 (os ciclos ficam 2ª, 3ª, 4ª venda).
for (const c of clientes.filter((x) => x.funil === "rc")) {
  c.vendas.sort((a, b) => a.dia.localeCompare(b.dia));
  if (c.vendas.length === 0 || rnd() < 0.45) {
    const limite = c.vendas[0] ? addDays(c.vendas[0].dia, -40) : "2025-12-19";
    const dias = businessDays("2025-09-01", limite < "2025-12-19" ? limite : "2025-12-19");
    c.vendas.unshift({ dia: pick(dias), valor: Math.round((c.escala * between(0.7, 1.1)) / 10) * 10 });
  }
}

// ---------------------------------------------------------------------------- etapa atual de cada cliente
for (const c of clientes) {
  if (c.funil === "rc") {
    const gap = diff(BASE, c.vendas.at(-1).dia);
    if (gap < 14) { c.etapa = "posvenda"; c.dias = Math.max(1, gap - 1); c.valor = 0; }
    else if (gap < 55) { c.etapa = "relacionamento"; c.dias = int(3, Math.max(4, gap - 10)); c.valor = Math.round(c.escala * 0.8 / 100) * 100; }
    else {
      c.etapa = pick(gap > 95 ? ["orcamento_r", "negociacao_r", "previsao", "negociacao_r"] : ["previsao", "previsao", "orcamento_r"]);
      c.dias = Math.min(gap - 5, c.etapa === "previsao" ? int(6, 40) : int(2, 9));
      c.valor = Math.round(c.escala * between(0.95, 1.35) / 100) * 100;
    }
  } else {
    const ETAPAS_AQ = ["lead", "qualificacao", "apresentacao_empresa", "apresentacao_tecnica", "cadastro", "homologacao", "aprovado", "orcamento", "negociacao"];
    c.etapa = c.funil === "perdida" ? pick(["orcamento", "negociacao", "homologacao"]) : pick(ETAPAS_AQ);
    const LIMITE = { lead: 14, qualificacao: 21, apresentacao_empresa: 21, apresentacao_tecnica: 21, cadastro: 20, homologacao: 45, aprovado: 30, orcamento: 10, negociacao: 15 };
    c.dias = c.funil === "perdida" ? int(25, 70) : int(2, Math.max(3, LIMITE[c.etapa] - 2));
    c.valor = ["homologacao", "aprovado", "orcamento", "negociacao"].includes(c.etapa) ? Math.round(c.escala * between(1.1, 1.9) / 100) * 100 : 0;
    if (c.funil === "perdida") { c.fechado = int(8, Math.min(60, c.dias - 3)); c.motivo = pick(["Preço", "Perdeu para concorrente", "Prazo de entrega", "Contrato vigente com concorrente"]); }
  }
}
// Poucas contas paradas de propósito (a Gestão precisa ter o que cobrar).
for (const c of clientes.filter((x) => x.funil === "aq" && ["qualificacao", "homologacao"].includes(x.etapa)).slice(0, 2)) c.dias += c.etapa === "homologacao" ? 25 : 12;
for (const c of clientes.filter((x) => x.etapa === "relacionamento" && x.dias > 20).slice(0, 1)) c.dias = Math.min(diff(BASE, c.vendas.at(-1).dia) - 3, 52);

// Hoje: tarefas do dia; atrasos: 6 tarefas, em quatro pessoas.
DONOS.forEach((_, slot) => {
  const ativos = clientes.filter((c) => c.dono === slot && c.funil !== "perdida");
  ativos.filter((_, i) => i % 4 === 1).slice(0, slot === 0 ? 2 : 4).forEach((c) => (c.hoje = true));
});
const ATRASOS = { 0: [3], 2: [2], 3: [4, 1], 4: [6, 2] };
for (const [slot, dias] of Object.entries(ATRASOS)) {
  const ativos = clientes.filter((c) => c.dono === Number(slot) && c.funil !== "perdida" && !c.hoje);
  dias.forEach((d, i) => (ativos[i * 3 + 2].atraso = d));
}

// ---------------------------------------------------------------------------- contatos
const contatos = [];
for (const c of clientes) {
  const papeis = ["D", "T", ...(rnd() < 0.7 ? ["C"] : []), ...(c.escala > 55_000 && rnd() < 0.55 ? ["F"] : []), ...(rnd() < 0.3 ? ["A"] : []), ...(rnd() < 0.2 ? ["M"] : [])];
  papeis.forEach((p, ordem) => {
    const nome = `${NOMES[(c.idx * 7 + ordem * 11) % NOMES.length]} ${SOBRENOMES[(c.idx * 13 + ordem * 5) % SOBRENOMES.length]}`;
    contatos.push({ cliente: c.idx, ordem: ordem + 1, nome, papel: p });
  });
}

// ---------------------------------------------------------------------------- conferência do gerador
const brl = (v) => `R$ ${(v / 1e6).toFixed(2)} mi`;
const vendas2026 = clientes.flatMap((c) => c.vendas.filter((v) => v.dia >= "2026-01-01").map((v) => ({ ...v, dono: c.dono })));
const total = vendas2026.reduce((t, v) => t + v.valor, 0);
const pipeline = clientes.filter((c) => c.funil !== "perdida").reduce((t, c) => t + c.valor, 0);
console.log(`clientes ${clientes.length} · contatos ${contatos.length} · vendas 2026: ${vendas2026.length} = ${brl(total)} · funil aberto ${brl(pipeline)}`);
console.log("por pessoa:", DONOS.map((d, s) => `${d.nome} ${brl(vendas2026.filter((v) => v.dono === s).reduce((t, v) => t + v.valor, 0))}`).join(" · "));
console.log("por mês:", Object.keys(ALVO_MES).map((m) => `${m}:${Math.round(vendas2026.filter((v) => Number(v.dia.slice(5, 7)) === Number(m)).reduce((t, v) => t + v.valor, 0) / 1000)}k`).join(" "));
if (Math.abs(total - Object.values(ALVO_MES).reduce((a, b) => a + b, 0)) > 2000) throw new Error("total de vendas fora do alvo");
for (const c of clientes.filter((x) => x.funil === "rc")) {
  for (let i = 1; i < c.vendas.length; i++) if (diff(c.vendas[i].dia, c.vendas[i - 1].dia) < 10) throw new Error(`vendas coladas em ${c.nome}`);
  // Pós-venda começa na própria venda; nas outras etapas o cliente entrou depois da última venda.
  if (c.etapa !== "posvenda" && c.dias >= diff(BASE, c.vendas.at(-1).dia)) throw new Error(`etapa antes da última venda em ${c.nome}`);
}

// ---------------------------------------------------------------------------- SQL
const linhasClientes = clientes.map((c) => {
  const [cidade, uf, cep, lat, lng, ddd] = c.cidade;
  const vendas = c.vendas.map((v) => `${v.dia}:${v.valor}`).join(",");
  return `  (${c.idx}, ${q(c.nome)}, ${q(cidade)}, ${q(uf)}, ${q(cep)}, ${lat}, ${lng}, ${q(ddd)}, ${q(c.ramo)}, ${c.colhedoras}, ${q(c.modelos)}, ${q(c.prensa)}, ${q(c.marca)}, ${q(c.concorrente)}, ${q(c.potencial)}, ${Math.round(c.escala * 0.6 / 1000) * 1000}, ${q(c.urgencia)}, ${q(c.funil)}, ${q(c.etapa)}, ${c.dias}, ${c.valor}, ${q(vendas)}, ${q(cnpj(c.idx))}, ${c.dono}, ${c.hoje}, ${c.atraso}, ${c.fechado ?? 0}, ${q(c.motivo ?? "")})`;
});
const linhasContatos = contatos.map((k) => {
  const [cargo, papel, infl, canal] = PAPEIS[k.papel];
  return `  (${k.cliente}, ${k.ordem}, ${q(k.nome)}, ${q(cargo)}, ${q(papel)}, ${infl}, ${q(canal)})`;
});

const template = await import("./demo-template.mjs");
const sql = template.default({ clientes: linhasClientes.join(",\n"), contatos: linhasContatos.join(",\n"), resumo: { total, pipeline, n: clientes.length } });
const out = join(dirname(fileURLToPath(import.meta.url)), "dados-demonstracao.sql");
writeFileSync(out, sql);
console.log(`gravado: ${out}`);
