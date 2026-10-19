"use client";

// Estado de interface (não persistido): qual fluxo/modal está aberto, painéis laterais e toasts.

import { create } from "zustand";
import type { ActivityDraft } from "./store";

export type Flow =
  | { kind: "quick"; companyId?: string; text?: string }
  | { kind: "complete"; activityId: string }
  | { kind: "newActivity"; companyId: string; preset?: Partial<ActivityDraft> }
  | { kind: "move"; dealId: string; toStageId?: string; preChecks?: Record<string, boolean>; nota?: string }
  | { kind: "viewStage"; dealId: string }
  | { kind: "win"; dealId: string }
  | { kind: "lose"; dealId: string }
  | { kind: "standby"; companyId: string }
  | { kind: "quote"; dealId: string; quoteId?: string }
  | { kind: "contact"; companyId: string; preset?: { nome?: string; whatsapp?: string } }
  | { kind: "editCompany"; companyId: string }
  | { kind: "cobranca"; companyId: string; texto?: string }
  | { kind: "deleteCompany"; companyId: string }
  | { kind: "drill"; title: string; subtitle?: string; companyIds: string[] }
  | { kind: "reschedule"; activityId: string };

export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "info" | "ai" | "warn";
  sub?: string;
}

interface UIState {
  flow: Flow | null;
  open: (f: Flow) => void;
  close: () => void;
  assistantOpen: boolean;
  setAssistant: (v: boolean) => void;
  guideOpen: boolean;
  setGuide: (v: boolean) => void;
  mobileNav: boolean;
  setMobileNav: (v: boolean) => void;
  toasts: Toast[];
  toast: (text: string, opts?: { tone?: Toast["tone"]; sub?: string }) => void;
  dismiss: (id: number) => void;
  typing: Record<string, boolean>;
  setTyping: (convId: string, v: boolean) => void;
  activeConversation: string | null;
  setActiveConversation: (id: string | null) => void;
  dbHealth: { ok: boolean; label: string } | null;
  setDbHealth: (v: { ok: boolean; label: string } | null) => void;
  conversasLoading: boolean;
  beginConversasLoad: () => void;
  endConversasLoad: () => void;
  /**
   * Janelas do WhatsApp no canto da tela (como o Messenger): a lista e até 3 conversas abertas,
   * cada uma podendo ficar minimizada. A tela de trás continua usável.
   */
  dock: { list: DockState; chats: { peer: string; min: boolean }[] };
  /** Com número: abre a janela daquela conversa. Sem número: abre a lista. */
  openInbox: (peer?: string) => void;
  setDockList: (state: DockState) => void;
  toggleChatMin: (peer: string) => void;
  closeChat: (peer: string) => void;
  /** Conversas do WhatsApp com mensagem não lida para quem está usando (null = WhatsApp não ligado). */
  liveUnread: number | null;
  setLiveUnread: (n: number | null) => void;
}

export type DockState = "closed" | "open" | "min";
const MAX_DOCK_CHATS = 3;

let tid = 0;

export const useUI = create<UIState>()((set, get) => ({
  flow: null,
  open: (flow) => set({ flow }),
  close: () => set({ flow: null }),
  assistantOpen: false,
  setAssistant: (assistantOpen) => set({ assistantOpen, guideOpen: assistantOpen ? false : get().guideOpen }),
  guideOpen: false,
  setGuide: (guideOpen) => set({ guideOpen, assistantOpen: guideOpen ? false : get().assistantOpen }),
  mobileNav: false,
  setMobileNav: (mobileNav) => set({ mobileNav }),
  toasts: [],
  toast: (text, opts = {}) => {
    tid += 1;
    const id = tid;
    set({ toasts: [...get().toasts, { id, text, tone: opts.tone ?? "ok", sub: opts.sub }] });
    setTimeout(() => get().dismiss(id), 3800);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  typing: {},
  setTyping: (convId, v) => set({ typing: { ...get().typing, [convId]: v } }),
  activeConversation: null,
  setActiveConversation: (activeConversation) => set({ activeConversation }),
  dbHealth: null,
  setDbHealth: (dbHealth) => set({ dbHealth }),
  conversasLoading: false,
  beginConversasLoad: () => set({ conversasLoading: true }),
  endConversasLoad: () => set({ conversasLoading: false }),
  dock: { list: "closed", chats: [] },
  openInbox: (peer = "") => {
    const { dock } = get();
    if (!peer) return set({ dock: { ...dock, list: "open" } });
    const chats = [{ peer, min: false }, ...dock.chats.filter((c) => c.peer !== peer)].slice(0, MAX_DOCK_CHATS);
    set({ dock: { list: dock.list === "closed" ? "min" : dock.list, chats } });
  },
  setDockList: (list) => set({ dock: { ...get().dock, list } }),
  toggleChatMin: (peer) => set({ dock: { ...get().dock, chats: get().dock.chats.map((c) => (c.peer === peer ? { ...c, min: !c.min } : c)) } }),
  closeChat: (peer) => set({ dock: { ...get().dock, chats: get().dock.chats.filter((c) => c.peer !== peer) } }),
  liveUnread: null,
  setLiveUnread: (liveUnread) => set({ liveUnread }),
}));
