// Dados fictícios da demonstração. Todas as datas são relativas ao momento em que a demo é
// (re)iniciada, para que atrasos, "hoje" e estagnações façam sentido em qualquer dia.

import { CATALOG, FUNNELS, USERS, stageIndex } from "./constants";
import { rel, relMinutes } from "./dates";
import type {
  Activity,
  ActivityType,
  AISuggestion,
  AuditEntry,
  Company,
  Contact,
  Conversation,
  Deal,
  DemoData,
  FunnelId,
  Interaction,
  Message,
  Notification,
  Quote,
  QuoteItem,
  RoutePlan,
  Strategy,
} from "./types";
import { normalizeWhatsApp, withValidCNPJCheckDigits } from "./br-ids";
import { quoteTotals } from "./utils";

export const DATA_VERSION = 4;

export function buildSeed(now = new Date()): DemoData {
  const R = (days: number, h = 9, m = 0) => rel(days, h, m, now);
  const M = (mins: number) => relMinutes(mins, now);

  // ---------------------------------------------------------------------------
  // Empresas
  // ---------------------------------------------------------------------------
  const base = (c: Omit<Company, "status" | "updatedAt"> & Partial<Pick<Company, "status" | "updatedAt">>): Company => ({
    status: "ativa",
    updatedAt: c.createdAt,
    ...c,
    cnpj: c.cnpj ? withValidCNPJCheckDigits(c.cnpj) : undefined,
  });

  const companies: Company[] = [
    base({
      id: "c-alvorada", codigo: "TW-0118", nome: "Usina Alvorada do Tietê",
      razaoSocial: "Alvorada do Tietê Açúcar e Bioenergia S.A.", cnpj: "12.418.330/0001-52",
      ownerId: "u-douglas", regiao: "Noroeste Paulista", cidade: "Novo Horizonte", uf: "SP",
      ramo: "Usina sucroenergética", origem: "Visita de prospecção", potencial: "Alto", potencialMensal: 38000,
      colhedoras: 22, modelos: "14 Case A8800 e 8 John Deere CH570", prensa: "Comodato concorrente",
      marcaAtual: "Parker", concorrente: "Parker (distribuidor de Rio Preto)", urgencia: "Alta",
      observacoes: "Maior incidência de estouro no corte de base das CH570 da frente 2.",
      createdAt: R(-96), updatedAt: R(-4), importadoDe: "Planilha",
    }),
    base({
      id: "c-canamax", codigo: "TW-0097", nome: "Grupo Canamax",
      razaoSocial: "Canamax Participações e Bioenergia S.A.", cnpj: "08.772.114/0001-09",
      ownerId: "u-murilo", regiao: "Norte Paulista", cidade: "Olímpia", uf: "SP",
      ramo: "Grupo sucroenergético", grupo: "Canamax (4 unidades)", origem: "Feira / evento",
      potencial: "Alto", potencialMensal: 180000, colhedoras: 118, modelos: "Frota mista Case A9000 e John Deere CH950",
      prensa: "Própria", marcaAtual: "Manuli", concorrente: "Manuli (contrato corporativo)", urgencia: "Alta",
      createdAt: R(-140), updatedAt: R(-2),
    }),
    base({
      id: "c-valeverde", codigo: "TW-0131", nome: "Fornecedora de Cana Vale Verde",
      razaoSocial: "Vale Verde Agrícola Ltda.", cnpj: "31.905.227/0001-40",
      ownerId: "u-douglas", regiao: "Norte Paulista", cidade: "Guaraci", uf: "SP", ramo: "Fornecedor de cana",
      influenciadoraId: "c-canamax",
      condicaoDependencia: "Segue o padrão técnico da Canamax — só troca de fornecedor depois da homologação na usina.",
      origem: "Indicação de cliente", potencial: "Médio", potencialMensal: 9000, colhedoras: 5,
      modelos: "5 John Deere CH570", prensa: "Não possui", marcaAtual: "Manuli", urgencia: "Baixa",
      createdAt: R(-60), updatedAt: R(-8),
    }),
    base({
      id: "c-rodrigues", codigo: "TW-0126", nome: "CTT Rodrigues & Filhos",
      razaoSocial: "Rodrigues & Filhos Serviços Agrícolas Ltda.", cnpj: "22.640.118/0001-77",
      ownerId: "u-fernando", regiao: "Norte Paulista", cidade: "Severínia", uf: "SP", ramo: "Prestador de serviço (CTT)",
      influenciadoraId: "c-canamax",
      condicaoDependencia: "Presta serviço de corte para a Canamax e usa a especificação técnica da usina.",
      origem: "Visita de prospecção", potencial: "Médio", potencialMensal: 14000, colhedoras: 9, modelos: "9 Case A8800",
      prensa: "Própria", marcaAtual: "Diversas / sem padrão", urgencia: "Média", createdAt: R(-75), updatedAt: R(-9),
    }),
    base({
      id: "c-santaclara", codigo: "TW-0142", nome: "Usina Santa Clara do Oeste",
      razaoSocial: "Santa Clara do Oeste Bioenergia Ltda.",
      ownerId: "u-fernando", regiao: "Oeste Paulista", cidade: "Martinópolis", uf: "SP", ramo: "Usina sucroenergética",
      origem: "Indicação de cliente", urgencia: "Média",
      observacoes: "Indicação do Wellington (CTT Pioneira). Ainda não temos contato da manutenção.",
      createdAt: R(-6),
    }),
    base({
      id: "c-boasafra", codigo: "TW-0088", nome: "Agropecuária Boa Safra", razaoSocial: "Boa Safra Agropecuária Ltda.",
      ownerId: "u-paulo", regiao: "Paranapanema", cidade: "Assis", uf: "SP", ramo: "Fornecedor de cana",
      origem: "Importado do Moskit", importadoDe: "Moskit", urgencia: "Baixa", createdAt: R(-210), updatedAt: R(-41),
    }),
    base({
      id: "c-novaalianca", codigo: "TW-0109", nome: "Usina Nova Aliança Bioenergia",
      razaoSocial: "Nova Aliança Bioenergia S.A.", cnpj: "17.332.901/0001-15",
      ownerId: "u-nilton", regiao: "Mato Grosso do Sul", cidade: "Rio Brilhante", uf: "MS", ramo: "Usina sucroenergética",
      origem: "Feira / evento", potencial: "Alto", potencialMensal: 52000, colhedoras: 30, modelos: "30 Case A9000",
      prensa: "Comodato concorrente", marcaAtual: "Gates", concorrente: "Gates (revenda de Campo Grande)",
      urgencia: "Alta", createdAt: R(-48), updatedAt: R(-17),
    }),
    base({
      id: "c-saojeronimo", codigo: "TW-0114", nome: "Usina São Jerônimo do Paranapanema",
      razaoSocial: "São Jerônimo Açúcar e Álcool Ltda.", cnpj: "05.118.664/0001-83",
      ownerId: "u-paulo", regiao: "Paranapanema", cidade: "Cândido Mota", uf: "SP", ramo: "Usina sucroenergética",
      origem: "Visita de prospecção", potencial: "Médio", potencialMensal: 21000, colhedoras: 16,
      modelos: "16 John Deere CH570", prensa: "Própria", marcaAtual: "Continental", urgencia: "Média",
      createdAt: R(-70), updatedAt: R(-13),
    }),
    base({
      id: "c-cerrado", codigo: "TW-0121", nome: "Bioenergia Cerrado Mineiro",
      razaoSocial: "Cerrado Mineiro Bioenergia S.A.", cnpj: "19.447.035/0001-26",
      ownerId: "u-fernando", regiao: "Triângulo Mineiro", cidade: "Frutal", uf: "MG", ramo: "Usina sucroenergética",
      origem: "Indicação de cliente", potencial: "Alto", potencialMensal: 41000, colhedoras: 26,
      modelos: "18 John Deere CH570 e 8 CH950", prensa: "Própria", marcaAtual: "Parker", concorrente: "Parker",
      urgencia: "Média", createdAt: R(-88), updatedAt: R(-5),
    }),
    base({
      id: "c-pontal", codigo: "TW-0103", nome: "Usina Pontal Açúcar e Etanol",
      razaoSocial: "Pontal Açúcar e Etanol S.A.", cnpj: "10.285.770/0001-61",
      ownerId: "u-nilton", regiao: "Goiás", cidade: "Quirinópolis", uf: "GO", ramo: "Usina sucroenergética",
      origem: "Visita de prospecção", potencial: "Alto", potencialMensal: 46000, colhedoras: 28,
      modelos: "28 John Deere CH570", prensa: "Comodato concorrente", marcaAtual: "Parker",
      concorrente: "Parker — contrato vigente até 31/10", urgencia: "Alta", createdAt: R(-150), updatedAt: R(-6),
    }),
    base({
      id: "c-ourobranco", codigo: "TW-0124", nome: "Agrícola Ouro Branco",
      razaoSocial: "Ouro Branco Agrícola e Pecuária Ltda.", cnpj: "27.508.442/0001-90",
      ownerId: "u-douglas", regiao: "Noroeste Paulista", cidade: "Catanduva", uf: "SP", ramo: "Fornecedor de cana",
      origem: "Indicação de cliente", potencial: "Médio", potencialMensal: 16000, colhedoras: 8,
      modelos: "8 John Deere CH570", prensa: "Não possui", marcaAtual: "Gates", urgencia: "Média",
      createdAt: R(-58), updatedAt: R(-6),
    }),
    base({
      id: "c-colina", codigo: "TW-0092", nome: "Usina Colina Verde", razaoSocial: "Colina Verde Bioenergia S.A.",
      cnpj: "03.990.512/0001-38", ownerId: "u-murilo", regiao: "Norte Paulista", cidade: "Bebedouro", uf: "SP",
      ramo: "Usina sucroenergética", origem: "Indicação de cliente", potencial: "Alto", potencialMensal: 62000,
      colhedoras: 34, modelos: "20 Case A9000 e 14 John Deere CH950", prensa: "Comodato concorrente",
      marcaAtual: "Manuli", concorrente: "Manuli", urgencia: "Alta", createdAt: R(-160), updatedAt: R(-3),
    }),
    base({
      id: "c-rioclaro", codigo: "TW-0099", nome: "Usina Rio Claro do Norte",
      razaoSocial: "Rio Claro do Norte Açúcar e Energia Ltda.", cnpj: "14.673.208/0001-02",
      ownerId: "u-paulo", regiao: "Paranapanema", cidade: "Paraguaçu Paulista", uf: "SP", ramo: "Usina sucroenergética",
      origem: "Feira / evento", potencial: "Alto", potencialMensal: 35000, colhedoras: 20, modelos: "20 Case A8800",
      prensa: "Própria", marcaAtual: "Parker", concorrente: "Parker", urgencia: "Alta",
      createdAt: R(-130), updatedAt: R(-19),
    }),
    base({
      id: "c-montealegre", codigo: "TW-0112", nome: "Destilaria Monte Alegre", razaoSocial: "Destilaria Monte Alegre Ltda.",
      status: "espera", ownerId: "u-nilton", regiao: "Goiás", cidade: "Jataí", uf: "GO", ramo: "Destilaria",
      origem: "Visita de prospecção", potencial: "Médio", potencialMensal: 12000, colhedoras: 7, modelos: "7 Case A8800",
      prensa: "Não possui", marcaAtual: "Diversas / sem padrão", urgencia: "Baixa", createdAt: R(-100), updatedAt: R(-18),
      standby: {
        motivo: "Orçamento anual ainda não liberado",
        inicio: R(-18),
        reavaliacao: R(12),
        responsavelId: "u-nilton",
        condicao: "Liberação do orçamento de manutenção 2027 (previsto para novembro).",
      },
    }),
    base({
      id: "c-boavista", codigo: "TW-0115", nome: "Usina Boa Vista Bioenergia", razaoSocial: "Boa Vista Bioenergia S.A.",
      cnpj: "09.214.887/0001-44", ownerId: "u-douglas", regiao: "Noroeste Paulista", cidade: "Votuporanga", uf: "SP",
      ramo: "Usina sucroenergética", origem: "Indicação de cliente", potencial: "Alto", potencialMensal: 29000,
      colhedoras: 18, modelos: "18 John Deere CH570", prensa: "Comodato Tawper", marcaAtual: "Tawper",
      urgencia: "Média", createdAt: R(-120), updatedAt: R(-5), clienteDesde: R(-5),
    }),
    base({
      id: "c-pioneira", codigo: "TW-0107", nome: "CTT Pioneira Agro", razaoSocial: "Pioneira Agro Serviços Ltda.",
      cnpj: "28.110.356/0001-09", ownerId: "u-fernando", regiao: "Triângulo Mineiro", cidade: "Iturama", uf: "MG",
      ramo: "Prestador de serviço (CTT)", origem: "Visita de prospecção", potencial: "Médio", potencialMensal: 11000,
      colhedoras: 7, modelos: "7 John Deere CH570", prensa: "Comodato Tawper", marcaAtual: "Tawper",
      urgencia: "Alta", createdAt: R(-110), updatedAt: R(-1), clienteDesde: R(-25),
    }),
    base({
      id: "c-belavista", codigo: "TW-0041", nome: "Usina Bela Vista do Turvo",
      razaoSocial: "Bela Vista do Turvo Açúcar e Álcool S.A.", cnpj: "02.771.905/0001-18",
      ownerId: "u-murilo", regiao: "Noroeste Paulista", cidade: "Monte Aprazível", uf: "SP", ramo: "Usina sucroenergética",
      origem: "Indicação de cliente", potencial: "Alto", potencialMensal: 58000, colhedoras: 32,
      modelos: "20 John Deere CH570 e 12 CH950", prensa: "Comodato Tawper", marcaAtual: "Tawper",
      urgencia: "Média", createdAt: R(-900), updatedAt: R(-10), clienteDesde: R(-880),
    }),
    base({
      id: "c-planalto", codigo: "TW-0076", nome: "Agroindustrial Planalto", razaoSocial: "Planalto Agroindustrial Ltda.",
      cnpj: "11.508.623/0001-57", ownerId: "u-nilton", regiao: "Mato Grosso do Sul", cidade: "Nova Andradina", uf: "MS",
      ramo: "Usina sucroenergética", origem: "Feira / evento", potencial: "Médio", potencialMensal: 24000,
      colhedoras: 15, modelos: "15 Case A8800", prensa: "Comodato Tawper", marcaAtual: "Tawper", urgencia: "Média",
      createdAt: R(-400), updatedAt: R(-30), clienteDesde: R(-380),
    }),
    base({
      id: "c-esperanca", codigo: "TW-0083", nome: "Usina Esperança Paulista",
      razaoSocial: "Esperança Paulista Bioenergia Ltda.", cnpj: "07.339.180/0001-72",
      ownerId: "u-paulo", regiao: "Paranapanema", cidade: "Ourinhos", uf: "SP", ramo: "Usina sucroenergética",
      origem: "Indicação de cliente", potencial: "Médio", potencialMensal: 19000, colhedoras: 12,
      modelos: "12 John Deere CH570", prensa: "Comodato Tawper", marcaAtual: "Tawper", urgencia: "Alta",
      createdAt: R(-320), updatedAt: R(-2), clienteDesde: R(-300),
    }),
    base({
      id: "c-tropical", codigo: "TW-0069", nome: "Grupo Agrícola Tropical",
      razaoSocial: "Tropical Agrícola Participações Ltda.", cnpj: "04.662.915/0001-33",
      ownerId: "u-fernando", regiao: "Triângulo Mineiro", cidade: "Uberaba", uf: "MG", ramo: "Grupo sucroenergético",
      origem: "Visita de prospecção", potencial: "Alto", potencialMensal: 36000, colhedoras: 24,
      modelos: "24 Case A8800", prensa: "Comodato Tawper", marcaAtual: "Tawper", concorrente: "Eaton (ofertou prensa nova)",
      urgencia: "Alta", createdAt: R(-540), updatedAt: R(-35), clienteDesde: R(-520),
    }),
    base({
      id: "c-valedosol-old", codigo: "TW-0058", nome: "Vale do Sol Agropecuária",
      razaoSocial: "Vale do Sol Agropecuária (cadastro Moskit)", ownerId: "u-paulo", cidade: "Pereira Barreto", uf: "SP",
      origem: "Importado do Moskit", importadoDe: "Moskit", urgencia: "Baixa", createdAt: R(-430), updatedAt: R(-430),
      observacoes: "Cadastro antigo do Moskit, sem contato válido.",
    }),
    base({
      id: "c-primavera", codigo: "TW-0095", nome: "Usina Primavera do Sul", razaoSocial: "Primavera do Sul Bioenergia Ltda.",
      status: "perdida", ownerId: "u-paulo", regiao: "Oeste Paulista", cidade: "Presidente Venceslau", uf: "SP",
      ramo: "Usina sucroenergética", origem: "Feira / evento", potencial: "Médio", potencialMensal: 18000, colhedoras: 11,
      prensa: "Comodato concorrente", marcaAtual: "Manuli", concorrente: "Manuli", urgencia: "Baixa",
      createdAt: R(-120), updatedAt: R(-21), motivoPerda: "Perdeu para concorrente",
    }),
    base({
      id: "c-horizonte", codigo: "TW-0101", nome: "CTT Horizonte Serviços Agrícolas",
      razaoSocial: "Horizonte Serviços Agrícolas Ltda.", status: "perdida", ownerId: "u-nilton",
      regiao: "Mato Grosso do Sul", cidade: "Naviraí", uf: "MS", ramo: "Prestador de serviço (CTT)", origem: "WhatsApp",
      potencial: "Baixo", colhedoras: 4, prensa: "Não possui", marcaAtual: "Diversas / sem padrão", urgencia: "Baixa",
      createdAt: R(-90), updatedAt: R(-47), motivoPerda: "Sem aderência / sem demanda",
    }),
  ];

  // ---------------------------------------------------------------------------
  // Contatos
  // ---------------------------------------------------------------------------
  const ct = (
    id: string, companyId: string, nome: string, cargo: string, papel: Contact["papel"], influencia: 1 | 2 | 3,
    whatsapp?: string, email?: string, canal: Contact["canal"] = "WhatsApp",
  ): Contact => ({ id, companyId, nome, cargo, papel, influencia, whatsapp: whatsapp ? normalizeWhatsApp(whatsapp) : undefined, email, canal, autorizaContato: true, ativo: true });

  const contacts: Contact[] = [
    ct("ct-alv-joao", "c-alvorada", "João Batista", "Supervisor de manutenção agrícola", "Técnico", 3, "(17) 99614-2230"),
    ct("ct-alv-carla", "c-alvorada", "Carla Mendes", "Compradora — Suprimentos", "Comprador", 2, "(17) 99180-4471", "carla.mendes@alvoradatiete.com.br", "E-mail"),
    ct("ct-alv-ricardo", "c-alvorada", "Ricardo Salles", "Gerente agrícola", "Decisor", 3, "(17) 99722-0915"),
    ct("ct-can-eduardo", "c-canamax", "Eduardo Tavares", "Gerente corporativo de manutenção", "Decisor", 3, "(17) 99845-3302"),
    ct("ct-can-fabiana", "c-canamax", "Fabiana Rocha", "Compradora corporativa", "Comprador", 2, "(17) 99230-6618", "fabiana.rocha@canamax.com.br", "E-mail"),
    ct("ct-can-luis", "c-canamax", "Luís Henrique", "Coordenador de oficina — Unidade Olímpia", "Técnico", 2, "(17) 99617-7740"),
    ct("ct-vv-antonio", "c-valeverde", "Antônio Carlos Vieira", "Proprietário", "Decisor", 3, "(17) 99108-2254"),
    ct("ct-rod-gilberto", "c-rodrigues", "Gilberto Rodrigues", "Sócio-diretor", "Decisor", 3, "(17) 99311-8820"),
    ct("ct-rod-wesley", "c-rodrigues", "Wesley Prado", "Encarregado de oficina", "Mecânico", 2, "(17) 99412-0036"),
    ct("ct-sc-recepcao", "c-santaclara", "Recepção / Portaria", "Telefone geral", "Outro", 1, "(18) 3275-1180", undefined, "Ligação"),
    ct("ct-bs-osvaldo", "c-boasafra", "Osvaldo Pereira", "Proprietário", "Decisor", 2, "(18) 99621-3390", undefined, "Ligação"),
    ct("ct-na-edson", "c-novaalianca", "Edson Morais", "Coordenador de manutenção automotiva", "Técnico", 3, "(67) 99814-2207"),
    ct("ct-na-priscila", "c-novaalianca", "Priscila Lemos", "Suprimentos", "Comprador", 2, "(67) 99260-1184", "priscila@novaalianca.com.br", "E-mail"),
    ct("ct-sj-marcelo", "c-saojeronimo", "Marcelo Pádua", "Analista de suprimentos", "Comprador", 2, "(18) 99741-5528", "marcelo.padua@saojeronimo.com.br", "E-mail"),
    ct("ct-sj-rogerio", "c-saojeronimo", "Rogério Lima", "Mecânico chefe", "Mecânico", 2, "(18) 99602-7713"),
    ct("ct-cer-helio", "c-cerrado", "Hélio Guimarães", "Gerente de manutenção", "Decisor", 3, "(34) 99155-0822"),
    ct("ct-cer-diego", "c-cerrado", "Diego Santana", "Técnico hidráulico", "Técnico", 2, "(34) 99277-4190"),
    ct("ct-pon-luciana", "c-pontal", "Luciana Prado", "Coordenadora de suprimentos", "Comprador", 3, "(64) 99318-6605", "luciana.prado@pontal.com.br"),
    ct("ct-pon-anderson", "c-pontal", "Anderson Melo", "Supervisor de oficina", "Técnico", 2, "(64) 99920-3317"),
    ct("ct-pon-celio", "c-pontal", "Célio Andrade", "Diretor industrial", "Decisor", 3, undefined, "celio.andrade@pontal.com.br", "E-mail"),
    ct("ct-ob-marcos", "c-ourobranco", "Marcos Antunes", "Comprador", "Comprador", 2, "(17) 99530-2291"),
    ct("ct-ob-silvio", "c-ourobranco", "Sílvio Ramos", "Gerente agrícola", "Decisor", 3, "(17) 99811-6604"),
    ct("ct-col-sergio", "c-colina", "Sérgio Albuquerque", "Diretor industrial", "Decisor", 3, "(17) 99703-1188"),
    ct("ct-col-renata", "c-colina", "Renata Couto", "Compras", "Comprador", 2, "(17) 99244-9031", "renata.couto@colinaverde.com.br", "E-mail"),
    ct("ct-col-jefferson", "c-colina", "Jefferson Lima", "Encarregado de manutenção", "Mecânico", 2, "(17) 99160-5572"),
    ct("ct-rc-adriana", "c-rioclaro", "Adriana Faria", "Compradora", "Comprador", 2, "(18) 99377-4012"),
    ct("ct-rc-vagner", "c-rioclaro", "Vagner Silva", "Supervisor de manutenção", "Técnico", 3, "(18) 99615-8840"),
    ct("ct-ma-joaquim", "c-montealegre", "Joaquim Pires", "Gerente geral", "Decisor", 3, "(64) 99612-0098"),
    ct("ct-bv-tiago", "c-boavista", "Tiago Moreira", "Mecânico chefe", "Mecânico", 3, "(17) 99280-4416"),
    ct("ct-bv-patricia", "c-boavista", "Patrícia Gomes", "Compradora", "Comprador", 2, "(17) 99551-7093", "patricia@boavistabio.com.br", "E-mail"),
    ct("ct-pio-wellington", "c-pioneira", "Wellington Souza", "Sócio e encarregado de oficina", "Decisor", 3, "(34) 99412-6650"),
    ct("ct-bel-otavio", "c-belavista", "Otávio Campos", "Gerente de manutenção", "Decisor", 3, "(17) 99108-7731"),
    ct("ct-bel-simone", "c-belavista", "Simone Freitas", "Compradora", "Comprador", 3, "(17) 99342-1850", "simone.freitas@belavistaturvo.com.br"),
    ct("ct-pla-rodrigo", "c-planalto", "Rodrigo Queiroz", "Supervisor de manutenção", "Técnico", 3, "(67) 99433-2071"),
    ct("ct-pla-elaine", "c-planalto", "Elaine Duarte", "Compras", "Comprador", 2, "(67) 99118-5540", "elaine.duarte@planalto.agr.br", "E-mail"),
    ct("ct-esp-fabio", "c-esperanca", "Fábio Nunes", "Almoxarife", "Comprador", 2, "(14) 99720-3364"),
    ct("ct-trop-henrique", "c-tropical", "Henrique Bastos", "Gerente de manutenção", "Decisor", 3, "(34) 99851-2276"),
    ct("ct-pri-jose", "c-primavera", "José Roberto Lins", "Comprador", "Comprador", 2, "(18) 99402-7718"),
    ct("ct-hor-carlos", "c-horizonte", "Carlos Eduardo", "Proprietário", "Decisor", 2, "(67) 99230-4418"),
  ];

  // ---------------------------------------------------------------------------
  // Oportunidades (com histórico de etapas)
  // ---------------------------------------------------------------------------
  const mkDeal = (o: {
    id: string; companyId: string; ownerId: string; funnel: FunnelId; stageId: string; dias: number; antes?: number[];
    titulo: string; valor?: number; status?: Deal["status"]; checklist?: Record<string, boolean>; ciclo?: number;
    previsao?: number; objecao?: string; closedDaysAgo?: number; valorRealizado?: number; motivo?: string;
  }): Deal => {
    const stages = FUNNELS[o.funnel].stages;
    const idx = stageIndex(o.funnel, o.stageId);
    const entered = new Date(R(-o.dias, 10));
    const history: Deal["history"] = [];
    let cursor = entered.getTime();
    const antes = o.antes ?? [];
    for (let i = idx - 1; i >= 0; i -= 1) {
      const dur = antes[i] ?? 7;
      if (dur === 0) continue;
      const leftAt = new Date(cursor).toISOString();
      cursor -= dur * 86_400_000;
      history.unshift({ stageId: stages[i].id, enteredAt: new Date(cursor).toISOString(), leftAt, byId: o.ownerId });
    }
    const closedAt = o.closedDaysAgo !== undefined ? R(-o.closedDaysAgo, 16) : undefined;
    history.push({ stageId: o.stageId, enteredAt: entered.toISOString(), leftAt: o.status === "perdida" ? closedAt : undefined, byId: o.ownerId });
    const stageDef = stages[idx];
    return {
      id: o.id,
      companyId: o.companyId,
      ownerId: o.ownerId,
      funnel: o.funnel,
      stageId: o.stageId,
      titulo: o.titulo,
      valor: o.valor,
      probabilidade: stageDef?.probabilidade,
      previsaoFechamento: o.previsao !== undefined ? R(o.previsao) : undefined,
      status: o.status ?? "aberta",
      motivo: o.motivo,
      createdAt: history[0].enteredAt,
      stageEnteredAt: entered.toISOString(),
      closedAt,
      valorRealizado: o.valorRealizado,
      checklist: o.checklist ?? {},
      history,
      ciclo: o.ciclo ?? 1,
      objecao: o.objecao,
    };
  };

  const ALL_ACQ_CHECKS = {
    apresentacao_realizada: true, interesse_tecnico: true, documentacao_enviada: true, cadastro_aprovado: true,
    medidas: true, teste_instalado: true, aprovacao_tecnica: true, solicitacao_orcamento: true,
  };

  const deals: Deal[] = [
    mkDeal({ id: "d-alvorada", companyId: "c-alvorada", ownerId: "u-douglas", funnel: "aquisicao", stageId: "homologacao", dias: 12, antes: [9, 16, 14, 11], titulo: "Kit corte de base — frente 2", valor: 64000, previsao: 35,
      checklist: { apresentacao_realizada: true, interesse_tecnico: true, documentacao_enviada: true, cadastro_aprovado: true } }),
    mkDeal({ id: "d-canamax", companyId: "c-canamax", ownerId: "u-murilo", funnel: "aquisicao", stageId: "apresentacao", dias: 19, antes: [20, 38], titulo: "Piloto Unidade Olímpia + contrato corporativo", valor: 420000, previsao: 120,
      checklist: { apresentacao_realizada: true } }),
    mkDeal({ id: "d-valeverde", companyId: "c-valeverde", ownerId: "u-douglas", funnel: "aquisicao", stageId: "qualificacao", dias: 34, antes: [26], titulo: "Reposição de mangueiras — 5 CH570", valor: 18000 }),
    mkDeal({ id: "d-rodrigues", companyId: "c-rodrigues", ownerId: "u-fernando", funnel: "aquisicao", stageId: "cadastro", dias: 9, antes: [12, 24, 30], titulo: "Padronização da frota A8800", valor: 36000,
      checklist: { apresentacao_realizada: true, interesse_tecnico: true } }),
    mkDeal({ id: "d-santaclara", companyId: "c-santaclara", ownerId: "u-fernando", funnel: "aquisicao", stageId: "lead", dias: 6, titulo: "Prospecção — Santa Clara do Oeste" }),
    mkDeal({ id: "d-boasafra", companyId: "c-boasafra", ownerId: "u-paulo", funnel: "aquisicao", stageId: "lead", dias: 41, titulo: "Boa Safra — mangueiras (Moskit)" }),
    mkDeal({ id: "d-novaalianca", companyId: "c-novaalianca", ownerId: "u-nilton", funnel: "aquisicao", stageId: "qualificacao", dias: 17, antes: [31], titulo: "Frota A9000 — consumo mensal", valor: 90000 }),
    mkDeal({ id: "d-saojeronimo", companyId: "c-saojeronimo", ownerId: "u-paulo", funnel: "aquisicao", stageId: "cadastro", dias: 13, antes: [10, 21, 26], titulo: "Kit CH570 — 16 colhedoras", valor: 52000,
      checklist: { apresentacao_realizada: true, interesse_tecnico: true, documentacao_enviada: true } }),
    mkDeal({ id: "d-cerrado", companyId: "c-cerrado", ownerId: "u-fernando", funnel: "aquisicao", stageId: "homologacao", dias: 18, antes: [8, 19, 22, 21], titulo: "Teste CH570 — frentes 1 e 3", valor: 71000, previsao: 40,
      checklist: { apresentacao_realizada: true, interesse_tecnico: true, documentacao_enviada: true, cadastro_aprovado: true, medidas: true, teste_instalado: true } }),
    mkDeal({ id: "d-pontal", companyId: "c-pontal", ownerId: "u-nilton", funnel: "aquisicao", stageId: "aprovado", dias: 24, antes: [11, 18, 20, 16, 61], titulo: "Kit CH570 — 28 colhedoras", valor: 118000, previsao: 55,
      checklist: { ...ALL_ACQ_CHECKS, solicitacao_orcamento: false } }),
    mkDeal({ id: "d-ourobranco", companyId: "c-ourobranco", ownerId: "u-douglas", funnel: "aquisicao", stageId: "orcamento", dias: 6, antes: [5, 9, 7, 0, 22, 9], titulo: "Kit CH570 + mangueiras 4SH", previsao: 10,
      checklist: { ...ALL_ACQ_CHECKS } }),
    mkDeal({ id: "d-colina", companyId: "c-colina", ownerId: "u-murilo", funnel: "aquisicao", stageId: "negociacao", dias: 8, antes: [10, 21, 18, 12, 50, 19, 7], titulo: "Frota A9000 + CH950 — contrato safra", previsao: 12,
      objecao: "Preço 8% acima da Manuli; pedem pagamento 28/56 dias.", checklist: { ...ALL_ACQ_CHECKS } }),
    mkDeal({ id: "d-rioclaro", companyId: "c-rioclaro", ownerId: "u-paulo", funnel: "aquisicao", stageId: "negociacao", dias: 27, antes: [9, 14, 12, 10, 38, 15, 6], titulo: "Kit corte de base A8800", previsao: -5,
      objecao: "Compradora pediu prazo para comparar com a Parker.", checklist: { ...ALL_ACQ_CHECKS } }),
    mkDeal({ id: "d-montealegre", companyId: "c-montealegre", ownerId: "u-nilton", funnel: "aquisicao", stageId: "apresentacao", dias: 40, antes: [14, 26], titulo: "Frota A8800 — padronização", valor: 24000,
      checklist: { apresentacao_realizada: true } }),
    mkDeal({ id: "d-valedosol-old", companyId: "c-valedosol-old", ownerId: "u-paulo", funnel: "aquisicao", stageId: "lead", dias: 430, titulo: "Vale do Sol — contato de feira (Moskit)" }),
    // Perdidas
    mkDeal({ id: "d-primavera", companyId: "c-primavera", ownerId: "u-paulo", funnel: "aquisicao", stageId: "negociacao", dias: 33, antes: [8, 15, 12, 10, 30, 12, 9], titulo: "Kit corte de base — 11 colhedoras", valor: 41000,
      status: "perdida", closedDaysAgo: 21, motivo: "Perdeu para concorrente — Manuli ofereceu prensa nova em comodato", checklist: { ...ALL_ACQ_CHECKS } }),
    mkDeal({ id: "d-horizonte", companyId: "c-horizonte", ownerId: "u-nilton", funnel: "aquisicao", stageId: "qualificacao", dias: 60, antes: [13], titulo: "CTT Horizonte — reposição", valor: 8000,
      status: "perdida", closedDaysAgo: 47, motivo: "Sem aderência / sem demanda — terceiriza a manutenção hidráulica" }),
    // Primeiras vendas (fechadas) e ciclos de recorrência
    mkDeal({ id: "d-boavista-acq", companyId: "c-boavista", ownerId: "u-douglas", funnel: "aquisicao", stageId: "ganho", dias: 5, antes: [7, 15, 12, 9, 38, 11, 8, 6], titulo: "Primeira venda — kit CH570", status: "ganha", closedDaysAgo: 5, checklist: { ...ALL_ACQ_CHECKS } }),
    mkDeal({ id: "d-boavista-r1", companyId: "c-boavista", ownerId: "u-douglas", funnel: "recorrencia", stageId: "posvenda", dias: 5, titulo: "Recorrência — ciclo 1", ciclo: 1 }),
    mkDeal({ id: "d-pioneira-acq", companyId: "c-pioneira", ownerId: "u-fernando", funnel: "aquisicao", stageId: "ganho", dias: 25, antes: [6, 12, 9, 0, 26, 8, 6, 5], titulo: "Primeira venda — kit CH570 + prensa", status: "ganha", closedDaysAgo: 25, checklist: { ...ALL_ACQ_CHECKS } }),
    mkDeal({ id: "d-pioneira-r1", companyId: "c-pioneira", ownerId: "u-fernando", funnel: "recorrencia", stageId: "suporte", dias: 3, antes: [22], titulo: "Recorrência — ciclo 1", ciclo: 1 }),
    mkDeal({ id: "d-belavista-r8", companyId: "c-belavista", ownerId: "u-murilo", funnel: "recorrencia", stageId: "recompra", dias: 18, antes: [9, 0, 21, 16, 5], titulo: "Recompra — reposição safra", status: "ganha", closedDaysAgo: 18, ciclo: 8,
      checklist: { entrega_confirmada: true, feedback: true, demanda_mapeada: true, demanda_confirmada: true } }),
    mkDeal({ id: "d-belavista-r9", companyId: "c-belavista", ownerId: "u-murilo", funnel: "recorrencia", stageId: "relacionamento", dias: 10, antes: [8, 0], titulo: "Recorrência — ciclo 9", ciclo: 9,
      checklist: { entrega_confirmada: true, feedback: true } }),
    mkDeal({ id: "d-planalto-r4", companyId: "c-planalto", ownerId: "u-nilton", funnel: "recorrencia", stageId: "recompra", dias: 64, antes: [10, 0, 30, 24, 6], titulo: "Recompra — kit A8800", status: "ganha", closedDaysAgo: 64, ciclo: 4, valorRealizado: 31200 }),
    mkDeal({ id: "d-planalto-r5", companyId: "c-planalto", ownerId: "u-nilton", funnel: "recorrencia", stageId: "previsao", dias: 30, antes: [9, 0, 25], titulo: "Reforma de entressafra — novembro", ciclo: 5, valor: 34000, previsao: 55,
      checklist: { entrega_confirmada: true, feedback: true, demanda_mapeada: true } }),
    mkDeal({ id: "d-esperanca-r3", companyId: "c-esperanca", ownerId: "u-paulo", funnel: "recorrencia", stageId: "recompra", dias: 45, antes: [8, 0, 26, 18, 4], titulo: "Recompra — reposição", status: "ganha", closedDaysAgo: 45, ciclo: 3, valorRealizado: 18600 }),
    mkDeal({ id: "d-esperanca-r4", companyId: "c-esperanca", ownerId: "u-paulo", funnel: "recorrencia", stageId: "orcamento_r", dias: 2, antes: [7, 0, 20, 16], titulo: "Reposição do almoxarifado", ciclo: 4, previsao: 8,
      checklist: { entrega_confirmada: true, feedback: true, demanda_mapeada: true, demanda_confirmada: true } }),
    mkDeal({ id: "d-tropical-r6", companyId: "c-tropical", ownerId: "u-fernando", funnel: "recorrencia", stageId: "recompra", dias: 132, antes: [9, 0, 28, 30, 7], titulo: "Recompra — kit A8800", status: "ganha", closedDaysAgo: 132, ciclo: 6, valorRealizado: 44800 }),
    mkDeal({ id: "d-tropical-r7", companyId: "c-tropical", ownerId: "u-fernando", funnel: "recorrencia", stageId: "previsao", dias: 70, antes: [12, 0, 50], titulo: "Reposição pós-safra", ciclo: 7, valor: 42000, previsao: -20,
      checklist: { entrega_confirmada: true, feedback: true, demanda_mapeada: true } }),
  ];

  // ---------------------------------------------------------------------------
  // Orçamentos
  // ---------------------------------------------------------------------------
  const it = (sku: string, qtd: number, preco?: number): QuoteItem => {
    const c = CATALOG.find((x) => x.sku === sku)!;
    return { id: `qi-${sku}-${qtd}`, sku, descricao: c.descricao, unidade: c.unidade, qtd, preco: preco ?? c.preco };
  };

  const quotes: Quote[] = [
    { id: "q-ourobranco", numero: "TW-2026-0187", companyId: "c-ourobranco", dealId: "d-ourobranco", autorId: "u-douglas",
      itens: [it("KIT-CH570-CB", 6), it("MH-4SH-34", 80), it("TP-JIC-34", 120), it("CP-ESP-34", 60), it("SV-ACAD", 1)],
      desconto: 3, condicao: "28/56 dias", validadeDias: 15, status: "enviado", createdAt: R(-6, 11), enviadoEm: R(-6, 15), decisaoEsperada: R(4) },
    { id: "q-colina", numero: "TW-2026-0179", companyId: "c-colina", dealId: "d-colina", autorId: "u-murilo",
      itens: [it("KIT-A9000-CB", 12), it("KIT-CH950-EL", 6), it("MH-4SH-1", 160), it("TP-FLG-1", 48), it("PR-CMD", 1)],
      desconto: 4, condicao: "28 dias", validadeDias: 20, status: "enviado", createdAt: R(-15, 10), enviadoEm: R(-15, 17), decisaoEsperada: R(2) },
    { id: "q-rioclaro", numero: "TW-2026-0161", companyId: "c-rioclaro", dealId: "d-rioclaro", autorId: "u-paulo",
      itens: [it("KIT-A8800-PC", 10), it("MH-R13-1", 90), it("TP-JIC-34", 80)],
      desconto: 2, condicao: "28 dias", validadeDias: 15, status: "enviado", createdAt: R(-34, 10), enviadoEm: R(-33, 16), decisaoEsperada: R(-20) },
    { id: "q-esperanca", numero: "TW-2026-0189", companyId: "c-esperanca", dealId: "d-esperanca-r4", autorId: "u-paulo",
      itens: [it("MH-R2-12", 150), it("MH-R2-34", 100), it("TP-JIC-12", 180), it("TP-JIC-34", 140), it("AD-JICBSP-34", 60)],
      desconto: 0, condicao: "28 dias", validadeDias: 10, status: "rascunho", createdAt: R(-1, 15) },
    { id: "q-boavista", numero: "TW-2026-0175", companyId: "c-boavista", dealId: "d-boavista-acq", autorId: "u-douglas",
      itens: [it("KIT-CH570-CB", 6), it("MH-4SH-34", 40), it("TP-JIC-34", 60), it("PR-CMD", 1), it("SV-ACAD", 1)],
      desconto: 5, condicao: "28/56 dias", validadeDias: 15, status: "aceito", createdAt: R(-14), enviadoEm: R(-11) },
    { id: "q-pioneira", numero: "TW-2026-0166", companyId: "c-pioneira", dealId: "d-pioneira-acq", autorId: "u-fernando",
      itens: [it("KIT-CH570-CB", 3), it("MH-R2-34", 60), it("TP-JIC-34", 40), it("PR-CMD", 1)],
      desconto: 0, condicao: "28 dias", validadeDias: 15, status: "aceito", createdAt: R(-34), enviadoEm: R(-31) },
    { id: "q-belavista", numero: "TW-2026-0181", companyId: "c-belavista", dealId: "d-belavista-r8", autorId: "u-murilo",
      itens: [it("KIT-CH570-CB", 5), it("KIT-CH950-EL", 3), it("MH-4SH-34", 120), it("TP-ORFS-34", 90)],
      desconto: 6, condicao: "30/60/90 dias", validadeDias: 15, status: "aceito", createdAt: R(-24), enviadoEm: R(-23) },
  ];

  const qTotal = (id: string) => {
    const q = quotes.find((x) => x.id === id)!;
    return Math.round(quoteTotals(q.itens, q.desconto).total);
  };
  const setDeal = (id: string, patch: Partial<Deal>) => {
    const d = deals.find((x) => x.id === id)!;
    Object.assign(d, patch);
  };
  setDeal("d-ourobranco", { valor: qTotal("q-ourobranco") });
  setDeal("d-colina", { valor: qTotal("q-colina") });
  setDeal("d-rioclaro", { valor: qTotal("q-rioclaro") });
  setDeal("d-esperanca-r4", { valor: qTotal("q-esperanca") });
  setDeal("d-boavista-acq", { valor: qTotal("q-boavista"), valorRealizado: qTotal("q-boavista") });
  setDeal("d-pioneira-acq", { valor: qTotal("q-pioneira"), valorRealizado: qTotal("q-pioneira") });
  setDeal("d-belavista-r8", { valor: qTotal("q-belavista"), valorRealizado: qTotal("q-belavista") });

  // ---------------------------------------------------------------------------
  // Próximos passos (atividades pendentes)
  // ---------------------------------------------------------------------------
  const act = (
    id: string, companyId: string, dealId: string | undefined, ownerId: string, tipo: ActivityType, titulo: string,
    dueAt: string, prioridade: Activity["prioridade"], origem: Activity["origem"] = "manual", createdAt = R(-3), descricao?: string,
  ): Activity => ({ id, companyId, dealId, ownerId, tipo, titulo, dueAt, prioridade, status: "pendente", origem, createdAt, descricao });

  const activities: Activity[] = [
    act("a-alv-1", "c-alvorada", "d-alvorada", "u-douglas", "WhatsApp", "Cobrar medidas do corte de base com João", R(0, 10), "Alta", "ia", R(-4, 16),
      "João ficou de enviar as medidas das mangueiras das colhedoras 207 e 212 até sexta."),
    act("a-can-1", "c-canamax", "d-canamax", "u-murilo", "Reunião", "Apresentação técnica para a manutenção corporativa (Unidade Olímpia)", R(5, 14), "Alta", "manual", R(-6)),
    act("a-vv-1", "c-valeverde", "d-valeverde", "u-douglas", "Ligação", "Retomar após avanço da Canamax (apresentação técnica)", R(8), "Baixa", "regra", R(-8)),
    act("a-rod-1", "c-rodrigues", "d-rodrigues", "u-fernando", "E-mail", "Enviar ficha cadastral e documentos da Tawper", R(-1, 11), "Média", "regra", R(-9)),
    act("a-sc-1", "c-santaclara", "d-santaclara", "u-fernando", "Visita", "Visita de prospecção — identificar responsável pela manutenção", R(3, 10), "Média", "manual", R(-6)),
    act("a-na-1", "c-novaalianca", "d-novaalianca", "u-nilton", "Ligação", "Ligar para Edson — mapear consumo mensal de mangueiras", R(-3, 9), "Alta", "manual", R(-10)),
    act("a-sj-1", "c-saojeronimo", "d-saojeronimo", "u-paulo", "Ligação", "Cobrar retorno do cadastro com Suprimentos (Marcelo)", R(1, 10), "Média", "manual", R(-5)),
    act("a-cer-1", "c-cerrado", "d-cerrado", "u-fernando", "Visita", "Acompanhar teste — leitura de 300 horas", R(2, 8), "Média", "regra", R(-5)),
    act("a-pon-1", "c-pontal", "d-pontal", "u-nilton", "Ligação", "Confirmar com Luciana a janela de compra pós-contrato Parker", R(4, 10), "Alta", "manual", R(-6)),
    act("a-ob-1", "c-ourobranco", "d-ourobranco", "u-douglas", "WhatsApp", "Follow-up do orçamento TW-2026-0187 com Marcos", R(1, 10), "Média", "regra", R(-6)),
    act("a-col-1", "c-colina", "d-colina", "u-murilo", "Reunião", "Reunião com Sérgio para fechar condição 28/56 dias", R(2, 15), "Alta", "ia", R(-3)),
    act("a-rc-1", "c-rioclaro", "d-rioclaro", "u-paulo", "Ligação", "Retomar contato com Adriana (orçamento vencido)", R(-6, 10), "Alta", "manual", R(-19)),
    act("a-ma-1", "c-montealegre", "d-montealegre", "u-nilton", "Ligação", "Reavaliar conta em espera — orçamento 2027", R(12), "Baixa", "regra", R(-18)),
    act("a-bv-1", "c-boavista", "d-boavista-r1", "u-douglas", "Ligação", "Pós-venda: confirmar entrega e aplicação com Tiago", R(0, 14), "Média", "regra", R(-5)),
    act("a-pio-1", "c-pioneira", "d-pioneira-r1", "u-fernando", "Suporte", "Enviar terminal JIC 3/4\" de reposição e orientar prensagem", R(-1, 9), "Alta", "manual", R(-3)),
    act("a-bel-1", "c-belavista", "d-belavista-r9", "u-murilo", "Visita", "Visita de relacionamento — mapear lista da reforma de entressafra", R(6, 9), "Média", "regra", R(-10)),
    act("a-pla-1", "c-planalto", "d-planalto-r5", "u-nilton", "Ligação", "Levantar lista de reposição para a reforma de entressafra", R(20), "Média", "regra", R(-30)),
    act("a-esp-1", "c-esperanca", "d-esperanca-r4", "u-paulo", "Cotação", "Enviar orçamento de reposição (lista do almoxarifado)", R(0, 16), "Alta", "manual", R(-2)),
    act("a-trop-1", "c-tropical", "d-tropical-r7", "u-fernando", "Ligação", "Ligar para Henrique — entender a queda nos pedidos", R(-2, 10), "Alta", "ia", R(-5)),
  ];

  // Histórico de execução (atividades concluídas) — alimenta taxa de execução e esforço por vendedor.
  let seedN = 20260910;
  const rand = () => {
    seedN = (seedN * 1664525 + 1013904223) % 4294967296;
    return seedN / 4294967296;
  };
  const onTimeRate: Record<string, number> = { "u-douglas": 0.9, "u-murilo": 0.82, "u-fernando": 0.74, "u-nilton": 0.62, "u-paulo": 0.48 };
  const POOL: { tipo: ActivityType; titulo: string; resultado: string }[] = [
    { tipo: "Ligação", titulo: "Ligação de follow-up", resultado: "Contato realizado. Cliente pediu retorno na próxima semana." },
    { tipo: "WhatsApp", titulo: "Enviar catálogo da linha 4SH", resultado: "Catálogo enviado e recebido." },
    { tipo: "Visita", titulo: "Visita técnica à oficina", resultado: "Visita realizada. Levantadas as principais falhas." },
    { tipo: "E-mail", titulo: "Enviar apresentação institucional", resultado: "Apresentação enviada." },
    { tipo: "Reunião", titulo: "Reunião com manutenção", resultado: "Reunião realizada. Interesse confirmado." },
    { tipo: "Cotação", titulo: "Revisar itens do orçamento", resultado: "Itens revisados com o comprador." },
    { tipo: "Ligação", titulo: "Confirmar recebimento de material", resultado: "Material recebido pelo cliente." },
    { tipo: "WhatsApp", titulo: "Cobrar retorno do cliente", resultado: "Cliente respondeu; aguardando decisão interna." },
  ];
  const activeForHistory = companies.filter((c) => c.status !== "perdida" && c.id !== "c-valedosol-old" && c.id !== "c-boasafra");
  activeForHistory.forEach((c, ci) => {
    const n = 2 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i += 1) {
      const p = POOL[Math.floor(rand() * POOL.length)];
      const dueDaysAgo = 2 + Math.floor(rand() * 40);
      const onTime = rand() < (onTimeRate[c.ownerId] ?? 0.7);
      const lateBy = onTime ? 0 : 1 + Math.floor(rand() * 6);
      const deal = deals.find((d) => d.companyId === c.id && d.status === "aberta") ?? deals.find((d) => d.companyId === c.id);
      activities.push({
        id: `a-h-${ci}-${i}`,
        companyId: c.id,
        dealId: deal?.id,
        ownerId: c.ownerId,
        tipo: p.tipo,
        titulo: p.titulo,
        dueAt: R(-dueDaysAgo, 10),
        prioridade: "Média",
        status: "concluida",
        origem: "manual",
        createdAt: R(-dueDaysAgo - 4, 9),
        completedAt: R(Math.min(-dueDaysAgo + lateBy, -1), 15),
        resultado: p.resultado,
      });
    }
  });
  // Uma atividade concluída recente e relevante para a Alvorada (origem do registro conversacional).
  activities.push({
    id: "a-alv-h1", companyId: "c-alvorada", dealId: "d-alvorada", ownerId: "u-douglas", tipo: "Visita",
    titulo: "Visita técnica na frente 2 com João", dueAt: R(-4, 14), prioridade: "Alta", status: "concluida",
    origem: "manual", createdAt: R(-6), completedAt: R(-4, 16, 20), resultado: "Falei com João. Ele enviará as medidas até sexta. Cobrar na segunda se não enviar.",
    nextActivityId: "a-alv-1",
  });

  // ---------------------------------------------------------------------------
  // Linha do tempo (interações)
  // ---------------------------------------------------------------------------
  let ix = 0;
  const I = (companyId: string, at: string, canal: Interaction["canal"], autorId: string, titulo: string, conteudo?: string, kind: Interaction["kind"] = "note", dealId?: string): Interaction => {
    ix += 1;
    return { id: `i-${ix}`, companyId, at, canal, autorId, titulo, conteudo, kind, dealId };
  };

  const interactions: Interaction[] = [
    // Alvorada
    I("c-alvorada", R(-96, 8), "Sistema", "sistema", "Conta importada da planilha de acompanhamento", "Observação 16/06: \"usa Parker com prensa em comodato; reclama de prazo de entrega\".", "import"),
    I("c-alvorada", R(-40, 15), "Reunião", "u-douglas", "Apresentação técnica para Ricardo e João", "Apresentada a linha 4SH e o kit de corte de base. Ricardo pediu teste antes de qualquer compra.", "note"),
    I("c-alvorada", R(-13, 11), "E-mail", "u-douglas", "Cadastro aprovado por Suprimentos", "Carla confirmou a Tawper como fornecedor homologado no sistema de compras.", "note"),
    I("c-alvorada", R(-12, 10), "Sistema", "u-douglas", "Etapa alterada: Cadastro → Homologação", undefined, "stage", "d-alvorada"),
    I("c-alvorada", R(-4, 16, 22), "IA", "ia", "Registro estruturado pela IA — confirmado por Douglas",
      "Resultado: contato realizado · Pendência do cliente: envio das medidas · Próximo passo: verificar recebimento e cobrar · Responsável: Douglas · Etapa mantida: Homologação", "ai"),
    I("c-alvorada", R(-1, 18), "Nota", "u-murilo", "Comentário do gestor", "Douglas, as medidas chegaram? Quero o kit de teste rodando antes do dia 20.", "cobranca"),
    // Canamax
    I("c-canamax", R(-140, 10), "Sistema", "u-murilo", "Empresa cadastrada — contato na Fenasucro", undefined, "create"),
    I("c-canamax", R(-19, 14), "Reunião", "u-murilo", "Apresentação institucional para Eduardo e Fabiana", "Boa recepção. Eduardo quer ver dados de durabilidade antes de levar para a diretoria.", "note"),
    I("c-canamax", R(-19, 15), "Sistema", "u-murilo", "Etapa alterada: Qualificação → Apresentação", undefined, "stage", "d-canamax"),
    I("c-canamax", R(-2, 9), "IA", "ia", "Conta influenciadora", "2 empresas dependem do avanço desta conta: Fornecedora de Cana Vale Verde e CTT Rodrigues & Filhos. Mudanças de etapa aqui geram alerta nas dependentes.", "ai"),
    // Vale Verde
    I("c-valeverde", R(-34, 10), "Ligação", "u-douglas", "Qualificação por telefone com Antônio Carlos", "5 CH570, sem prensa. Segue o padrão técnico da Canamax.", "note"),
    I("c-valeverde", R(-8, 7), "IA", "ia", "Cobrança automática suspensa", "Conta dependente da Canamax. O alerta de estagnação foi substituído por monitoramento da conta influenciadora.", "ai"),
    // Rodrigues
    I("c-rodrigues", R(-9, 16), "Visita", "u-fernando", "Visita à oficina com Gilberto e Wesley", "Frota A8800 sem padrão de marca. Pediram cadastro para liberar compras.", "note"),
    I("c-rodrigues", R(-9, 17), "Sistema", "u-fernando", "Etapa alterada: Apresentação → Cadastro", undefined, "stage", "d-rodrigues"),
    // Santa Clara
    I("c-santaclara", R(-6, 11), "Sistema", "u-fernando", "Empresa cadastrada por indicação do Wellington (CTT Pioneira)", undefined, "create"),
    I("c-santaclara", R(-6, 11, 2), "IA", "ia", "Dados mínimos incompletos", "Faltam número de colhedoras, tipo de prensa e contato técnico. Sem contato direto da manutenção, a sugestão é visita presencial.", "ai"),
    // Boa Safra
    I("c-boasafra", R(-210, 9), "Sistema", "sistema", "Importado do Moskit", "Negócio \"Boa Safra — mangueiras\" sem atividade desde 03/2025.", "import"),
    I("c-boasafra", R(-41, 10), "Ligação", "u-paulo", "Tentativa de contato", "Sem resposta.", "note"),
    // Nova Aliança
    I("c-novaalianca", R(-17, 15), "Reunião", "u-nilton", "Reunião de qualificação com Edson", "30 A9000, prensa da Gates em comodato. Consumo alto de mangueira no picador.", "note"),
    // São Jerônimo
    I("c-saojeronimo", R(-13, 10), "E-mail", "u-paulo", "Documentação cadastral enviada para Marcelo", undefined, "note"),
    // Cerrado
    I("c-cerrado", R(-18, 14), "Visita", "u-fernando", "Kit de teste instalado em 2 CH570 (frentes 1 e 3)", "Instalação acompanhada pelo Diego. Leitura inicial registrada.", "note"),
    I("c-cerrado", R(-5, 16), "WhatsApp", "u-fernando", "Diego enviou foto do teste com 180h", "Sem vazamento e sem desgaste aparente na capa.", "note"),
    // Pontal
    I("c-pontal", R(-24, 10), "E-mail", "u-nilton", "Aprovação técnica registrada", "Laudo do Anderson Melo: kit CH570 aprovado após 420h sem falha. Evidência anexada.", "note"),
    I("c-pontal", R(-24, 11), "Sistema", "u-nilton", "Etapa alterada: Homologação → Produto aprovado", undefined, "stage", "d-pontal"),
    I("c-pontal", R(-6, 15), "Ligação", "u-nilton", "Luciana confirmou contrato Parker até 31/10", "Compra só depois do fim do contrato. Pediu para retomar no início de outubro.", "note"),
    // Ouro Branco
    I("c-ourobranco", R(-6, 15), "WhatsApp", "u-douglas", "Orçamento TW-2026-0187 enviado para Marcos", undefined, "quote", "d-ourobranco"),
    I("c-ourobranco", R(-5, 9), "WhatsApp", "u-douglas", "Marcos confirmou o recebimento", "Vai passar para o Sílvio aprovar.", "note"),
    // Colina
    I("c-colina", R(-15, 17), "E-mail", "u-murilo", "Orçamento TW-2026-0179 enviado", undefined, "quote", "d-colina"),
    I("c-colina", R(-8, 10), "Reunião", "u-murilo", "Negociação com Sérgio e Renata", "Preço 8% acima da Manuli. Pedem 28/56 dias. Sérgio gostou do resultado do teste.", "note"),
    I("c-colina", R(-3, 9), "IA", "ia", "Sugestão estratégica aprovada por Murilo", "Trocar desconto por prazo: oferecer 28/56 dias mantendo o preço e incluir turma Tawper Academy.", "strategy"),
    // Rio Claro
    I("c-rioclaro", R(-33, 16), "E-mail", "u-paulo", "Orçamento TW-2026-0161 enviado para Adriana", undefined, "quote", "d-rioclaro"),
    I("c-rioclaro", R(-19, 11), "WhatsApp", "u-paulo", "Adriana pediu prazo para comparar com a Parker", undefined, "note"),
    I("c-rioclaro", R(-4, 7), "IA", "ia", "Alerta de estagnação", "Negociação parada há mais de 15 dias (limite da etapa). Orçamento vencido. Escalonado para o gestor.", "ai"),
    // Monte Alegre
    I("c-montealegre", R(-18, 10), "Sistema", "u-nilton", "Conta colocada em espera", "Motivo: orçamento anual ainda não liberado. Reavaliação agendada.", "standby"),
    // Boa Vista
    I("c-boavista", R(-11, 10), "WhatsApp", "u-douglas", "Orçamento TW-2026-0175 enviado", undefined, "quote", "d-boavista-acq"),
    I("c-boavista", R(-5, 16), "Sistema", "u-douglas", "Primeira venda registrada", "Venda ganha. Conta movida para o funil de Recorrência e pós-venda criado automaticamente.", "win", "d-boavista-acq"),
    // Pioneira
    I("c-pioneira", R(-25, 16), "Sistema", "u-fernando", "Primeira venda registrada", "Kit CH570 + prensa em comodato Tawper.", "win", "d-pioneira-acq"),
    I("c-pioneira", R(-3, 8), "WhatsApp", "u-fernando", "Chamado de suporte aberto", "Vazamento no terminal da mangueira do picador da colhedora 07.", "note"),
    // Bela Vista
    I("c-belavista", R(-18, 16), "Sistema", "u-murilo", "Recompra registrada — ciclo 8", undefined, "win", "d-belavista-r8"),
    I("c-belavista", R(-10, 10), "Ligação", "u-murilo", "Pós-venda concluído com Otávio", "Entrega ok. Pediu visita para planejar a reforma de entressafra.", "note"),
    // Planalto
    I("c-planalto", R(-30, 10), "Reunião", "u-nilton", "Previsão de compra registrada", "Reforma de entressafra em novembro: 15 colhedoras. Não cobrar antes de outubro.", "note"),
    // Esperança
    I("c-esperanca", R(-2, 15), "WhatsApp", "u-paulo", "Fábio enviou a lista do almoxarifado", "Reposição de R2 1/2\", R2 3/4\" e terminais JIC.", "note"),
    // Tropical
    I("c-tropical", R(-35, 10), "Visita", "u-fernando", "Visita de relacionamento", "Henrique comentou que a Eaton ofereceu uma prensa nova.", "note"),
    I("c-tropical", R(-5, 7), "IA", "ia", "Recorrente sem compra", "Janela prevista de recompra passou há 20 dias sem nova oportunidade. Último pedido há 132 dias.", "ai"),
    // Vale do Sol (Moskit)
    I("c-valedosol-old", R(-430, 9), "Sistema", "sistema", "Importado do Moskit", "Contato em feira (Agrishow 2025). Nenhuma atividade registrada depois disso.", "import"),
    // Perdidas
    I("c-primavera", R(-21, 16), "Sistema", "u-paulo", "Oportunidade perdida", "Motivo: perdeu para concorrente — Manuli ofereceu prensa nova em comodato.", "loss", "d-primavera"),
    I("c-horizonte", R(-47, 16), "Sistema", "u-nilton", "Oportunidade perdida", "Motivo: sem aderência — terceiriza a manutenção hidráulica.", "loss", "d-horizonte"),
  ];

  // ---------------------------------------------------------------------------
  // Estratégias
  // ---------------------------------------------------------------------------
  const st = (companyId: string, s: Omit<Strategy, "companyId" | "versao" | "origem"> & Partial<Pick<Strategy, "versao" | "origem">>): Strategy => ({
    companyId,
    versao: 1,
    origem: "manual",
    ...s,
  });

  const strategies: Strategy[] = [
    st("c-alvorada", {
      objetivo: "Homologar o kit de corte de base nas CH570 da frente 2.",
      diagnostico: "Operação grande (22 colhedoras) com dor clara de estouro no corte de base. A relação com a Parker se sustenta pela prensa em comodato.",
      barreira: "Dependência técnica da prensa em comodato do concorrente.",
      estrategia: "Teste em 2 CH570 com acompanhamento semanal; oferecer turma Tawper Academy aos mecânicos e prensa em comodato Tawper se aprovado.",
      resultadoEsperado: "Aprovação técnica em até 30 dias e primeira compra do kit para a frente 2.",
      definidoPorId: "u-murilo", revisadaEm: R(-12), proximaRevisao: R(18), versao: 2,
    }),
    st("c-canamax", {
      objetivo: "Entrar por uma unidade piloto (Olímpia) antes do contrato corporativo.",
      diagnostico: "Grupo com 118 colhedoras e contrato corporativo com a Manuli renovado todo março. Duas contas menores dependem da decisão técnica da Canamax.",
      barreira: "Contrato corporativo vigente com a Manuli.",
      estrategia: "Apresentação técnica com dados de durabilidade e proposta de teste em 5 colhedoras da Unidade Olímpia sem custo de prensa.",
      resultadoEsperado: "Homologação piloto até o fim da safra.",
      definidoPorId: "u-murilo", revisadaEm: R(-19), proximaRevisao: R(10),
    }),
    st("c-colina", {
      objetivo: "Fechar o contrato de safra da frota A9000 + CH950.",
      diagnostico: "Teste aprovado e diretor industrial favorável. Objeção concentrada em preço e prazo de pagamento.",
      barreira: "Preço 8% acima da Manuli.",
      estrategia: "Trocar desconto por prazo: 28/56 dias mantendo o preço e incluir turma Tawper Academy.",
      resultadoEsperado: "Pedido fechado nesta quinzena.",
      definidoPorId: "u-murilo", revisadaEm: R(-3), proximaRevisao: R(7), versao: 3, origem: "ia-aprovada",
    }),
    st("c-pontal", {
      objetivo: "Converter a aprovação técnica no primeiro pedido após o fim do contrato Parker.",
      diagnostico: "Produto aprovado com laudo técnico. Contrato Parker vence em 31/10.",
      barreira: "Contrato vigente com o concorrente.",
      estrategia: "Garantir que o orçamento chegue antes do vencimento do contrato, com estoque reservado para 28 kits.",
      resultadoEsperado: "Solicitação de orçamento na primeira semana de outubro.",
      definidoPorId: "u-nilton", revisadaEm: R(-6), proximaRevisao: R(14),
    }),
    st("c-rioclaro", {
      objetivo: "Fechar a primeira venda do kit de corte de base A8800.",
      diagnostico: "Orçamento enviado; compradora avaliando.",
      barreira: "Comparação de preço com a Parker.",
      estrategia: "Aguardar retorno da compradora.",
      resultadoEsperado: "Pedido em 15 dias.",
      definidoPorId: "u-paulo", revisadaEm: R(-33), proximaRevisao: R(-18),
    }),
    st("c-ourobranco", {
      objetivo: "Fechar o orçamento TW-2026-0187 antes do vencimento.",
      diagnostico: "Fornecedor de cana com 8 CH570 e sem prensa. Comprador receptivo, decisão com o gerente agrícola.",
      barreira: "Decisão depende do Sílvio (gerente agrícola).",
      estrategia: "Follow-up com Marcos e oferecer visita rápida ao Sílvio para apresentar o treinamento incluso.",
      resultadoEsperado: "Pedido até o vencimento do orçamento.",
      definidoPorId: "u-douglas", revisadaEm: R(-6), proximaRevisao: R(4),
    }),
    st("c-belavista", {
      objetivo: "Garantir 100% da reforma de entressafra com a Tawper.",
      diagnostico: "Cliente desde 2024, prensa em comodato Tawper, 8 recompras. Referência regional.",
      barreira: "Nenhuma relevante; risco de acomodação.",
      estrategia: "Visita de planejamento da reforma e proposta de estoque consignado para a safra seguinte.",
      resultadoEsperado: "Pedido da reforma fechado em outubro.",
      definidoPorId: "u-murilo", revisadaEm: R(-10), proximaRevisao: R(20),
    }),
  ];

  const strategyHistory: Strategy[] = [
    st("c-alvorada", {
      objetivo: "Apresentar a Tawper para a manutenção agrícola.",
      diagnostico: "Conta importada da planilha, sem contato técnico definido.",
      barreira: "Não conhecemos o responsável pela manutenção.",
      estrategia: "Visita presencial para mapear a oficina.",
      resultadoEsperado: "Contato técnico identificado.",
      definidoPorId: "u-douglas", revisadaEm: R(-60), proximaRevisao: R(-30),
    }),
    st("c-colina", {
      objetivo: "Fechar o contrato de safra.",
      diagnostico: "Orçamento enviado.",
      barreira: "Preço.",
      estrategia: "Dar 5% de desconto.",
      resultadoEsperado: "Pedido fechado.",
      definidoPorId: "u-murilo", revisadaEm: R(-14), proximaRevisao: R(-3), versao: 2,
    }),
  ];

  // ---------------------------------------------------------------------------
  // Sugestões da IA
  // ---------------------------------------------------------------------------
  const suggestions: AISuggestion[] = [
    {
      id: "s-rioclaro", companyId: "c-rioclaro", tipo: "estrategia", status: "pendente", createdAt: R(-1, 7),
      titulo: "Reabrir a negociação pela manutenção, não por Compras",
      texto: "A conversa ficou concentrada na compradora, que usa nosso orçamento como referência contra a Parker. O supervisor de manutenção — quem sente o problema — ainda não participou.",
      base: ["Etapa Negociação há 27 dias (limite 15)", "Orçamento TW-2026-0161 vencido", "Última interação há 19 dias", "Contatos: Adriana (Compras) e Vagner (Manutenção)", "Concorrente: Parker"],
      faltantes: ["Não há registro da diferença de preço citada pela Adriana — pergunte antes de reemitir o orçamento."],
      detalhes: {
        diagnostico: "Negociação parada há 27 dias. O orçamento TW-2026-0161 venceu sem resposta e toda a conversa ficou em Compras, que usa a Parker como referência de preço.",
        hipoteses: [
          "Compras está usando o orçamento da Tawper só para negociar com a Parker.",
          "A manutenção (Vagner), que sente o problema de estouro, não participou da decisão.",
          "Com prensa própria, o custo de troca é baixo: a barreira é de relacionamento, não técnica.",
        ],
        acoes: [
          { titulo: "Visita técnica com Vagner — histórico de falhas do corte de base", tipo: "Visita", prazoDias: 3 },
          { titulo: "Reemitir orçamento com validade de 10 dias e condição 28/56", tipo: "Cotação", prazoDias: 4 },
          { titulo: "Oferecer turma Tawper Academy para os mecânicos", tipo: "WhatsApp", prazoDias: 5 },
        ],
        perguntas: [
          "Quantas paradas por estouro de mangueira vocês tiveram nesta safra?",
          "Quem, além de Compras, participa da escolha do fornecedor?",
          "O que faria vocês testarem uma segunda marca nas A8800?",
        ],
        rascunho: "Oi Vagner, tudo bem? Aqui é o Paulo, da Tawper. Estive olhando o histórico das A8800 da Rio Claro e queria entender com você como está o corte de base nesta safra. Consigo passar aí na quinta para conversarmos 20 minutos?",
        objetivo: "Reabrir a negociação pela manutenção e obter decisão até o fim do mês.",
        barreira: "Decisão concentrada em Compras, com a Parker como referência de preço.",
        estrategia: "Envolver o supervisor de manutenção com dados de falha, reemitir o orçamento com validade curta e oferecer treinamento como diferencial.",
        resultadoEsperado: "Nova rodada de negociação com a manutenção presente em até 10 dias.",
      },
    },
    {
      id: "s-tropical", companyId: "c-tropical", tipo: "estrategia", status: "pendente", createdAt: R(-5, 7),
      titulo: "Plano de recuperação: defender a prensa em comodato",
      texto: "Cliente recorrente sem compra há 132 dias e com oferta de prensa nova da Eaton. O risco é perder a conta pela troca de equipamento, não por preço de mangueira.",
      base: ["Último pedido há 132 dias", "Janela prevista passou há 20 dias", "Nota de visita: oferta de prensa Eaton", "6 recompras anteriores"],
      faltantes: [],
      detalhes: {
        diagnostico: "Cliente fiel por 6 ciclos, agora sem compra há 132 dias. A última visita registrou oferta de prensa nova da Eaton.",
        hipoteses: [
          "A prensa em comodato Tawper está antiga e a Eaton ofereceu troca.",
          "O almoxarifado pode estar comprando mangueira avulsa de outro fornecedor.",
        ],
        acoes: [
          { titulo: "Visita com Henrique + técnico para avaliar a prensa em comodato", tipo: "Visita", prazoDias: 2 },
          { titulo: "Proposta de upgrade da prensa vinculada a volume anual", tipo: "Cotação", prazoDias: 6 },
        ],
        perguntas: ["A prensa atual está atendendo? Houve alguma falha?", "Vocês compraram mangueira de outro fornecedor nesta safra?"],
        rascunho: "Henrique, bom dia! Aqui é o Fernando, da Tawper. Queria passar aí essa semana com nosso técnico para revisar a prensa e já conversar sobre a reposição pós-safra. Quarta às 9h funciona?",
        objetivo: "Recuperar a recorrência e renovar o comodato da prensa.",
        barreira: "Oferta de prensa nova da Eaton.",
        estrategia: "Antecipar a revisão/troca da prensa em comodato atrelada a um volume anual de mangueiras.",
        resultadoEsperado: "Novo pedido em até 30 dias e comodato renovado.",
      },
    },
    {
      id: "s-colina", companyId: "c-colina", tipo: "estrategia", status: "aprovada", createdAt: R(-4, 7), decididoPorId: "u-murilo", decididoEm: R(-3, 9),
      titulo: "Trocar desconto por prazo",
      texto: "O diretor já aprovou tecnicamente; a objeção é financeira. Prazo 28/56 dias resolve o caixa do cliente sem reduzir margem.",
      base: ["Objeção registrada: preço 8% acima da Manuli", "Teste aprovado", "Diretor industrial favorável"],
      faltantes: [],
    },
  ];

  // ---------------------------------------------------------------------------
  // Conversas (WhatsApp simulado)
  // ---------------------------------------------------------------------------
  let mx = 0;
  const msg = (from: Message["from"], text: string, at: string, autorId?: string, attachment?: Message["attachment"]): Message => {
    mx += 1;
    return { id: `m-${mx}`, from, text, at, autorId, attachment };
  };

  const conversations: Conversation[] = [
    {
      id: "conv-valedosol", contatoNome: "Rafael", telefone: "(18) 99734-5120", ownerId: "u-douglas", unread: 2, lastAt: M(-11),
      persona: {
        empresa: "Usina Vale do Sol Bioenergia", cidade: "Pereira Barreto", uf: "SP", colhedoras: 14,
        modelos: "10 John Deere CH570 e 4 CH950", marca: "Gates", prensa: "Própria", mecanico: "Marcos",
        papel: "Comprador", cargo: "Comprador", indicacao: "João, da Usina Alvorada",
      },
      messages: [
        msg("cliente", "Boa tarde! Peguei o contato de vocês com o João, da Usina Alvorada.", M(-12)),
        msg("cliente", "Sou comprador da Usina Vale do Sol, aqui em Pereira Barreto. Vocês atendem mangueira hidráulica pra colhedora John Deere? Estamos com muito problema de estouro nessa safra.", M(-11)),
      ],
    },
    {
      id: "conv-alvorada", companyId: "c-alvorada", contactId: "ct-alv-joao", contatoNome: "João Batista", telefone: "(17) 99614-2230", ownerId: "u-douglas", unread: 0, lastAt: R(-4, 17, 30),
      messages: [
        msg("tawper", "Bom dia João! Amanhã passo aí na frente 2 pra gente ver as mangueiras do corte de base. Pode ser às 14h?", R(-5, 8, 12), "u-douglas"),
        msg("cliente", "Bom dia Douglas, pode vir sim. A 207 estourou de novo ontem 😤", R(-5, 8, 40)),
        msg("tawper", "Obrigado pela recepção hoje. Fico no aguardo das medidas das mangueiras da 207 e da 212 pra montar o kit de teste.", R(-4, 17, 5), "u-douglas"),
        msg("cliente", "Combinado. Vou pedir pro pessoal da oficina levantar e te mando até sexta.", R(-4, 17, 30)),
      ],
      summary: {
        assunto: "Homologação do kit de corte de base (CH570)",
        necessidade: "Reduzir os estouros de mangueira no corte de base da frente 2.",
        objecoes: ["Receio de trocar o padrão Parker (prensa em comodato)."],
        compromissosTawper: ["Montar o kit de teste para as colhedoras 207 e 212."],
        compromissosCliente: ["Enviar as medidas das mangueiras até sexta."],
        datas: ["Sexta — envio das medidas"],
        proximoPasso: "Verificar recebimento das medidas e cobrar João",
        proximoPassoTipo: "WhatsApp", proximoPassoDias: 0, confianca: 0.86, geradoEm: R(-4, 17, 31),
      },
    },
    {
      id: "conv-boavista", companyId: "c-boavista", contactId: "ct-bv-tiago", contatoNome: "Tiago Moreira", telefone: "(17) 99280-4416", ownerId: "u-douglas", unread: 1, lastAt: M(-95),
      messages: [
        msg("tawper", "Tiago, o pedido saiu hoje da Tawper. Chega amanhã cedo aí em Votuporanga.", R(-4, 16), "u-douglas"),
        msg("cliente", "Show! Obrigado Douglas.", R(-4, 16, 20)),
        msg("cliente", "Chegou tudo certinho ontem. Já montamos 3 kits e o pessoal gostou da prensagem 👍", M(-95)),
      ],
    },
    {
      id: "conv-ourobranco", companyId: "c-ourobranco", contactId: "ct-ob-marcos", contatoNome: "Marcos Antunes", telefone: "(17) 99530-2291", ownerId: "u-douglas", unread: 0, lastAt: R(-5, 9),
      messages: [
        msg("tawper", "Marcos, segue o orçamento com os 6 kits de corte de base, as mangueiras 4SH e o treinamento incluso.", R(-6, 15), "u-douglas", { nome: "Orcamento_TW-2026-0187.pdf", tipo: "pdf", detalhe: "Validade 15 dias" }),
        msg("cliente", "Recebi, vou passar pro Sílvio aprovar.", R(-5, 9)),
      ],
    },
    {
      id: "conv-colina", companyId: "c-colina", contactId: "ct-col-sergio", contatoNome: "Sérgio Albuquerque", telefone: "(17) 99703-1188", ownerId: "u-murilo", unread: 0, lastAt: R(-2, 18),
      messages: [
        msg("cliente", "Murilo, o teste foi muito bem. O problema é que a Manuli está 8% abaixo.", R(-8, 11)),
        msg("tawper", "Entendo, Sérgio. Consigo melhorar a condição de pagamento para 28/56 dias e incluir o treinamento dos mecânicos. Podemos fechar os detalhes pessoalmente?", R(-3, 10), "u-murilo"),
        msg("cliente", "Pode ser. Quinta à tarde aqui na usina.", R(-2, 18)),
      ],
    },
    {
      id: "conv-rioclaro", companyId: "c-rioclaro", contactId: "ct-rc-adriana", contatoNome: "Adriana Faria", telefone: "(18) 99377-4012", ownerId: "u-paulo", unread: 0, lastAt: R(-19, 11),
      messages: [
        msg("tawper", "Adriana, conseguiu avaliar o orçamento?", R(-20, 15), "u-paulo"),
        msg("cliente", "Ainda não, Paulo. Preciso comparar com a Parker, te retorno.", R(-19, 11)),
      ],
    },
    {
      id: "conv-pioneira", companyId: "c-pioneira", contactId: "ct-pio-wellington", contatoNome: "Wellington Souza", telefone: "(34) 99412-6650", ownerId: "u-fernando", unread: 1, lastAt: M(-240),
      messages: [
        msg("cliente", "Fernando, a mangueira do picador da 07 tá vazando no terminal. Pode ser prensagem?", R(-3, 7, 50)),
        msg("tawper", "Bom dia Wellington! Pode ser o terminal. Vou te mandar um de reposição e um vídeo de como regular a prensa.", R(-3, 8, 30), "u-fernando"),
        msg("cliente", "Beleza, fico no aguardo. A máquina tá parada.", M(-240)),
      ],
    },
    {
      id: "conv-canamax", companyId: "c-canamax", contactId: "ct-can-eduardo", contatoNome: "Eduardo Tavares", telefone: "(17) 99845-3302", ownerId: "u-murilo", unread: 0, lastAt: R(-6, 16),
      messages: [
        msg("tawper", "Eduardo, confirmando a apresentação técnica na Unidade Olímpia. Levo os dados de durabilidade da linha 4SH.", R(-6, 15), "u-murilo"),
        msg("cliente", "Confirmado. O Luís Henrique da oficina vai participar.", R(-6, 16)),
      ],
    },
    {
      id: "conv-pontal", companyId: "c-pontal", contactId: "ct-pon-luciana", contatoNome: "Luciana Prado", telefone: "(64) 99318-6605", ownerId: "u-nilton", unread: 0, lastAt: R(-6, 15, 40),
      messages: [
        msg("tawper", "Luciana, o laudo do Anderson ficou excelente. Quando podemos falar do pedido?", R(-6, 14), "u-nilton"),
        msg("cliente", "Nilton, o contrato com a Parker vai até 31/10. Me procura no começo de outubro que a gente vê.", R(-6, 15, 40)),
      ],
    },
  ];

  // ---------------------------------------------------------------------------
  // Auditoria
  // ---------------------------------------------------------------------------
  let ax = 0;
  const A = (at: string, autorId: string, origem: AuditEntry["origem"], entidade: string, entidadeId: string, companyId: string | undefined, campo: string, de?: string, para?: string): AuditEntry => {
    ax += 1;
    return { id: `au-${ax}`, at, autorId, origem, entidade, entidadeId, companyId, campo, de, para };
  };

  const audit: AuditEntry[] = [
    A(R(-1, 18), "u-murilo", "usuario", "Comentário", "c-alvorada", "c-alvorada", "cobrança", undefined, "Douglas, as medidas chegaram?"),
    A(R(-1, 7), "ia", "ia", "Sugestão", "s-rioclaro", "c-rioclaro", "estratégia sugerida", undefined, "Reabrir a negociação pela manutenção"),
    A(R(-1, 8), "sistema", "automacao", "Oportunidade", "d-rioclaro", "c-rioclaro", "escalonamento", "Paulo", "Murilo (gestor)"),
    A(R(-2, 15), "u-paulo", "usuario", "Orçamento", "q-esperanca", "c-esperanca", "status", undefined, "rascunho"),
    A(R(-3, 9), "u-murilo", "usuario", "Estratégia", "c-colina", "c-colina", "estratégia", "Dar 5% de desconto", "Trocar desconto por prazo (IA aprovada)"),
    A(R(-4, 16, 22), "u-douglas", "usuario", "Atividade", "a-alv-1", "c-alvorada", "criada", undefined, "Cobrar medidas do corte de base com João"),
    A(R(-4, 16, 21), "u-douglas", "usuario", "Atividade", "a-alv-h1", "c-alvorada", "status", "pendente", "concluída"),
    A(R(-5, 16), "u-douglas", "usuario", "Oportunidade", "d-boavista-acq", "c-boavista", "status", "aberta", "ganha"),
    A(R(-5, 16), "sistema", "automacao", "Oportunidade", "d-boavista-r1", "c-boavista", "funil", "Aquisição", "Recorrência · Pós-venda"),
    A(R(-6, 15), "u-douglas", "usuario", "Orçamento", "q-ourobranco", "c-ourobranco", "status", "rascunho", "enviado"),
    A(R(-6, 11), "u-fernando", "usuario", "Empresa", "c-santaclara", "c-santaclara", "criada", undefined, "Usina Santa Clara do Oeste"),
    A(R(-8, 10), "u-murilo", "usuario", "Empresa", "c-valeverde", "c-valeverde", "empresa influenciadora", undefined, "Grupo Canamax"),
    A(R(-9, 17), "u-fernando", "usuario", "Oportunidade", "d-rodrigues", "c-rodrigues", "etapa", "Apresentação", "Cadastro"),
    A(R(-12, 10), "u-douglas", "usuario", "Oportunidade", "d-alvorada", "c-alvorada", "etapa", "Cadastro", "Homologação"),
    A(R(-14, 9), "u-murilo", "usuario", "Empresa", "c-ourobranco", "c-ourobranco", "responsável", "Paulo", "Douglas"),
    A(R(-18, 10), "u-nilton", "usuario", "Empresa", "c-montealegre", "c-montealegre", "status", "ativa", "em espera"),
    A(R(-21, 16), "u-paulo", "usuario", "Oportunidade", "d-primavera", "c-primavera", "status", "aberta", "perdida"),
    A(R(-24, 11), "u-nilton", "usuario", "Oportunidade", "d-pontal", "c-pontal", "etapa", "Homologação", "Produto aprovado"),
    A(R(-25, 16), "u-fernando", "usuario", "Oportunidade", "d-pioneira-acq", "c-pioneira", "status", "aberta", "ganha"),
  ];

  // ---------------------------------------------------------------------------
  // Notificações
  // ---------------------------------------------------------------------------
  const notifications: Notification[] = [
    { id: "n-1", userId: "u-douglas", at: M(-11), tipo: "alerta", titulo: "Nova conversa sem vínculo", texto: "Rafael — (18) 99734-5120 escreveu no seu WhatsApp.", link: "/conversas?c=conv-valedosol", lida: false },
    { id: "n-2", userId: "u-douglas", at: R(-1, 18), tipo: "cobranca", deId: "u-murilo", titulo: "Murilo comentou em Usina Alvorada do Tietê", texto: "Douglas, as medidas chegaram? Quero o kit de teste rodando antes do dia 20.", link: "/empresas/c-alvorada", lida: false },
    { id: "n-3", userId: "u-douglas", at: R(0, 7), tipo: "ia", titulo: "Seu resumo do dia está pronto", texto: "2 atividades para hoje e 1 orçamento perto do vencimento.", link: "/meu-dia", lida: false },
    { id: "n-4", userId: "u-murilo", at: R(-1, 8), tipo: "alerta", titulo: "Escalonamento: Usina Rio Claro do Norte", texto: "Negociação parada há 27 dias. Paulo não agiu após o alerta.", link: "/empresas/c-rioclaro", lida: false },
    { id: "n-5", userId: "u-murilo", at: R(0, 7), tipo: "ia", titulo: "Revisão semanal pronta", texto: "Exceções da carteira separadas para sua revisão.", link: "/gestao", lida: false },
    { id: "n-6", userId: "u-paulo", at: R(-1, 8), tipo: "alerta", titulo: "Atividade vencida há 5 dias", texto: "Retomar contato com Adriana — Usina Rio Claro do Norte.", link: "/empresas/c-rioclaro", lida: false },
  ];

  // ---------------------------------------------------------------------------
  // Rotas
  // ---------------------------------------------------------------------------
  const routes: RoutePlan[] = [
    {
      id: "r-douglas-1", ownerId: "u-douglas", regiao: "Noroeste Paulista", data: R(2, 7), kmEstimado: 318, status: "confirmada",
      paradas: [
        { companyId: "c-alvorada", objetivo: "Coletar medidas e definir as colhedoras do teste", motivo: "Homologação com pendência do cliente" },
        { companyId: "c-ourobranco", objetivo: "Apresentar o treinamento incluso ao Sílvio", motivo: "Orçamento vence em 4 dias" },
        { companyId: "c-boavista", objetivo: "Pós-venda presencial com Tiago", motivo: "Primeira venda há 5 dias" },
      ],
    },
  ];

  return {
    version: DATA_VERSION,
    seededAt: now.toISOString(),
    users: USERS,
    companies,
    contacts,
    deals,
    strategies,
    strategyHistory,
    suggestions,
    activities,
    interactions,
    conversations,
    quotes,
    audit,
    notifications,
    routes,
    seq: { codigo: 150, quote: 190 },
  };
}
