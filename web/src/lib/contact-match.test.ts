import { describe, expect, it } from "vitest";
import { matchByPhone, peerOf, phoneKey } from "./contact-match";
import type { Company, Contact } from "./types";

const company = (id: string, nome: string) => ({ id, nome }) as Company;
const contact = (id: string, companyId: string, whatsapp?: string) =>
  ({ id, companyId, nome: id, cargo: "", papel: "Comprador", influencia: 2, whatsapp, canal: "WhatsApp", autorizaContato: true, ativo: true }) as Contact;

describe("reconhecer o cliente pelo número da conversa", () => {
  it("trata o celular com e sem o 9º dígito como o mesmo número", () => {
    expect(phoneKey("556499430898")).toBe(phoneKey("5564999430898"));
    expect(phoneKey("(64) 99943-0898")).toBe(phoneKey("+55 64 99943-0898"));
  });

  it("acha a empresa do contato cadastrado, em qualquer formato", () => {
    const companies = [company("c1", "Usina A"), company("c2", "Usina B")];
    const contacts = [contact("k1", "c1", "+5564999430898"), contact("k2", "c2", "5511988887777"), contact("k3", "c2")];
    const found = matchByPhone("556499430898", contacts, companies);
    expect(found).toHaveLength(1);
    expect(found[0].company.nome).toBe("Usina A");
  });

  it("devolve todas as empresas quando o mesmo número está em mais de uma", () => {
    const companies = [company("c1", "Usina A"), company("c2", "Usina B")];
    const contacts = [contact("k1", "c1", "5564999430898"), contact("k2", "c2", "(64) 99943-0898")];
    expect(matchByPhone("5564999430898", contacts, companies).map((m) => m.company.id)).toEqual(["c1", "c2"]);
  });

  it("número sem cadastro ou vazio não acha ninguém", () => {
    const companies = [company("c1", "Usina A")];
    const contacts = [contact("k1", "c1", "5564999430898")];
    expect(matchByPhone("5511900000000", contacts, companies)).toEqual([]);
    expect(matchByPhone("", contacts, companies)).toEqual([]);
  });

  it("abre o inbox no número do contato, ou em nada se ele não tem WhatsApp", () => {
    expect(peerOf(contact("k1", "c1", "+55 (64) 99943-0898"))).toBe("5564999430898");
    expect(peerOf(contact("k2", "c1"))).toBe("");
  });
});
