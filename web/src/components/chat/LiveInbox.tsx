"use client";

import { ArrowLeft, MessageCircle, Search, Trash2, UserRound } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { ClientPanel } from "@/components/chat/ClientPanel";
import { ConversasReady } from "@/components/chat/ConversasLoading";
import { Badge, Button, Card, Empty, Select } from "@/components/ui/primitives";
import { canonicalWhatsApp, formatWhatsApp, normalizeWhatsApp } from "@/lib/br-ids";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { filterThreads, labelOf, sameChat, useLiveChat, type InboxTab, type Snapshot } from "./live-engine";
import { ChatAvatar, Composer, MessageList, ThreadRow } from "./live-parts";

export type { Snapshot } from "./live-engine";

/** Tela Conversas: lista, conversa e ficha do cliente em tela cheia. */
export function LiveInbox({ initial, selected: selectedPeer, onSelect }: { initial: Snapshot; selected: string; onSelect: (peer: string) => void }) {
  const chat = useLiveChat({ initial });
  const { agent, manager } = chat;
  const users = useStore((s) => s.users);
  const snap = chat.snap ?? initial;
  const [tab, setTab] = useState<InboxTab>("minhas");
  const [query, setQuery] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const [profileOpen, setProfileOpen] = useState(false);
  const selected = canonicalWhatsApp(selectedPeer);

  const { counts, visible } = filterThreads(chat.threads, { tab, query, agentId: agent.id, manager });
  const active = chat.threadOf(selected);
  const hidden = Boolean(active && !manager && active.ownerId && active.ownerId !== agent.id);
  const listed = selected && !visible.some((t) => sameChat(t.peer, selected)) && !active ? [{ peer: selected, name: "", ownerId: null, ownerName: "", unread: 0, messages: [] }, ...visible] : visible;
  const canErase = (thread: { ownerId: string | null }) => manager || !thread.ownerId || thread.ownerId === agent.id;
  const canTransfer = Boolean(active && (manager || active.ownerId === agent.id));
  const title = active ? labelOf(active.name, active.peer) : "";
  const ownerLabel = active?.ownerId ? (active.ownerId === agent.id ? "Você" : active.ownerName || "Outro atendente") : "Sem responsável";
  const tabs: { id: InboxTab; label: string }[] = [
    { id: "minhas", label: "Minhas" },
    { id: "fila", label: "Sem responsável" },
    ...(manager ? [{ id: "todas" as InboxTab, label: "Todas" }] : []),
  ];

  const { markRead } = chat;
  useEffect(() => {
    markRead(active);
  }, [active, markRead]);

  const select = (peer: string) => {
    setProfileOpen(false);
    onSelect(peer);
  };

  const run = (task: () => Promise<void>, done?: string) => {
    setError("");
    start(async () => {
      try {
        await task();
        if (done) setNotice(done);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível concluir.");
      }
    });
  };

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

  const removeConversation = (peer: string, label: string) => {
    if (!window.confirm(`Apagar a conversa com ${label}? Todas as mensagens somem do Tawper para todos os atendentes.`)) return;
    run(async () => {
      await chat.removeConversation(peer);
      if (sameChat(peer, selected)) select("");
    }, "Conversa apagada.");
  };

  const removeMessage = (id: string, scope: "me" | "everyone") => {
    const question =
      scope === "everyone" ? "Apagar para todos? A mensagem some também no WhatsApp do cliente." : "Apagar para mim? Ela some do Tawper para todos os atendentes, mas continua no celular e no WhatsApp do cliente.";
    if (!window.confirm(question)) return;
    run(() => chat.removeMessage(id, scope));
  };

  return (
    <div className="-mt-1">
      <ConversasReady />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="label">Central de conversas</div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Conversas</h1>
        </div>
        <div className="text-[12px] text-muted">
          WhatsApp de {snap.status.name || "Tawper"} · {chat.statusLabel} · atendendo como <span className="font-semibold text-ink">{agent.name || "—"}</span>
        </div>
      </div>
      {error && <div className="mb-3 rounded-[8px] border border-brand/25 bg-brand-soft px-4 py-2.5 text-[13px] text-brand">{error}</div>}
      {notice && <div className="mb-3 rounded-[8px] border border-ok/20 bg-ok-soft px-4 py-2.5 text-[13px] text-ok">{notice}</div>}
      <Card className="grid h-[calc(100dvh-190px)] min-h-[560px] grid-cols-1 overflow-hidden md:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr_320px]">
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
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                openNumber(newNumber);
              }}
            >
              <input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="Novo número" className="h-8 min-w-0 flex-1 rounded-[5px] border border-line px-2 text-[12.5px] outline-none focus:border-navy-3" />
              <Button size="sm" type="submit">
                Abrir
              </Button>
            </form>
          </div>
          <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {listed.map((thread) => (
              <ThreadRow
                key={thread.peer}
                thread={thread}
                agentId={agent.id}
                active={selected === thread.peer}
                busy={pending}
                onOpen={() => select(thread.peer)}
                onDelete={canErase(thread) ? () => removeConversation(thread.peer, labelOf(thread.name, thread.peer)) : undefined}
              />
            ))}
            {listed.length === 0 && <li className="px-4 py-10 text-center text-[12.5px] text-muted">{tab === "minhas" ? 'Nenhuma conversa com você. Veja a fila "Sem responsável".' : "Nenhuma conversa aqui."}</li>}
          </ul>
        </aside>

        <section className={cn("relative min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden md:flex")}>
          {selected && profileOpen && (
            <div className="absolute inset-0 z-30 flex flex-col bg-paper xl:hidden">
              <div className="flex items-center gap-2 border-b border-line bg-white px-3 py-2">
                <span className="flex-1 text-[13px] font-semibold text-ink">Ficha do cliente</span>
                <Button size="xs" variant="outline" onClick={() => setProfileOpen(false)}>
                  Voltar à conversa
                </Button>
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
                <ClientPanel peer={selected} name={active?.name} />
              </div>
            </div>
          )}
          {selected ? (
            <>
              <button type="button" onClick={() => select("")} className="flex items-center gap-1 border-b border-line px-3 py-2 text-[12.5px] font-semibold text-muted md:hidden">
                <ArrowLeft size={14} /> Conversas
              </button>
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
                <ChatAvatar name={active?.name ?? ""} peer={selected} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{title || formatWhatsApp(selected)}</div>
                  <div className="text-[11.5px] text-muted">
                    {formatWhatsApp(selected)} · responsável: <span className="font-medium text-ink">{ownerLabel}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" className="xl:hidden" onClick={() => setProfileOpen(true)}>
                    <UserRound size={14} /> Ficha
                  </Button>
                  {active?.ownerId !== agent.id && (!active?.ownerId || manager) && (
                    <Button size="sm" variant="dark" disabled={pending} onClick={() => run(() => chat.assign(selected, { id: agent.id, name: agent.name }), "Conversa assumida. Agora você responde por ela.")}>
                      Assumir
                    </Button>
                  )}
                  {active?.ownerId && canTransfer && (
                    <Button size="sm" disabled={pending} onClick={() => run(() => chat.assign(selected, null), "Conversa devolvida para a fila.")}>
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
                        if (to) run(() => chat.assign(selected, { id: to.id, name: to.short || to.name }), `Conversa transferida para ${to.short || to.name}.`);
                      }}
                    >
                      <option value="">Transferir para…</option>
                      {users
                        .filter((u) => u.id !== active?.ownerId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.short || u.name}
                          </option>
                        ))}
                    </Select>
                  )}
                  {active && canErase(active) && (
                    <Button size="sm" disabled={pending} onClick={() => removeConversation(active.peer, title || formatWhatsApp(active.peer))} className="gap-1.5 text-brand">
                      <Trash2 size={14} /> Apagar conversa
                    </Button>
                  )}
                </div>
              </div>
              <MessageList thread={active} canErase={Boolean(active && canErase(active))} hiddenOwner={hidden ? active?.ownerName || "outro atendente" : undefined} onRemove={removeMessage} />
              <Composer chat={chat} peer={selected} onError={setError} onSent={(number) => number !== selected && select(number)} />
            </>
          ) : (
            <div className="grid flex-1 place-items-center bg-[#f7f6f3]">
              <Empty icon={<MessageCircle size={20} />} title="Selecione uma conversa" text="Um único WhatsApp, vários atendentes. Assuma uma conversa da fila ou abra um número." />
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-soft/30 p-3 xl:flex">
          <div className="flex items-center gap-2 rounded-[8px] border border-line bg-white px-3 py-2 text-[12px]">
            <span className={cn("size-2 rounded-full", snap.status.loggedIn ? "bg-ok" : "bg-amber-500")} />
            <span className="min-w-0 flex-1 truncate text-muted">
              {snap.status.name || "Tawper"} · {formatWhatsApp(snap.status.phone) || "número não identificado"}
            </span>
            <Badge tone={snap.status.loggedIn ? "green" : "amber"}>{chat.statusLabel}</Badge>
          </div>
          {!snap.status.loggedIn && (
            <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-950">
              <p className="font-medium">WhatsApp desconectado</p>
              <p className="mt-0.5">Leia o QR no celular do número da Tawper para voltar a receber e enviar.</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado na hora, em data URL */}
              {snap.qr.image && <img src={snap.qr.image} alt="QR Code" className="mt-2 h-40 w-40 rounded-[8px] border border-line bg-white p-2" />}
              <Button size="sm" className="mt-2" disabled={pending} onClick={() => run(() => chat.refreshQr(), "QR atualizado.")}>
                Atualizar QR
              </Button>
            </div>
          )}
          <ClientPanel peer={selected} name={active?.name} />
        </aside>
      </Card>
    </div>
  );
}
