"use client";

import { Building2, ExternalLink, LocateFixed, Megaphone, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DueLabel, StagePill, StatusBadge, UserAvatar } from "@/components/crm/crm";
import { Modal } from "@/components/ui/overlay";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { getCurrentPosition } from "@/lib/browser-geo";
import { formatCNPJ, formatWhatsApp, isValidCNPJ, isValidWhatsApp, storedCNPJ, storedWhatsApp } from "@/lib/br-ids";
import { formatCEP, isValidCEP, lookupViaCep, normalizeCEP } from "@/lib/cep";
import { isMuriloLouis, MARCAS, PAPEIS, PRENSAS, RAMOS, REGIOES } from "@/lib/constants";
import { currentDealOf, nextStepOf, qualityOf } from "@/lib/selectors";
import { useCurrentUser, useStore } from "@/lib/store";
import type { Company, Papel, Potencial, Prensa, Urgencia } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { geocodeCepOrAddress, reverseGeocode } from "@/server/geo/geocode";

export function ContactModal({ companyId, preset }: { companyId: string; preset?: { nome?: string; whatsapp?: string } }) {
  const s = useStore();
  const { close, toast } = useUI();
  const company = s.companies.find((c) => c.id === companyId);
  const [f, setF] = useState({ nome: preset?.nome ?? "", cargo: "", papel: "Técnico" as Papel, whatsapp: preset?.whatsapp ?? "", email: "", influencia: 2 as 1 | 2 | 3 });
  if (!company) return null;
  const save = () => {
    if (f.whatsapp.trim() && !isValidWhatsApp(f.whatsapp)) {
      toast("WhatsApp inválido", { sub: "Use um celular brasileiro com DDD, no formato (64) 99999-9999.", tone: "warn" });
      return;
    }
    s.addContact({ companyId, nome: f.nome, cargo: f.cargo, papel: f.papel, influencia: f.influencia, whatsapp: storedWhatsApp(f.whatsapp), email: f.email || undefined, canal: f.whatsapp ? "WhatsApp" : "E-mail", autorizaContato: true, ativo: true });
    toast("Contato adicionado", { sub: `${f.nome} · ${f.papel}` });
    close();
  };
  return (
    <Modal
      onClose={close}
      kicker={company.nome}
      title="Novo contato"
      icon={<UserPlus size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!f.nome.trim()}>
            Salvar contato
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" required>
          <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoFocus />
        </Field>
        <Field label="Cargo">
          <Input value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} placeholder="Ex.: Mecânico chefe" />
        </Field>
        <Field label="Papel na decisão">
          <Select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Papel })}>
            {PAPEIS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Influência">
          <Select value={f.influencia} onChange={(e) => setF({ ...f, influencia: Number(e.target.value) as 1 | 2 | 3 })}>
            <option value={3}>Alta</option>
            <option value={2}>Média</option>
            <option value={1}>Baixa</option>
          </Select>
        </Field>
        <Field label="WhatsApp">
          <Input value={f.whatsapp} inputMode="tel" autoComplete="off" maxLength={15} onChange={(e) => setF({ ...f, whatsapp: formatWhatsApp(e.target.value) })} placeholder="(64) 99999-9999" />
        </Field>
        <Field label="E-mail">
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

export function EditCompanyModal({ companyId }: { companyId: string }) {
  const s = useStore();
  const { close, toast } = useUI();
  const company = s.companies.find((c) => c.id === companyId);
  const [f, setF] = useState<Partial<Company>>(
    company ? { ...company, cnpj: formatCNPJ(company.cnpj), cep: formatCEP(company.cep) } : {},
  );
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "error">(
    company?.cep && typeof company.latitude === "number" ? "ok" : typeof company?.latitude === "number" ? "ok" : "idle",
  );
  const [cepHint, setCepHint] = useState(
    company?.latitude != null && company?.longitude != null
      ? `${company.cidade ?? ""}/${company.uf ?? ""} · ${company.latitude.toFixed(5)}, ${company.longitude.toFixed(5)}`.trim()
      : "",
  );
  const [gpsLoading, setGpsLoading] = useState(false);
  const [fromGps, setFromGps] = useState(false);
  if (!company) return null;
  const set = <K extends keyof Company>(k: K, v: Company[K]) => setF((x) => ({ ...x, [k]: v }));

  const resolveCep = async (raw: string) => {
    const digits = normalizeCEP(raw);
    if (digits.length !== 8) {
      setCepStatus("idle");
      setCepHint("");
      return;
    }
    setFromGps(false);
    setCepStatus("loading");
    setCepHint("Consultando CEP…");
    try {
      const addr = await lookupViaCep(digits);
      if (!addr) {
        setCepStatus("error");
        setCepHint("CEP não encontrado. Confira os 8 dígitos.");
        return;
      }
      const geo = await geocodeCepOrAddress({
        cep: addr.cep,
        cidade: addr.cidade,
        uf: addr.uf,
      });
      if (!geo.ok) {
        setCepStatus("error");
        setCepHint(geo.reason);
        setF((x) => ({
          ...x,
          cep: formatCEP(addr.cep),
          cidade: addr.cidade,
          uf: addr.uf,
        }));
        return;
      }
      setF((x) => ({
        ...x,
        cep: formatCEP(addr.cep),
        cidade: addr.cidade,
        uf: addr.uf,
        latitude: geo.lat,
        longitude: geo.lng,
      }));
      setCepStatus("ok");
      const origem = geo.source === "google" ? "Google" : geo.source === "nominatim" ? "OpenStreetMap" : "cidade";
      setCepHint(`${addr.cidade}/${addr.uf} · mapa ok (${origem})`);
    } catch {
      setCepStatus("error");
      setCepHint("Não foi possível consultar o CEP agora.");
    }
  };

  const useCurrentLocation = async () => {
    setGpsLoading(true);
    setCepHint("Obtendo GPS…");
    try {
      const pos = await getCurrentPosition();
      setCepHint("Identificando cidade…");
      const place = await reverseGeocode(pos.lat, pos.lng);
      if (!place.ok) {
        setCepStatus("error");
        setCepHint(place.reason);
        toast("Não foi possível ler a localização", { tone: "warn", sub: place.reason });
        return;
      }
      setFromGps(true);
      setF((x) => ({
        ...x,
        cidade: place.cidade,
        uf: place.uf,
        cep: place.cep ? formatCEP(place.cep) : x.cep,
        latitude: place.lat,
        longitude: place.lng,
      }));
      setCepStatus("ok");
      setCepHint(`GPS · ${place.cidade}/${place.uf} · ${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`);
      toast("Localização atual aplicada", {
        tone: "ok",
        sub: `${place.cidade}/${place.uf} — coordenadas salvas para as rotas`,
      });
    } catch (e) {
      setCepStatus("error");
      const msg = e instanceof Error ? e.message : "Falha ao obter GPS";
      setCepHint(msg);
      toast("Localização atual", { tone: "warn", sub: msg });
    } finally {
      setGpsLoading(false);
    }
  };

  const save = () => {
    if (String(f.cep ?? "").trim() && !isValidCEP(f.cep)) {
      toast("CEP inválido", { sub: "Informe 8 dígitos ou deixe em branco.", tone: "warn" });
      return;
    }
    if (isValidCEP(f.cep) && !fromGps && (typeof f.latitude !== "number" || typeof f.longitude !== "number")) {
      toast("Localização pendente", { sub: "Aguarde o CEP carregar a posição, use o GPS ou limpe o CEP.", tone: "warn" });
      return;
    }
    const keys: (keyof Company)[] = [
      "nome", "razaoSocial", "cnpj", "cep", "endereco", "cidade", "uf", "latitude", "longitude", "regiao", "ramo",
      "colhedoras", "modelos", "prensa", "marcaAtual", "concorrente", "potencial", "potencialMensal", "urgencia",
      "ownerId", "observacoes", "influenciadoraId", "condicaoDependencia",
    ];
    const patch: Partial<Company> = {};
    keys.forEach((k) => {
      let next = f[k];
      let prev = company[k];
      if (k === "cep") {
        next = f.cep ? normalizeCEP(f.cep) : undefined;
        prev = company.cep ? normalizeCEP(company.cep) : undefined;
      }
      if (next !== prev) (patch as Record<string, unknown>)[k] = next;
    });
    if (String(f.cnpj ?? "").trim() && !isValidCNPJ(f.cnpj)) {
      toast("CNPJ inválido", { sub: "Informe 14 dígitos com os dígitos verificadores corretos.", tone: "warn" });
      return;
    }
    if ("cnpj" in patch) patch.cnpj = storedCNPJ(patch.cnpj);
    s.updateCompany(company.id, patch);
    toast("Cadastro atualizado", { sub: `${Object.keys(patch).length} campo(s) alterado(s) · registrado na auditoria` });
    close();
  };
  return (
    <Modal
      onClose={close}
      size="lg"
      kicker={company.codigo}
      title="Editar cadastro"
      icon={<Building2 size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={cepStatus === "loading" || gpsLoading}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nome fantasia" className="lg:col-span-2">
          <Input value={f.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
        </Field>
        <Field label="CNPJ">
          <Input value={f.cnpj ?? ""} inputMode="numeric" autoComplete="off" maxLength={18} onChange={(e) => set("cnpj", formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
        </Field>
        <Field label="Razão social" className="lg:col-span-3">
          <Input value={f.razaoSocial ?? ""} onChange={(e) => set("razaoSocial", e.target.value)} />
        </Field>
        <Field label="CEP" hint={cepHint || (fromGps ? "GPS ativo — CEP opcional" : "preenche cidade, UF e região")}>
          <Input
            value={f.cep ?? ""}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            placeholder="00000-000"
            className={cn(cepStatus === "ok" && "border-ok", cepStatus === "error" && "border-brand")}
            onChange={(e) => {
              const cep = formatCEP(e.target.value);
              setFromGps(false);
              setF((x) => ({ ...x, cep, latitude: undefined, longitude: undefined }));
              setCepStatus("idle");
              setCepHint("");
              if (normalizeCEP(cep).length === 8) void resolveCep(cep);
            }}
            onBlur={() => {
              if (normalizeCEP(f.cep).length === 8) void resolveCep(String(f.cep));
            }}
          />
        </Field>
        <Field label="Endereço" className="lg:col-span-2" hint="rua, número e bairro (manual)">
          <Input
            value={f.endereco ?? ""}
            onChange={(e) => set("endereco", e.target.value)}
            placeholder="Ex.: Rodovia GO-306, km 12 — Zona Rural"
          />
        </Field>
        <div className="lg:col-span-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={gpsLoading || cepStatus === "loading"}
            onClick={() => void useCurrentLocation()}
          >
            <LocateFixed size={14} />
            {gpsLoading ? "Localizando…" : "Preencher com localização atual"}
          </Button>
        </div>
        <Field label="Cidade" hint="preenchida pelo CEP">
          <Input value={f.cidade ?? ""} onChange={(e) => set("cidade", e.target.value)} />
        </Field>
        <Field label="UF" hint="preenchida pelo CEP">
          <Input
            value={f.uf ?? ""}
            maxLength={2}
            placeholder="SP"
            onChange={(e) => set("uf", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
          />
        </Field>
        <Field label="Região">
          <Select value={f.regiao ?? ""} onChange={(e) => set("regiao", e.target.value)}>
            <option value="">—</option>
            {REGIOES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Ramo">
          <Select value={f.ramo ?? ""} onChange={(e) => set("ramo", e.target.value)}>
            <option value="">—</option>
            {RAMOS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nº de colhedoras">
          <Input type="number" value={f.colhedoras ?? ""} onChange={(e) => set("colhedoras", e.target.value ? Number(e.target.value) : undefined)} />
        </Field>
        <Field label="Modelos">
          <Input value={f.modelos ?? ""} onChange={(e) => set("modelos", e.target.value)} />
        </Field>
        <Field label="Tipo de prensa">
          <Select value={f.prensa ?? ""} onChange={(e) => set("prensa", (e.target.value || undefined) as Prensa)}>
            <option value="">—</option>
            {PRENSAS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Marca atual">
          <Select value={f.marcaAtual ?? ""} onChange={(e) => set("marcaAtual", e.target.value)}>
            <option value="">—</option>
            {MARCAS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Concorrente">
          <Input value={f.concorrente ?? ""} onChange={(e) => set("concorrente", e.target.value)} />
        </Field>
        <Field label="Potencial">
          <Select value={f.potencial ?? ""} onChange={(e) => set("potencial", (e.target.value || undefined) as Potencial)}>
            <option value="">—</option>
            <option>Alto</option>
            <option>Médio</option>
            <option>Baixo</option>
          </Select>
        </Field>
        <Field label="Urgência">
          <Select value={f.urgencia} onChange={(e) => set("urgencia", e.target.value as Urgencia)}>
            <option>Alta</option>
            <option>Média</option>
            <option>Baixa</option>
          </Select>
        </Field>
        <Field label="Responsável">
          <Select value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
            {s.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Empresa influenciadora" hint="dependência comercial" className="lg:col-span-2">
          <Select value={f.influenciadoraId ?? ""} onChange={(e) => set("influenciadoraId", e.target.value || undefined)}>
            <option value="">Nenhuma</option>
            {s.companies
              .filter((c) => c.id !== company.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Condição de avanço" className="lg:col-span-3">
          <Input value={f.condicaoDependencia ?? ""} onChange={(e) => set("condicaoDependencia", e.target.value)} placeholder="Ex.: só avança se a usina homologar" />
        </Field>
        <Field label="Observações" className="lg:col-span-3">
          <Textarea value={f.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

export function CobrancaModal({ companyId, texto: initial }: { companyId: string; texto?: string }) {
  const s = useStore();
  const { close, toast } = useUI();
  const company = s.companies.find((c) => c.id === companyId);
  const owner = s.users.find((u) => u.id === company?.ownerId);
  const next = company ? nextStepOf(s, company.id) : undefined;
  const [texto, setTexto] = useState(initial ?? "");
  if (!company || !owner) return null;
  const chips = [
    next ? `${owner.short}, como está "${next.titulo}"? Me atualiza até amanhã.` : `${owner.short}, essa conta está sem próximo passo. Define hoje, por favor.`,
    `${owner.short}, vamos rever a estratégia dessa conta na reunião de sexta.`,
    `${owner.short}, se precisar de apoio técnico nessa conta, me chama que eu vou junto.`,
  ];
  const send = () => {
    s.sendCobranca({ companyId, toUserId: owner.id, texto });
    toast(`Comentário enviado para ${owner.short}`, { sub: "Notificação no app e registro no histórico" });
    close();
  };
  return (
    <Modal
      onClose={close}
      kicker={company.nome}
      title={`Comentar e cobrar ${owner.short}`}
      icon={<Megaphone size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={send} disabled={!texto.trim()}>
            Enviar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Escreva o comentário para o vendedor…" autoFocus />
        <div className="flex flex-col gap-1.5">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => setTexto(c)} className="rounded-[4px] border border-dashed border-line px-2.5 py-1.5 text-left text-[12px] text-navy-3 hover:border-navy/40">
              {c}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** Lista de origem de um indicador (RN-08). */
export function DrillModal({ title, subtitle, companyIds }: { title: string; subtitle?: string; companyIds: string[] }) {
  const s = useStore();
  const { close } = useUI();
  const list = companyIds.map((id) => s.companies.find((c) => c.id === id)).filter(Boolean) as Company[];
  return (
    <Modal onClose={close} size="lg" kicker="Registros que formam este número" title={title}>
      {subtitle && <p className="-mt-1 mb-3 text-[12.5px] text-muted">{subtitle}</p>}
      <div className="overflow-hidden rounded-[6px] border border-line">
        {list.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted">Nenhum registro compõe este número agora.</div>}
        {list.map((c) => {
          const deal = currentDealOf(s, c.id);
          const next = nextStepOf(s, c.id);
          const q = qualityOf(s, c);
          return (
            <Link key={c.id} href={`/empresas/${c.id}`} onClick={close} className="flex items-center gap-3 border-b border-line/70 px-4 py-3 last:border-b-0 hover:bg-soft/40">
              <UserAvatar userId={c.ownerId} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">{c.nome}</span>
                  <StagePill deal={deal} />
                  {c.status !== "ativa" && <StatusBadge c={c} />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
                  <span>
                    {c.cidade}/{c.uf}
                  </span>
                  {next ? (
                    <span className="inline-flex items-center gap-1">
                      {next.titulo} · <DueLabel iso={next.dueAt} />
                    </span>
                  ) : (
                    <span className="font-semibold text-brand">sem próximo passo</span>
                  )}
                  <span>cadastro {q.score}%</span>
                </div>
              </div>
              <ExternalLink size={14} className="text-muted" />
            </Link>
          );
        })}
      </div>
    </Modal>
  );
}

export function DeleteCompanyModal({ companyId }: { companyId: string }) {
  const s = useStore();
  const user = useCurrentUser();
  const router = useRouter();
  const { close, toast } = useUI();
  const company = s.companies.find((c) => c.id === companyId);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  if (!company || !isMuriloLouis(user)) return null;

  const confirm = async () => {
    if (!isMuriloLouis(user) || motivo.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/crm/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteCompany", id: company.id, actorId: user.id, reason: motivo.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error ?? "Não foi possível excluir a empresa", { tone: "warn" });
        return;
      }
      s.removeCompany(company.id);
      toast("Empresa excluída", { sub: company.nome });
      close();
      router.push("/carteira");
    } catch {
      toast("Não foi possível excluir a empresa", { tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={close}
      size="sm"
      kicker="Exclusão administrativa"
      title={company.nome}
      icon={<Trash2 size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} disabled={motivo.trim().length < 3 || busy}>
            {busy ? "Excluindo…" : "Excluir empresa"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-ink/80">
          A empresa {company.codigo} sai da carteira, dos funis e do banco. O motivo fica na auditoria. Somente Murilo Louis pode excluir.
        </p>
        <Field label="Motivo" required>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Por que esta empresa deve ser excluída" />
        </Field>
      </div>
    </Modal>
  );
}
