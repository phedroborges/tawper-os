import { afterEach, describe, expect, it } from "vitest";
import { findWhatsAppAgentIdentity, parseWhatsAppAgentUsers } from "./config";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});
describe("configuração do agente interno no WhatsApp", () => {
  it("normaliza telefones e papéis do piloto", () => {
    const users = parseWhatsAppAgentUsers(JSON.stringify([
      { phone: "(17) 99999-0001", name: "Aline", role: "gestor" },
      { phone: "64 99888-7766", name: "Pessoa Admin", role: "desenvolvedor" },
      { phone: "17 99777-6655", name: "Bruno", role: "vendedor e gestor" },
    ]));
    expect(users).toEqual([
      { phone: "5517999990001", name: "Aline", role: "gestor" },
      { phone: "5564998887766", name: "Pessoa Admin", role: "admin" },
      { phone: "5517997776655", name: "Bruno", role: "gestor" },
    ]);
  });

  it("nunca autoriza o próprio número do bot", () => {
    process.env.TAWPER_WHATSAPP_AGENT_BOT_NUMBER = "17 98164-0081";
    process.env.TAWPER_WHATSAPP_AGENT_USERS_JSON = JSON.stringify([
      { phone: "17 98164-0081", name: "Assistente IA", role: "gestor" },
      { phone: "17 98164-0028", name: "Douglas", role: "vendedor" },
    ]);
    expect(findWhatsAppAgentIdentity("5517981640081")).toBeNull();
    expect(findWhatsAppAgentIdentity("5517981640028")?.name).toBe("Douglas");
  });

  it("reconhece o JID brasileiro antigo sem o nono dígito", () => {
    process.env.TAWPER_WHATSAPP_AGENT_BOT_NUMBER = "17 98164-0081";
    process.env.TAWPER_WHATSAPP_AGENT_USERS_JSON = JSON.stringify([
      { phone: "64 99943-0898", name: "Phedro Borges", role: "admin" },
    ]);
    expect(findWhatsAppAgentIdentity("556499430898@s.whatsapp.net")?.name).toBe("Phedro Borges");
  });

  it("recusa lista malformada", () => {
    expect(() => parseWhatsAppAgentUsers('[{"phone":"123"}]')).toThrow(/phone, name e role/);
  });
});
