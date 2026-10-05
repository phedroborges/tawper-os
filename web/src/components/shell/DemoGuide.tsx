"use client";

import { Check, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { Button } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  titulo: string;
  texto: string;
  href?: string;
  asUser?: string;
}

const ATOS: { titulo: string; sub: string; steps: Step[] }[] = [
  {
    titulo: "Ato 1 · A visão do dono",
    sub: "Perfil: Murilo (gestor)",
    steps: [
      { id: "dash", titulo: "Dashboard clicável", texto: "Mostre a operação inteira. Clique em “Sem próximo passo”: todo número abre a lista de clientes que o formou.", href: "/dashboard", asUser: "u-murilo" },
      { id: "gestao", titulo: "Gestão por exceção", texto: "Atrasadas, paradas e sugestões da IA. Na Usina Rio Claro do Norte, aprove a sugestão estratégica e cobre o Paulo.", href: "/gestao", asUser: "u-murilo" },
    ],
  },
  {
    titulo: "Ato 2 · Do primeiro WhatsApp à venda",
    sub: "Perfil: Douglas (vendedor)",
    steps: [
      { id: "meudia", titulo: "Meu Dia do vendedor", texto: "Entre como Douglas. A IA resume o dia e mostra as prioridades. Nada de planilha.", href: "/meu-dia", asUser: "u-douglas" },
      { id: "lead", titulo: "Lead chega pelo WhatsApp", texto: "Abra a conversa do Rafael (Usina Vale do Sol) e clique em “Cadastrar empresa”. A IA lê a conversa e preenche o cadastro.", href: "/conversas?c=conv-valedosol", asUser: "u-douglas" },
      { id: "dup", titulo: "Duplicidade controlada", texto: "O sistema acha o cadastro antigo “Vale do Sol Agropecuária” (Moskit). Una os registros: o histórico é preservado.", asUser: "u-douglas" },
      { id: "chat", titulo: "Conversar e qualificar", texto: "Na conversa, pergunte quantas colhedoras eles têm. O cliente responde e a IA extrai frota, marca e prensa para o cadastro.", asUser: "u-douglas" },
      { id: "etapas", titulo: "Avançar com validação", texto: "Na página da empresa, use “Avançar etapa”. O sistema mostra o que falta e cria as tarefas de cada etapa.", asUser: "u-douglas" },
      { id: "quick", titulo: "Registro em texto livre", texto: "Clique em “Registrar” e use o exemplo 2 (visita + apresentação + teste). A IA propõe etapa, critérios e próximo passo.", asUser: "u-douglas" },
      { id: "homolog", titulo: "Cadastro e homologação", texto: "Marque os critérios (documentação, medidas, teste, aprovação) e chegue em Produto aprovado.", asUser: "u-douglas" },
      { id: "orcamento", titulo: "Orçamento em 1 minuto", texto: "“Sugerir itens pela frota” monta o orçamento. Envie: o PDF vai para o WhatsApp e o follow-up é agendado.", asUser: "u-douglas" },
      { id: "copiloto", titulo: "Copiloto estratégico", texto: "Na aba Estratégia, gere a sugestão da IA: diagnóstico, hipóteses, perguntas e rascunho. Aprove e crie as ações.", asUser: "u-douglas" },
      { id: "venda", titulo: "Venda ganha → recorrência", texto: "Registre a venda. O sistema cria o pós-venda, move a conta para Recorrência e prevê a recompra — sozinho.", asUser: "u-douglas" },
    ],
  },
  {
    titulo: "Ato 3 · Recorrência e controle",
    sub: "Perfil: Murilo (gestor)",
    steps: [
      { id: "recompra", titulo: "Nova venda (recompra)", texto: "Em Funis → Recorrência, avance a conta até Novo orçamento e registre a recompra: começa o ciclo 2.", href: "/funis?f=recorrencia", asUser: "u-murilo" },
      { id: "auditoria", titulo: "Auditoria completa", texto: "Tudo o que foi feito tem autor, origem (usuário, IA, automação), antes e depois.", href: "/auditoria", asUser: "u-murilo" },
      { id: "extras", titulo: "Celular e Modo TV", texto: "Mostre o app no celular do vendedor e o painel para a TV da sala comercial.", href: "/celular", asUser: "u-murilo" },
    ],
  },
];

const KEY = "tawper-os-guide";

function loadDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function DemoGuide() {
  const { guideOpen, setGuide } = useUI();
  if (!guideOpen) return null;
  return <GuideBody onClose={() => setGuide(false)} />;
}

function GuideBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const login = useStore((s) => s.login);
  const resetDemo = useStore((s) => s.resetDemo);
  const currentUserId = useStore((s) => s.currentUserId);
  const toast = useUI((s) => s.toast);
  const [done, setDone] = useState<Record<string, boolean>>(loadDone);

  const toggle = (id: string) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  const go = (st: Step) => {
    if (st.asUser && st.asUser !== currentUserId) login(st.asUser);
    if (st.href) router.push(st.href);
    const next = { ...done, [st.id]: true };
    setDone(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    if (st.href) onClose();
  };

  const total = ATOS.reduce((a, x) => a + x.steps.length, 0);
  const count = Object.values(done).filter(Boolean).length;

  return (
    <Drawer onClose={onClose} title="Roteiro da apresentação" kicker={`${count}/${total} passos · ~15 minutos`} width={460}>
      <div className="space-y-5 px-5 py-4">
        <div className="rounded-[8px] border border-line bg-soft/40 p-3">
          <div className="text-[13px] font-medium text-ink">Antes de começar</div>
          <p className="mt-0.5 text-[12px] text-muted">Reinicie a demo para voltar todos os clientes ao estado inicial, com as datas de hoje.</p>
          <Button
            size="xs"
            variant="outline"
            className="mt-2"
            onClick={() => {
              resetDemo();
              setDone({});
              try {
                localStorage.removeItem(KEY);
              } catch {}
              toast("Demo reiniciada", { tone: "info", sub: "Dados e roteiro voltaram ao início" });
            }}
          >
            <RotateCcw size={13} /> Reiniciar demo
          </Button>
        </div>
        {ATOS.map((ato) => (
          <section key={ato.titulo}>
            <div className="label">{ato.titulo}</div>
            <div className="mb-2 text-[11.5px] text-muted">{ato.sub}</div>
            <ol className="space-y-2">
              {ato.steps.map((st) => (
                <li key={st.id} className={cn("flex gap-3 rounded-[8px] border p-3 transition", done[st.id] ? "border-line bg-soft/50" : "border-line bg-white")}>
                  <button
                    type="button"
                    onClick={() => toggle(st.id)}
                    className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", done[st.id] ? "border-ok bg-ok text-white" : "border-line text-transparent hover:border-ok")}
                    aria-label="Marcar passo"
                  >
                    <Check size={11} strokeWidth={3} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-ink">{st.titulo}</div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{st.texto}</p>
                    {(st.href || st.asUser) && (
                      <button type="button" onClick={() => go(st)} className="mt-1.5 text-[12px] font-medium text-navy hover:underline">
                        {st.href ? "Ir para a tela →" : "Usar este perfil →"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
