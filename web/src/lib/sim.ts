"use client";

// Simulação do lado do cliente no WhatsApp: depois que o vendedor envia uma mensagem, o "cliente"
// digita e responde. Os timers vivem fora dos componentes para a resposta chegar mesmo se o
// usuário mudar de tela (e aí vira notificação).

import { clientReply, personaFor } from "./ai";
import { useStore } from "./store";
import { useUI } from "./ui-store";

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function simulateClientReply(convId: string, sellerText: string) {
  const prev = pending.get(convId);
  if (prev) clearTimeout(prev);
  const startTyping = setTimeout(() => useUI.getState().setTyping(convId, true), 700);
  const delay = 2000 + Math.min(sellerText.length * 12, 1400);
  const t = setTimeout(() => {
    clearTimeout(startTyping);
    const s = useStore.getState();
    const conv = s.conversations.find((c) => c.id === convId);
    if (!conv) return;
    const company = s.companies.find((c) => c.id === conv.companyId);
    const contact = s.contacts.find((c) => c.id === conv.contactId);
    const temOrcamentoEnviado = s.quotes.some((q) => q.companyId === conv.companyId && q.status === "enviado");
    const reply = clientReply(sellerText, personaFor(conv, company, contact), { temOrcamentoEnviado });
    s.receiveMessage(convId, reply);
    useUI.getState().setTyping(convId, false);
    pending.delete(convId);
    const ui = useUI.getState();
    if (ui.activeConversation === convId) {
      useStore.getState().markConversationRead(convId);
    } else {
      ui.toast(`Nova mensagem de ${conv.contatoNome}`, { tone: "info", sub: reply.length > 70 ? `${reply.slice(0, 68)}…` : reply });
    }
  }, delay);
  pending.set(convId, t);
}
