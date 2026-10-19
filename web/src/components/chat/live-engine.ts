"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canonicalWhatsApp, formatWhatsApp, normalizeWhatsApp } from "@/lib/br-ids";
import { isManager } from "@/lib/constants";
import { useCurrentUser } from "@/lib/store";
import { normalize } from "@/lib/utils";
import {
  assignProofConversation,
  deleteProofConversation,
  deleteProofMessage,
  loadProofSnapshot,
  markProofRead,
  refreshProofQr,
  sendProofText,
  type Agent,
} from "@/server/integrations/stevo-proof/actions";
import type { MediaKind, MessageReceipt, ProofEventView } from "@/server/integrations/stevo-proof/events";

/**
 * Motor do atendimento pelo WhatsApp: carrega e atualiza as conversas, envia texto e arquivo,
 * troca o responsável e apaga. A tela Conversas e as janelas flutuantes usam este mesmo motor.
 */

export type Snapshot = Awaited<ReturnType<typeof loadProofSnapshot>>;
type LiveFeed = Pick<Snapshot, "events" | "conversations">;
type PendingOut = { id: string; peer: string; text: string; at: string };

export type LiveMessage = {
  id: string;
  at: string;
  text: string;
  out: boolean;
  author: string;
  media?: MediaKind;
  revoked?: boolean;
  revocable?: boolean;
  receipt?: MessageReceipt;
  forwarded?: boolean;
};

export type Thread = {
  peer: string;
  name: string;
  ownerId: string | null;
  ownerName: string;
  unread: number;
  messages: LiveMessage[];
};

export type InboxTab = "minhas" | "fila" | "todas";

export const MAX_FILE_BYTES = 16 * 1024 * 1024;

async function fetchLiveFeed(): Promise<LiveFeed | null> {
  try {
    const res = await fetch("/api/whatsapp/live", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LiveFeed;
  } catch {
    return null;
  }
}

function chatOf(event: ProofEventView) {
  if (event.direction !== "in" && event.direction !== "out") return null;
  const peer = event.peer ? canonicalWhatsApp(event.peer) : "";
  if (!peer || (!event.preview && !event.revoked)) return null;
  return {
    peer,
    name: event.name ?? "",
    message: {
      id: event.id,
      at: event.receivedAt,
      text: event.preview,
      out: event.direction === "out",
      author: event.authorName ?? "",
      media: event.mediaKind,
      revoked: event.revoked,
      revocable: event.revocable,
      receipt: event.receipt,
      forwarded: event.forwarded,
    } satisfies LiveMessage,
  };
}

function threadsOf(snap: Snapshot): Thread[] {
  const owners = new Map(snap.conversations.map((c) => [canonicalWhatsApp(c.peer), c]));
  const map = new Map<string, Thread>();
  for (const event of [...snap.events].reverse()) {
    const chat = chatOf(event);
    if (!chat) continue;
    const conv = owners.get(chat.peer);
    const thread = map.get(chat.peer) ?? { peer: chat.peer, name: "", ownerId: conv?.ownerId ?? null, ownerName: conv?.ownerName ?? "", unread: conv?.unread ?? 0, messages: [] };
    if (chat.name) thread.name = chat.name;
    thread.messages.push(chat.message);
    map.set(chat.peer, thread);
  }
  return [...map.values()].sort((a, b) => (b.messages.at(-1)?.at ?? "").localeCompare(a.messages.at(-1)?.at ?? ""));
}

export function sameChat(left: string, right: string) {
  return left === right || normalizeWhatsApp(left) === normalizeWhatsApp(right);
}

function alreadySaved(events: ProofEventView[], item: PendingOut) {
  const since = new Date(item.at).getTime() - 5000;
  return events.some(
    (event) => event.direction === "out" && !event.id.startsWith("local-") && sameChat(event.peer || "", item.peer) && event.preview.endsWith(item.text) && new Date(event.receivedAt).getTime() >= since,
  );
}

function withPending(next: Snapshot, pending: PendingOut[], author: string): Snapshot {
  const missing = pending.filter((item) => !alreadySaved(next.events, item));
  if (!missing.length) return next;
  const extras: ProofEventView[] = missing.map((item) => ({
    id: item.id,
    receivedAt: item.at,
    event: "SendMessage",
    from: item.peer,
    preview: item.text,
    accepted: true,
    direction: "out",
    peer: item.peer,
    name: "",
    authorName: author,
    receipt: "pending",
  }));
  return { ...next, events: [...extras, ...next.events] };
}

export function labelOf(name: string, peer: string) {
  return name.trim() || formatWhatsApp(peer) || peer;
}

export function initialOf(name: string, peer: string) {
  const clean = name.trim();
  if (clean && /[A-Za-zÀ-ÿ]/.test(clean[0] ?? "")) return clean[0].toUpperCase();
  return peer.replace(/\D/g, "").slice(-2) || "?";
}

/** Lista de conversas que o atendente pode ver, com as contagens por aba e o filtro aplicado. */
export function filterThreads(threads: Thread[], opts: { tab: InboxTab; query: string; agentId: string; manager: boolean }) {
  const allowed = threads.filter((t) => opts.manager || !t.ownerId || t.ownerId === opts.agentId);
  const counts = {
    minhas: allowed.filter((t) => t.ownerId === opts.agentId).length,
    fila: allowed.filter((t) => !t.ownerId).length,
    todas: allowed.length,
  };
  const q = normalize(opts.query);
  const visible = allowed.filter((t) => {
    if (opts.tab === "minhas" && t.ownerId !== opts.agentId) return false;
    if (opts.tab === "fila" && t.ownerId) return false;
    return !q || normalize(`${t.name} ${formatWhatsApp(t.peer)} ${t.peer}`).includes(q);
  });
  return { allowed, counts, visible };
}

export type LiveChat = ReturnType<typeof useLiveChat>;

/**
 * @param initial  conversas já carregadas no servidor (tela Conversas); sem isso, carrega ao ligar.
 * @param enabled  liga a carga e a atualização (as janelas desligam quando tudo está fechado).
 * @param intervalMs intervalo de atualização enquanto ligado.
 */
export function useLiveChat({ initial, enabled = true, intervalMs = 1000 }: { initial?: Snapshot | null; enabled?: boolean; intervalMs?: number } = {}) {
  const user = useCurrentUser();
  const manager = isManager(user);
  const agent: Agent = useMemo(() => ({ id: user?.id ?? "", name: user?.short || user?.name || "", role: user?.role ?? "vendedor" }), [user]);
  const [snap, setSnap] = useState<Snapshot | null>(initial ?? null);
  const [loadError, setLoadError] = useState("");
  const pendingOut = useRef<PendingOut[]>([]);
  const seq = useRef(0);
  const author = useRef(agent.name);
  useEffect(() => {
    author.current = agent.name;
  }, [agent.name]);

  const ready = Boolean(snap?.enabled && snap?.configured);
  const loaded = Boolean(snap);

  // Primeira carga, quando as conversas não vieram do servidor (janelas flutuantes).
  useEffect(() => {
    if (!enabled || loaded) return;
    let alive = true;
    loadProofSnapshot().then(
      (next) => alive && setSnap(next),
      (e: unknown) => alive && setLoadError(e instanceof Error ? e.message : "Não foi possível abrir o WhatsApp."),
    );
    return () => {
      alive = false;
    };
  }, [enabled, loaded]);

  const refresh = useCallback(async () => {
    const live = await fetchLiveFeed();
    if (!live) return;
    setSnap((current) => {
      if (!current) return current;
      const next = { ...current, events: live.events, conversations: live.conversations };
      pendingOut.current = pendingOut.current.filter((item) => !alreadySaved(next.events, item));
      return withPending(next, pendingOut.current, author.current);
    });
  }, []);

  useEffect(() => {
    if (!enabled || !ready) return;
    let busy = false;
    const tick = () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      refresh().finally(() => {
        busy = false;
      });
    };
    const timer = setInterval(tick, intervalMs);
    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, ready, intervalMs, refresh]);

  const threads = useMemo(() => (snap ? threadsOf(snap) : []), [snap]);
  const threadOf = useCallback((peer: string) => threads.find((t) => sameChat(t.peer, peer)) ?? null, [threads]);
  const canReply = useCallback((thread: Thread | null) => !thread?.ownerId || thread.ownerId === agent.id, [agent.id]);
  const statusLabel = snap?.status.loggedIn ? "online" : snap?.status.connected ? "reconectando" : "offline";

  /** Confere tudo que impede o envio e diz o motivo. */
  const assertCanSend = (peer: string) => {
    if (!peer) throw new Error("Abra o número do cliente antes de enviar.");
    if (!snap?.status.loggedIn) throw new Error("O WhatsApp está offline. Espere a sessão voltar ou atualize o QR.");
    const thread = threadOf(peer);
    if (!canReply(thread)) throw new Error(`Esta conversa está com ${thread?.ownerName || "outro atendente"}. Assuma para responder.`);
  };

  /** Envia texto; a mensagem aparece na hora e some com aviso se o envio falhar. Devolve o número final. */
  const sendText = async (peer: string, text: string) => {
    assertCanSend(peer);
    seq.current += 1;
    const item: PendingOut = { id: `local-${seq.current}`, peer, text, at: new Date().toISOString() };
    pendingOut.current = [item, ...pendingOut.current];
    setSnap((current) => (current ? withPending(current, pendingOut.current, author.current) : current));
    try {
      const sent = await sendProofText(peer, text, agent);
      await refresh();
      return canonicalWhatsApp(sent.number);
    } catch (cause) {
      pendingOut.current = pendingOut.current.filter((row) => row.id !== item.id);
      setSnap((current) => (current ? { ...current, events: current.events.filter((event) => event.id !== item.id) } : current));
      throw cause instanceof Error ? cause : new Error("Não foi possível enviar.");
    }
  };

  const sendFile = async (peer: string, file: File, caption: string) => {
    assertCanSend(peer);
    if (file.size > MAX_FILE_BYTES) throw new Error("Arquivo maior que 16 MB.");
    const form = new FormData();
    form.set("file", file);
    form.set("to", peer);
    form.set("caption", caption);
    form.set("agentId", agent.id);
    form.set("agentName", agent.name);
    form.set("agentRole", agent.role);
    const res = await fetch("/api/whatsapp/send-media", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { error?: string; number?: string };
    if (!res.ok) throw new Error(body.error || "Não foi possível enviar o arquivo.");
    await refresh();
    return body.number ? canonicalWhatsApp(body.number) : peer;
  };

  const assign = async (peer: string, target: { id: string; name: string } | null) => {
    await assignProofConversation(peer, target, agent);
    await refresh();
  };

  const removeMessage = async (id: string, scope: "me" | "everyone") => {
    await deleteProofMessage(id, scope, agent);
    await refresh();
  };

  const removeConversation = async (peer: string) => {
    await deleteProofConversation(peer, agent);
    await refresh();
  };

  /** Marca como lida quando o atendente responsável (ou ninguém) está olhando a conversa. */
  const markRead = useCallback(
    (thread: Thread | null) => {
      if (!thread || !thread.unread || !agent.id) return;
      if (thread.ownerId && thread.ownerId !== agent.id) return;
      markProofRead(thread.peer, agent).catch(() => undefined);
    },
    [agent],
  );

  const refreshQr = async () => {
    const qr = await refreshProofQr();
    setSnap((current) => (current ? { ...current, qr } : current));
  };

  return { snap, ready, loaded, loadError, threads, threadOf, canReply, agent, manager, statusLabel, refresh, sendText, sendFile, assign, removeMessage, removeConversation, markRead, refreshQr };
}
