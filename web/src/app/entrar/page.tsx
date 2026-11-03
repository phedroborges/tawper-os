"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/primitives";
import { ROLE_LABEL, USERS } from "@/lib/constants";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function EnterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const loginLocal = useStore((s) => s.login);
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState(USERS[0]?.id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = useMemo(() => {
    const value = params.get("next") || "/meu-dia";
    return value.startsWith("/") ? value : "/meu-dia";
  }, [params]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, userId }),
      });
      const body = (await res.json()) as { error?: string; user?: { id: string } };
      if (!res.ok) throw new Error(body.error || "Não foi possível entrar.");
      if (body.user?.id) loginLocal(body.user.id);
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,#f7ebe9,transparent_40%),linear-gradient(#f4f6f8,#eef1f4)] px-4 py-10">
      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-[10px] border border-line bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Image src="/brand/tawper-logo.png" alt="Tawper" width={112} height={32} className="h-8 w-auto" />
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Entrar no Tawper OS</h1>
            <p className="text-[12.5px] text-muted">Senha do aplicativo + perfil. Sem isso a API não grava nada.</p>
          </div>
        </div>

        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink">
          Senha do aplicativo
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-[6px] border border-line px-3 py-2 text-[14px] font-normal outline-none focus:border-brand"
            required
          />
        </label>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[12.5px] font-medium text-ink">Perfil</legend>
          {USERS.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => setUserId(user.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-[6px] border px-3 py-2 text-left",
                userId === user.id ? "border-brand bg-brand-soft" : "border-line hover:bg-soft",
              )}
            >
              <Avatar name={user.name} initials={user.initials} color={user.color} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">{user.name}</span>
                <span className="block truncate text-[11.5px] text-muted">{ROLE_LABEL[user.role]}</span>
              </span>
            </button>
          ))}
        </fieldset>

        {error && <p className="rounded-[6px] bg-brand-soft px-3 py-2 text-[12.5px] text-brand">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded-[6px] bg-brand px-4 py-2.5 text-[13.5px] font-medium text-white disabled:opacity-60"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

export default function EnterPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center text-muted">Carregando…</main>}>
      <EnterForm />
    </Suspense>
  );
}
