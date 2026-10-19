"use client";

import { ChevronDown, ChevronUp, Loader2, Maximize2, MessageCircle, Minus, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ClientPanel } from "@/components/chat/ClientPanel";
import { DueLabel, StagePill } from "@/components/crm/crm";
import { formatWhatsApp, normalizeWhatsApp } from "@/lib/br-ids";
import { isManager } from "@/lib/constants";
import { matchByPhone } from "@/lib/contact-match";
import { canSeeCompany, openDealOf, pendingOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { filterThreads, labelOf, useLiveChat, type InboxTab, type LiveChat } from "./live-engine";
import { ChatAvatar, Composer, MessageList, ThreadRow } from "./live-parts";

const UNREAD_EVERY_MS = 20_000;
const WINDOW_HEIGHT = "min(500px, calc(100dvh - 140px))";

/** Mantém o contador de conversas não lidas (leitura leve a cada 20 s, para o botão e o menu). */
export function InboxUnreadSync() {
  const user = useCurrentUser();
  const setLiveUnread = useUI((s) => s.setLiveUnread);
  const dockList = useUI((s) => s.dock.list);

  useEffect(() => {
    let stopped = false;
    const manager = isManager(user);
    const sync = async () => {
      if (stopped || document.hidden) return;
      try {
        const res = await fetch("/api/whatsapp/unread", { cache: "no-store" });
        const body = (await res.json()) as { live: boolean; conversations: { ownerId: string | null; unread: number }[] };
        if (!body.live) return setLiveUnread(null);
        setLiveUnread(body.conversations.filter((c) => manager || !c.ownerId || c.ownerId === user?.id).length);
      } catch {
        /* sem rede: mantém o último número */
      }
    };
    void sync();
    const timer = window.setInterval(sync, UNREAD_EVERY_MS);
    const onVisible = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, setLiveUnread, dockList]);

  return null;
}

/** Botão do topo: abre (ou recolhe) a lista de conversas no canto da tela. */
export function InboxButton() {
  const list = useUI((s) => s.dock.list);
  const setDockList = useUI((s) => s.setDockList);
  const unread = useUI((s) => s.liveUnread);
  return (
    <button
      type="button"
      onClick={() => setDockList(list === "open" ? "min" : "open")}
      className="relative inline-flex h-10 items-center gap-2 rounded-[6px] px-2.5 text-[13.5px] text-muted transition-colors hover:bg-soft hover:text-ink"
      title="Conversas do WhatsApp"
      aria-label={unread ? `WhatsApp, ${unread} conversa(s) não lida(s)` : "WhatsApp"}
    >
      <MessageCircle size={18} className="text-ok" />
      <span className="hidden lg:inline">WhatsApp</span>
      {Boolean(unread) && (
        <span className="absolute top-1 left-6 min-w-[18px] rounded-full bg-ok px-1 text-center text-[10.5px] leading-[18px] font-semibold text-white lg:static lg:ml-0.5">
          {unread! > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

function IconButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("grid size-7 shrink-0 place-items-center rounded-full transition-colors", active ? "bg-navy text-white" : "text-muted hover:bg-soft hover:text-ink")}
    >
      {children}
    </button>
  );
}

/** Moldura de uma janela do canto: cabeçalho clicável (minimiza/restaura) e corpo. */
function DockWindow({ header, min, onToggle, children, className }: { header: ReactNode; min: boolean; onToggle: () => void; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("pointer-events-auto flex w-[calc(100vw-16px)] flex-col overflow-hidden rounded-t-[12px] border border-b-0 border-line bg-white shadow-[0_-6px_28px_rgba(15,23,42,0.18)] sm:w-[340px]", className)}
      style={{ height: min ? 48 : WINDOW_HEIGHT }}
    >
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => e.key === "Enter" && onToggle()} className="flex h-12 shrink-0 cursor-pointer items-center gap-2 border-b border-line/70 px-2.5 select-none hover:bg-soft/40">
        {header}
      </div>
      {!min && children}
    </div>
  );
}

/** Faixa com a conta do cliente no topo da janela: empresa, etapa e próximo passo. */
function ClientStrip({ peer, onFicha }: { peer: string; onFicha: () => void }) {
  const s = useStore();
  const user = useCurrentUser();
  const match = useMemo(() => matchByPhone(peer, s.contacts, s.companies).find((m) => canSeeCompany(user, m.company)), [peer, s.contacts, s.companies, user]);
  if (!match)
    return (
      <button type="button" onClick={onFicha} className="flex w-full items-center gap-2 border-b border-line/70 bg-amber-50 px-3 py-1.5 text-left text-[11.5px] text-amber-900 hover:bg-amber-100">
        Número sem cadastro <span className="ml-auto font-semibold underline">Cadastrar ou vincular</span>
      </button>
    );
  const deal = openDealOf(s, match.company.id);
  const next = pendingOf(s, match.company.id)[0];
  return (
    <button type="button" onClick={onFicha} className="block w-full border-b border-line/70 bg-soft/50 px-3 py-1.5 text-left hover:bg-soft" title="Abrir a ficha do cliente">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[12px] font-semibold text-ink">{match.company.nome}</span>
        <span className="ml-auto shrink-0">
          <StagePill deal={deal} />
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
        {next ? (
          <>
            <span className="truncate">Próximo: {next.titulo}</span>
            <DueLabel iso={next.dueAt} className="shrink-0 text-[11px]" />
          </>
        ) : (
          <span className="text-brand">Sem próximo passo</span>
        )}
      </div>
    </button>
  );
}

/** Janela de uma conversa: mensagens e resposta, ou a ficha do cliente no lugar delas. */
function ChatWindow({ chat, peer, min, className }: { chat: LiveChat; peer: string; min: boolean; className?: string }) {
  const { toggleChatMin, closeChat, openInbox } = useUI();
  const [view, setView] = useState<"chat" | "ficha">("chat");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const thread = chat.threadOf(peer);
  const { agent, manager } = chat;
  const name = labelOf(thread?.name ?? "", peer);
  const hidden = Boolean(thread && !manager && thread.ownerId && thread.ownerId !== agent.id);
  const canErase = !thread?.ownerId || manager || thread.ownerId === agent.id;
  const mine = thread?.ownerId === agent.id;

  const { markRead } = chat;
  useEffect(() => {
    if (!min && view === "chat") markRead(thread);
  }, [min, view, thread, markRead]);

  const act = (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    task()
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Não foi possível concluir."))
      .finally(() => setBusy(false));
  };

  const removeMessage = (id: string, scope: "me" | "everyone") => {
    const question = scope === "everyone" ? "Apagar para todos? A mensagem some também no WhatsApp do cliente." : "Apagar para mim? Ela some do Tawper para todos os atendentes.";
    if (window.confirm(question)) act(() => chat.removeMessage(id, scope));
  };

  return (
    <DockWindow
      min={min}
      onToggle={() => toggleChatMin(peer)}
      className={className}
      header={
        <>
          <ChatAvatar name={thread?.name ?? ""} peer={peer} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] leading-tight font-semibold text-ink">{name}</div>
            <div className="truncate text-[11px] leading-tight text-muted">{formatWhatsApp(peer)}</div>
          </div>
          {min && Boolean(thread?.unread) && <span className="rounded-full bg-ok px-1.5 text-[10.5px] leading-[18px] font-semibold text-white">{thread!.unread}</span>}
          {!min && (
            <IconButton label={view === "ficha" ? "Voltar à conversa" : "Ficha do cliente"} active={view === "ficha"} onClick={() => setView(view === "ficha" ? "chat" : "ficha")}>
              <UserRound size={15} />
            </IconButton>
          )}
          <Link href={`/conversas?c=${peer}`} onClick={(e) => e.stopPropagation()} title="Abrir na tela Conversas" aria-label="Abrir na tela Conversas" className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink">
            <Maximize2 size={14} />
          </Link>
          <IconButton label={min ? "Abrir" : "Minimizar"} onClick={() => toggleChatMin(peer)}>
            {min ? <ChevronUp size={16} /> : <Minus size={16} />}
          </IconButton>
          <IconButton label="Fechar" onClick={() => closeChat(peer)}>
            <X size={16} />
          </IconButton>
        </>
      }
    >
      {view === "ficha" ? (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-paper p-2.5">
          <ClientPanel peer={peer} name={thread?.name} />
        </div>
      ) : (
        <>
          <ClientStrip peer={peer} onFicha={() => setView("ficha")} />
          {!mine && (
            <div className="flex items-center gap-2 border-b border-line/70 bg-white px-3 py-1.5 text-[11.5px]">
              <span className="min-w-0 flex-1 truncate text-muted">{thread?.ownerId ? `Com ${thread.ownerName || "outro atendente"}` : "Sem responsável"}</span>
              {(!thread?.ownerId || manager) && (
                <button type="button" disabled={busy} onClick={() => act(() => chat.assign(peer, { id: agent.id, name: agent.name }))} className="font-semibold text-navy-3 hover:underline disabled:opacity-50">
                  Assumir
                </button>
              )}
            </div>
          )}
          {error && <div className="border-b border-brand/20 bg-brand-soft px-3 py-1.5 text-[11.5px] text-brand">{error}</div>}
          <MessageList thread={thread} canErase={canErase} hiddenOwner={hidden ? thread?.ownerName || "outro atendente" : undefined} compact onRemove={removeMessage} />
          <Composer chat={chat} peer={peer} compact onError={setError} onSent={(number) => number !== peer && openInbox(number)} />
        </>
      )}
    </DockWindow>
  );
}

/** Janela da lista: conversas do atendente, fila e busca; clicar abre a conversa ao lado. */
function ListWindow({ chat, className }: { chat: LiveChat; className?: string }) {
  const { dock, setDockList, openInbox } = useUI();
  const unread = useUI((s) => s.liveUnread);
  const [tab, setTab] = useState<InboxTab>("minhas");
  const [query, setQuery] = useState("");
  const min = dock.list !== "open";
  const { counts, visible } = filterThreads(chat.threads, { tab, query, agentId: chat.agent.id, manager: chat.manager });
  const tabs: { id: InboxTab; label: string }[] = [
    { id: "minhas", label: "Minhas" },
    { id: "fila", label: "Fila" },
    ...(chat.manager ? [{ id: "todas" as InboxTab, label: "Todas" }] : []),
  ];
  const typedNumber = normalizeWhatsApp(query);

  return (
    <DockWindow
      min={min}
      onToggle={() => setDockList(min ? "open" : "min")}
      className={className}
      header={
        <>
          <span className="grid size-8 place-items-center rounded-full bg-[#e7f6ee] text-ok">
            <MessageCircle size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] leading-tight font-semibold text-ink">WhatsApp</div>
            <div className="truncate text-[11px] leading-tight text-muted">{chat.loaded ? (chat.ready ? `${chat.snap?.status.name || "Tawper"} · ${chat.statusLabel}` : "não ligado") : "abrindo…"}</div>
          </div>
          {Boolean(unread) && <span className="rounded-full bg-ok px-1.5 text-[10.5px] leading-[18px] font-semibold text-white">{unread}</span>}
          <Link href="/conversas" onClick={(e) => e.stopPropagation()} title="Abrir a tela Conversas" aria-label="Abrir a tela Conversas" className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink">
            <Maximize2 size={14} />
          </Link>
          <IconButton label={min ? "Abrir" : "Minimizar"} onClick={() => setDockList(min ? "open" : "min")}>
            {min ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
          <IconButton label="Fechar" onClick={() => setDockList("closed")}>
            <X size={16} />
          </IconButton>
        </>
      }
    >
      {!chat.loaded ? (
        <div className="grid flex-1 place-items-center text-[12.5px] text-muted">
          {chat.loadError ? (
            <span className="px-4 text-center text-brand">{chat.loadError}</span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" /> Abrindo o WhatsApp…
            </span>
          )}
        </div>
      ) : !chat.ready ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-[12.5px] text-muted">
          <div>
            <p>O WhatsApp integrado não está ligado neste ambiente.</p>
            <Link href="/conversas" className="mt-2 inline-block font-semibold text-navy-3 hover:underline">
              Ir para Conversas
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2 border-b border-line/70 p-2.5">
            <div className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn("flex-1 rounded-full px-2 py-1 text-[11.5px] font-medium", tab === t.id ? "bg-navy text-white" : "bg-soft text-muted hover:text-ink")}
                >
                  {t.label} <span className="opacity-70">{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typedNumber.length >= 12 && !visible.length) {
                    openInbox(typedNumber);
                    setQuery("");
                  }
                }}
                placeholder="Buscar ou digitar um número"
                className="h-8 w-full rounded-full border border-line bg-[#fbfbfa] pr-3 pl-8 text-[12.5px] outline-none focus:border-navy-3"
              />
            </div>
          </div>
          <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {visible.map((thread) => (
              <ThreadRow key={thread.peer} thread={thread} agentId={chat.agent.id} compact active={dock.chats.some((c) => c.peer === thread.peer)} onOpen={() => openInbox(thread.peer)} />
            ))}
            {!visible.length && (
              <li className="px-4 py-8 text-center text-[12px] text-muted">
                {typedNumber.length >= 12 ? (
                  <button
                    type="button"
                    onClick={() => {
                      openInbox(typedNumber);
                      setQuery("");
                    }}
                    className="font-semibold text-navy-3 hover:underline"
                  >
                    Conversar com {formatWhatsApp(typedNumber)}
                  </button>
                ) : tab === "minhas" ? (
                  'Nenhuma conversa com você. Veja a "Fila".'
                ) : (
                  "Nenhuma conversa aqui."
                )}
              </li>
            )}
          </ul>
        </>
      )}
    </DockWindow>
  );
}

/**
 * Conversas no canto da tela, como o Messenger: a lista e as conversas abertas ficam em janelas
 * pequenas que minimizam e não bloqueiam o resto do sistema. Some na tela Conversas.
 */
export function ChatDock() {
  const pathname = usePathname();
  const dock = useUI((s) => s.dock);
  const onConversas = pathname.startsWith("/conversas");
  const visible = !onConversas && (dock.list !== "closed" || dock.chats.length > 0);
  const expanded = dock.list === "open" || dock.chats.some((c) => !c.min);
  const chat = useLiveChat({ enabled: visible, intervalMs: expanded ? 1500 : 6000 });

  if (!visible) return null;
  // A conversa mais recente fica colada na lista (à direita), como no Messenger.
  const chats = [...dock.chats].reverse();
  const chatOpenOnPhone = dock.chats.some((c) => !c.min);

  return (
    <div className="pointer-events-none fixed right-2 bottom-16 z-[60] flex items-end gap-2 md:right-5 md:bottom-0">
      {chat.ready &&
        chats.map((c, i) => (
          <ChatWindow key={c.peer} chat={chat} peer={c.peer} min={c.min} className={i < chats.length - 1 ? "hidden sm:flex" : undefined} />
        ))}
      {dock.list !== "closed" && <ListWindow chat={chat} className={chatOpenOnPhone ? "hidden sm:flex" : undefined} />}
    </div>
  );
}
