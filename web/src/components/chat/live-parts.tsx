"use client";

import { Ban, ChevronDown, Loader2, Mic, Paperclip, Send, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ForwardedLabel, MediaView, REVOKED_TEXT, visibleText, withoutSignature } from "@/components/chat/live-message";
import { outgoingReceipt, WhatsAppTicks } from "@/components/chat/WhatsAppTicks";
import { formatWhatsApp } from "@/lib/br-ids";
import { dayDiff, fmtDateShort, fmtTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { initialOf, labelOf, MAX_FILE_BYTES, type LiveChat, type Thread } from "./live-engine";

/** Bolinha com a inicial do contato. */
export function ChatAvatar({ name, peer, size = 40 }: { name: string; peer: string; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-[#e7f6ee] font-bold text-ok" style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}>
      {initialOf(name, peer)}
    </span>
  );
}

/** Uma conversa na lista: nome, número, responsável, última mensagem e não lidas. */
export function ThreadRow({
  thread,
  agentId,
  active,
  compact,
  busy,
  onOpen,
  onDelete,
}: {
  thread: Thread;
  agentId: string;
  active?: boolean;
  compact?: boolean;
  busy?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const last = thread.messages.at(-1);
  const when = last?.at ?? "";
  return (
    <li className="group relative">
      {onDelete && thread.messages.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="absolute right-2 bottom-2 z-10 grid size-7 place-items-center rounded-full bg-white text-muted opacity-0 shadow-sm group-hover:opacity-100 hover:text-brand focus:opacity-100 disabled:opacity-40"
          aria-label="Apagar conversa"
          title="Apagar conversa"
        >
          <Trash2 size={14} />
        </button>
      )}
      <button type="button" onClick={onOpen} className={cn("flex w-full items-start gap-2.5 border-b border-line/70 text-left hover:bg-soft/40", compact ? "px-3 py-2" : "px-3 py-2.5", active && "bg-soft")}>
        <ChatAvatar name={thread.name} peer={thread.peer} size={compact ? 36 : 40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate font-semibold text-ink", compact ? "text-[12.5px]" : "text-[13px]")}>{labelOf(thread.name, thread.peer)}</span>
            {when && <span className="ml-auto shrink-0 text-[10.5px] text-muted">{dayDiff(when) === 0 ? fmtTime(when) : fmtDateShort(when)}</span>}
          </span>
          {!compact && (
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[11.5px] text-muted">{formatWhatsApp(thread.peer)}</span>
              <span className={cn("ml-auto shrink-0 rounded-[3px] px-1 text-[10px] font-medium", thread.ownerId ? "bg-soft text-muted" : "bg-amber-50 text-amber-800")}>
                {thread.ownerId ? (thread.ownerId === agentId ? "você" : thread.ownerName || "atribuída") : "fila"}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1.5">
            {last?.out && <WhatsAppTicks receipt={outgoingReceipt(last)} />}
            <span className="block min-w-0 flex-1 truncate text-[12px] text-muted">
              {last?.out ? `${last.author || "Aparelho"}: ` : ""}
              {last ? (last.revoked ? REVOKED_TEXT : withoutSignature(last.text, last.author)) : "Conversa nova"}
            </span>
            {compact && !thread.ownerId && <span className="shrink-0 rounded-[3px] bg-amber-50 px-1 text-[10px] font-medium text-amber-800">fila</span>}
            {thread.unread > 0 && <span className="shrink-0 rounded-full bg-ok px-1.5 text-[10.5px] leading-[18px] font-semibold text-white">{thread.unread}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Mensagens com divisória por dia, menu de apagar e confirmações de leitura. */
export function MessageList({
  thread,
  canErase,
  hiddenOwner,
  compact,
  onRemove,
}: {
  thread: Thread | null;
  canErase: boolean;
  /** Conversa de outro atendente que este usuário não pode ler. */
  hiddenOwner?: string;
  compact?: boolean;
  onRemove: (id: string, scope: "me" | "everyone") => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const count = thread?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count, thread?.peer]);

  return (
    <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-[#efeae2]", compact ? "px-2.5 py-2" : "px-3 py-3 md:px-6")}>
      {hiddenOwner ? (
        <div className="mx-auto mt-10 max-w-xs rounded-[6px] bg-white/90 p-3 text-center text-[12.5px] text-muted">Esta conversa está com {hiddenOwner}.</div>
      ) : (
        <>
          {count === 0 && <div className="mx-auto mt-10 max-w-xs rounded-[6px] bg-white/90 p-3 text-center text-[12.5px] text-muted">Nenhuma mensagem ainda. Escreva abaixo.</div>}
          {(thread?.messages ?? []).map((message, index, list) => {
            const divider = index === 0 || list[index - 1].at.slice(0, 10) !== message.at.slice(0, 10);
            return (
              <div key={message.id}>
                {divider && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-[4px] bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-muted shadow-sm">{dayDiff(message.at) === 0 ? "Hoje" : fmtDateShort(message.at)}</span>
                  </div>
                )}
                <div className={cn("my-1 flex", message.out ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "group relative rounded-[8px] px-2.5 pt-1.5 pb-1 leading-snug shadow-[0_1px_0.5px_#0000001f]",
                      compact ? "max-w-[86%] text-[12.5px]" : "max-w-[78%] text-[13px]",
                      message.out ? "rounded-tr-[2px] bg-[#d9fdd3]" : "rounded-tl-[2px] bg-white",
                    )}
                  >
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
                          <button
                            type="button"
                            onClick={() => {
                              setMenuFor(null);
                              onRemove(message.id, "me");
                            }}
                            className="block w-full px-3 py-1.5 text-left text-ink hover:bg-soft"
                          >
                            Apagar para mim
                          </button>
                          {message.out && message.revocable && (
                            <button
                              type="button"
                              onClick={() => {
                                setMenuFor(null);
                                onRemove(message.id, "everyone");
                              }}
                              className="block w-full px-3 py-1.5 text-left text-brand hover:bg-soft"
                            >
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
                        {message.forwarded && <ForwardedLabel />}
                        {message.media && <MediaView id={message.id} kind={message.media} text={message.text} />}
                        {visibleText(message) && <span className="whitespace-pre-wrap text-ink">{visibleText(message)}</span>}
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
  );
}

/** Caixa de digitação: texto, anexo e áudio gravado. Cada janela tem a sua. */
export function Composer({
  chat,
  peer,
  compact,
  onSent,
  onError,
}: {
  chat: LiveChat;
  peer: string;
  compact?: boolean;
  /** Número final usado no envio (a Stevo pode corrigir o 9º dígito). */
  onSent?: (number: string) => void;
  onError: (message: string) => void;
}) {
  const thread = chat.threadOf(peer);
  const canReply = chat.canReply(thread);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fail = (cause: unknown, fallback: string) => onError(cause instanceof Error ? cause.message : fallback);

  const sendFile = async (file: File, caption: string) => {
    setSending(true);
    onError("");
    try {
      const number = await chat.sendFile(peer, file, caption);
      setAttachment(null);
      setDraft("");
      onSent?.(number);
    } catch (cause) {
      fail(cause, "Não foi possível enviar o arquivo.");
    } finally {
      setSending(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (attachment) {
      void sendFile(attachment, text);
      return;
    }
    if (!text) return;
    setDraft("");
    onError("");
    chat.sendText(peer, text).then(
      (number) => onSent?.(number),
      (cause: unknown) => {
        setDraft(text);
        fail(cause, "Não foi possível enviar.");
      },
    );
  };

  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("Este navegador não grava áudio. Anexe um arquivo de áudio.");
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
      onError("");
    } catch {
      onError("Permita o uso do microfone para gravar áudio.");
    }
  };

  const placeholder = recording
    ? "Gravando… clique no quadrado para enviar"
    : !canReply
      ? `Com ${thread?.ownerName || "outro atendente"}. Assuma para responder.`
      : attachment
        ? "Legenda (opcional)"
        : thread?.ownerId || compact
          ? "Digite uma mensagem"
          : "Digite uma mensagem (ao enviar, a conversa fica com você)";

  return (
    <>
      {attachment && (
        <div className="flex items-center gap-2 border-t border-line bg-white px-3 py-1.5 text-[12px]">
          <Paperclip size={13} className="text-muted" />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{attachment.name}</span>
          <span className="text-muted">{(attachment.size / 1024 / 1024).toFixed(1)} MB</span>
          <button type="button" onClick={() => setAttachment(null)} disabled={sending} className="grid size-6 place-items-center rounded-full text-muted hover:bg-soft hover:text-ink" aria-label="Remover anexo">
            <X size={13} />
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className={cn("flex items-center gap-1.5 border-t border-line bg-[#f6f6f4]", compact ? "px-2 py-2" : "gap-2 px-3 py-2.5")}
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (file && file.size > MAX_FILE_BYTES) {
              onError("Arquivo maior que 16 MB.");
              return;
            }
            setAttachment(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!canReply || sending || recording}
          className={cn("grid shrink-0 place-items-center rounded-full text-muted hover:bg-white hover:text-ink disabled:opacity-40", compact ? "size-8" : "size-10")}
          aria-label="Anexar arquivo"
          title="Anexar documento, imagem, vídeo ou áudio"
        >
          <Paperclip size={compact ? 16 : 18} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canReply || recording}
          placeholder={placeholder}
          className={cn("min-w-0 flex-1 rounded-full border border-transparent bg-white px-3.5 outline-none disabled:bg-soft", compact ? "h-9 text-[13px]" : "h-10 text-[13.5px]")}
        />
        {draft.trim() || attachment ? (
          <button type="submit" disabled={sending || !canReply} className={cn("grid shrink-0 place-items-center rounded-full bg-navy text-white disabled:opacity-40", compact ? "size-9" : "size-10")} aria-label="Enviar">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void toggleRecording()}
            disabled={!canReply || sending}
            className={cn("grid shrink-0 place-items-center rounded-full text-white disabled:opacity-40", compact ? "size-9" : "size-10", recording ? "animate-pulse bg-brand" : "bg-navy")}
            aria-label={recording ? "Parar e enviar áudio" : "Gravar áudio"}
            title={recording ? "Parar e enviar" : "Gravar áudio"}
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : recording ? <Square size={13} /> : <Mic size={16} />}
          </button>
        )}
      </form>
    </>
  );
}
