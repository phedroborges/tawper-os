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
  it("vincula vendedor por nome e usa o papel do CRM", () => {
    const result = resolveWhatsAppAgentUser({ phone: "5517981640028", name: "Douglas", role: "gestor" }, users);
    expect(result.linked).toBe(true);
    expect(result.user.id).toBe(users[0].id);
    expect(result.user.role).toBe("vendedor");
  });

  it("sem vínculo não promove papel da allowlist como se fosse CRM", () => {
    const result = resolveWhatsAppAgentUser({ phone: "5511999990001", name: "Pessoa Admin", role: "admin" }, users);
    expect(result.linked).toBe(false);
    expect(result.user.id).toContain("whatsapp-");
  });

  it("vincula pelo profileId e ignora role da allowlist", () => {
    const result = resolveWhatsAppAgentUser({ phone: "5564999430898", name: "Phedro", role: "admin", profileId: users[0].id }, users);
    expect(result.linked).toBe(true);
    expect(result.user.id).toBe(users[0].id);
    expect(result.user.role).toBe("vendedor");
  });

  it("profileId que não está na equipe ativa não vira vínculo", () => {
    const result = resolveWhatsAppAgentUser({ phone: "5564999430898", name: "Phedro", role: "admin", profileId: "00000000-0000-4000-8000-0000000000ff" }, users);
    expect(result.linked).toBe(false);
  });
});
