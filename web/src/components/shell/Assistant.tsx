"use client";

import { ArrowUpRight, RotateCcw, Send, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { ASSISTANT_STARTERS, type AssistantMessage, type AssistantReply } from "@/lib/assistant-contract";
import { useCurrentUser } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

type ChatMessage = AssistantMessage & { id: number; answer?: AssistantReply };

async function sessionHeaders(): Promise<Record<string, string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return {};
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key);
  const { data } = await client.auth.getSession();
  // Token is verified on the server. UI profile is never authorization.
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export function AssistantPanel() {
  const user = useCurrentUser();
  return <AssistantConversation key={user.id} />;
}

function AssistantConversation() {
  const { assistantOpen, setAssistant } = useUI();
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy, error]);
  useEffect(() => () => controller.current?.abort(), []);

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setMessages((current) => current.at(-1)?.role === "user" ? current.slice(0, -1) : current);
    setError("Consulta cancelada. Você pode enviar outra pergunta.");
  };

  const reset = () => {
    controller.current?.abort();
    controller.current = null;
    setMessages([]);
    setError(null);
    setText("");
    setBusy(false);
  };

  const ask = async (question: string) => {
    const content = question.trim();
    if (!content || controller.current) return;
    const pending = new AbortController();
    controller.current = pending;
    const history = messages.slice(-22).map(({ role, content }) => ({ role, content }));
    if (history[0]?.role === "assistant") history.shift();
    const nextMessages: AssistantMessage[] = [...history, { role: "user", content }];
    setMessages((current) => [...current, { id: ++sequence.current, role: "user", content }]);
    setText("");
    setError(null);
    setBusy(true);
    try {
      const company = pathname.match(/^\/empresas\/([0-9a-f-]{36})(?:\/|$)/i)?.[1] ?? null;
      const headers = await sessionHeaders();
      const result = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ messages: nextMessages, context: { companyId: company, page: pathname } }),
        signal: pending.signal,
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error ?? "Não foi possível consultar o assistente.");
      if (controller.current !== pending) return;
      const answer = body as AssistantReply;
      setMessages((current) => [...current, { id: ++sequence.current, role: "assistant", content: answer.text, answer }]);
    } catch (failure) {
      if (controller.current !== pending) return;
      setMessages((current) => current.slice(0, -1));
      setText(content);
      setError(failure instanceof Error ? failure.message : "Falha na consulta. Tente novamente.");
    } finally {
      if (controller.current === pending) { controller.current = null; setBusy(false); }
    }
  };

  if (!assistantOpen) return null;
  return (
    <Drawer onClose={() => setAssistant(false)} title="Pergunte à Tawper IA" kicker="Assistente geral · fontes internas" width={480}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-2">
          <span className="text-[11px] text-muted">CRM e materiais da Tawper · sem busca na internet</span>
          <button onClick={reset} className="flex items-center gap-1 text-[11px] text-navy-3" type="button" aria-label="Nova conversa"><RotateCcw size={12} /> Nova conversa</button>
        </div>
        <div className="flex-1 space-y-3 px-5 py-4" role="log" aria-label="Conversa com a Tawper IA" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && (
            <div className="rounded-[8px] border border-line bg-soft/40 p-4">
              <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink"><Sparkles size={15} className="text-ai" /> Como posso ajudar?</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Pergunte sobre clientes, visitas, produtos e diferenciais. Consulto as fontes disponíveis e indico quando falta informação. Você pode continuar a conversa para aprofundar a resposta.</p>
              <p className="mt-2 text-[11.5px] text-muted">Base inicial: apresentação comercial Tawper. Especificações técnicas e disponibilidade dependem de documentação adicional.</p>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[95%] min-w-0 rounded-[8px] px-3 py-2 text-[13px] leading-relaxed", message.role === "user" ? "bg-navy text-white" : "border border-line bg-white text-ink")}>
                {message.role === "assistant" && <div className="mb-1 flex items-center gap-1 text-[11px] text-ai"><Sparkles size={11} /> Tawper IA</div>}
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                {Boolean(message.answer?.sources.length) && (
                  <div className="mt-3 border-t border-line pt-2">
                    <span className="text-[11px] font-medium text-muted">Fontes consultadas</span>
                    {message.answer!.sources.map((source) => (
                      <details key={source.id} className="mt-1 rounded border border-line px-2 py-1.5 text-[11.5px]">
                        <summary className="cursor-pointer text-navy-3">{source.title}</summary>
                        <div className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-muted">{source.excerpt}</div>
                        {source.href && <Link href={source.href} onClick={() => setAssistant(false)} className="mt-2 inline-flex items-center gap-1 text-ai">Abrir registro <ArrowUpRight size={12} /></Link>}
                      </details>
                    ))}
                  </div>
                )}
                {message.answer?.mode === "local_preview" && <p className="mt-2 text-[10.5px] text-muted">Prévia local · sem identidade autenticada</p>}
              </div>
            </div>
          ))}
          {busy && <div role="status" className="flex items-center gap-2 text-[12.5px] text-ai"><Sparkles size={13} className="animate-pulse" /> Consultando fontes e preparando a resposta…</div>}
          {error && <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-950">{error}</p>}
          <div ref={endRef} />
        </div>
        <div className="sticky bottom-0 border-t border-line bg-white px-4 py-3">
          <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
            {ASSISTANT_STARTERS.map((suggestion) => <button key={suggestion} type="button" disabled={busy} onClick={() => void ask(suggestion)} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-navy-3 hover:border-ai disabled:opacity-50">{suggestion}</button>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void ask(text); }} className="flex gap-2">
            <input value={text} onChange={(event) => setText(event.target.value)} maxLength={6000} aria-label="Pergunta para a Tawper IA" placeholder="Pergunte sobre clientes, visitas ou produtos…" className="h-10 min-w-0 flex-1 rounded-[5px] border border-line px-3 text-[13px] outline-none focus:border-ai" />
            {busy ? <button type="button" onClick={cancel} className="grid size-10 place-items-center rounded-[5px] border border-line text-ai" aria-label="Cancelar consulta"><Square size={15} /></button> : <button type="submit" disabled={!text.trim()} className="grid size-10 place-items-center rounded-[5px] bg-ai text-white hover:bg-[#23488f] disabled:opacity-40" aria-label="Enviar pergunta"><Send size={16} /></button>}
          </form>
        </div>
      </div>
    </Drawer>
  );
}
