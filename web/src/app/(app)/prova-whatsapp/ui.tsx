"use client";

import { useState, useTransition } from "react";
import { loadProofSnapshot, pairProofPhone, refreshProofQr, registerProofWebhook, sendProofText } from "@/server/integrations/stevo-proof/actions";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";

type Snapshot = Awaited<ReturnType<typeof loadProofSnapshot>>;

export function ProvaWhatsAppClient({ initial }: { initial: Snapshot }) {
  const [snap, setSnap] = useState(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("Prova Tawper OS — Fase 0. Pode ignorar.");
  const [pairPhone, setPairPhone] = useState(snap.testNumber);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) => {
    setError("");
    setNotice("");
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha na prova da Stevo.");
      }
    });
  };

  const reload = async () => {
    const next = await loadProofSnapshot();
    setSnap(next);
    setNotice(`Lista atualizada às ${new Date().toLocaleTimeString("pt-BR")}. ${next.events.length} aviso(s).`);
  };

  const statusTone = !snap.enabled ? "muted" : !snap.status.loggedIn ? "amber" : "green";
  const statusLabel = !snap.enabled ? "desligada" : !snap.configured ? "sem credencial" : snap.status.loggedIn ? "conectado" : snap.status.connected ? "aguardando QR" : "desconectado";

  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-ink">
        Prova técnica da <b>Fase 0</b>. Não é a Central de Conversas e não grava empresa, contato nem histórico comercial. Só valida se a Stevo conecta, envia e avisa que chegou mensagem.
      </div>

      {error && <div className="rounded-[8px] border border-brand/25 bg-brand-soft px-4 py-3 text-[13px] text-brand">{error}</div>}
      {notice && <div className="rounded-[8px] border border-ok/20 bg-ok-soft px-4 py-3 text-[13px] text-ok">{notice}</div>}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Sessão</h2>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>
          <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
            <div><dt className="text-[11px] text-muted">Instância</dt><dd>{snap.instance}</dd></div>
            <div><dt className="text-[11px] text-muted">Número de teste</dt><dd>{snap.testNumber || "—"}</dd></div>
            <div><dt className="text-[11px] text-muted">Nome no WhatsApp</dt><dd>{snap.status.name || "—"}</dd></div>
            <div><dt className="text-[11px] text-muted">Telefone conectado</dt><dd>{snap.status.phone || "—"}</dd></div>
            <div><dt className="text-[11px] text-muted">Proxy</dt><dd>{snap.status.proxy ? "ligado" : "não informado"}</dd></div>
            <div><dt className="text-[11px] text-muted">URL pública</dt><dd className="break-all">{snap.publicUrl || "APP_PUBLIC_URL ainda não definida"}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="dark" disabled={pending} onClick={() => run(reload)}>Atualizar status</Button>
            <Button size="sm" disabled={pending} onClick={() => run(async () => { setSnap({ ...snap, qr: await refreshProofQr() }); setNotice("QR atualizado."); })}>Atualizar QR</Button>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-[15px] font-semibold text-ink">Conectar o celular</h2>
          <p className="mt-1 text-[12.5px] text-muted">No WhatsApp: Mais opções → Aparelhos conectados → Conectar um aparelho.</p>
          {snap.qr.image ? (
            <img src={snap.qr.image} alt="QR Code da Stevo" className="mt-3 h-48 w-48 rounded-[8px] border border-line bg-white p-2" />
          ) : (
            <div className="mt-3 grid h-48 w-48 place-items-center rounded-[8px] border border-dashed border-line text-[12px] text-muted">QR indisponível. Atualize.</div>
          )}
          {snap.qr.pairingCode && <p className="mt-2 text-[13px]">Código de pareamento: <b>{snap.qr.pairingCode}</b></p>}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Celular para código de pareamento" className="min-w-52 flex-1">
              <Input value={pairPhone} onChange={(e) => setPairPhone(e.target.value)} placeholder="64 99939-4890" />
            </Field>
            <Button size="sm" disabled={pending} onClick={() => run(async () => {
              const result = await pairProofPhone(pairPhone);
              setNotice(`Código ${result.code} gerado para ${result.phone}.`);
            })}>Pedir código</Button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold text-ink">Enviar texto</h2>
          <p className="mt-1 text-[12.5px] text-muted">Use outro celular, não o número conectado na instância.</p>
          <div className="mt-3 space-y-3">
            <Field label="Destino" hint="DDI + DDD + número">
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="55 11 99999-0000" />
            </Field>
            <Field label="Mensagem">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
            </Field>
            <Button variant="dark" disabled={pending || !snap.status.loggedIn} onClick={() => run(async () => {
              const sent = await sendProofText(to, text);
              setNotice(`Enviado para ${sent.number}.`);
            })}>Enviar prova</Button>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-[15px] font-semibold text-ink">Webhook de entrada</h2>
          <p className="mt-1 text-[12.5px] text-muted">O celular recebe direto do WhatsApp. O Tawper só vê a mensagem se a Stevo estiver inscrita no evento MESSAGE. Clique em Ativar recebimento uma vez, espere conectar de novo e peça um oi novo.</p>
          <div className="mt-3 break-all rounded-[6px] bg-soft px-3 py-2 text-[12px]">{snap.webhookUrl || "Falta APP_PUBLIC_URL e STEVO_WEBHOOK_TOKEN no EasyPanel."}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="dark" disabled={pending || !snap.webhookUrl} onClick={() => run(async () => {
              const registered = await registerProofWebhook();
              setNotice(`Recebimento ativado. A sessão pode piscar e voltar. Peça um oi novo e clique em Ver eventos recebidos. ${registered.url}`);
              await reload();
            })}>Ativar recebimento</Button>
            <Button size="sm" disabled={pending} onClick={() => run(reload)}>Ver eventos recebidos</Button>
          </div>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-[12.5px]">
            {snap.events.length === 0 && <li className="text-muted">Nenhum aviso da Stevo chegou neste servidor. Envie um oi do outro celular e clique de novo em Ver eventos recebidos.</li>}
            {snap.events.map((event) => (
              <li key={event.id} className="rounded-[6px] border border-line px-3 py-2">
                <div className="flex justify-between gap-2 text-[11px] text-muted">
                  <span>{event.accepted ? event.event : "token recusado"}</span>
                  <span>{new Date(event.receivedAt).toLocaleString("pt-BR")}</span>
                </div>
                <div className="mt-0.5">{event.from || "origem não identificada"}</div>
                <div className="text-muted">{event.preview}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
