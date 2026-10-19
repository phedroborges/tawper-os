"use client";

import { ArrowLeft, Ellipsis, MessageCircle, Search, Trash2, UserRound, UserRoundCog } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { ClientPanel } from "@/components/chat/ClientPanel";
import { ConversasReady } from "@/components/chat/ConversasLoading";
import { MenuItem, Popover } from "@/components/ui/overlay";
import { Button, Empty } from "@/components/ui/primitives";
import { canonicalWhatsApp, formatWhatsApp, normalizeWhatsApp } from "@/lib/br-ids";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { filterThreads, labelOf, sameChat, useLiveChat, type InboxTab, type Snapshot } from "./live-engine";
import { ChatAvatar, Composer, MessageList, ThreadRow } from "./live-parts";

export type { Snapshot } from "./live-engine";

/*
 * Layout pelo espaço real do componente (container queries), não pela largura da janela:
 * recolher o menu lateral já dá espaço às colunas.
 *   < 720px   uma coluna (lista ou conversa)
 *   ≥ 720px   lista + conversa
 *   ≥ 1140px  lista + conversa + ficha do cliente
 * As colunas laterais crescem com a tela até um teto (lista 360px, ficha 440px); depois disso
 * só a conversa cresce. Nenhuma coluna fica abaixo do mínimo útil.
 */

/** Tela Conversas: lista, conversa e ficha do cliente usando toda a largura da tela. */
export function LiveInbox({ initial, selected: selectedPeer, onSelect }: { initial: Snapshot; selected: string; onSelect: (peer: string) => void }) {
  const chat = useLiveChat({ initial });
  const { agent, manager } = chat;
  const users = useStore((s) => s.users);
  const snap = chat.snap ?? initial;
  const [tab, setTab] = useState<InboxTab>("minhas");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const [profileOpen, setProfileOpen] = useState(false);
  const selected = canonicalWhatsApp(selectedPeer);

  const { counts, visible } = filterThreads(chat.threads, { tab, query, agentId: agent.id, manager });
  const active = chat.threadOf(selected);
  const hidden = Boolean(active && !manager && active.ownerId && active.ownerId !== agent.id);
  const listed = selected && !visible.some((t) => sameChat(t.peer, selected)) && !active ? [{ peer: selected, name: "", ownerId: null, ownerName: "", unread: 0, messages: [] }, ...visible] : visible;
  const typedNumber = normalizeWhatsApp(query);
  const canErase = (thread: { ownerId: string | null }) => manager || !thread.ownerId || thread.ownerId === agent.id;
  const canTransfer = Boolean(active && (manager || active.ownerId === agent.id));
  const title = active ? labelOf(active.name, active.peer) : "";
  const ownerLabel = active?.ownerId ? (active.ownerId === agent.id ? "você" : active.ownerName || "outro atendente") : "sem responsável";
  const tabs: { id: InboxTab; label: string }[] = [
    { id: "minhas", label: "Minhas" },
    { id: "fila", label: "Fila" },
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
    setNotice("");
    start(async () => {
      try {
        await task();
        if (done) setNotice(done);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível concluir.");
      }
    });
  };

  const openTyped = () => {
    if (typedNumber.length < 12) {
      setError("Informe o celular com DDD.");
      return;
    }
    setQuery("");
    setError("");
    select(typedNumber);
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
    <div className="@container">
      <ConversasReady />
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <h1 className="text-[19px] font-bold tracking-[-0.01em] text-ink">Conversas</h1>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
          <span className={cn("size-2 rounded-full", snap.status.loggedIn ? "bg-ok" : "bg-amber-500")} />
          {snap.status.name || "Tawper"} · {formatWhatsApp(snap.status.phone) || "número não identificado"} · {chat.statusLabel}
        </span>
        <span className="ml-auto text-[12px] text-muted">
          atendendo como <span className="font-semibold text-ink">{agent.name || "—"}</span>
        </span>
      </div>
      {(error || notice) && (
        <div className={cn("mb-2 rounded-[8px] border px-4 py-2 text-[13px]", error ? "border-brand/25 bg-brand-soft text-brand" : "border-ok/20 bg-ok-soft text-ok")}>{error || notice}</div>
      )}
      {!snap.status.loggedIn && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-950">
          <span className="font-medium">WhatsApp desconectado.</span>
          <span>Leia o QR no celular do número da Tawper para voltar a receber e enviar.</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado na hora, em data URL */}
          {snap.qr.image && <img src={snap.qr.image} alt="QR Code" className="h-28 w-28 rounded-[6px] border border-line bg-white p-1" />}
          <Button size="xs" disabled={pending} onClick={() => run(() => chat.refreshQr(), "QR atualizado.")}>
            Atualizar QR
          </Button>
        </div>
      )}

      <div
        className={cn(
          "grid h-[calc(100dvh-236px)] min-h-[460px] md:h-[calc(100dvh-182px)] md:min-h-[520px] grid-cols-1 overflow-hidden rounded-[10px] border border-line bg-white shadow-sm",
          "@min-[720px]:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]",
          "@min-[1140px]:grid-cols-[clamp(300px,22cqw,360px)_minmax(440px,1fr)_clamp(340px,27cqw,440px)]",
        )}
      >
        {/* Lista */}
        <aside className={cn("min-h-0 min-w-0 flex-col border-r border-line", selected ? "hidden @min-[720px]:flex" : "flex")}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex rounded-[7px] bg-soft p-0.5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2 py-1.5 text-[12.5px] font-medium transition-colors", tab === t.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
                >
                  {t.label}
                  <span className={cn("rounded-full px-1.5 text-[10.5px] leading-[17px]", tab === t.id ? "bg-navy text-white" : "bg-white text-muted")}>{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                if (!visible.length || typedNumber.length >= 12) openTyped();
              }}
            >
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar conversa ou digitar um número"
                className="h-9 w-full rounded-[7px] border border-line bg-[#fbfbfa] pr-3 pl-8 text-[12.5px] outline-none focus:border-navy-3"
              />
            </form>
          </div>
          <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {typedNumber.length >= 12 && !visible.some((t) => sameChat(t.peer, typedNumber)) && (
              <li className="border-b border-line/70">
                <button type="button" onClick={openTyped} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-soft/40">
                  <span className="grid size-10 place-items-center rounded-full bg-navy text-white">
                    <MessageCircle size={17} />
                  </span>
                  <span className="text-[13px] font-semibold text-navy-3">Conversar com {formatWhatsApp(typedNumber)}</span>
                </button>
              </li>
            )}
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
            {listed.length === 0 && typedNumber.length < 12 && (
              <li className="px-4 py-10 text-center text-[12.5px] text-muted">{tab === "minhas" ? 'Nenhuma conversa com você. Veja a "Fila".' : "Nenhuma conversa aqui."}</li>
            )}
          </ul>
        </aside>

        {/* Conversa */}
        <section className={cn("relative min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden @min-[720px]:flex")}>
          {selected && profileOpen && (
            <div className={"absolute inset-0 z-30 flex flex-col bg-paper @min-[1140px]:hidden"}>
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
              <div className="flex items-center gap-2.5 border-b border-line bg-white px-3 py-2.5">
                <button type="button" onClick={() => select("")} className={"grid size-8 place-items-center rounded-full text-muted hover:bg-soft @min-[720px]:hidden"} aria-label="Voltar para a lista">
                  <ArrowLeft size={16} />
                </button>
                <ChatAvatar name={active?.name ?? ""} peer={selected} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">{title || formatWhatsApp(selected)}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    {formatWhatsApp(selected)} · responsável: <span className="font-medium text-ink">{ownerLabel}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileOpen(true)}
                  title="Ficha do cliente"
                  aria-label="Ficha do cliente"
                  className="grid size-8 shrink-0 place-items-center rounded-[6px] border border-line bg-white text-muted hover:bg-soft hover:text-ink @min-[1140px]:hidden"
                >
                  <UserRound size={15} />
                </button>
                {active?.ownerId !== agent.id && (!active?.ownerId || manager) && (
                  <Button size="sm" variant="dark" disabled={pending} onClick={() => run(() => chat.assign(selected, { id: agent.id, name: agent.name }), "Conversa assumida. Agora você responde por ela.")}>
                    Assumir
                  </Button>
                )}
                {(canTransfer || (active && canErase(active))) && (
                  <Popover
                    className="w-60 py-1"
                    trigger={() => (
                      <span className="grid size-8 place-items-center rounded-[6px] border border-line bg-white text-muted hover:bg-soft hover:text-ink" aria-label="Mais ações">
                        <Ellipsis size={16} />
                      </span>
                    )}
                  >
                    {(close) => (
                      <div>
                        {active?.ownerId && canTransfer && (
                          <MenuItem
                            icon={<UserRoundCog size={14} />}
                            sub="volta para a fila"
                            onClick={() => {
                              close();
                              run(() => chat.assign(selected, null), "Conversa devolvida para a fila.");
                            }}
                          >
                            Liberar conversa
                          </MenuItem>
                        )}
                        {canTransfer && (
                          <>
                            <div className="label px-3 pt-1.5 pb-1">Transferir para</div>
                            {users
                              .filter((u) => u.id !== active?.ownerId)
                              .map((u) => (
                                <MenuItem
                                  key={u.id}
                                  icon={<UserRoundCog size={14} />}
                                  onClick={() => {
                                    close();
                                    run(() => chat.assign(selected, { id: u.id, name: u.short || u.name }), `Conversa transferida para ${u.short || u.name}.`);
                                  }}
                                >
                                  {u.short || u.name}
                                </MenuItem>
                              ))}
                          </>
                        )}
                        {active && canErase(active) && (
                          <>
                            <div className="my-1 h-px bg-line" />
                            <MenuItem
                              icon={<Trash2 size={14} />}
                              danger
                              onClick={() => {
                                close();
                                removeConversation(active.peer, title || formatWhatsApp(active.peer));
                              }}
                            >
                              Apagar conversa
                            </MenuItem>
                          </>
                        )}
                      </div>
                    )}
                  </Popover>
                )}
              </div>
              <MessageList thread={active} canErase={Boolean(active && canErase(active))} hiddenOwner={hidden ? active?.ownerName || "outro atendente" : undefined} onRemove={removeMessage} />
              <Composer chat={chat} peer={selected} onError={setError} onSent={(number) => number !== selected && select(number)} />
            </>
          ) : (
            <div className="grid flex-1 place-items-center bg-[#f7f6f3]">
              <Empty icon={<MessageCircle size={20} />} title="Selecione uma conversa" text="Um único WhatsApp, vários atendentes. Assuma uma conversa da fila ou digite um número na busca." />
            </div>
          )}
        </section>

        {/* Ficha do cliente */}
        <aside className={"hidden min-h-0 min-w-0 flex-col overflow-y-auto border-l border-line bg-soft/30 p-3 @min-[1140px]:flex"}>
          <ClientPanel peer={selected} name={active?.name} />
        </aside>
      </div>
    </div>
  );
}
