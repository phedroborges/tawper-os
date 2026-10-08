import type { ActivityType, Company, FunnelId, Papel, Prensa, User } from "./types";

export const USERS: User[] = [
  {
    id: "u-murilo",
    name: "Murilo Louis",
    short: "Murilo",
    role: "admin",
    title: "Proprietário · Gestor comercial",
    initials: "ML",
    color: "#d41624",
    phone: "(17) 99701-2201",
    regions: ["Noroeste Paulista", "Norte Paulista"],
  },
  {
    id: "u-douglas",
    name: "Douglas Ferreira",
    short: "Douglas",
    role: "vendedor",
    title: "Vendedor interno · Treinador Tawper Academy",
    initials: "DF",
    color: "#123a7b",
    phone: "(17) 99701-2202",
    regions: ["Noroeste Paulista"],
  },
  {
    id: "u-paulo",
    name: "Paulo",
    short: "Paulo",
    role: "vendedor",
    title: "Vendedor interno",
    initials: "PA",
    color: "#0f7a5a",
    phone: "(17) 99701-2203",
    regions: ["Paranapanema", "Oeste Paulista"],
  },
  {
    id: "u-nilton",
    name: "Nilton",
    short: "Nilton",
    role: "vendedor",
    title: "Vendedor interno",
    initials: "NI",
    color: "#8a5a00",
    phone: "(17) 99701-2204",
    regions: ["Mato Grosso do Sul", "Goiás"],
  },
  {
    id: "u-fernando",
    name: "Fernando",
    short: "Fernando",
    role: "vendedor",
    title: "Vendedor interno",
    initials: "FE",
    color: "#5b3fa6",
    phone: "(17) 99701-2205",
    regions: ["Triângulo Mineiro", "Oeste Paulista"],
  },
];

export const ROLE_LABEL: Record<User["role"], string> = {
  admin: "Administrador · Gestor",
  gestor: "Gestor comercial",
  vendedor: "Vendedor",
  representante: "Representante",
};

export function isManager(u?: User) {
  return u?.role === "admin" || u?.role === "gestor";
}

/** Sem login real, a exclusão de empresa fica presa a esta pessoa, não ao papel genérico. */
export function isMuriloLouis(u?: { id?: string; name?: string }) {
  return u?.id === "u-murilo" || u?.name === "Murilo Louis";
}

export interface Criterion {
  id: string;
  label: string;
  kind: "field" | "check" | "contact" | "quote";
  field?: keyof Company;
  hint?: string;
}

export interface SuggestedTask {
  titulo: string;
  tipo: ActivityType;
  prazoDias: number;
}

export interface StageDef {
  id: string;
  funnel: FunnelId;
  nome: string;
  curto: string;
  objetivo: string;
  limiteDias: number;
  probabilidade: number;
  criterios: Criterion[];
  tarefas: SuggestedTask[];
  terminal?: boolean;
}

const AQUISICAO: StageDef[] = [
  {
    id: "lead",
    funnel: "aquisicao",
    nome: "Lead desconhecido",
    curto: "Lead",
    objetivo: "Identificar empresa, aderência e caminho de entrada.",
    limiteDias: 14,
    probabilidade: 5,
    criterios: [
      { id: "cidade", label: "Cidade e estado", kind: "field", field: "cidade" },
      { id: "regiao", label: "Região", kind: "field", field: "regiao" },
      { id: "ramo", label: "Ramo de atividade", kind: "field", field: "ramo" },
      { id: "contato", label: "Pelo menos um contato", kind: "contact" },
    ],
    tarefas: [{ titulo: "Identificar responsável pela manutenção agrícola", tipo: "Ligação", prazoDias: 2 }],
  },
  {
    id: "qualificacao",
    funnel: "aquisicao",
    nome: "Qualificação",
    curto: "Qualif.",
    objetivo: "Conhecer operação, potencial e interlocutores.",
    limiteDias: 21,
    probabilidade: 10,
    criterios: [
      { id: "colhedoras", label: "Número de colhedoras", kind: "field", field: "colhedoras" },
      { id: "prensa", label: "Tipo de prensa", kind: "field", field: "prensa" },
      { id: "marcaAtual", label: "Marca / fornecedor atual", kind: "field", field: "marcaAtual" },
      { id: "potencial", label: "Potencial estimado", kind: "field", field: "potencial" },
    ],
    tarefas: [{ titulo: "Mapear frota, prensa e fornecedor atual", tipo: "WhatsApp", prazoDias: 3 }],
  },
  {
    id: "apresentacao",
    funnel: "aquisicao",
    nome: "Apresentação",
    curto: "Apres.",
    objetivo: "Apresentar a Tawper e avançar para o interesse técnico.",
    limiteDias: 21,
    probabilidade: 20,
    criterios: [
      { id: "apresentacao_realizada", label: "Apresentação institucional/técnica realizada", kind: "check" },
      { id: "interesse_tecnico", label: "Interlocutor confirmou interesse técnico", kind: "check" },
    ],
    tarefas: [{ titulo: "Agendar apresentação da Tawper com a manutenção", tipo: "Visita", prazoDias: 5 }],
  },
  {
    id: "cadastro",
    funnel: "aquisicao",
    nome: "Cadastro",
    curto: "Cadastro",
    objetivo: "Concluir documentação para habilitar a relação comercial.",
    limiteDias: 20,
    probabilidade: 30,
    criterios: [
      { id: "documentacao_enviada", label: "Documentação cadastral enviada", kind: "check" },
      { id: "cadastro_aprovado", label: "Cadastro aprovado pelo cliente", kind: "check" },
    ],
    tarefas: [{ titulo: "Enviar ficha cadastral e documentos da Tawper", tipo: "E-mail", prazoDias: 2 }],
  },
  {
    id: "homologacao",
    funnel: "aquisicao",
    nome: "Homologação",
    curto: "Homol.",
    objetivo: "Identificar itens, enviar material, acompanhar teste e formalizar aprovação.",
    limiteDias: 45,
    probabilidade: 45,
    criterios: [
      { id: "medidas", label: "Medidas e produtos identificados", kind: "check" },
      { id: "teste_instalado", label: "Material de teste enviado ou instalado", kind: "check" },
      { id: "aprovacao_tecnica", label: "Aprovação técnica registrada", kind: "check", hint: "de preferência com evidência" },
    ],
    tarefas: [
      { titulo: "Levantar medidas das mangueiras nas colhedoras", tipo: "Visita", prazoDias: 4 },
      { titulo: "Preparar kit de teste", tipo: "Homologação", prazoDias: 8 },
    ],
  },
  {
    id: "aprovado",
    funnel: "aquisicao",
    nome: "Produto aprovado",
    curto: "Aprovado",
    objetivo: "Converter a aprovação técnica em uma demanda concreta.",
    limiteDias: 30,
    probabilidade: 60,
    criterios: [{ id: "solicitacao_orcamento", label: "Solicitação de orçamento recebida", kind: "check" }],
    tarefas: [{ titulo: "Confirmar janela de compra e estoque atual", tipo: "Ligação", prazoDias: 3 }],
  },
  {
    id: "orcamento",
    funnel: "aquisicao",
    nome: "Orçamento",
    curto: "Orçam.",
    objetivo: "Enviar proposta e controlar validade, valor e decisão.",
    limiteDias: 10,
    probabilidade: 70,
    criterios: [{ id: "orcamento_enviado", label: "Orçamento enviado ao cliente", kind: "quote" }],
    tarefas: [{ titulo: "Montar e enviar orçamento", tipo: "Cotação", prazoDias: 1 }],
  },
  {
    id: "negociacao",
    funnel: "aquisicao",
    nome: "Negociação",
    curto: "Negoc.",
    objetivo: "Tratar objeções e obter uma decisão explícita.",
    limiteDias: 15,
    probabilidade: 80,
    criterios: [],
    tarefas: [{ titulo: "Tratar objeções e buscar decisão", tipo: "Reunião", prazoDias: 3 }],
  },
  {
    id: "ganho",
    funnel: "aquisicao",
    nome: "Primeira venda",
    curto: "Ganho",
    objetivo: "Registrar o resultado e iniciar a jornada de recorrência.",
    limiteDias: 0,
    probabilidade: 100,
    criterios: [],
    tarefas: [],
    terminal: true,
  },
];

const RECORRENCIA: StageDef[] = [
  {
    id: "posvenda",
    funnel: "recorrencia",
    nome: "Pós-venda",
    curto: "Pós-venda",
    objetivo: "Confirmar entrega, aplicação e satisfação.",
    limiteDias: 10,
    probabilidade: 20,
    criterios: [
      { id: "entrega_confirmada", label: "Entrega e aplicação confirmadas", kind: "check" },
      { id: "feedback", label: "Feedback do cliente coletado", kind: "check" },
    ],
    tarefas: [{ titulo: "Pós-venda: confirmar entrega e aplicação", tipo: "Ligação", prazoDias: 5 }],
  },
  {
    id: "suporte",
    funnel: "recorrencia",
    nome: "Suporte",
    curto: "Suporte",
    objetivo: "Resolver dúvidas e chamados sem consumir o vendedor.",
    limiteDias: 7,
    probabilidade: 20,
    criterios: [{ id: "suporte_resolvido", label: "Chamado técnico resolvido", kind: "check" }],
    tarefas: [{ titulo: "Resolver chamado técnico", tipo: "Suporte", prazoDias: 1 }],
  },
  {
    id: "relacionamento",
    funnel: "recorrencia",
    nome: "Relacionamento",
    curto: "Relac.",
    objetivo: "Manter presença e mapear estoque, safra, reforma e expansão.",
    limiteDias: 45,
    probabilidade: 30,
    criterios: [{ id: "demanda_mapeada", label: "Estoque, safra e reforma mapeados", kind: "check" }],
    tarefas: [{ titulo: "Visita de relacionamento — mapear demanda", tipo: "Visita", prazoDias: 14 }],
  },
  {
    id: "previsao",
    funnel: "recorrencia",
    nome: "Previsão de compra",
    curto: "Previsão",
    objetivo: "Registrar a janela esperada e evitar cobrança fora de hora.",
    limiteDias: 60,
    probabilidade: 45,
    criterios: [{ id: "demanda_confirmada", label: "Nova demanda confirmada pelo cliente", kind: "check" }],
    tarefas: [{ titulo: "Revisar demanda na janela prevista", tipo: "Ligação", prazoDias: 20 }],
  },
  {
    id: "orcamento_r",
    funnel: "recorrencia",
    nome: "Novo orçamento",
    curto: "Orçam.",
    objetivo: "Transformar a necessidade em proposta.",
    limiteDias: 10,
    probabilidade: 70,
    criterios: [{ id: "orcamento_enviado", label: "Orçamento enviado ao cliente", kind: "quote" }],
    tarefas: [{ titulo: "Montar e enviar orçamento de reposição", tipo: "Cotação", prazoDias: 1 }],
  },
  {
    id: "recompra",
    funnel: "recorrencia",
    nome: "Recompra",
    curto: "Recompra",
    objetivo: "Registrar o ganho e reiniciar o ciclo.",
    limiteDias: 0,
    probabilidade: 100,
    criterios: [],
    tarefas: [],
    terminal: true,
  },
];

export const FUNNELS: Record<FunnelId, { id: FunnelId; nome: string; subtitulo: string; stages: StageDef[] }> = {
  aquisicao: { id: "aquisicao", nome: "Aquisição", subtitulo: "Prospecção até a primeira venda", stages: AQUISICAO },
  recorrencia: { id: "recorrencia", nome: "Recorrência", subtitulo: "Pós-venda, relacionamento e recompra", stages: RECORRENCIA },
};

const STAGE_INDEX = new Map<string, StageDef>();
[...AQUISICAO, ...RECORRENCIA].forEach((s) => STAGE_INDEX.set(`${s.funnel}:${s.id}`, s));

export function getStage(funnel: FunnelId, id: string): StageDef {
  return STAGE_INDEX.get(`${funnel}:${id}`) ?? FUNNELS[funnel].stages[0];
}

export function stageIndex(funnel: FunnelId, id: string) {
  return FUNNELS[funnel].stages.findIndex((s) => s.id === id);
}

export const REGIOES = [
  "Noroeste Paulista",
  "Norte Paulista",
  "Oeste Paulista",
  "Paranapanema",
  "Triângulo Mineiro",
  "Goiás",
  "Mato Grosso do Sul",
];

export const UFS = ["SP", "MG", "GO", "MS", "PR", "MT"];

export const RAMOS = [
  "Usina sucroenergética",
  "Grupo sucroenergético",
  "Fornecedor de cana",
  "Prestador de serviço (CTT)",
  "Destilaria",
  "Revenda / oficina",
];

export const PRENSAS: Prensa[] = ["Própria", "Comodato Tawper", "Comodato concorrente", "Não possui"];

export const MARCAS = ["Parker", "Gates", "Manuli", "Continental", "Eaton", "Tawper", "Diversas / sem padrão"];

export const PAPEIS: Papel[] = ["Decisor", "Comprador", "Técnico", "Mecânico", "Influenciador", "Outro"];

export const ORIGENS = [
  "WhatsApp",
  "Indicação de cliente",
  "Visita de prospecção",
  "Feira / evento",
  "Site tawper.com.br",
  "Importado do Moskit",
  "Planilha de acompanhamento",
];

export const ACTIVITY_TYPES: ActivityType[] = [
  "Ligação",
  "WhatsApp",
  "Visita",
  "Reunião",
  "E-mail",
  "Cotação",
  "Homologação",
  "Cadastro",
  "Suporte",
  "Outro",
];

export const MOTIVOS_PERDA = [
  "Preço",
  "Prazo de entrega",
  "Perdeu para concorrente",
  "Contrato vigente com concorrente",
  "Reprovado na homologação",
  "Sem aderência / sem demanda",
  "Cliente sem retorno",
];

export const MOTIVOS_ESPERA = [
  "Orçamento anual ainda não liberado",
  "Aguardando fim do contrato com concorrente",
  "Aguardando decisão de conta influenciadora",
  "Entressafra / operação parada",
  "Troca de responsável no cliente",
];

export const CONDICOES_PAGAMENTO = ["28 dias", "28/56 dias", "30/60/90 dias", "À vista (3% desc.)", "Boleto 21 dias"];

export interface CatalogItem {
  sku: string;
  descricao: string;
  unidade: string;
  preco: number;
  linha: string;
}

export const CATALOG: CatalogItem[] = [
  { sku: "MH-R2-12", descricao: 'Mangueira hidráulica 2 tramas SAE 100 R2AT 1/2"', unidade: "m", preco: 38.9, linha: "Mangueiras" },
  { sku: "MH-R2-34", descricao: 'Mangueira hidráulica 2 tramas SAE 100 R2AT 3/4"', unidade: "m", preco: 54.5, linha: "Mangueiras" },
  { sku: "MH-4SH-34", descricao: 'Mangueira 4 espirais 4SH 3/4" — alta pressão', unidade: "m", preco: 96.8, linha: "Mangueiras" },
  { sku: "MH-4SH-1", descricao: 'Mangueira 4 espirais 4SH 1"', unidade: "m", preco: 128.4, linha: "Mangueiras" },
  { sku: "MH-R13-1", descricao: 'Mangueira R13 1" — corte de base', unidade: "m", preco: 162.0, linha: "Mangueiras" },
  { sku: "TP-JIC-12", descricao: 'Terminal prensável JIC fêmea 37° 1/2"', unidade: "un", preco: 21.9, linha: "Terminais e conexões" },
  { sku: "TP-JIC-34", descricao: 'Terminal prensável JIC fêmea 37° 3/4"', unidade: "un", preco: 34.5, linha: "Terminais e conexões" },
  { sku: "TP-ORFS-34", descricao: 'Terminal prensável ORFS fêmea 3/4"', unidade: "un", preco: 41.2, linha: "Terminais e conexões" },
  { sku: "TP-FLG-1", descricao: 'Terminal flange SAE código 62 — 1"', unidade: "un", preco: 118.0, linha: "Terminais e conexões" },
  { sku: "AD-JICBSP-34", descricao: 'Adaptador JIC x BSP 3/4"', unidade: "un", preco: 27.6, linha: "Terminais e conexões" },
  { sku: "CP-ESP-34", descricao: 'Capa protetora espiral 3/4"', unidade: "m", preco: 12.4, linha: "Proteção" },
  { sku: "KIT-CH570-CB", descricao: "Kit mangueiras corte de base — John Deere CH570", unidade: "kit", preco: 4890.0, linha: "Kits para colhedoras" },
  { sku: "KIT-CH950-EL", descricao: "Kit mangueiras elevador — John Deere CH950", unidade: "kit", preco: 6120.0, linha: "Kits para colhedoras" },
  { sku: "KIT-A8800-PC", descricao: "Kit mangueiras picador — Case A8800", unidade: "kit", preco: 5640.0, linha: "Kits para colhedoras" },
  { sku: "KIT-A9000-CB", descricao: "Kit mangueiras corte de base — Case A9000", unidade: "kit", preco: 5980.0, linha: "Kits para colhedoras" },
  { sku: "PR-CMD", descricao: "Prensa hidráulica em comodato (contrato 12 meses)", unidade: "un", preco: 0, linha: "Serviços" },
  { sku: "SV-ACAD", descricao: "Treinamento Tawper Academy — prensagem (até 8 mecânicos)", unidade: "turma", preco: 1800.0, linha: "Serviços" },
];

export const FIELD_LABELS: Partial<Record<keyof Company, string>> = {
  nome: "Nome fantasia",
  razaoSocial: "Razão social",
  cnpj: "CNPJ",
  status: "Status",
  ownerId: "Responsável",
  regiao: "Região",
  cidade: "Cidade",
  uf: "UF",
  ramo: "Ramo de atividade",
  grupo: "Grupo econômico",
  influenciadoraId: "Empresa influenciadora",
  condicaoDependencia: "Condição de dependência",
  origem: "Origem",
  potencial: "Potencial",
  potencialMensal: "Potencial mensal",
  colhedoras: "Nº de colhedoras",
  modelos: "Modelos",
  prensa: "Tipo de prensa",
  marcaAtual: "Marca atual",
  concorrente: "Concorrente",
  urgencia: "Urgência",
  observacoes: "Observações",
};
