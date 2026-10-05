// Modelo de domínio do Tawper OS (seção 5 da especificação).
// A empresa é a entidade central; todo o resto pertence a ela.

export type Role = "admin" | "gestor" | "vendedor" | "representante";

export interface User {
  id: string;
  name: string;
  short: string;
  role: Role;
  title: string;
  initials: string;
  color: string;
  phone: string;
  regions: string[];
}

export type FunnelId = "aquisicao" | "recorrencia";

export type CompanyStatus = "ativa" | "espera" | "perdida" | "arquivada";
export type Prensa = "Própria" | "Comodato Tawper" | "Comodato concorrente" | "Não possui";
export type Urgencia = "Alta" | "Média" | "Baixa";
export type Potencial = "Alto" | "Médio" | "Baixo";

export interface Standby {
  motivo: string;
  inicio: string;
  reavaliacao: string;
  responsavelId: string;
  condicao: string;
}

export interface Company {
  id: string;
  codigo: string;
  nome: string;
  razaoSocial: string;
  cnpj?: string;
  status: CompanyStatus;
  ownerId: string;
  regiao?: string;
  cidade?: string;
  uf?: string;
  ramo?: string;
  grupo?: string;
  influenciadoraId?: string;
  condicaoDependencia?: string;
  origem: string;
  potencial?: Potencial;
  potencialMensal?: number;
  colhedoras?: number;
  modelos?: string;
  prensa?: Prensa;
  marcaAtual?: string;
  concorrente?: string;
  urgencia: Urgencia;
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
  standby?: Standby;
  clienteDesde?: string;
  importadoDe?: "Moskit" | "Planilha";
  motivoPerda?: string;
}

export type Papel = "Decisor" | "Comprador" | "Técnico" | "Mecânico" | "Influenciador" | "Outro";

export interface Contact {
  id: string;
  companyId: string;
  nome: string;
  cargo: string;
  papel: Papel;
  influencia: 1 | 2 | 3;
  whatsapp?: string;
  email?: string;
  canal: "WhatsApp" | "Ligação" | "E-mail" | "Presencial";
  autorizaContato: boolean;
  ativo: boolean;
}

export type DealStatus = "aberta" | "ganha" | "perdida" | "suspensa";

export interface StageEntry {
  stageId: string;
  enteredAt: string;
  leftAt?: string;
  byId: string;
}

export interface Deal {
  id: string;
  companyId: string;
  ownerId: string;
  funnel: FunnelId;
  stageId: string;
  titulo: string;
  valor?: number;
  probabilidade?: number;
  previsaoFechamento?: string;
  status: DealStatus;
  motivo?: string;
  createdAt: string;
  stageEnteredAt: string;
  closedAt?: string;
  valorRealizado?: number;
  checklist: Record<string, boolean>;
  history: StageEntry[];
  ciclo: number;
  objecao?: string;
}

export interface Strategy {
  companyId: string;
  objetivo: string;
  diagnostico: string;
  barreira: string;
  estrategia: string;
  resultadoEsperado: string;
  definidoPorId: string;
  revisadaEm: string;
  proximaRevisao: string;
  versao: number;
  origem: "manual" | "ia-aprovada";
}

export interface CopilotDetail {
  diagnostico: string;
  hipoteses: string[];
  acoes: { titulo: string; tipo: ActivityType; prazoDias: number }[];
  perguntas: string[];
  rascunho: string;
  objetivo: string;
  barreira: string;
  estrategia: string;
  resultadoEsperado: string;
}

export interface AISuggestion {
  id: string;
  companyId: string;
  tipo: "estrategia" | "proximo_passo" | "cadastro";
  titulo: string;
  texto: string;
  detalhes?: CopilotDetail;
  base: string[];
  faltantes: string[];
  status: "pendente" | "aprovada" | "descartada";
  createdAt: string;
  decididoPorId?: string;
  decididoEm?: string;
}

export type ActivityType =
  | "Ligação"
  | "WhatsApp"
  | "E-mail"
  | "Visita"
  | "Reunião"
  | "Cotação"
  | "Homologação"
  | "Cadastro"
  | "Suporte"
  | "Outro";

export type Prioridade = "Alta" | "Média" | "Baixa";

export interface Activity {
  id: string;
  companyId: string;
  dealId?: string;
  tipo: ActivityType;
  titulo: string;
  descricao?: string;
  ownerId: string;
  dueAt: string;
  prioridade: Prioridade;
  status: "pendente" | "concluida" | "cancelada";
  origem: "manual" | "regra" | "ia" | "integracao";
  createdAt: string;
  completedAt?: string;
  resultado?: string;
  nextActivityId?: string;
}

export type Canal = "WhatsApp" | "Ligação" | "E-mail" | "Visita" | "Reunião" | "Nota" | "Sistema" | "IA";

export type InteractionKind =
  | "create"
  | "stage"
  | "win"
  | "loss"
  | "standby"
  | "quote"
  | "task"
  | "note"
  | "ai"
  | "contact"
  | "merge"
  | "import"
  | "cobranca"
  | "strategy";

export interface Interaction {
  id: string;
  companyId: string;
  dealId?: string;
  canal: Canal;
  at: string;
  autorId: string; // id do usuário, "ia" ou "sistema"
  titulo: string;
  conteudo?: string;
  kind: InteractionKind;
}

export interface Message {
  id: string;
  from: "cliente" | "tawper" | "nota" | "sistema";
  text: string;
  at: string;
  autorId?: string;
  attachment?: { nome: string; tipo: "pdf" | "img"; detalhe?: string };
}

export interface ConversationSummary {
  assunto: string;
  necessidade: string;
  objecoes: string[];
  compromissosTawper: string[];
  compromissosCliente: string[];
  datas: string[];
  proximoPasso: string;
  proximoPassoTipo: ActivityType;
  proximoPassoDias: number;
  confianca: number;
  etapaSugerida?: string;
  dadosExtraidos?: Partial<Pick<Company, "colhedoras" | "modelos" | "marcaAtual" | "prensa" | "concorrente">>;
  geradoEm: string;
}

export interface Persona {
  empresa: string;
  cidade: string;
  uf: string;
  colhedoras: number;
  modelos: string;
  marca: string;
  prensa: Prensa;
  mecanico: string;
  papel: Papel;
  cargo: string;
  indicacao?: string;
}

export interface Conversation {
  id: string;
  companyId?: string;
  contactId?: string;
  contatoNome: string;
  telefone: string;
  ownerId: string;
  messages: Message[];
  unread: number;
  summary?: ConversationSummary;
  persona?: Persona;
  lastAt: string;
}

export interface QuoteItem {
  id: string;
  sku: string;
  descricao: string;
  unidade: string;
  qtd: number;
  preco: number;
}

export type QuoteStatus = "rascunho" | "enviado" | "aceito" | "recusado";

export interface Quote {
  id: string;
  numero: string;
  companyId: string;
  dealId: string;
  itens: QuoteItem[];
  desconto: number;
  condicao: string;
  validadeDias: number;
  status: QuoteStatus;
  createdAt: string;
  enviadoEm?: string;
  decisaoEsperada?: string;
  autorId: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  autorId: string;
  origem: "usuario" | "ia" | "integracao" | "automacao";
  entidade: string;
  entidadeId: string;
  companyId?: string;
  campo: string;
  de?: string;
  para?: string;
}

export interface Notification {
  id: string;
  userId: string;
  at: string;
  titulo: string;
  texto: string;
  link?: string;
  lida: boolean;
  tipo: "cobranca" | "alerta" | "ia" | "sistema";
  deId?: string;
}

export interface RouteStop {
  companyId: string;
  objetivo: string;
  motivo: string;
}

export interface RoutePlan {
  id: string;
  ownerId: string;
  regiao: string;
  data: string;
  paradas: RouteStop[];
  kmEstimado: number;
  status: "planejada" | "confirmada";
}

export interface DemoData {
  version: number;
  seededAt: string;
  users: User[];
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  strategies: Strategy[];
  strategyHistory: Strategy[];
  suggestions: AISuggestion[];
  activities: Activity[];
  interactions: Interaction[];
  conversations: Conversation[];
  quotes: Quote[];
  audit: AuditEntry[];
  notifications: Notification[];
  routes: RoutePlan[];
  seq: { codigo: number; quote: number };
}
