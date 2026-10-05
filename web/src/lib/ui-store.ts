"use client";

// Estado de interface (não persistido): qual fluxo/modal está aberto, painéis laterais e toasts.

import { create } from "zustand";
import type { ActivityDraft } from "./store";

export type Flow =
  | { kind: "quick"; companyId?: string; text?: string }
  | { kind: "complete"; activityId: string }
  | { kind: "newActivity"; companyId: string; preset?: Partial<ActivityDraft> }
  | { kind: "move"; dealId: string; toStageId?: string; preChecks?: Record<string, boolean>; nota?: string }
  | { kind: "win"; dealId: string }
  | { kind: "lose"; dealId: string }
  | { kind: "standby"; companyId: string }
  | { kind: "quote"; dealId: string; quoteId?: string }
  | { kind: "contact"; companyId: string }
  | { kind: "editCompany"; companyId: string }
  | { kind: "cobranca"; companyId: string; texto?: string }
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
}

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
}));
