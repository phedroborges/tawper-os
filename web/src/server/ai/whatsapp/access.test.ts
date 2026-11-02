import { describe, expect, it } from "vitest";
import type { User } from "@/lib/types";
import { resolveWhatsAppAgentUser } from "./access";

const users: User[] = [{
  id: "00000000-0000-4000-8000-000000000123",
  name: "Douglas Ferreira",
  short: "Douglas",
  role: "vendedor",
  title: "Vendedor",
  initials: "DF",
  color: "#123a7b",
  phone: "",
  regions: [],
}];

describe("vínculo do WhatsApp com o perfil comercial", () => {
  it("vincula vendedor por nome e mantém o papel da lista autorizada", () => {
    const result = resolveWhatsAppAgentUser({ phone: "5517981640028", name: "Douglas", role: "vendedor" }, users);
    expect(result.linked).toBe(true);
    expect(result.user.id).toBe(users[0].id);
    expect(result.user.role).toBe("vendedor");
  });

  it("permite gestor sintético sem fingir vínculo de perfil", () => {
    const result = resolveWhatsAppAgentUser({ phone: "5511999990001", name: "Pessoa Admin", role: "admin" }, users);
    expect(result.linked).toBe(false);
    expect(result.user.role).toBe("admin");
    expect(result.user.id).toContain("whatsapp-");
  });

  it("vincula pelo profileId mesmo que nome e telefone não batam", () => {
    const result = resolveWhatsAppAgentUser({ phone: "5564999430898", name: "Phedro", role: "admin", profileId: users[0].id }, users);
    expect(result.linked).toBe(true);
    expect(result.user.id).toBe(users[0].id);
    expect(result.user.role).toBe("admin");
  });

  it("profileId que não está na equipe ativa não vira vínculo", () => {
    const result = resolveWhatsAppAgentUser({ phone: "5564999430898", name: "Phedro", role: "admin", profileId: "00000000-0000-4000-8000-0000000000ff" }, users);
    expect(result.linked).toBe(false);
  });
});
