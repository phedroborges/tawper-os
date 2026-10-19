import { describe, expect, it } from "vitest";
import type { CopilotResult } from "@/lib/ai";
import { reconcileCopilotWithKnownContacts } from "./guards";

function suggestion(): CopilotResult {
  return {
    titulo: "Descobrir quem decide",
    texto: "Mapear o decisor antes de avançar.",
    detalhes: {
      diagnostico: "Conta em qualificação.",
      hipoteses: [],
      acoes: [{ titulo: "Identificar o decisor da compra", tipo: "Ligação", prazoDias: 2 }],
      perguntas: ["Quem aprova a compra?"],
      rascunho: "Olá!",
      objetivo: "Avançar",
      barreira: "Decisão",
      estrategia: "Contato",
      resultadoEsperado: "Reunião",
    },
    base: ["Etapa: Qualificação"],
    faltantes: ["Quem decide a compra.", "Número de colhedoras."],
  };
}

describe("reconcileCopilotWithKnownContacts", () => {
  it("usa o decisor cadastrado e remove a contradição do modelo", () => {
    const result = reconcileCopilotWithKnownContacts(suggestion(), {
      contatos: [{ nome: "Carlos Lisboa", papel: "Decisor", cargo: "Diretor" }],
    });

    expect(result.base[0]).toContain("Carlos Lisboa");
    expect(result.faltantes).toEqual(["Número de colhedoras."]);
    expect(result.detalhes.acoes[0].titulo).toContain("Carlos");
    expect(result.detalhes.perguntas[0]).toContain("Carlos");
  });

  it("preserva o resultado quando não há decisor cadastrado", () => {
    const original = suggestion();
    expect(reconcileCopilotWithKnownContacts(original, { contatos: [] })).toBe(original);
  });
});
