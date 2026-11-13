"use client";

import { BellRing } from "lucide-react";
import { useMemo } from "react";
import { Card, Checkbox, PageHeader } from "@/components/ui/primitives";
import { formatWhatsApp } from "@/lib/br-ids";
import { useNow } from "@/lib/hooks";
import { buildReminder } from "@/lib/reminder-text";
import { reportError, useCurrentUser, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";

/** Lembrete diário pelo WhatsApp: liga/desliga e mostra como a mensagem de hoje ficaria. */
export default function LembretesPage() {
  const user = useCurrentUser();
  const now = useNow();
  const toast = useUI((s) => s.toast);
  const activities = useStore((s) => s.activities);
  const companies = useStore((s) => s.companies);
  const enabled = useStore((s) => !s.config.remindersOff.includes(user.id));
  const setReminder = useStore((s) => s.setReminder);
  const preview = useMemo(
    () => buildReminder({ nome: user.short, ownerId: user.id, activities, companyName: (id) => companies.find((c) => c.id === id)?.nome ?? "cliente", now }),
    [user, activities, companies, now],
  );

  return (
    <div className="max-w-3xl">
      <PageHeader title="Lembretes" subtitle="De segunda a sexta, às 7h30, você recebe no seu WhatsApp o que vence hoje, o que está atrasado e o que vem em dois dias úteis." />
      <Card className="mb-5 p-4">
        <Checkbox
          checked={enabled}
          onChange={(v) => {
            setReminder(v)
              .then(() => toast(v ? "Lembrete ligado" : "Lembrete desligado", { tone: "info" }))
              .catch((e) => reportError(e, "Não foi possível salvar"));
          }}
          label="Receber o lembrete diário no meu WhatsApp"
          sub={user.phone ? `Vai para ${formatWhatsApp(user.phone)}. Em dia sem tarefa não chega mensagem.` : "Cadastre seu WhatsApp em Minha conta para receber."}
        />
      </Card>
      <Card>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-[13.5px] font-medium text-ink">
          <BellRing size={15} className="text-muted" /> Como ficaria a mensagem de hoje
        </div>
        <div className="p-4">
          {preview ? (
            <pre className="max-w-md rounded-[10px] bg-[#e7f6e1] px-3.5 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{preview}</pre>
          ) : (
            <p className="text-[13px] text-muted">Você não tem nada para hoje, nada atrasado e nada para daqui a dois dias. Hoje não chegaria mensagem.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
