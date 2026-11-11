import { describe, expect, it } from "vitest";
import { storedWhatsApp, storedWhatsAppAssumindoNove } from "./br-ids";

describe("storedWhatsAppAssumindoNove", () => {
  it("completa o 9 do celular antigo ditado sem ele (caso real: Alagoas)", () => {
    expect(storedWhatsAppAssumindoNove("+55 82 9111-2222")).toBe("5582991112222");
    expect(storedWhatsAppAssumindoNove("82 9333-4444")).toBe("5582993334444");
    expect(storedWhatsAppAssumindoNove("(64) 9555-6666")).toBe("5564995556666");
  });
  it("mantém o número que já vem completo, com ou sem máscara e +55", () => {
    expect(storedWhatsAppAssumindoNove("(17) 99777-8888")).toBe("5517997778888");
    expect(storedWhatsAppAssumindoNove("+55 17 99777-8888")).toBe("5517997778888");
  });
  it("não inventa: fixo, DDD inexistente e número curto continuam inválidos", () => {
    expect(storedWhatsAppAssumindoNove("17 3322-1100")).toBeUndefined();
    expect(storedWhatsAppAssumindoNove("10 9111-2222")).toBeUndefined();
    expect(storedWhatsAppAssumindoNove("9111-2222")).toBeUndefined();
    expect(storedWhatsAppAssumindoNove("")).toBeUndefined();
  });
  it("a versão estrita não muda: segue recusando o número sem o 9", () => {
    expect(storedWhatsApp("82 9111-2222")).toBeUndefined();
  });
});
