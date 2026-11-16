"use client";

import { KeyRound, Mail, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AvatarPicker } from "@/components/ui/AvatarPicker";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader } from "@/components/ui/primitives";
import { formatWhatsApp } from "@/lib/br-ids";
import { isAdmin, ROLE_LABEL } from "@/lib/constants";
import { refreshCrm, useCurrentUser } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { useAction } from "@/lib/use-action";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/auth/conta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
}

/** Minha conta: cada pessoa gerencia seu próprio perfil (foto, nome, cargo, WhatsApp) e senha. */
export default function MinhaContaPage() {
  const user = useCurrentUser();
  const toast = useUI((s) => s.toast);
  const perfil = useAction();
  const senha = useAction();
  const [f, setF] = useState({
    nome: user.name,
    curto: user.short,
    cargo: user.title,
    whatsapp: formatWhatsApp(user.phone),
    avatarUrl: user.avatarUrl,
    cor: user.color,
  });
  const [p, setP] = useState({ atual: "", nova: "", repete: "" });
  const senhaOk = p.atual.length > 0 && p.nova.length >= 8 && p.nova === p.repete && p.nova !== p.atual;

  const savePerfil = () =>
    void perfil.run(async () => {
      await post({
        acao: "perfil",
        nome: f.nome,
        curto: f.curto,
        cargo: f.cargo,
        whatsapp: f.whatsapp,
        avatarUrl: f.avatarUrl ?? null,
        cor: f.cor,
      });
      await refreshCrm().catch(() => undefined);
      toast("Perfil atualizado", { sub: "Sua foto e seus dados já aparecem em todo o Tawper OS" });
    });

  const saveSenha = () =>
    void senha.run(async () => {
      await post({ acao: "senha", atual: p.atual, nova: p.nova });
      setP({ atual: "", nova: "", repete: "" });
      toast("Senha trocada", { sub: "Use a senha nova no próximo acesso" });
    });

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Meu perfil"
        subtitle="Personalize sua foto, seus dados de contato e sua senha. O WhatsApp é o número usado para falar com o agente e assinar suas propostas."
      />

      <Card>
        <div className="border-b border-line px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{ROLE_LABEL[user.role]}</Badge>
              {isAdmin(user) && (
                <Badge tone="navy">
                  <ShieldCheck size={12} /> Administrador
                </Badge>
              )}
              {user.email && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
                  <Mail size={12} /> {user.email}
                </span>
              )}
            </div>
          </div>

          <AvatarPicker
            name={f.nome || user.name}
            initials={user.initials}
            color={f.cor}
            avatarUrl={f.avatarUrl}
            onChangeAvatar={(avatarUrl) => setF((prev) => ({ ...prev, avatarUrl }))}
            onChangeColor={(cor) => setF((prev) => ({ ...prev, cor }))}
            size={68}
          />
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Nome completo" required>
            <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Paulo Henrique Souza" autoComplete="name" />
          </Field>
          <Field label="Como aparece no sistema" hint="nome curto">
            <Input value={f.curto} onChange={(e) => setF({ ...f, curto: e.target.value })} placeholder="Ex.: Paulo" />
          </Field>
          <Field label="Cargo / Função" hint="aparece nas propostas e equipe">
            <Input value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} placeholder="Ex.: Consultor Técnico Comercial" />
          </Field>
          <Field label="WhatsApp" hint="celular com DDD">
            <Input value={f.whatsapp} inputMode="tel" maxLength={15} onChange={(e) => setF({ ...f, whatsapp: formatWhatsApp(e.target.value) })} placeholder="(64) 99999-9999" autoComplete="tel" />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-3">
          {perfil.error && <span className="mr-auto text-[12.5px] font-medium text-brand">{perfil.error}</span>}
          <Button variant="primary" size="sm" onClick={savePerfil} disabled={!f.nome.trim() || perfil.busy}>
            <Save size={14} /> {perfil.busy ? "Salvando…" : "Salvar perfil"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Trocar senha" kicker="Mínimo de 8 caracteres" action={<KeyRound size={16} className="text-muted" />} />
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
          <Field label="Senha atual" required>
            <Input type="password" value={p.atual} onChange={(e) => setP({ ...p, atual: e.target.value })} autoComplete="current-password" />
          </Field>
          <Field label="Senha nova" required>
            <Input type="password" value={p.nova} onChange={(e) => setP({ ...p, nova: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Repita a senha nova" required>
            <Input type="password" value={p.repete} onChange={(e) => setP({ ...p, repete: e.target.value })} autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-3">
          <span className="mr-auto text-[12.5px] font-medium text-brand">
            {senha.error ?? (p.repete && p.nova !== p.repete ? "As duas senhas novas estão diferentes." : p.nova && p.nova === p.atual ? "A senha nova precisa ser diferente da atual." : "")}
          </span>
          <Button variant="primary" size="sm" onClick={saveSenha} disabled={!senhaOk || senha.busy}>
            {senha.busy ? "Trocando…" : "Trocar senha"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
