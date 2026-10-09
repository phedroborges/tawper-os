"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, Search, SendHorizontal, Settings2 } from "lucide-react";
import { loadProofSnapshot, pairProofPhone, refreshProofQr, registerProofWebhook, sendProofText } from "@/server/integrations/stevo-proof/actions";
import type { ProofEventView } from "@/server/integrations/stevo-proof/events";
import { Badge, Button, Field, Input } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlay";
import { formatWhatsApp, normalizeWhatsApp } from "@/lib/br-ids";
import { cn } from "@/lib/utils";

type Snapshot = Awaited<ReturnType<typeof loadProofSnapshot>>;

type Thread = {
  peer: string;
  name: string;
  messages: { id: string; at: string; text: string; out: boolean }[];
};

function chatOf(event: ProofEventView) {
  const kind = event.event.toLowerCase();
  const legacy = !event.direction && (kind === "message" || kind === "sendmessage") && /^\d{10,}$/.test(event.from) && !event.preview.startsWith("{");
  const direction = event.direction ?? (legacy ? (kind === "sendmessage" ? "out" : "in") : "");
  if (direction !== "in" && direction !== "out") return null;
  const peer = event.peer || (legacy ? event.from : "");
  if (!peer || !event.preview) return null;
  return { peer, name: event.name ?? "", out: direction === "out", text: event.preview, id: event.id, at: event.receivedAt };
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

function mark(name: string, peer: string) {
  if (name.trim()) return name.trim().slice(0, 1).toUpperCase();
  return peer.replace(/\D/g, "").slice(-2) || "?";
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const same = date.toDateString() === today.toDateString();
  if (same) return "Hoje";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function ProvaWhatsAppClient({ initial }: { initial: Snapshot }) {
  const [snap, setSnap] = useState(initial);
  const [peer, setPeer] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tools, setTools] = useState(false);
  const [pairPhone, setPairPhone] = useState(initial.testNumber);
  const [pending, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  const threads = useMemo(() => threadsOf(snap.events), [snap.events]);
  const visible = threads.filter((thread) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${thread.name} ${formatWhatsApp(thread.peer)} ${thread.peer}`.toLowerCase().includes(q);
  });
  const listed = peer && !visible.some((thread) => thread.peer === peer) ? [{ peer, name: "", messages: [] }, ...visible] : visible;
  const active = threads.find((thread) => thread.peer === peer) ?? null;

  const reload = async () => {
    const next = await loadProofSnapshot();
    setSnap(next);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      loadProofSnapshot().then(setSnap).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [active?.messages.length, peer]);

  const run = (fn: () => Promise<void>) => {
    setError("");
    setNotice("");
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha na prova da Stevo.");
      }
    });
  };

  const openNumber = (raw: string) => {
    const next = normalizeWhatsApp(raw);
    if (next.length < 12) {
      setError("Informe o celular com DDD.");
      return;
    }
    setPeer(next);
    setNewNumber("");
    setError("");
  };

  const send = () => {
    const text = draft.trim();
    const target = peer || active?.peer || normalizeWhatsApp(newNumber);
    if (!text) return;
    if (!target) {
      setError("Abra o número do cliente antes de enviar.");
      return;
    }
    if (!snap.status.loggedIn) {
      setError("O WhatsApp está offline. Abra a conexão e espere ficar online.");
      return;
    }
    run(async () => {
      const sent = await sendProofText(target, text);
      setPeer(sent.number);
      setDraft("");
      setNewNumber("");
      await reload();
    });
  };

  const statusLabel = !snap.enabled ? "desligada" : !snap.configured ? "sem credencial" : snap.status.loggedIn ? "online" : "offline";

  return (
    <div className="-mt-2">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-[#008069] uppercase">Número conectado</div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">WhatsApp</h1>
        </div>
        <p className="hidden max-w-sm text-right text-[12px] text-muted sm:block">O vendedor lê e responde por aqui. A mensagem sai e entra no WhatsApp do número conectado.</p>
      </div>

      {error && <div className="mb-3 rounded-[8px] border border-brand/25 bg-brand-soft px-4 py-2.5 text-[13px] text-brand">{error}</div>}

      <div className="grid h-[calc(100dvh-248px)] min-h-[480px] overflow-hidden rounded-[10px] border border-[#d1d7db] bg-white shadow-card md:grid-cols-[340px_1fr]">
        <aside className={cn("flex min-h-0 flex-col border-[#d1d7db] bg-white md:border-r", peer && "hidden md:flex")}>
          <div className="flex h-[60px] items-center justify-between bg-[#f0f2f5] px-4">
            <div className="flex items-center gap-2">
              <span className="grid size-10 place-items-center rounded-full bg-[#00a884] text-[15px] font-semibold text-white">
                {(snap.status.name || "T").slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="text-[14px] font-semibold text-[#111b21]">{snap.status.name || "Tawper"}</div>
                <div className="text-[12px] text-[#667781]">{statusLabel} · {formatWhatsApp(snap.status.phone) || "sem sessão"}</div>
              </div>
            </div>
            <button type="button" onClick={() => setTools(true)} className="grid size-9 place-items-center rounded-full text-[#54656f] hover:bg-black/5" aria-label="Conexão">
              <Settings2 size={18} />
            </button>
          </div>
          <div className="border-b border-[#e9edef] px-3 py-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#54656f]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar ou começar uma conversa" className="h-9 w-full rounded-lg bg-[#f0f2f5] pr-3 pl-9 text-[13px] text-[#111b21] outline-none" />
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                openNumber(newNumber);
              }}
            >
              <input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="Novo número" className="h-8 min-w-0 flex-1 rounded-lg border border-[#e9edef] px-2 text-[12.5px] outline-none focus:border-[#00a884]" />
              <button type="submit" className="rounded-lg bg-[#00a884] px-2.5 text-[12px] font-semibold text-white">Abrir</button>
            </form>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {listed.map((thread) => {
              const last = thread.messages.at(-1);
              return (
                <li key={thread.peer}>
                  <button type="button" onClick={() => setPeer(thread.peer)} className={cn("flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#f5f6f6]", peer === thread.peer && "bg-[#f0f2f5]")}>
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#dfe5e7] text-[15px] font-semibold text-[#54656f]">
                      {mark(thread.name, thread.peer)}
                    </span>
                    <span className="min-w-0 flex-1 border-b border-[#e9edef] pb-3">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[16px] text-[#111b21]">{thread.name || formatWhatsApp(thread.peer)}</span>
                        <span className="ml-auto shrink-0 text-[12px] text-[#667781]">{last ? clock(last.at) : ""}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13.5px] text-[#667781]">{last?.out ? "Você: " : ""}{last?.text}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {listed.length === 0 && <li className="px-6 py-10 text-center text-[13px] text-[#667781]">Nenhuma mensagem ainda. Abra um número ou espere uma mensagem chegar.</li>}
          </ul>
        </aside>

        <section className={cn("min-h-0 flex-col bg-[#efeae2]", peer ? "flex" : "hidden md:flex")}>
          {peer ? (
            <>
              <header className="flex h-[60px] items-center gap-3 bg-[#f0f2f5] px-4">
                <button type="button" onClick={() => setPeer("")} className="grid size-9 place-items-center rounded-full text-[#54656f] md:hidden" aria-label="Voltar">
                  <ArrowLeft size={18} />
                </button>
                <span className="grid size-10 place-items-center rounded-full bg-[#dfe5e7] text-[14px] font-semibold text-[#54656f]">
                  {mark(active?.name ?? "", peer)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-medium text-[#111b21]">{active?.name || formatWhatsApp(peer)}</div>
                  <div className="text-[12.5px] text-[#667781]">{formatWhatsApp(peer)}</div>
                </div>
              </header>
              <div ref={scroller} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-[6%] py-4">
                {(active?.messages ?? []).map((message, index, list) => {
                  const previous = list[index - 1];
                  const showDay = !previous || dayLabel(previous.at) !== dayLabel(message.at);
                  return (
                    <div key={message.id}>
                      {showDay && (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-lg bg-white px-3 py-1 text-[12px] text-[#54656f] shadow-sm">{dayLabel(message.at)}</span>
                        </div>
                      )}
                      <div className={cn("flex", message.out ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[75%] rounded-lg px-2.5 py-1.5 text-[14.2px] leading-snug text-[#111b21] shadow-sm", message.out ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white")}>
                          <span className="whitespace-pre-wrap">{message.text}</span>
                          <span className="ml-2 inline-block translate-y-1 text-[11px] text-[#667781]">{clock(message.at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!active && <p className="mt-8 text-center text-[13px] text-[#54656f]">Conversa nova. Escreva a primeira mensagem abaixo.</p>}
              </div>
              <form
                className="flex items-end gap-2 bg-[#f0f2f5] px-4 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <textarea
                  value={draft}
                  rows={1}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Digite uma mensagem"
                  className="max-h-28 min-h-11 flex-1 resize-none rounded-lg border-0 bg-white px-3 py-3 text-[15px] text-[#111b21] outline-none"
                />
                <button type="submit" disabled={pending || !draft.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white disabled:opacity-40" aria-label="Enviar">
                  <SendHorizontal size={18} />
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center border-b-[6px] border-[#00a884] bg-[#f0f2f5] px-8 text-center">
              <div>
                <h2 className="text-[28px] font-light text-[#41525d]">Tawper WhatsApp</h2>
                <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-[#667781]">Selecione uma conversa para ler e responder o cliente. Uma mensagem nova aparece sozinha em alguns segundos.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {tools && (
        <Drawer onClose={() => setTools(false)} title="Conexão da prova" kicker="Stevo" width={460}>
          <div className="space-y-4 px-5 py-4 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Sessão</span>
              <Badge tone={snap.status.loggedIn ? "green" : "amber"}>{statusLabel}</Badge>
            </div>
            <p>Instância {snap.instance}. Telefone {formatWhatsApp(snap.status.phone) || "—"}. Nome {snap.status.name || "—"}.</p>
            {notice && <p className="rounded-[6px] bg-ok-soft px-3 py-2 text-ok">{notice}</p>}
            {snap.qr.image ? (
              <img src={snap.qr.image} alt="QR Code da Stevo" className="h-44 w-44 rounded-[8px] border border-line bg-white p-2" />
            ) : (
              <p className="text-muted">{snap.status.loggedIn ? "Sessão já conectada. O QR só aparece se desconectar." : "QR indisponível. Atualize."}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="dark" disabled={pending} onClick={() => run(async () => { await reload(); setNotice("Status atualizado."); })}>Atualizar status</Button>
              <Button size="sm" disabled={pending || snap.status.loggedIn} onClick={() => run(async () => { setSnap({ ...snap, qr: await refreshProofQr() }); setNotice("QR atualizado."); })}>Atualizar QR</Button>
            </div>
            <Field label="Celular para código de pareamento">
              <Input value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} placeholder="64 99939-4890" />
            </Field>
            <Button size="sm" disabled={pending} onClick={() => run(async () => {
              const result = await pairProofPhone(pairPhone);
              setNotice(`Código ${result.code} gerado para ${result.phone}.`);
            })}>Pedir código</Button>
            <div>
              <div className="text-[11px] text-muted">Recebimento</div>
              <p className="mt-1 text-[12.5px] text-muted">Clique uma vez se as mensagens chegam no celular e não aparecem aqui. A sessão pode piscar e voltar.</p>
              <div className="mt-2 break-all rounded-[6px] bg-soft px-3 py-2 text-[12px]">{snap.webhookUrl || "Falta APP_PUBLIC_URL e STEVO_WEBHOOK_TOKEN."}</div>
              <Button className="mt-2" size="sm" variant="dark" disabled={pending || !snap.webhookUrl} onClick={() => run(async () => {
                const registered = await registerProofWebhook();
                setNotice(`Recebimento ativado. Espere conectar de novo. ${registered.url}`);
                await reload();
              })}>Ativar recebimento</Button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
