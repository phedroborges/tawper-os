import { describe, expect, it } from "vitest";
import { findUserByOperatorEmail, operatorAccounts, operatorEmailForUserId } from "./operators";

describe("operadores Auth", () => {
  it("monta e-mail pelo primeiro nome do id", () => {
    expect(operatorEmailForUserId("u-murilo")).toBe("murilo@tawper.com.br");
    expect(operatorEmailForUserId("u-phedro")).toBe("phedro@tawper.com.br");
  });

  it("lista todos os operadores cadastrados no app", () => {
    const emails = operatorAccounts().map((a) => a.email);
    expect(emails).toContain("douglas@tawper.com.br");
    expect(emails).toContain("paulo@tawper.com.br");
    expect(emails).toHaveLength(6);
  });

  it("resolve usuário pelo e-mail de login", () => {
    expect(findUserByOperatorEmail("Murilo@tawper.com.br")?.id).toBe("u-murilo");
    expect(findUserByOperatorEmail("nilton@usuarios.tawper.local")?.id).toBe("u-nilton");
  });
});
