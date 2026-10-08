"use client";

import { useEffect } from "react";
import { setActorAliases, useStore } from "@/lib/store";
import { useUI } from "@/lib/ui-store";

export function SupabaseBridge() {
  const hydrateCrm = useStore((s) => s.hydrateCrm);
  const setDbHealth = useUI((s) => s.setDbHealth);

  useEffect(() => {
    let cancelled = false;
    setDbHealth({ ok: false, label: "Consultando Supabase…" });
    fetch("/api/crm/snapshot")
      .then((r) => r.json())
      .then((body: { health: { ok: boolean; organization?: string; companies?: number; stages?: number; reason?: string; detail?: string }; snapshot: Parameters<typeof hydrateCrm>[0] | null; actorMap?: Record<string, string> | null }) => {
        if (cancelled) return;
        if (body.health?.ok) {
          setDbHealth({
            ok: true,
            label: `${body.health.organization} · ${body.health.companies ?? 0} empresas · ${body.health.stages ?? 0} etapas`,
          });
          if (body.actorMap) setActorAliases(body.actorMap);
          const current = useStore.getState().currentUserId;
          const mapped = current && body.actorMap ? body.actorMap[current] : undefined;
          if (mapped && mapped !== current) useStore.setState({ currentUserId: mapped });
          if (body.snapshot) hydrateCrm(body.snapshot);
        } else {
          const reason = body.health?.reason === "missing_schema" ? "schema ainda não aplicado no projeto" : body.health?.detail ?? "falha";
          setDbHealth({ ok: false, label: reason });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setDbHealth({ ok: false, label: e instanceof Error ? e.message : "erro de rede" });
      });
    return () => {
      cancelled = true;
    };
  }, [hydrateCrm, setDbHealth]);

  return null;
}

export function DbStatus() {
  const dbHealth = useUI((s) => s.dbHealth);
  if (!dbHealth) return null;
  return (
    <div className={`border-b px-4 py-2 text-[12.5px] md:px-8 ${dbHealth.ok ? "border-line bg-soft text-muted" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
      <span className="font-medium">{dbHealth.ok ? "Banco conectado — " : "Banco pendente — "}</span>
      {dbHealth.label}
    </div>
  );
}
