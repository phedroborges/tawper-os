"use client";

import { Loader2, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveInbox, type Snapshot } from "@/components/chat/LiveInbox";
import { isManager } from "@/lib/constants";
import { useCurrentUser } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { loadProofSnapshot } from "@/server/integrations/stevo-proof/actions";

const UNREAD_EVERY_MS = 20_000;

/** Mantém o contador de conversas não lidas do botão do WhatsApp (uma leitura leve a cada 20 s). */
export function InboxUnreadSync() {
  const user = useCurrentUser();
  const setLiveUnread = useUI((s) => s.setLiveUnread);
  const inboxOpen = useUI((s) => s.inbox.open);

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
  }, [user, setLiveUnread, inboxOpen]);

  return null;
}

/** Botão do topo: abre o inbox do WhatsApp na lateral, em qualquer tela. */
export function InboxButton() {
  const openInbox = useUI((s) => s.openInbox);
  const unread = useUI((s) => s.liveUnread);
  return (
    <button
      type="button"
      onClick={() => openInbox()}
      className="relative inline-flex h-10 items-center gap-2 rounded-[6px] px-2.5 text-[13.5px] text-muted transition-colors hover:bg-soft hover:text-ink"
      title="Abrir o WhatsApp"
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

/** Inbox lateral: o mesmo atendimento da tela Conversas, num painel por cima da tela atual. */
export function InboxDrawer() {
  const { inbox, openInbox, closeInbox } = useUI();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    if (!inbox.open) return;
    let alive = true;
    loadProofSnapshot().then(
      (next) => {
        if (!alive) return;
        setFailed("");
        setSnap(next);
      },
      (e: unknown) => alive && setFailed(e instanceof Error ? e.message : "Não foi possível abrir o WhatsApp."),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !useUI.getState().flow) closeInbox();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [inbox.open, closeInbox]);

  if (!inbox.open) return null;
  const ready = snap && snap.enabled && snap.configured;

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-ink/25 animate-fade-in" onMouseDown={closeInbox}>
      <aside className="flex h-full w-full max-w-[1180px] flex-col bg-white shadow-pop animate-slide-left" onMouseDown={(e) => e.stopPropagation()}>
        {ready ? (
          <LiveInbox initial={snap} variant="panel" selected={inbox.peer} onSelect={(peer) => openInbox(peer)} onClose={closeInbox} />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <MessageCircle size={18} className="text-ok" />
              <span className="flex-1 text-[15px] font-semibold text-ink">WhatsApp</span>
              <button type="button" onClick={closeInbox} className="grid size-8 place-items-center rounded-[6px] text-muted hover:bg-soft" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className={cn("grid flex-1 place-items-center p-6 text-center text-[13px] text-muted")}>
              {failed ? (
                <div>
                  <p className="text-brand">{failed}</p>
                  <button type="button" onClick={() => openInbox(inbox.peer)} className="mt-2 font-semibold text-navy-3 hover:underline">
                    Tentar de novo
                  </button>
                </div>
              ) : !snap ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Abrindo o WhatsApp…
                </span>
              ) : (
                <div>
                  <p>O WhatsApp integrado não está ligado neste ambiente.</p>
                  <Link href="/conversas" onClick={closeInbox} className="mt-2 inline-block font-semibold text-navy-3 hover:underline">
                    Ir para Conversas
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
