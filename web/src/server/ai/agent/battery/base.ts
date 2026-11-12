import type { Activity, Company, Contact, Deal, User } from "@/lib/types";

/**
 * CRM simulado para os testes e para a bateria do agente: poucos clientes, mas com as situações do dia a dia
 * (tarefa atrasada, tarefa de hoje, visita marcada, contato que ainda não existe, cliente de outra carteira).
 */

export const IDS = {
  douglas: "a0000000-0000-4000-8000-000000000001",
  paulo: "a0000000-0000-4000-8000-000000000002",
  phedro: "a0000000-0000-4000-8000-000000000003",
  ativos: "c0000000-0000-4000-8000-000000000001",
  santaHelena: "c0000000-0000-4000-8000-000000000002",
  colorado: "c0000000-0000-4000-8000-000000000003",
  dealAtivos: "d0000000-0000-4000-8000-000000000001",
  dealSantaHelena: "d0000000-0000-4000-8000-000000000002",
  tarefaMarcelo: "e0000000-0000-4000-8000-000000000001",
  tarefaJoana: "e0000000-0000-4000-8000-000000000002",
  visitaSantaHelena: "e0000000-0000-4000-8000-000000000003",
  tarefaColorado: "e0000000-0000-4000-8000-000000000004",
  contatoCerto: "f0000000-0000-4000-8000-000000000004",
  contatoPhedro: "f0000000-0000-4000-8000-000000000005",
};

const day = (offset: number, hour = 9) => {
  // "Hoje" é o dia de Brasília (UTC-3): depois das 21h o dia em UTC já virou e "hoje às 14h" apareceria como amanhã.
  const at = new Date(Date.now() - 3 * 3_600_000);
  at.setUTCDate(at.getUTCDate() + offset);
  at.setUTCHours(hour + 3, 0, 0, 0);
  return at.toISOString();
};

const user = (id: string, name: string, role: User["role"]): User =>
  ({ id, name, short: name.split(" ")[0], role, title: role, initials: name.slice(0, 2).toUpperCase(), color: "#000", phone: "", regions: [] }) as User;

const company = (id: string, nome: string, cidade: string, uf: string, ownerId: string): Company =>
  ({ id, codigo: `TW-${id.slice(-3)}`, nome, razaoSocial: nome, cidade, uf, status: "ativa", ownerId, origem: "Indicação", urgencia: "Média", createdAt: day(-40), updatedAt: day(-2) }) as unknown as Company;

const contact = (id: string, companyId: string, nome: string, cargo: string, papel: Contact["papel"]): Contact =>
  ({ id, companyId, nome, cargo, papel, influencia: 2, canal: "WhatsApp", autorizaContato: true, ativo: true, whatsapp: "5564999990000" }) as Contact;

const deal = (id: string, companyId: string, ownerId: string, stageId: string): Deal =>
  ({ id, companyId, ownerId, funnel: "aquisicao", stageId, titulo: "Prospecção", status: "aberta", createdAt: day(-30), stageEnteredAt: day(-10), checklist: {}, history: [], ciclo: 1 }) as unknown as Deal;

const task = (id: string, companyId: string, tipo: Activity["tipo"], titulo: string, dueAt: string, ownerId: string): Activity =>
  ({ id, companyId, tipo, titulo, dueAt, ownerId, prioridade: "Média", status: "pendente", origem: "manual", createdAt: day(-5) }) as Activity;

export function batteryBase() {
  const users = [user(IDS.douglas, "Douglas Silva", "vendedor"), user(IDS.paulo, "Paulo Lima", "vendedor"), user(IDS.phedro, "Phedro Borges", "admin")];
  return {
    users,
    companies: [
      company(IDS.ativos, "Ativos de Mineiros", "Mineiros", "GO", IDS.douglas),
      company(IDS.santaHelena, "Usina Santa Helena", "Rio Verde", "GO", IDS.douglas),
      company(IDS.colorado, "Usina Colorado", "Guaíra", "SP", IDS.paulo),
    ],
    contacts: [
      contact("f0000000-0000-4000-8000-000000000001", IDS.ativos, "Marcelo Souza", "Comprador", "Comprador"),
      contact("f0000000-0000-4000-8000-000000000002", IDS.santaHelena, "Joana Ribeiro", "Compras", "Comprador"),
      contact("f0000000-0000-4000-8000-000000000003", IDS.santaHelena, "João Batista", "Supervisor de manutenção", "Técnico"),
      // Os dois que o agente antigo criou por engano na conversa real do Phedro (03/11).
      contact(IDS.contatoCerto, IDS.ativos, "Contato Certo", "Cargo do Contato", "Outro"),
      contact(IDS.contatoPhedro, IDS.ativos, "Phedro", "", "Outro"),
    ],
    deals: [deal(IDS.dealAtivos, IDS.ativos, IDS.douglas, "lead"), deal(IDS.dealSantaHelena, IDS.santaHelena, IDS.douglas, "lead")],
    activities: [
      task(IDS.tarefaMarcelo, IDS.ativos, "Ligação", "Ligar para o Marcelo e qualificar frota e prensa", day(-1), IDS.douglas),
      task(IDS.tarefaJoana, IDS.santaHelena, "Ligação", "Ligar para a Joana e confirmar se recebeu o orçamento", day(0, 14), IDS.douglas),
      task(IDS.visitaSantaHelena, IDS.santaHelena, "Visita", "Visita técnica na Santa Helena", day(2, 8), IDS.douglas),
      task(IDS.tarefaColorado, IDS.colorado, "Ligação", "Ligar para o comprador da Colorado", day(1), IDS.paulo),
    ],
    interactions: [],
    quotes: [],
    strategies: [],
  };
}

export const douglas = () => batteryBase().users[0];
