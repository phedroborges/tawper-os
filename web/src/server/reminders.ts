import "server-only";

import { canonicalWhatsApp } from "@/lib/br-ids";
import { buildReminder, dayKey } from "@/lib/reminder-text";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { sendWhatsAppAgentText } from "@/server/ai/whatsapp/stevo";
import { loadTeam } from "@/server/auth/team";
import { loadConfigSafe } from "@/server/config";
import { loadCrmSnapshot } from "@/server/crm";

/** Enquanto esta lista existir (telefones separados por vírgula), só esses números recebem. Serve para o teste real. */
function allowlist() {
  const raw = (process.env.TAWPER_REMINDERS_ONLY ?? "").split(",").map((item) => canonicalWhatsApp(item.trim())).filter(Boolean);
  return raw.length ? new Set(raw) : null;
}

/**
 * Lembrete diário: uma mensagem por pessoa, no WhatsApp dela, pelo número do agente.
 * A linha em `notifications` (dedupe_key único) é gravada antes do envio: chamar duas vezes no mesmo dia não repete a mensagem.
 */
export async function sendDailyReminders(now = new Date()) {
  const [team, snapshot, config] = await Promise.all([loadTeam(true), loadCrmSnapshot(), loadConfigSafe()]);
  const only = allowlist();
  const off = new Set(config.remindersOff);
  const names = new Map(snapshot.companies.map((c) => [c.id, c.nome]));
  const sb = getSupabaseAdmin();
  const result = { sent: 0, skipped: 0, failed: [] as string[] };

  for (const member of team) {
    const phone = canonicalWhatsApp(member.phone);
    if (!member.ativo || !phone || off.has(member.id) || (only && !only.has(phone))) {
      result.skipped += 1;
      continue;
    }
    const text = buildReminder({ nome: member.short, ownerId: member.id, activities: snapshot.activities, companyName: (id) => names.get(id) ?? "cliente", now });
    if (!text) {
      result.skipped += 1;
      continue;
    }
    const claimed = await sb.from("notifications").insert({
      organization_id: TAWPER_ORG_ID, recipient_id: member.id, type: "system", title: "Lembrete diário pelo WhatsApp", body: text, link: "/meu-dia",
      source_kind: "whatsapp_reminder", dedupe_key: `lembrete:${member.id}:${dayKey(now)}`,
    });
    if (claimed.error) {
      // 23505 = já enviado hoje. Outro erro: não envia sem conseguir registrar.
      if (claimed.error.code === "23505") result.skipped += 1;
      else result.failed.push(`${member.short}: ${claimed.error.message}`);
      continue;
    }
    try {
      await sendWhatsAppAgentText(phone, text);
      result.sent += 1;
    } catch (e) {
      // Falhou o envio: solta a trava para a próxima chamada do dia tentar de novo.
      await sb.from("notifications").delete().eq("organization_id", TAWPER_ORG_ID).eq("dedupe_key", `lembrete:${member.id}:${dayKey(now)}`);
      result.failed.push(`${member.short}: ${e instanceof Error ? e.message : "falha no envio"}`);
    }
  }
  return result;
}
