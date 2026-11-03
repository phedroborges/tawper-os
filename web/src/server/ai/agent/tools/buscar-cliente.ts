import { companyBrief, findCompanies } from "../search";
import type { AgentTool } from "../types";
import { loadScope, str } from "./shared";

export const buscarCliente: AgentTool = {
  name: "buscar_cliente",
  description:
    "Encontra um cliente que já existe no CRM, por nome aproximado (nomes ditos em áudio saem errados), CNPJ, telefone ou nome de contato. Devolve o id da empresa, contatos, negócio aberto e tarefas pendentes com id. Use antes de registrar, agendar ou alterar algo de um cliente. Não use antes de cadastrar cliente novo: criar_cliente já confere duplicidade.",
  writes: false,
  parameters: {
    type: "object",
    properties: { consulta: { type: "string", description: "Nome da empresa (ou parte), CNPJ, telefone ou nome do contato." } },
    required: ["consulta"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const consulta = str(args.consulta, 120);
    if (!consulta) return { data: { ok: false, erro: "Informe o nome, CNPJ ou telefone para buscar." } };
    const { snapshot, visible, ownerName } = await loadScope(ctx.actor);
    const found = findCompanies(snapshot, consulta, 5, 0.5);
    if (!found.length) return { data: { ok: true, encontrados: 0, aviso: "Nenhum cliente com esse nome ou dado no CRM." } };
    const clientes = found.map(({ company, motivos }) =>
      visible.has(company.id)
        ? { ...companyBrief(company, snapshot, ownerName), encontrado_por: motivos }
        : {
            nome: company.nome,
            bloqueado: `É da carteira de ${ownerName(company.ownerId)}. ${ctx.actor.short} não pode registrar nem agendar nada nesse cliente: diga isso ao usuário e sugira falar com ${ownerName(company.ownerId)} ou com um gestor.`,
          },
    );
    const memo = clientes
      .filter((item): item is ReturnType<typeof companyBrief> & { encontrado_por: string[] } => "id" in item)
      .slice(0, 2)
      .map((item) => {
        const tarefas = item.tarefas_pendentes.slice(0, 3).map((task) => `tarefa_id=${task.id} "${task.titulo}" ${task.prazo}`).join("; ");
        const contatos = item.contatos.slice(0, 3).map((contact) => `${contact.nome} contato_id=${contact.id}`).join("; ");
        return `${item.nome} empresa_id=${item.id}${tarefas ? ` (pendentes: ${tarefas})` : ""}${contatos ? ` (contatos: ${contatos})` : ""}`;
      })
      .join(" | ");
    return { data: { ok: true, encontrados: found.length, clientes }, memo: memo || undefined };
  },
};
