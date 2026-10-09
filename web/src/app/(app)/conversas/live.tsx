"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, MessageCircle, Search, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadProofSnapshot, refreshProofQr, registerProofWebhook, sendProofText } from "@/server/integrations/stevo-proof/actions";
import type { ProofEventView } from "@/server/integrations/stevo-proof/events";
import { Badge, Button, Card, Empty, Field, Input } from "@/components/ui/primitives";
import { dayDiff, fmtDateShort, fmtTime } from "@/lib/dates";
import { formatWhatsApp, normalizeWhatsApp } from "@/lib/br-ids";
import { cn, normalize } from "@/lib/utils";

type Snapshot = Awaited<ReturnType<typeof loadProofSnapshot>>;
type PendingOut = { id: string; peer: string; text: string; at: string };

type Thread = {
  peer: string;
  name: string;
  messages: { id: string; at: string; text: string; out: boolean }[];
};

function chatOf(event: ProofEventView) {
  if (event.direction !== "in" && event.direction !== "out") return null;
  const peer = event.peer || "";
  if (!peer || !event.preview) return null;
  return { peer, name: event.name ?? "", out: event.direction === "out", text: event.preview, id: event.id, at: event.receivedAt };
}

function threadsOf(events: ProofEventView[]): Thread[] {
  const map = new Map<string, Thread>();
  for (const event of [...events].reverse()) {
    const chat = chatOf(event);
    if (!chat) continue;
    const thread = map.get(chat.peer) ?? { peer: chat.peer, name: "", messages: [] };
    if (chat.name) thread.name = chat.name;
    thread.messages.push({ id: chat.id, at: chat.at, text: chat.text, out: chat.out });
    map.set(chat.peer, thread);
  }
  return [...map.values()].sort((a, b) => (b.messages.at(-1)?.at ?? "").localeCompare(a.messages.at(-1)?.at ?? ""));
}

function sameChat(left: string, right: string) {
  return left === right || normalizeWhatsApp(left) === normalizeWhatsApp(right);
}

function alreadySaved(events: ProofEventView[], item: PendingOut) {
  const since = new Date(item.at).getTime() - 5000;
  return events.some((event) => event.direction === "out" && !event.id.startsWith("local-") && sameChat(event.peer || "", item.peer) && event.preview === item.text && new Date(event.receivedAt).getTime() >= since);
}

function withPending(next: Snapshot, pending: PendingOut[]): Snapshot {
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
  const [snap, setSnap] = useState(initial);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const pendingOut = useRef<PendingOut[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const selected = params.get("c") ?? "";

  const show = (next: Snapshot) => {
    pendingOut.current = pendingOut.current.filter((item) => !alreadySaved(next.events, item));
    setSnap(withPending(next, pendingOut.current));
  };

  const threads = useMemo(() => threadsOf(snap.events), [snap.events]);
  const visible = threads.filter((thread) => {
    const q = normalize(query);
    if (!q) return true;
    return normalize(`${thread.name} ${formatWhatsApp(thread.peer)} ${thread.peer}`).includes(q);
  });
  const active = threads.find((thread) => thread.peer === selected) ?? null;
  const listed = selected && !visible.some((thread) => sameChat(thread.peer, selected)) ? [{ peer: selected, name: "", messages: [] }, ...visible] : visible;

  useEffect(() => {
    const timer = setInterval(() => {
      loadProofSnapshot().then(show).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages.length, selected]);

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

  const send = () => {
    const text = draft.trim();
    const target = selected || active?.peer || "";
    if (!text) return;
    if (!target) {
      setError("Abra o número do cliente antes de enviar.");
      return;
    }
    if (!snap.status.loggedIn) {
      setError("O WhatsApp está offline. Espere a sessão voltar ou atualize o QR.");
      return;
    }
    const item: PendingOut = { id: `local-${Date.now()}`, peer: target, text, at: new Date().toISOString() };
    pendingOut.current = [item, ...pendingOut.current];
    setDraft("");
    setError("");
    setSnap((current) => withPending(current, pendingOut.current));
    start(async () => {
      try {
        const sent = await sendProofText(target, text);
        if (sent.number !== selected) select(sent.number);
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

  return (
    <div className="-mt-1">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="label">Central de conversas</div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Conversas</h1>
        </div>
        <div className="text-[12px] text-muted">WhatsApp de {snap.status.name || "Tawper"} · {statusLabel}</div>
      </div>
      {error && <div className="mb-3 rounded-[8px] border border-brand/25 bg-brand-soft px-4 py-2.5 text-[13px] text-brand">{error}</div>}
      {notice && <div className="mb-3 rounded-[8px] border border-ok/20 bg-ok-soft px-4 py-2.5 text-[13px] text-ok">{notice}</div>}
      <Card className="grid h-[calc(100dvh-190px)] min-h-[560px] grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr_300px]">
        <aside className={cn("flex min-h-0 min-w-0 flex-col border-r border-line", selected && "hidden md:flex")}>
          <div className="space-y-2 border-b border-line p-3">
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
                <li key={thread.peer}>
                  <button type="button" onClick={() => select(thread.peer)} className={cn("flex w-full items-start gap-2.5 border-b border-line/70 px-3 py-2.5 text-left hover:bg-soft/40", selected === thread.peer && "bg-soft")}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e7f6ee] text-[13px] font-bold text-ok">{badge(thread.name, thread.peer)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-ink">{labelOf(thread.name, thread.peer)}</span>
                        {when && <span className="ml-auto shrink-0 text-[10.5px] text-muted">{dayDiff(when) === 0 ? fmtTime(when) : fmtDateShort(when)}</span>}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted">{formatWhatsApp(thread.peer)}</span>
                      <span className="block truncate text-[12px] text-muted">{last?.out ? "Você: " : ""}{last?.text ?? "Conversa nova"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {listed.length === 0 && <li className="px-4 py-10 text-center text-[12.5px] text-muted">Nenhuma conversa ainda. Abra um número ou espere uma mensagem.</li>}
          </ul>
        </aside>

        <section className={cn("min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden md:flex")}>
          {selected ? (
            <>
              <button type="button" onClick={() => select("")} className="flex items-center gap-1 border-b border-line px-3 py-2 text-[12.5px] font-semibold text-muted md:hidden">
                <ArrowLeft size={14} /> Conversas
              </button>
              <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-2.5">
                <span className="grid size-9 place-items-center rounded-full bg-[#e7f6ee] text-[13px] font-bold text-ok">{badge(active?.name ?? "", selected)}</span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{title}</div>
                  <div className="text-[11.5px] text-muted">{formatWhatsApp(selected)} · {statusLabel}</div>
                </div>
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 md:px-6">
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
                        <div className={cn("max-w-[78%] rounded-[8px] px-2.5 pt-1.5 pb-1 text-[13px] leading-snug shadow-[0_1px_0.5px_#0000001f]", message.out ? "rounded-tr-[2px] bg-[#d9fdd3]" : "rounded-tl-[2px] bg-white")}>
                          <span className="whitespace-pre-wrap text-ink">{message.text}</span>
                          <span className="float-right mt-1 ml-2 text-[10.5px] text-muted">{fmtTime(message.at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-center gap-2 border-t border-line bg-[#f6f6f4] px-3 py-2.5"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Digite uma mensagem"
                  className="h-10 min-w-0 flex-1 rounded-full border border-transparent bg-white px-4 text-[13.5px] outline-none"
                />
                <button type="submit" disabled={pending || !draft.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-white disabled:opacity-40" aria-label="Enviar">
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center bg-[#f7f6f3]">
              <Empty icon={<MessageCircle size={20} />} title="Selecione uma conversa" text="As mensagens são as do WhatsApp conectado. Abra um número ou escolha um cliente na lista." />
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
              <Button size="sm" variant="dark" disabled={pending} onClick={() => start(async () => {
                const registered = await registerProofWebhook();
                setNotice("Recebimento reativado. A sessão pode piscar.");
                show(await loadProofSnapshot());
                void registered;
              })}>Reativar recebimento</Button>
            </div>
            {selected && (
              <Field label="Cliente" className="mt-3">
                <Input value={formatWhatsApp(selected)} readOnly />
              </Field>
            )}
          </div>
        </aside>
      </Card>
    </div>
  );
}
