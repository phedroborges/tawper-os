import { companyBrief, findCompanies } from "../search";
import type { AgentTool } from "../types";
import { loadScope, str } from "./shared";

export const buscarCliente: AgentTool = {
  name: "buscar_cliente",
  description:
    "Procura clientes (empresas) no CRM por nome aproximado, CNPJ, telefone ou nome de contato. Devolve id, cidade, responsável, contatos, negócio aberto e próximo passo. Use SEMPRE antes de falar de um cliente específico ou de criar um novo, para não duplicar.",
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
    if (!found.length) return { data: { ok: true, encontrados: 0, aviso: "Nenhum cliente com esse nome/dado." } };
    return {
      data: {
        ok: true,
        encontrados: found.length,
        clientes: found.map(({ company, motivos }) =>
          visible.has(company.id)
            ? { ...companyBrief(company, snapshot, ownerName), encontrado_por: motivos }
            : { nome: company.nome, aviso: `Já existe, na carteira de ${ownerName(company.ownerId)}. Você não tem acesso aos detalhes.` },
        ),
      },
    };
  },
};
