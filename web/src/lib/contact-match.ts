import { canonicalWhatsApp, normalizeWhatsApp } from "./br-ids";
import type { Company, Contact } from "./types";

/** Chave única de um celular (com o 9º dígito), para casar número da conversa com contato cadastrado. */
export function phoneKey(value?: string | null): string {
  const digits = normalizeWhatsApp(value);
  return digits ? canonicalWhatsApp(digits) : "";
}

/** Contatos cadastrados com este WhatsApp e as empresas deles (o mesmo número pode estar em mais de uma). */
export function matchByPhone(peer: string, contacts: Contact[], companies: Company[]) {
  const key = phoneKey(peer);
  if (!key) return [];
  return contacts
    .filter((c) => c.whatsapp && phoneKey(c.whatsapp) === key)
    .map((contact) => ({ contact, company: companies.find((co) => co.id === contact.companyId) }))
    .filter((m): m is { contact: Contact; company: Company } => Boolean(m.company));
}

/** WhatsApp de um contato no formato que a conversa usa (para abrir o inbox nele). */
export function peerOf(contact?: Contact): string {
  return contact?.whatsapp ? phoneKey(contact.whatsapp) : "";
}
