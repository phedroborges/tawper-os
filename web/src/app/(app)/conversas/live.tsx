"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Ban, ChevronDown, Loader2, MessageCircle, Mic, Paperclip, Search, Send, Square, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  assignProofConversation,
  deleteProofConversation,
  deleteProofMessage,
  loadProofSnapshot,
  markProofRead,
  refreshProofQr,
  registerProofWebhook,
  sendProofText,
  type Agent,
} from "@/server/integrations/stevo-proof/actions";
import type { MediaKind, ProofEventView } from "@/server/integrations/stevo-proof/events";
import { ConversasReady } from "@/components/chat/ConversasLoading";
import { MediaView, REVOKED_TEXT, visibleText, withoutSignature } from "@/components/chat/live-message";
import { Badge, Button, Card, Empty, Field, Input, Select } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import { dayDiff, fmtDateShort, fmtTime } from "@/lib/dates";
import { canonicalWhatsApp, formatWhatsApp, normalizeWhatsApp } from "@/lib/br-ids";
import { useCurrentUser, useStore } from "@/lib/store";
import { cn, normalize } from "@/lib/utils";

type Snapshot = Awaited<ReturnType<typeof loadProofSnapshot>>;
type PendingOut = { id: string; peer: string; text: string; at: string };
type Tab = "minhas" | "fila" | "todas";

type Thread = {
  peer: string;
  name: string;
  ownerId: string | null;
  ownerName: string;
  unread: number;
  messages: { id: string; at: string; text: string; out: boolean; author: string; media?: MediaKind; revoked?: boolean; revocable?: boolean }[];
};

function chatOf(event: ProofEventView) {
  if (event.direction !== "in" && event.direction !== "out") return null;
  const peer = event.peer ? canonicalWhatsApp(event.peer) : "";
  if (!peer || (!event.preview && !event.revoked)) return null;
  return {
    peer,
    name: event.name ?? "",
    out: event.direction === "out",
    text: event.preview,
    id: event.id,
    at: event.receivedAt,
    author: event.authorName ?? "",
    media: event.mediaKind,
    revoked: event.revoked,
    revocable: event.revocable,
  };
}

function threadsOf(snap: Snapshot): Thread[] {
  const owners = new Map(snap.conversations.map((c) => [canonicalWhatsApp(c.peer), c]));
  const map = new Map<string, Thread>();
  for (const event of [...snap.events].reverse()) {
    const chat = chatOf(event);
    if (!chat) continue;
    const conv = owners.get(chat.peer);
    const thread = map.get(chat.peer) ?? {
      peer: chat.peer,
      name: "",
      ownerId: conv?.ownerId ?? null,
      ownerName: conv?.ownerName ?? "",
      unread: conv?.unread ?? 0,
      messages: [],
    };
    if (chat.name) thread.name = chat.name;
    thread.messages.push({ id: chat.id, at: chat.at, text: chat.text, out: chat.out, author: chat.author, media: chat.media, revoked: chat.revoked, revocable: chat.revocable });
    map.set(chat.peer, thread);
  }
  return [...map.values()].sort((a, b) => (b.messages.at(-1)?.at ?? "").localeCompare(a.messages.at(-1)?.at ?? ""));
}

function sameChat(left: string, right: string) {
  return left === right || normalizeWhatsApp(left) === normalizeWhatsApp(right);
}

function alreadySaved(events: ProofEventView[], item: PendingOut) {
  const since = new Date(item.at).getTime() - 5000;
  return events.some(
    (event) =>
      event.direction === "out" &&
      !event.id.startsWith("local-") &&
      sameChat(event.peer || "", item.peer) &&
      event.preview.endsWith(item.text) &&
      new Date(event.receivedAt).getTime() >= since,
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
  }));
  return { ...next, events: [...extras, ...next.events] };
}

function labelOf(name: string, peer: string) {
  return name.trim() || formatWhatsApp(peer) || peer;
}

function badge(name: string, peer: string) {
  const clean = name.trim();
  if (clean && /[A-Za-zÀ-ÿ]/.test(clean[0] ?? "")) return clean[0].toUpperCase();
  return peer.replace(/\D/g, "").slice(-2) || "?";
}

export function LiveConversas({ initial }: { initial: Snapshot }) {
  const params = useSearchParams();
  const router = useRouter();
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const manager = isManager(user);
  const agent: Agent = useMemo(() => ({ id: user?.id ?? "", name: user?.short || user?.name || "", role: user?.role ?? "vendedor" }), [user]);
  const [snap, setSnap] = useState(initial);
  const [tab, setTab] = useState<Tab>("minhas");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const pendingOut = useRef<PendingOut[]>([]);
  const localSeq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const selected = canonicalWhatsApp(params.get("c") ?? "");

  const show = (next: Snapshot) => {
    pendingOut.current = pendingOut.current.filter((item) => !alreadySaved(next.events, item));
    setSnap(withPending(next, pendingOut.current, agent.name));
  };

  const threads = useMemo(() => threadsOf(snap), [snap]);
  const allowed = threads.filter((thread) => manager || !thread.ownerId || thread.ownerId === agent.id);
  const counts = {
    minhas: allowed.filter((t) => t.ownerId === agent.id).length,
    fila: allowed.filter((t) => !t.ownerId).length,
    todas: allowed.length,
  };
  const visible = allowed.filter((thread) => {
    if (tab === "minhas" && thread.ownerId !== agent.id) return false;
    if (tab === "fila" && thread.ownerId) return false;
    const q = normalize(query);
    if (!q) return true;
    return normalize(`${thread.name} ${formatWhatsApp(thread.peer)} ${thread.peer}`).includes(q);
  });
  const active = threads.find((thread) => thread.peer === selected) ?? null;
  const hidden = Boolean(active && !manager && active.ownerId && active.ownerId !== agent.id);
  const canReply = !active?.ownerId || active.ownerId === agent.id;
  const listed = selected && !visible.some((thread) => sameChat(thread.peer, selected)) && !active ? [{ peer: selected, name: "", ownerId: null, ownerName: "", unread: 0, messages: [] }, ...visible] : visible;

  useEffect(() => {
    const timer = setInterval(() => {
      loadProofSnapshot().then(show).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.name]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages.length, selected]);

  useEffect(() => {
    if (!active || !active.unread || !agent.id) return;
    if (active.ownerId && active.ownerId !== agent.id) return;
    markProofRead(active.peer, agent).catch(() => undefined);
  }, [active, agent]);

  const select = (peer: string) => router.replace(peer ? `/conversas?c=${peer}` : "/conversas");

  const openNumber = (raw: string) => {
    const next = normalizeWhatsApp(raw);
    if (next.length < 12) {
      setError("Informe o celular com DDD.");
      return;
    }
    setNewNumber("");
    setError("");
    select(next);
  };

  const assign = (target: { id: string; name: string } | null, message: string) => {
    if (!selected) return;
    setError("");
    start(async () => {
      try {
        await assignProofConversation(selected, target, agent);
        setNotice(message);
        show(await loadProofSnapshot());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível mudar o responsável.");
      }
    });
  };

  const removeMessage = (id: string, scope: "me" | "everyone") => {
    setMenuFor(null);
    const question =
      scope === "everyone"
        ? "Apagar para todos? A mensagem some também no WhatsApp do cliente."
        : "Apagar para mim? Ela some do Tawper para todos os atendentes, mas continua no celular e no WhatsApp do cliente.";
    if (!window.confirm(question)) return;
    setError("");
    start(async () => {
      try {
        await deleteProofMessage(id, scope, agent);
        show(await loadProofSnapshot());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível apagar a mensagem.");
      }
    });
  };

  const canEraseThread = (thread: { ownerId: string | null }) => manager || !thread.ownerId || thread.ownerId === agent.id;

  const removeConversation = (peer: string, label: string) => {
    if (!window.confirm(`Apagar a conversa com ${label}? Todas as mensagens somem do Tawper para todos os atendentes.`)) return;
    setError("");
    start(async () => {
      try {
        await deleteProofConversation(peer, agent);
        setNotice("Conversa apagada.");
        if (sameChat(peer, selected)) select("");
        show(await loadProofSnapshot());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível apagar a conversa.");
      }
    });
  };

  const canSendNow = (target: string) => {
    if (!target) {
      setError("Abra o número do cliente antes de enviar.");
      return false;
    }
    if (!snap.status.loggedIn) {
      setError("O WhatsApp está offline. Espere a sessão voltar ou atualize o QR.");
      return false;
    }
    if (!canReply) {
      setError(`Esta conversa está com ${active?.ownerName || "outro atendente"}.`);
      return false;
    }
    return true;
  };

  const sendFile = async (file: File, caption: string) => {
    const target = selected || active?.peer || "";
    if (!canSendNow(target)) return;
    if (file.size > 16 * 1024 * 1024) {
      setError("Arquivo maior que 16 MB.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("to", target);
    form.set("caption", caption);
    form.set("agentId", agent.id);
    form.set("agentName", agent.name);
    form.set("agentRole", agent.role);
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/send-media", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string; number?: string };
      if (!res.ok) throw new Error(body.error || "Não foi possível enviar o arquivo.");
      setAttachment(null);
      setDraft("");
      if (body.number && canonicalWhatsApp(body.number) !== selected) select(canonicalWhatsApp(body.number));
      show(await loadProofSnapshot());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!canSendNow(selected || active?.peer || "")) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não grava áudio. Anexe um arquivo de áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const mime = (rec.mimeType || type || "audio/webm").split(";")[0];
        const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunks, { type: mime });
        if (blob.size) void sendFile(new File([blob], `audio.${ext}`, { type: mime }), "");
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setError("");
    } catch {
      setError("Permita o uso do microfone para gravar áudio.");
    }
  };

  const send = () => {
    const text = draft.trim();
    const target = selected || active?.peer || "";
    if (attachment) {
      void sendFile(attachment, text);
      return;
    }
    if (!text) return;
    if (!canSendNow(target)) return;
    localSeq.current += 1;
    const item: PendingOut = { id: `local-${localSeq.current}`, peer: target, text, at: new Date().toISOString() };
    pendingOut.current = [item, ...pendingOut.current];
    setDraft("");
    setError("");
    setSnap((current) => withPending(current, pendingOut.current, agent.name));
    start(async () => {
      try {
        const sent = await sendProofText(target, text, agent);
        if (canonicalWhatsApp(sent.number) !== selected) select(canonicalWhatsApp(sent.number));
        show(await loadProofSnapshot());
      } catch (cause) {
        pendingOut.current = pendingOut.current.filter((row) => row.id !== item.id);
        setSnap((current) => ({ ...current, events: current.events.filter((event) => event.id !== item.id) }));
        setDraft(text);
        setError(cause instanceof Error ? cause.message : "Não foi possível enviar.");
      }
    });
  };

  const statusLabel = snap.status.loggedIn ? "online" : snap.status.connected ? "reconectando" : "offline";
  const title = active ? labelOf(active.name, active.peer) : "";
  const ownerLabel = active?.ownerId ? (active.ownerId === agent.id ? "Você" : active.ownerName || "Outro atendente") : "Sem responsável";
  const canTransfer = Boolean(active && (manager || active.ownerId === agent.id));
  const canErase = Boolean(active && canEraseThread(active));
  const tabs: { id: Tab; label: string }[] = [
    { id: "minhas", label: "Minhas" },
    { id: "fila", label: "Sem responsável" },
    ...(manager ? [{ id: "todas" as Tab, label: "Todas" }] : []),
  ];

  return (
    <div className="-mt-1">
      <ConversasReady />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="label">Central de conversas</div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Conversas</h1>
        </div>
        <div className="text-[12px] text-muted">
          WhatsApp de {snap.status.name || "Tawper"} · {statusLabel} · atendendo como <span className="font-semibold text-ink">{agent.name || "—"}</span>
        </div>
      </div>
      {error && <div className="mb-3 rounded-[8px] border border-brand/25 bg-brand-soft px-4 py-2.5 text-[13px] text-brand">{error}</div>}
      {notice && <div className="mb-3 rounded-[8px] border border-ok/20 bg-ok-soft px-4 py-2.5 text-[13px] text-ok">{notice}</div>}
      <Card className="grid h-[calc(100dvh-190px)] min-h-[560px] grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr_300px]">
        <aside className={cn("flex min-h-0 min-w-0 flex-col border-r border-line", selected && "hidden md:flex")}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn("flex-1 rounded-[5px] px-2 py-1.5 text-[12px] font-medium", tab === t.id ? "bg-navy text-white" : "bg-soft text-muted hover:text-ink")}
                >
                  {t.label} <span className="opacity-70">{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conversa" className="h-9 w-full rounded-[5px] border border-line bg-[#fbfbfa] pr-3 pl-8 text-[12.5px] outline-none focus:border-navy-3" />
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); openNumber(newNumber); }}>
              <input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="Novo número" className="h-8 min-w-0 flex-1 rounded-[5px] border border-line px-2 text-[12.5px] outline-none focus:border-navy-3" />
              <Button size="sm" type="submit">Abrir</Button>
            </form>
          </div>
          <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {listed.map((thread) => {
              const last = thread.messages.at(-1);
              const when = last?.at ?? "";
              return (
                <li key={thread.peer} className="group relative">
                  {thread.messages.length > 0 && canEraseThread(thread) && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => removeConversation(thread.peer, labelOf(thread.name, thread.peer))}
                      className="absolute right-2 bottom-2 z-10 grid size-7 place-items-center rounded-full bg-white text-muted opacity-0 shadow-sm group-hover:opacity-100 hover:text-brand focus:opacity-100 disabled:opacity-40"
                      aria-label="Apagar conversa"
                      title="Apagar conversa"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button type="button" onClick={() => select(thread.peer)} className={cn("flex w-full items-start gap-2.5 border-b border-line/70 px-3 py-2.5 text-left hover:bg-soft/40", selected === thread.peer && "bg-soft")}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e7f6ee] text-[13px] font-bold text-ok">{badge(thread.name, thread.peer)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-ink">{labelOf(thread.name, thread.peer)}</span>
                        {when && <span className="ml-auto shrink-0 text-[10.5px] text-muted">{dayDiff(when) === 0 ? fmtTime(when) : fmtDateShort(when)}</span>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[11.5px] text-muted">{formatWhatsApp(thread.peer)}</span>
                        <span className={cn("ml-auto shrink-0 rounded-[3px] px-1 text-[10px] font-medium", thread.ownerId ? "bg-soft text-muted" : "bg-amber-50 text-amber-800")}>
                          {thread.ownerId ? (thread.ownerId === agent.id ? "você" : thread.ownerName || "atribuída") : "fila"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="block min-w-0 flex-1 truncate text-[12px] text-muted">
                          {last?.out ? `${last.author || "Aparelho"}: ` : ""}
                          {last ? (last.revoked ? REVOKED_TEXT : withoutSignature(last.text, last.author)) : "Conversa nova"}
                        </span>
                        {thread.unread > 0 && <span className="shrink-0 rounded-full bg-ok px-1.5 text-[10.5px] leading-[18px] font-semibold text-white">{thread.unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {listed.length === 0 && (
              <li className="px-4 py-10 text-center text-[12.5px] text-muted">
                {tab === "minhas" ? "Nenhuma conversa com você. Veja a fila \"Sem responsável\"." : "Nenhuma conversa aqui."}
              </li>
            )}
          </ul>
        </aside>

        <section className={cn("min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden md:flex")}>
          {selected ? (
            <>
              <button type="button" onClick={() => select("")} className="flex items-center gap-1 border-b border-line px-3 py-2 text-[12.5px] font-semibold text-muted md:hidden">
                <ArrowLeft size={14} /> Conversas
              </button>
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
                <span className="grid size-9 place-items-center rounded-full bg-[#e7f6ee] text-[13px] font-bold text-ok">{badge(active?.name ?? "", selected)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{title || formatWhatsApp(selected)}</div>
                  <div className="text-[11.5px] text-muted">{formatWhatsApp(selected)} · responsável: <span className="font-medium text-ink">{ownerLabel}</span></div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {active?.ownerId !== agent.id && (!active?.ownerId || manager) && (
                    <Button size="sm" variant="dark" disabled={pending} onClick={() => assign({ id: agent.id, name: agent.name }, "Conversa assumida. Agora você responde por ela.")}>
                      Assumir
                    </Button>
                  )}
                  {active?.ownerId && canTransfer && (
                    <Button size="sm" disabled={pending} onClick={() => assign(null, "Conversa devolvida para a fila.")}>
                      Liberar
                    </Button>
                  )}
                  {canTransfer && (
                    <Select
                      className="h-8 w-40 text-[12px]"
                      value=""
                      disabled={pending}
                      onChange={(e) => {
                        const to = users.find((u) => u.id === e.target.value);
                        if (to) assign({ id: to.id, name: to.short || to.name }, `Conversa transferida para ${to.short || to.name}.`);
                      }}
                    >
                      <option value="">Transferir para…</option>
                      {users.filter((u) => u.id !== active?.ownerId).map((u) => (
                        <option key={u.id} value={u.id}>{u.short || u.name}</option>
                      ))}
                    </Select>
                  )}
                  {canErase && active && (
                    <Button size="sm" disabled={pending} onClick={() => removeConversation(active.peer, title || formatWhatsApp(active.peer))} className="gap-1.5 text-brand">
                      <Trash2 size={14} /> Apagar conversa
                    </Button>
                  )}
                </div>
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 md:px-6">
                {hidden ? (
                  <div className="mx-auto mt-10 max-w-xs rounded-[6px] bg-white/90 p-3 text-center text-[12.5px] text-muted">
                    Esta conversa está com {active?.ownerName || "outro atendente"}.
                  </div>
                ) : (
                  <>
                    {(active?.messages ?? []).length === 0 && <div className="mx-auto mt-10 max-w-xs rounded-[6px] bg-white/90 p-3 text-center text-[12.5px] text-muted">Nenhuma mensagem ainda. Escreva abaixo.</div>}
                    {(active?.messages ?? []).map((message, index, list) => {
                      const divider = index === 0 || list[index - 1].at.slice(0, 10) !== message.at.slice(0, 10);
                      return (
                        <div key={message.id}>
                          {divider && (
                            <div className="my-3 flex justify-center">
                              <span className="rounded-[4px] bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-muted shadow-sm">{dayDiff(message.at) === 0 ? "Hoje" : fmtDateShort(message.at)}</span>
                            </div>
                          )}
                          <div className={cn("my-1 flex", message.out ? "justify-end" : "justify-start")}>
                            <div className={cn("group relative max-w-[78%] rounded-[8px] px-2.5 pt-1.5 pb-1 text-[13px] leading-snug shadow-[0_1px_0.5px_#0000001f]", message.out ? "rounded-tr-[2px] bg-[#d9fdd3]" : "rounded-tl-[2px] bg-white")}>
                              {canErase && !message.id.startsWith("local-") && (
                                <button
                                  type="button"
                                  onClick={() => setMenuFor(menuFor === message.id ? null : message.id)}
                                  className={cn("absolute top-0.5 right-0.5 z-10 grid size-6 place-items-center rounded-full bg-inherit text-muted hover:text-ink", menuFor === message.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100")}
                                  aria-label="Opções da mensagem"
                                >
                                  <ChevronDown size={15} />
                                </button>
                              )}
                              {menuFor === message.id && (
                                <>
                                  <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
                                  <div className={cn("absolute top-7 z-30 w-44 overflow-hidden rounded-[6px] border border-line bg-white py-1 text-[12.5px] shadow-lg", message.out ? "right-0" : "left-0")}>
                                    <button type="button" onClick={() => removeMessage(message.id, "me")} className="block w-full px-3 py-1.5 text-left text-ink hover:bg-soft">
                                      Apagar para mim
                                    </button>
                                    {message.out && message.revocable && (
                                      <button type="button" onClick={() => removeMessage(message.id, "everyone")} className="block w-full px-3 py-1.5 text-left text-brand hover:bg-soft">
                                        Apagar para todos
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                              {message.revoked ? (
                                <span className="inline-flex items-center gap-1 text-muted italic">
                                  <Ban size={13} /> {message.out ? "Você apagou esta mensagem" : "Esta mensagem foi apagada"}
                                </span>
                              ) : (
                                <>
                                  {message.media && <MediaView id={message.id} kind={message.media} text={message.text} />}
                                  {visibleText(message) && <span className="whitespace-pre-wrap text-ink">{visibleText(message)}</span>}
                                </>
                              )}
                              <span className="float-right mt-1 ml-2 text-[10.5px] text-muted">
                                {message.out && <span className="mr-1 font-medium">{message.author || "pelo aparelho"} ·</span>}
                                {fmtTime(message.at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                <div ref={endRef} />
              </div>
              {attachment && (
                <div className="flex items-center gap-2 border-t border-line bg-white px-4 py-2 text-[12.5px]">
                  <Paperclip size={14} className="text-muted" />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{attachment.name}</span>
                  <span className="text-muted">{(attachment.size / 1024 / 1024).toFixed(1)} MB · o texto vira legenda</span>
                  <button type="button" onClick={() => setAttachment(null)} disabled={uploading} className="grid size-6 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink" aria-label="Remover anexo">
                    <X size={14} />
                  </button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-center gap-2 border-t border-line bg-[#f6f6f4] px-3 py-2.5"
              >
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (file && file.size > 16 * 1024 * 1024) {
                      setError("Arquivo maior que 16 MB.");
                      return;
                    }
                    setAttachment(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!canReply || uploading || recording}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-white hover:text-ink disabled:opacity-40"
                  aria-label="Anexar arquivo"
                  title="Anexar documento, imagem, vídeo ou áudio"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!canReply || recording}
                  placeholder={
                    recording
                      ? "Gravando áudio… clique no quadrado para enviar"
                      : !canReply
                        ? `Conversa com ${active?.ownerName || "outro atendente"}. Assuma para responder.`
                        : attachment
                          ? "Legenda (opcional)"
                          : active?.ownerId
                            ? "Digite uma mensagem"
                            : "Digite uma mensagem (ao enviar, a conversa fica com você)"
                  }
                  className="h-10 min-w-0 flex-1 rounded-full border border-transparent bg-white px-4 text-[13.5px] outline-none disabled:bg-soft"
                />
                {draft.trim() || attachment ? (
                  <button type="submit" disabled={pending || uploading || !canReply} className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-white disabled:opacity-40" aria-label="Enviar">
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void toggleRecording()}
                    disabled={!canReply || uploading}
                    className={cn("grid size-10 shrink-0 place-items-center rounded-full text-white disabled:opacity-40", recording ? "animate-pulse bg-brand" : "bg-navy")}
                    aria-label={recording ? "Parar e enviar áudio" : "Gravar áudio"}
                    title={recording ? "Parar e enviar" : "Gravar áudio"}
                  >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : recording ? <Square size={14} /> : <Mic size={17} />}
                  </button>
                )}
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center bg-[#f7f6f3]">
              <Empty icon={<MessageCircle size={20} />} title="Selecione uma conversa" text="Um único WhatsApp, vários atendentes. Assuma uma conversa da fila ou abra um número." />
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-soft/30 p-3 xl:flex">
          <div className="rounded-[6px] border border-line bg-white p-3 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <div className="label">Sessão</div>
              <Badge tone={snap.status.loggedIn ? "green" : "amber"}>{statusLabel}</Badge>
            </div>
            <p className="mt-2">{snap.status.name || "Tawper"}</p>
            <p className="text-[12px] text-muted">{formatWhatsApp(snap.status.phone) || "Número ainda não identificado"}</p>
            {!snap.status.loggedIn && snap.qr.image && <img src={snap.qr.image} alt="QR Code" className="mt-3 h-40 w-40 rounded-[8px] border border-line bg-white p-2" />}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={pending || snap.status.loggedIn} onClick={() => start(async () => {
                setSnap({ ...snap, qr: await refreshProofQr() });
                setNotice("QR atualizado.");
              })}>Atualizar QR</Button>
              {manager && (
                <Button size="sm" variant="dark" disabled={pending} onClick={() => start(async () => {
                  await registerProofWebhook();
                  setNotice("Recebimento reativado. A sessão pode piscar.");
                  show(await loadProofSnapshot());
                })}>Reativar recebimento</Button>
              )}
            </div>
            {selected && (
              <Field label="Cliente" className="mt-3">
                <Input value={formatWhatsApp(selected)} readOnly />
              </Field>
            )}
          </div>
          <div className="rounded-[6px] border border-line bg-white p-3 text-[12.5px] text-muted">
            <div className="label mb-1.5">Como funciona</div>
            <p>Todos atendem pelo mesmo número. Cada conversa tem um responsável, e só ele responde.</p>
            <p className="mt-1.5">Mensagem de contato cadastrado vai para o dono da empresa. As demais caem em &quot;Sem responsável&quot;.</p>
          </div>
        </aside>
      </Card>
    </div>
  );
}
