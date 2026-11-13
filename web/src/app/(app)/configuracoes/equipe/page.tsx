"use client";

import { KeyRound, Pencil, Plus, UserCheck, UserX, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Avatar, Badge, Button, Card, Empty, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { formatWhatsApp } from "@/lib/br-ids";
import { ROLE_LABEL } from "@/lib/constants";
import { refreshCrm, useCurrentUser } from "@/lib/store";
import type { User } from "@/lib/types";
import { useUI } from "@/lib/ui-store";

type Carteira = { empresas: number; negocios: number; tarefas: number; conversas: number };
type Member = User & { email: string; ativo: boolean; carteira: Carteira };
type Dialog = { kind: "criar" } | { kind: "editar"; member: Member } | { kind: "senha"; member: Member } | { kind: "desativar"; member: Member } | null;

const ROLES: User["role"][] = ["admin", "gestor", "vendedor", "representante"];

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/equipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string; para?: string };
  if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
  return data;
}

async function fetchTeam() {
  const res = await fetch("/api/admin/equipe", { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { team?: Member[]; error?: string };
  if (!res.ok || !data.team) throw new Error(data.error || "Falha ao ler a equipe.");
  return data.team;
}

function carteiraText(c: Carteira) {
  const parts = [
    c.empresas && `${c.empresas} ${c.empresas === 1 ? "empresa" : "empresas"}`,
    c.negocios && `${c.negocios} ${c.negocios === 1 ? "negócio aberto" : "negócios abertos"}`,
    c.tarefas && `${c.tarefas} ${c.tarefas === 1 ? "tarefa pendente" : "tarefas pendentes"}`,
    c.conversas && `${c.conversas} ${c.conversas === 1 ? "conversa" : "conversas"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sem carteira";
}

export default function EquipePage() {
  const user = useCurrentUser();
  const toast = useUI((s) => s.toast);
  const [team, setTeam] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let off = false;
    fetchTeam().then(
      (rows) => {
        if (off) return;
        setTeam(rows);
        setLoadError("");
      },
      (error: unknown) => {
        if (!off) setLoadError(error instanceof Error ? error.message : "Falha ao ler a equipe.");
      },
    );
    return () => {
      off = true;
    };
  }, [version]);

  if (user?.role !== "admin") return <Empty icon={<Users size={20} />} title="Área do administrador" text="Só o administrador gerencia quem tem acesso ao sistema." />;

  const done = async (message: string, sub?: string) => {
    setDialog(null);
    toast(message, { sub });
    setVersion((v) => v + 1);
    void refreshCrm().catch(() => undefined);
  };

  const active = team?.filter((m) => m.ativo) ?? [];
  const inactive = team?.filter((m) => !m.ativo) ?? [];

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Quem entra no Tawper OS e quem fala com o agente do WhatsApp. Só fala com o agente quem está ativo e tem WhatsApp cadastrado."
        actions={
          <Button variant="primary" onClick={() => setDialog({ kind: "criar" })}>
            <Plus size={16} /> Adicionar pessoa
          </Button>
        }
      />

      {loadError && <p className="mb-4 rounded-[6px] bg-brand-soft px-3 py-2 text-[12.5px] text-brand">{loadError}</p>}
      {!team && !loadError && <p className="text-[13px] text-muted">Carregando…</p>}

      {team && (
        <div className="grid gap-6">
          <MemberList title={`Ativos · ${active.length}`} members={active} selfId={user.id} onDialog={setDialog} onReactivate={() => undefined} />
          {inactive.length > 0 && (
            <MemberList
              title={`Desativados · ${inactive.length}`}
              members={inactive}
              selfId={user.id}
              onDialog={setDialog}
              onReactivate={async (member) => {
                try {
                  await call({ acao: "reativar", id: member.id });
                  await done(`${member.name} reativado`, "Já pode entrar de novo com a senha que tinha.");
                } catch (error) {
                  toast("Não foi possível reativar", { tone: "warn", sub: error instanceof Error ? error.message : undefined });
                }
              }}
            />
          )}
        </div>
      )}

      {(dialog?.kind === "criar" || dialog?.kind === "editar") && (
        <MemberForm member={dialog.kind === "editar" ? dialog.member : undefined} selfId={user.id} onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog?.kind === "senha" && <PasswordForm member={dialog.member} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "desativar" && <DeactivateForm member={dialog.member} others={active.filter((m) => m.id !== dialog.member.id)} onClose={() => setDialog(null)} onSaved={done} />}
    </div>
  );
}

function MemberList({ title, members, selfId, onDialog, onReactivate }: { title: string; members: Member[]; selfId: string; onDialog: (d: Dialog) => void; onReactivate: (m: Member) => void }) {
  return (
    <section>
      <div className="label mb-2">{title}</div>
      <Card className="divide-y divide-line">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={m.name} initials={m.initials} color={m.color} size={34} className={m.ativo ? "" : "opacity-50"} />
            <div className="min-w-[200px] flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[14px] font-medium text-ink">{m.name}</span>
                {m.id === selfId && <Badge tone="muted">você</Badge>}
                <Badge tone={m.role === "admin" ? "navy" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
                {m.ativo && m.phone && <Badge tone="green">Fala com o agente</Badge>}
              </div>
              <div className="mt-0.5 text-[12px] text-muted">
                {m.email || "sem e-mail"}
                {m.phone ? ` · WhatsApp ${formatWhatsApp(m.phone)}` : " · sem WhatsApp"}
                {m.title ? ` · ${m.title}` : ""}
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">{carteiraText(m.carteira)}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {m.ativo ? (
                <>
                  <Button size="sm" onClick={() => onDialog({ kind: "editar", member: m })}>
                    <Pencil size={14} /> Editar
                  </Button>
                  <Button size="sm" onClick={() => onDialog({ kind: "senha", member: m })}>
                    <KeyRound size={14} /> Senha
                  </Button>
                  {m.id !== selfId && (
                    <Button size="sm" variant="danger" onClick={() => onDialog({ kind: "desativar", member: m })}>
                      <UserX size={14} /> Desativar
                    </Button>
                  )}
                </>
              ) : (
                <Button size="sm" onClick={() => onReactivate(m)}>
                  <UserCheck size={14} /> Reativar
                </Button>
              )}
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

function FormError({ text }: { text: string }) {
  return text ? <p className="rounded-[6px] bg-brand-soft px-3 py-2 text-[12.5px] text-brand">{text}</p> : null;
}

function MemberForm({ member, selfId, onClose, onSaved }: { member?: Member; selfId: string; onClose: () => void; onSaved: (message: string, sub?: string) => Promise<void> }) {
  const [form, setForm] = useState({
    nome: member?.name ?? "",
    curto: member?.short ?? "",
    email: member?.email ?? "",
    cargo: member?.title ?? "",
    papel: member?.role ?? "vendedor",
    whatsapp: member?.phone ? formatWhatsApp(member.phone) : "",
    senha: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await call(member ? { acao: "editar", id: member.id, ...form } : { acao: "criar", ...form });
      await onSaved(member ? `${form.nome} atualizado` : `${form.nome} adicionado`, member ? undefined : `Entra com ${form.email} e a senha que você definiu.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={member ? `Editar ${member.name}` : "Adicionar pessoa"}
      icon={<Users size={18} />}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {busy ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Nome completo" required>
            <Input value={form.nome} onChange={set("nome")} />
          </Field>
          <Field label="Como chamar" hint="Aparece nas mensagens">
            <Input value={form.curto} onChange={set("curto")} placeholder={form.nome.split(" ")[0]} />
          </Field>
        </div>
        <Field label="E-mail de login" required={!member} hint={member ? "O e-mail não muda por aqui." : undefined}>
          <Input type="email" value={form.email} onChange={set("email")} disabled={Boolean(member)} placeholder="nome@tawper.com.br" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Perfil de acesso" required>
            <Select value={form.papel} onChange={set("papel")} disabled={member?.id === selfId}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cargo">
            <Input value={form.cargo} onChange={set("cargo")} placeholder="Vendedor interno" />
          </Field>
        </div>
        <Field label="WhatsApp" hint="Com o número, a pessoa passa a falar com o agente. Deixe vazio para tirar o acesso ao agente.">
          <Input value={form.whatsapp} onChange={set("whatsapp")} placeholder="(64) 99999-9999" inputMode="tel" />
        </Field>
        {!member && (
          <Field label="Senha inicial" required hint="Pelo menos 8 caracteres. Passe para a pessoa por um canal seguro.">
            <Input type="text" value={form.senha} onChange={set("senha")} autoComplete="new-password" />
          </Field>
        )}
        <FormError text={error} />
      </div>
    </Modal>
  );
}

function PasswordForm({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: (message: string, sub?: string) => Promise<void> }) {
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await call({ acao: "senha", id: member.id, senha });
      await onSaved(`Senha de ${member.short} trocada`, "A senha antiga deixou de valer.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível trocar a senha.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      size="sm"
      onClose={onClose}
      title={`Nova senha de ${member.name}`}
      icon={<KeyRound size={18} />}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {busy ? "Salvando…" : "Trocar senha"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Nova senha" required hint="Pelo menos 8 caracteres.">
          <Input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </Field>
        <FormError text={error} />
      </div>
    </Modal>
  );
}

function DeactivateForm({ member, others, onClose, onSaved }: { member: Member; others: Member[]; onClose: () => void; onSaved: (message: string, sub?: string) => Promise<void> }) {
  const c = member.carteira;
  const hasCarteira = c.empresas + c.negocios + c.tarefas + c.conversas > 0;
  const [para, setPara] = useState(hasCarteira ? (others.find((m) => m.role === "admin")?.id ?? others[0]?.id ?? "") : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const target = others.find((m) => m.id === para);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await call({ acao: "desativar", id: member.id, transferirPara: para || undefined });
      await onSaved(`${member.name} desativado`, target ? `A carteira passou para ${target.short}.` : "Não entra mais no sistema nem fala com o agente.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível desativar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      size="sm"
      onClose={onClose}
      title={`Desativar ${member.name}`}
      icon={<UserX size={18} />}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="danger" disabled={busy || (hasCarteira && !para)} onClick={submit}>
            {busy ? "Desativando…" : "Desativar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-[13px] text-ink">
        <p>{member.short} deixa de entrar no sistema e de falar com o agente na hora. O histórico dele continua guardado, e dá para reativar depois.</p>
        {hasCarteira ? (
          <>
            <p className="text-muted">Carteira atual: {carteiraText(c)}.</p>
            <Field label="Passar a carteira para" required>
              <Select value={para} onChange={(e) => setPara(e.target.value)}>
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <p className="text-muted">Não tem empresa, negócio, tarefa ou conversa no nome dele.</p>
        )}
        <FormError text={error} />
      </div>
    </Modal>
  );
}
