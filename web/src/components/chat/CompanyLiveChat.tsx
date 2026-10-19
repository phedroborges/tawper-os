"use client";

import { Ban, ExternalLink, Loader2, MessageCircle, Paperclip, Send, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ConversationAI } from "@/components/chat/Chat";
import { ForwardedLabel, MediaView, REVOKED_TEXT, visibleText } from "@/components/chat/live-message";
import { outgoingReceipt, WhatsAppTicks } from "@/components/chat/WhatsAppTicks";
import { Badge, Button, Empty } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import { dayDiff, fmtDateShort, fmtTime } from "@/lib/dates";
import { formatWhatsApp, normalizeWhatsApp } from "@/lib/br-ids";
import { useCurrentUser } from "@/lib/store";
import type { Company, Contact, Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  assignProofConversation,
  loadCompanyChat,
  markProofRead,
  sendProofText,
  type Agent,
  type CompanyChatSnapshot,
} from "@/server/integrations/stevo-proof/actions";
import type { MediaKind, MessageReceipt } from "@/server/integrations/stevo-proof/events";

type LiveMessage = { id: string; at: string; text: string; out: boolean; author: string; media?: MediaKind; revoked?: boolean; receipt?: MessageReceipt; forwarded?: boolean };

export type CompanyThread = {
  contact: Contact;
  peer: string;
  messages: LiveMessage[];
  ownerId: string | null;
  ownerName: string;
  unread: number;
};

/** O WhatsApp pode entregar o celular com ou sem o 9º dígito; os dois formatos são o mesmo contato. */
function variantsOf(phone: string) {
  const digits = normalizeWhatsApp(phone);
  if (digits.length === 12) return [digits, `${digits.slice(0, 4)}9${digits.slice(4)}`];
  if (digits.length === 13 && digits[4] === "9") return [digits, `${digits.slice(0, 4)}${digits.slice(5)}`];
  return digits ? [digits] : [];
}

export function useCompanyChat(contacts: Contact[]) {
  const phones = useMemo(() => contacts.map((c) => c.whatsapp ?? "").filter(Boolean), [contacts]);
  const key = phones.join(",");
  const [data, setData] = useState<CompanyChatSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef(true);

  const refresh = useCallback(
    () =>
      loadCompanyChat(phones).then(
        (next) => {
          live.current = next.live;
          setFailed(false);
          setData(next);
        },
        () => setFailed(true),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const poll = useCallback(() => {
    if (!phones.length) return Promise.resolve();
    return fetch(`/api/whatsapp/live?peers=${encodeURIComponent(phones.join(","))}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((feed: { events?: CompanyChatSnapshot["events"]; conversations?: CompanyChatSnapshot["conversations"] } | null) => {
        if (!feed?.events) return;
        setFailed(false);
        setData((current) =>
          current
            ? { ...current, events: feed.events ?? [], conversations: feed.conversations ?? current.conversations }
            : { live: true, status: { configured: true, connected: true, loggedIn: true, proxy: false, name: "", phone: "" }, events: feed.events ?? [], conversations: feed.conversations ?? [] },
        );
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    refresh();
    let busy = false;
    const tick = () => {
      if (busy || !live.current || document.visibilityState === "hidden") return;
      busy = true;
      poll().finally(() => {
        busy = false;
      });
    };
    const timer = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, poll]);

  const threads = useMemo<CompanyThread[]>(() => {
    if (!data?.live) return [];
    const ordered = [...data.events].reverse();
    return contacts
      .filter((contact) => contact.whatsapp)
      .map((contact) => {
        const variants = new Set(variantsOf(contact.whatsapp!));
        const messages: LiveMessage[] = [];
        let peer = "";
        for (const event of ordered) {
          if (!variants.has(event.peer ?? "")) continue;
          if (event.direction !== "in" && event.direction !== "out") continue;
          if (!event.preview && !event.revoked) continue;
          peer = event.peer!;
          messages.push({ id: event.id, at: event.receivedAt, text: event.preview, out: event.direction === "out", author: event.authorName ?? "", media: event.mediaKind, revoked: event.revoked, receipt: event.receipt, forwarded: event.forwarded });
        }
        const convs = data.conversations.filter((c) => variants.has(c.peer));
        const owned = convs.find((c) => c.ownerId);
        return {
          contact,
          peer: peer || normalizeWhatsApp(contact.whatsapp),
          messages,
          ownerId: owned?.ownerId ?? null,
          ownerName: owned?.ownerName ?? "",
          unread: convs.reduce((sum, c) => sum + c.unread, 0),
        };
      })
      .sort((a, b) => (b.messages.at(-1)?.at ?? "").localeCompare(a.messages.at(-1)?.at ?? ""));
  }, [data, contacts]);

  const loading = !data && !failed;
  return { data, loading, threads, refresh, poll, unread: threads.reduce((sum, t) => sum + t.unread, 0) };
}

export function CompanyLiveChat({
  company,
  chat,
  contactId,
  onSelectContact,
  onAddContact,
}: {
  company: Company;
  chat: ReturnType<typeof useCompanyChat>;
  contactId: string | null;
  onSelectContact: (id: string) => void;
  onAddContact: () => void;
}) {
  const user = useCurrentUser();
  const manager = isManager(user);
  const agent: Agent = useMemo(() => ({ id: user?.id ?? "", name: user?.short || user?.name || "", role: user?.role ?? "vendedor" }), [user]);
  const { data, threads, refresh, poll } = chat;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const active = threads.find((t) => t.contact.id === contactId) ?? threads[0];
  const canReply = Boolean(active && (!active.ownerId || active.ownerId === agent.id));
  const online = Boolean(data?.status.loggedIn);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages.length, active?.peer]);

  useEffect(() => {
    if (!active?.unread || !agent.id) return;
    if (active.ownerId && active.ownerId !== agent.id) return;
    markProofRead(active.peer, agent).then(refresh).catch(() => undefined);
  }, [active?.peer, active?.unread, active?.ownerId, agent, refresh]);

  const conv = useMemo<Conversation | null>(() => {
    if (!active) return null;
    return {
      id: `live-${active.peer}`,
      companyId: company.id,
      contactId: active.contact.id,
      contatoNome: active.contact.nome,
      telefone: active.peer,
      ownerId: active.ownerId ?? company.ownerId,
      messages: active.messages.filter((m) => !m.revoked).map((m) => ({ id: m.id, from: m.out ? "tawper" : "cliente", text: visibleText(m), at: m.at })),
      unread: active.unread,
      lastAt: active.messages.at(-1)?.at ?? "",
    };
  }, [active, company.id, company.ownerId]);

  if (!data) {
    return (
      <div className="grid h-[300px] place-items-center text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-2">
          <Loader2 size={15} className="animate-spin" /> Buscando conversas do WhatsApp…
        </span>
      </div>
    );
  }

  if (!active) {
    return (
      <Empty
        icon={<MessageCircle size={20} />}
        title="Nenhum contato com WhatsApp"
        text="Cadastre o WhatsApp de um contato desta empresa: as conversas desse número aparecem aqui e na central de conversas."
        action={
          <Button variant="success" onClick={onAddContact}>
            <UserPlus size={15} /> Adicionar contato
          </Button>
        }
      />
    );
  }

  const check = () => {
    if (!online) {
      setError("O WhatsApp está offline. Espere a sessão voltar ou atualize o QR na central de conversas.");
      return false;
    }
    if (!canReply) {
      setError(`Esta conversa está com ${active.ownerName || "outro atendente"}. Assuma para responder.`);
      return false;
    }
    return true;
  };

  const sendFile = async (file: File, caption: string) => {
    if (!check()) return;
    const form = new FormData();
    form.set("file", file);
    form.set("to", active.peer);
    form.set("caption", caption);
    form.set("agentId", agent.id);
    form.set("agentName", agent.name);
    form.set("agentRole", agent.role);
    setUploading(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/send-media", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Não foi possível enviar o arquivo.");
      setAttachment(null);
      setDraft("");
      await poll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (attachment) {
      void sendFile(attachment, text);
      return;
    }
    if (!text || !check()) return;
    setDraft("");
    setError("");
    start(async () => {
      try {
        await sendProofText(active.peer, text, agent);
        await poll();
      } catch (cause) {
        setDraft(text);
        setError(cause instanceof Error ? cause.message : "Não foi possível enviar.");
      }
    });
  };

  const assume = () => {
    setError("");
    start(async () => {
      try {
        await assignProofConversation(active.peer, { id: agent.id, name: agent.name }, agent);
        await poll();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível assumir a conversa.");
      }
    });
  };

  const ownerLabel = active.ownerId ? `com ${active.ownerId === agent.id ? "você" : active.ownerName || "outro atendente"}` : "sem responsável";
  const hidden = Boolean(!manager && active.ownerId && active.ownerId !== agent.id);

  return (
    <div className="grid lg:grid-cols-[1fr_300px]">
      <div className="flex h-[560px] min-h-0 flex-col">
        {threads.length > 1 && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-line bg-white px-3 py-2">
            {threads.map((t) => (
              <button
                key={t.contact.id}
                type="button"
                onClick={() => onSelectContact(t.contact.id)}
                className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium", t.contact.id === active.contact.id ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:border-navy/40")}
              >
                {t.contact.nome}
                <span className="opacity-70">{t.messages.length ? t.messages.length : "sem conversa"}</span>
                {t.unread > 0 && <span className="rounded-full bg-ok px-1.5 text-[10px] leading-[16px] font-semibold text-white">{t.unread}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-white px-4 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e7f6ee] text-[13px] font-bold text-ok">{active.contact.nome[0]?.toUpperCase()}</span>
          <div className="min-w-[160px] flex-1">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
              <span className="truncate">{active.contact.nome}</span>
              <Badge tone={online ? "green" : "amber"}>{online ? "online" : "offline"}</Badge>
            </div>
            <div className="truncate text-[11.5px] text-muted">
              {formatWhatsApp(active.peer)} · <span className="font-medium text-ink">{ownerLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {active.ownerId !== agent.id && (!active.ownerId || manager) && (
              <Button size="sm" variant="dark" disabled={pending} onClick={assume}>
                Assumir
              </Button>
            )}
            <Link href={`/conversas?c=${active.peer}`} className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-navy-3 hover:text-brand">
              Abrir na central <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-3 md:px-6">
          {hidden ? (
            <div className="mx-auto mt-10 max-w-xs rounded-[6px] bg-white/90 p-3 text-center text-[12.5px] text-muted">Esta conversa está com {active.ownerName || "outro atendente"}.</div>
          ) : (
            <>
              {active.messages.length === 0 && (
                <div className="mx-auto mt-10 max-w-xs rounded-[6px] bg-white/90 p-3 text-center text-[12.5px] text-muted">
                  Nenhuma mensagem com {formatWhatsApp(active.peer)} ainda. Escreva abaixo: a conversa também aparece na central.
                </div>
              )}
              {active.messages.map((message, index, list) => {
                const divider = index === 0 || list[index - 1].at.slice(0, 10) !== message.at.slice(0, 10);
                const text = visibleText(message);
                return (
                  <div key={message.id}>
                    {divider && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-[4px] bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-muted shadow-sm">{dayDiff(message.at) === 0 ? "Hoje" : fmtDateShort(message.at)}</span>
                      </div>
                    )}
                    <div className={cn("my-1 flex", message.out ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[78%] rounded-[8px] px-2.5 pt-1.5 pb-1 text-[13px] leading-snug shadow-[0_1px_0.5px_#0000001f]", message.out ? "rounded-tr-[2px] bg-[#d9fdd3]" : "rounded-tl-[2px] bg-white")}>
                        {message.revoked ? (
                          <span className="inline-flex items-center gap-1 text-muted italic" title={REVOKED_TEXT}>
                            <Ban size={13} /> {message.out ? "Você apagou esta mensagem" : "Esta mensagem foi apagada"}
                          </span>
                        ) : (
                          <>
                            {message.forwarded && <ForwardedLabel />}
                            {message.media && <MediaView id={message.id} kind={message.media} text={message.text} />}
                            {text && <span className="whitespace-pre-wrap text-ink">{text}</span>}
                          </>
                        )}
                        <span className="float-right mt-1 ml-2 inline-flex items-center gap-0.5 text-[10.5px] text-muted">
                          {message.out && <span className="mr-1 font-medium">{message.author || "pelo aparelho"} ·</span>}
                          {fmtTime(message.at)}
                          {message.out && <WhatsAppTicks receipt={outgoingReceipt(message)} />}
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

        {error && <div className="border-t border-brand/25 bg-brand-soft px-4 py-2 text-[12.5px] text-brand">{error}</div>}
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
            disabled={!canReply || uploading}
            className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-white hover:text-ink disabled:opacity-40"
            aria-label="Anexar arquivo"
          >
            <Paperclip size={18} />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canReply}
            placeholder={
              !canReply
                ? `Conversa com ${active.ownerName || "outro atendente"}. Assuma para responder.`
                : attachment
                  ? "Legenda (opcional)"
                  : active.ownerId
                    ? "Digite uma mensagem"
                    : "Digite uma mensagem (ao enviar, a conversa fica com você)"
            }
            className="h-10 min-w-0 flex-1 rounded-full border border-transparent bg-white px-4 text-[13.5px] outline-none disabled:bg-soft"
          />
          <button type="submit" disabled={pending || uploading || !canReply || (!draft.trim() && !attachment)} className="grid size-10 shrink-0 place-items-center rounded-full bg-ok text-white hover:bg-[#12895f] disabled:opacity-40" aria-label="Enviar">
            {uploading || pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={17} />}
          </button>
        </form>
      </div>
      <div className="border-t border-line p-3 lg:border-t-0 lg:border-l">{conv && <ConversationAI key={conv.id} conv={conv} compact />}</div>
    </div>
  );
}
