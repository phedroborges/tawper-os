import { afterEach, describe, expect, it } from "vitest";
import { createSessionForUser, decodeSession, encodeSession, verifyAppPassword } from "./session";

describe("sessão assinada", () => {
  afterEach(() => {
    delete process.env.TAWPER_APP_PASSWORD;
    delete process.env.TAWPER_APP_SECRET;
    delete process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE;
  });

  it("assina e lê de volta o perfil", () => {
    process.env.TAWPER_APP_SECRET = "teste-secreto-bem-longo";
    const session = createSessionForUser("u-murilo");
    const token = encodeSession(session);
    expect(decodeSession(token)?.userId).toBe("u-murilo");
    expect(decodeSession(token)?.role).toBe("admin");
  });

  it("rejeita token adulterado", () => {
    process.env.TAWPER_APP_SECRET = "teste-secreto-bem-longo";
    const token = encodeSession(createSessionForUser("u-douglas"));
    const [body] = token.split(".");
    expect(decodeSession(`${body}.assinatura-falsa`)).toBeNull();
  });

  it("valida a senha legada do aplicativo em tempo constante", () => {
    process.env.TAWPER_APP_PASSWORD = "porta-fechada";
    expect(verifyAppPassword("porta-fechada")).toBe(true);
    expect(verifyAppPassword("outra")).toBe(false);
  });
});

