"use client";

import { ArrowUpRight, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { ASSISTANT_SUGGESTIONS, assistantAnswer, type AssistantAnswer } from "@/lib/ai";
import { useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

interface Msg {
  id: number;
  from: "user" | "ia";
  text: string;
  answer?: AssistantAnswer;
}

/** "Pergunte à Tawper IA": respostas calculadas a partir dos dados da demo. */
export function AssistantPanel() {
  const { assistantOpen, setAssistant } = useUI();
  const user = useCurrentUser();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  if (!assistantOpen) return null;

  const ask = (q: string) => {
    if (!q.trim() || busy) return;
    seq.current += 1;
    const userMsgId = seq.current;
    setMsgs((m) => [...m, { id: userMsgId, from: "user", text: q }]);
    setText("");
    setBusy(true);
    setTimeout(() => {
      const answer = assistantAnswer(useStore.getState(), user, q);
      seq.current += 1;
      const iaMsgId = seq.current;
      setMsgs((m) => [...m, { id: iaMsgId, from: "ia", text: answer.texto, answer }]);
      setBusy(false);
    }, 1100);
  };

  return (
    <Drawer onClose={() => setAssistant(false)} title="Pergunte à Tawper IA" kicker="Assistente · dados reais do sistema" width={440}>
      <div className="flex h-full flex-col">
        <div className="flex-1 space-y-3 px-5 py-4">
          {msgs.length === 0 && (
            <div className="rounded-[8px] border border-line bg-soft/40 p-4">
              <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                <Sparkles size={15} className="text-ai" /> Olá, {user.short}.
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Respondo com base no que está registrado no Tawper OS — quando falta dado, eu digo o que falta em vez de inventar. {user.role === "vendedor" ? "Você vê apenas a sua carteira." : "Você vê a carteira inteira."}
              </p>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={cn("flex", m.from === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-[8px] px-3 py-2 text-[13px] leading-relaxed", m.from === "user" ? "bg-navy text-white" : "border border-line bg-white text-ink")}>
                {m.from === "ia" && (
                  <div className="mb-1 flex items-center gap-1 text-[11px] text-ai">
                    <Sparkles size={11} /> Tawper IA
                  </div>
                )}
                {m.text}
                {m.answer?.itens && m.answer.itens.length > 0 && (
                  <ul className="mt-2 divide-y divide-line/70 overflow-hidden rounded-[6px] border border-line bg-white">
                    {m.answer.itens.slice(0, 8).map((it) => (
                      <li key={it.label + it.meta}>
                        <Link href={it.href} onClick={() => setAssistant(false)} className="flex items-start gap-2 px-2.5 py-2 hover:bg-soft">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-semibold text-ink">{it.label}</span>
                            {it.meta && <span className="block text-[11.5px] text-muted">{it.meta}</span>}
                          </span>
                          <ArrowUpRight size={13} className="mt-0.5 text-muted" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[12.5px] text-ai">
              <Sparkles size={13} className="animate-pulse" /> consultando a carteira
              <span className="flex gap-1">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="size-1.5 rounded-full bg-ai animate-pulse-dot" style={{ animationDelay: `${d * 0.18}s` }} />
                ))}
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="sticky bottom-0 border-t border-line bg-white px-4 py-3">
          <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
            {ASSISTANT_SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-navy-3 hover:border-ai hover:text-ai">
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(text);
            }}
            className="flex gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Pergunte sobre clientes, prazos, time…"
              className="h-10 flex-1 rounded-[5px] border border-line px-3 text-[13px] outline-none focus:border-ai"
            />
            <button type="submit" className="grid size-10 place-items-center rounded-[5px] bg-ai text-white hover:bg-[#23488f]" aria-label="Enviar">
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </Drawer>
  );
}
