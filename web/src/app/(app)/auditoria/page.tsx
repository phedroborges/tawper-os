"use client";

import { History, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { UserAvatar, userName } from "@/components/crm/crm";
import { Badge, Card, Empty, Input, PageHeader, Select } from "@/components/ui/primitives";
import { isManager } from "@/lib/constants";
import { fmtDateTime } from "@/lib/dates";
import { useCurrentUser, useStore } from "@/lib/store";
import type { AuditEntry } from "@/lib/types";
import { normalize } from "@/lib/utils";

const ORIGEM_LABEL: Record<AuditEntry["origem"], string> = { usuario: "Usuário", ia: "IA", automacao: "Automação", integracao: "Integração" };

export default function AuditoriaPage() {
  const s = useStore();
  const user = useCurrentUser();
  const [origem, setOrigem] = useState("");
  const [autor, setAutor] = useState("");
  const [entidade, setEntidade] = useState("");
  const [q, setQ] = useState("");
  const entidades = useMemo(() => Array.from(new Set(s.audit.map((a) => a.entidade))).sort(), [s.audit]);
  const rows = useMemo(() => {
    const n = normalize(q);
    return s.audit
      .filter((a) => (!origem || a.origem === origem) && (!autor || a.autorId === autor) && (!entidade || a.entidade === entidade))
      .filter((a) => !n || normalize(`${s.companies.find((c) => c.id === a.companyId)?.nome ?? ""} ${a.campo} ${a.para ?? ""} ${a.de ?? ""}`).includes(n))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [s.audit, s.companies, origem, autor, entidade, q]);

  if (!isManager(user)) return <Empty icon={<History size={20} />} title="Área do administrador" text="Troque para o perfil do Murilo para consultar a auditoria." />;

  const counts = (o: AuditEntry["origem"]) => s.audit.filter((a) => a.origem === o).length;

  return (
    <div>
      <PageHeader
        kicker="Histórico imutável · RN-10"
        title="Auditoria"
        subtitle="Quem alterou, o quê, quando, de onde veio a mudança (usuário, IA, automação ou integração), valor anterior e valor novo."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["usuario", "ia", "automacao", "integracao"] as const).map((o) => (
          <button key={o} type="button" onClick={() => setOrigem(origem === o ? "" : o)} className={`rounded-[6px] border bg-white p-3 text-left shadow-card ${origem === o ? "border-navy" : "border-line"}`}>
            <div className="label">{ORIGEM_LABEL[o]}</div>
            <div className="mt-1 text-[24px] font-bold text-ink">{counts(o)}</div>
          </button>
        ))}
      </div>
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por empresa, campo ou valor" className="pl-9" />
          </div>
          <Select value={entidade} onChange={(e) => setEntidade(e.target.value)} className="w-auto">
            <option value="">Todas as entidades</option>
            {entidades.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </Select>
          <Select value={autor} onChange={(e) => setAutor(e.target.value)} className="w-auto">
            <option value="">Todos os autores</option>
            <option value="ia">Tawper IA</option>
            <option value="sistema">Sistema</option>
            {s.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.short}
              </option>
            ))}
          </Select>
          <Select value={origem} onChange={(e) => setOrigem(e.target.value)} className="w-auto">
            <option value="">Todas as origens</option>
            {Object.entries(ORIGEM_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-soft/40 text-left">
                {["Quando", "Autor", "Origem", "Empresa", "Entidade · campo", "Antes", "Depois"].map((h) => (
                  <th key={h} className="label px-4 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const c = s.companies.find((x) => x.id === a.companyId);
                return (
                  <tr key={a.id} className="border-b border-line/70 last:border-b-0 hover:bg-soft/40">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted tabular-nums">{fmtDateTime(a.at)}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <UserAvatar userId={a.autorId} size={22} />
                        {userName(s.users, a.autorId)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={a.origem === "ia" ? "ai" : a.origem === "automacao" ? "navy" : "outline"}>{ORIGEM_LABEL[a.origem]}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {c ? (
                        <Link href={`/empresas/${c.id}?tab=auditoria`} className="font-semibold text-ink hover:text-brand">
                          {c.nome}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-muted">{a.entidade} ·</span> <span className="font-medium">{a.campo}</span>
                    </td>
                    <td className="max-w-[220px] px-4 py-2.5 text-muted">
                      <span className="line-clamp-2 line-through decoration-muted/40">{a.de ?? "—"}</span>
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5 font-medium text-ink">
                      <span className="line-clamp-2">{a.para ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted">Nenhum registro com esses filtros.</div>}
      </Card>
    </div>
  );
}
