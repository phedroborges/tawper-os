"use client";

import { ArrowLeft, MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ChatThread, ConversationAI } from "@/components/chat/Chat";
import { DueLabel, StagePill, UserAvatar } from "@/components/crm/crm";
import { Badge, Card, Empty, Segmented } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import { dayDiff, fmtDateShort, fmtTime } from "@/lib/dates";
import { canSeeCompany, nextStepOf, openDealOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import { cn, normalize } from "@/lib/utils";

function Central() {
  const params = useSearchParams();
  const router = useRouter();
  const s = useStore();
  const user = useCurrentUser();
  const [filter, setFilter] = useState<"todas" | "naolidas" | "semvinculo">("todas");
  const [q, setQ] = useState("");
  const selected = params.get("c");

  const convs = useMemo(() => {
    const n = normalize(q);
    return s.conversations
      .filter((c) => {
        if (isManager(user)) return true;
        if (c.ownerId === user.id) return true;
        const co = s.companies.find((x) => x.id === c.companyId);
        return co ? canSeeCompany(user, co) : false;
      })
      .filter((c) => (filter === "naolidas" ? c.unread > 0 : filter === "semvinculo" ? !c.companyId : true))
      .filter((c) => !n || normalize(`${c.contatoNome} ${s.companies.find((x) => x.id === c.companyId)?.nome ?? ""} ${c.telefone}`).includes(n))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [s.conversations, s.companies, user, filter, q]);

  const conv = s.conversations.find((c) => c.id === selected);
  const company = conv?.companyId ? s.companies.find((c) => c.id === conv.companyId) : undefined;
  const deal = company ? openDealOf(s, company.id) : undefined;
  const next = company ? nextStepOf(s, company.id) : undefined;
  const select = (id: string) => router.replace(`/conversas?c=${id}`);

  return (
    <div className="-mt-1">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="label">Central de conversas · WhatsApp integrado (simulado)</div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink">Conversas</h1>
        </div>
        <div className="text-[12px] text-muted">5 números da equipe · cada conversa vinculada à empresa e ao contato</div>
      </div>
      <Card className="grid h-[calc(100dvh-190px)] min-h-[560px] grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr_330px]">
        <aside className={cn("flex min-h-0 min-w-0 flex-col border-r border-line", conv && "hidden md:flex")}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversa" className="h-9 w-full rounded-[5px] border border-line bg-[#fbfbfa] pr-3 pl-8 text-[12.5px] outline-none focus:border-navy-3" />
            </div>
            <Segmented
              value={filter}
              onChange={setFilter}
              className="w-full"
              options={[
                { value: "todas", label: "Todas" },
                { value: "naolidas", label: "Não lidas" },
                { value: "semvinculo", label: "Sem vínculo" },
              ]}
            />
          </div>
          <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {convs.map((c) => {
              const co = s.companies.find((x) => x.id === c.companyId);
              const last = c.messages.at(-1);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => select(c.id)} className={cn("flex w-full items-start gap-2.5 border-b border-line/70 px-3 py-2.5 text-left hover:bg-soft/40", selected === c.id && "bg-soft")}>
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-bold", co ? "bg-[#e7f6ee] text-ok" : "bg-warn-soft text-warn")}>{c.contatoNome[0]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-ink">{c.contatoNome}</span>
                        <span className="ml-auto shrink-0 text-[10.5px] text-muted">{dayDiff(c.lastAt) === 0 ? fmtTime(c.lastAt) : fmtDateShort(c.lastAt)}</span>
                      </span>
                      <span className="block truncate text-[11.5px] font-medium text-navy-3">{co ? co.nome : "Número sem vínculo"}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn("block flex-1 truncate text-[12px]", c.unread ? "font-semibold text-ink" : "text-muted")}>
                          {last?.from === "tawper" ? "Você: " : last?.from === "nota" ? "Nota: " : ""}
                          {last?.attachment ? `📄 ${last.attachment.nome}` : last?.text ?? "—"}
                        </span>
                        {c.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-ok px-1.5 text-[10.5px] leading-5 font-bold text-white">{c.unread}</span>}
                      </span>
                      {isManager(user) && <span className="mt-0.5 block text-[10.5px] text-muted/80">WhatsApp de {s.users.find((u) => u.id === c.ownerId)?.short}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {convs.length === 0 && <li className="px-4 py-10 text-center text-[12.5px] text-muted">Nenhuma conversa.</li>}
          </ul>
        </aside>

        <section className={cn("min-h-0 min-w-0 flex-col", conv ? "flex" : "hidden md:flex")}>
          {conv ? (
            <>
              <button type="button" onClick={() => router.replace("/conversas")} className="flex items-center gap-1 border-b border-line px-3 py-2 text-[12.5px] font-semibold text-muted md:hidden">
                <ArrowLeft size={14} /> Conversas
              </button>
              <ChatThread key={conv.id} conv={conv} className="min-h-0 flex-1" />
              <div className="scrollbar-thin max-h-[42%] overflow-y-auto border-t border-line p-3 xl:hidden">
                <ConversationAI conv={conv} compact />
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center bg-[#f7f6f3]">
              <Empty icon={<MessageCircle size={20} />} title="Selecione uma conversa" text="Toda conversa fica vinculada à empresa, ao contato e à oportunidade — e pode virar atividade com um clique." />
            </div>
          )}
        </section>

        <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-soft/30 p-3 xl:flex">
          {conv ? (
            <>
              {company && (
                <div className="rounded-[6px] border border-line bg-white p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="label">Empresa vinculada</div>
                      <Link href={`/empresas/${company.id}`} className="block truncate text-[14px] font-semibold text-ink hover:text-brand">
                        {company.nome}
                      </Link>
                      <div className="text-[11.5px] text-muted">
                        {company.cidade}/{company.uf} · {company.colhedoras ? `${company.colhedoras} colhedoras` : "frota não informada"}
                      </div>
                    </div>
                    <UserAvatar userId={company.ownerId} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StagePill deal={deal} />
                    {company.marcaAtual && <Badge tone="outline">usa {company.marcaAtual}</Badge>}
                  </div>
                  <div className="mt-2 rounded-[4px] bg-[#f5f6f8] px-2 py-1.5 text-[11.5px]">
                    {next ? (
                      <>
                        <div className="label">Próximo passo</div>
                        <div className="font-medium text-ink">{next.titulo}</div>
                        <DueLabel iso={next.dueAt} className="text-[11px]" />
                      </>
                    ) : (
                      <span className="font-semibold text-brand">Sem próximo passo</span>
                    )}
                  </div>
                </div>
              )}
              <ConversationAI key={conv.id} conv={conv} />
            </>
          ) : (
            <div className="px-2 py-6 text-center text-[12px] text-muted">O contexto da conta e o resumo da IA aparecem aqui.</div>
          )}
        </aside>
      </Card>
    </div>
  );
}

export default function ConversasPage() {
  return (
    <Suspense>
      <Central />
    </Suspense>
  );
}
