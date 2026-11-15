"use client";
/* eslint-disable @next/next/no-img-element, @next/next/no-location-assign-relative-destination */

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useStore } from "@/lib/store";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function EnterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const loginLocal = useStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(() => params.get("oauth_error") || params.get("error_description") || "");
  const [busy, setBusy] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);

  const next = useMemo(() => {
    const value = params.get("next") || "/meu-dia";
    return value.startsWith("/") ? value : "/meu-dia";
  }, [params]);

  // Processa retorno do Google OAuth (#access_token=... ou ?code=...)
  useEffect(() => {
    const code = params.get("code");
    let hashToken = "";
    let hashError = "";
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      hashToken = hashParams.get("access_token") || "";
      hashError = hashParams.get("error_description") || hashParams.get("error") || "";
    }

    if (!hashError && !hashToken && !code) return;

    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (hashError) {
        setError(hashError);
        return;
      }
      setBusyGoogle(true);
      setError("");
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: hashToken || undefined,
            code: code || undefined,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          user?: { id: string };
          profileId?: string;
        };
        if (!res.ok) {
          throw new Error(body.error || "Não foi possível entrar com o Google.");
        }
        if (cancelled) return;
        if (body.profileId) loginLocal(body.profileId);
        else if (body.user?.id) loginLocal(body.user.id);
        router.replace(next);
        router.refresh();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Não foi possível entrar com o Google.");
          setBusyGoogle(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, next, loginLocal, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as {
        error?: string;
        user?: { id: string };
        profileId?: string;
      };
      if (!res.ok) throw new Error(body.error || "Não foi possível entrar.");
      if (body.profileId) loginLocal(body.profileId);
      else if (body.user?.id) loginLocal(body.user.id);
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleLogin() {
    setBusyGoogle(true);
    setError("");
    window.location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  }

  return (
    <main
      className="min-h-dvh w-full bg-[#0c101a] text-[#141d35] lg:grid lg:grid-cols-12"
      style={{ fontFamily: "'Manrope', 'Poppins', system-ui, -apple-system, sans-serif" }}
    >
      <style>{`
        @font-face {
          font-family: 'Manrope';
          src: url('/apresentacao-tawper/assets/fontes/Manrope-Variable.ttf') format('truetype');
          font-weight: 200 800;
          font-display: swap;
        }
      `}</style>

      {/* =================================================================== */}
      {/* COLUNA ESQUERDA — HERO EDITORIAL TAWPER (DESIGN SYSTEM APRESENTAÇÃO) */}
      {/* =================================================================== */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#141d35] p-12 text-white lg:col-span-7 lg:flex xl:p-16">
        {/* Barra lateral vermelha assinatura Tawper */}
        <div className="absolute inset-y-0 left-0 z-20 w-1.5 bg-[#e31c3f]" />

        {/* Imagem industrial de fundo + Véu editorial */}
        <img
          src="/apresentacao-tawper/assets/geradas/14-capa-terminais-catalogo.png"
          alt="Bancada de mangueiras e prensa hidráulica Tawper"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, rgba(12,24,47,0.97) 0%, rgba(20,29,53,0.92) 48%, rgba(41,56,127,0.68) 100%)",
          }}
        />

        {/* Topbar */}
        <header className="relative z-10 flex items-center justify-between">
          <img
            src="/apresentacao-tawper/assets/marca/tawper.svg"
            alt="Tawper — Mangueiras e Conexões"
            className="h-9 w-auto brightness-0 invert"
          />
          <span className="text-[11.5px] font-bold tracking-[0.16em] text-white/70 uppercase">
            TAWPER OS · ENTERPRISE PLATFORM
          </span>
        </header>

        {/* Conteúdo Central */}
        <div className="relative z-10 my-auto max-w-2xl py-10">
          <div className="mb-5 flex items-center gap-3.5">
            <span className="block h-1 w-8 bg-[#e31c3f]" />
            <span className="text-[12.5px] font-extrabold tracking-[0.16em] text-white/90 uppercase">
              OPERAÇÃO COMERCIAL, PROPOSTAS &amp; AUDITORIA IA
            </span>
          </div>

          <h1 className="text-[44px] leading-[1.06] font-extrabold tracking-[-0.045em] text-white xl:text-[52px]">
            Soluções completas para a gestão comercial em campo.
          </h1>

          <p className="mt-5 max-w-xl text-[17px] leading-[1.5] font-normal text-[#dbe3f4]">
            Centralize a carteira de usinas, rotas presenciais, propostas executivas conectadas ao ERP e auditoria em tempo real do agente de IA no WhatsApp.
          </p>

          {/* 3 Pilares no estilo .proof / .story-path da Apresentação */}
          <div className="mt-10 grid grid-cols-3 gap-6 border-t border-white/20 pt-7">
            <div>
              <span className="block text-[11px] font-extrabold tracking-[0.14em] text-[#ff8da3] uppercase">
                01 · CARTEIRA &amp; FUNIS
              </span>
              <strong className="mt-1.5 block text-[18px] leading-snug font-extrabold tracking-tight text-white">
                Aquisição &amp; Recorrência
              </strong>
              <p className="mt-1 text-[13px] leading-relaxed text-[#c3ccdf]">
                Diagnóstico de frota, colhedoras, prensas e alertas de cadência por vendedor.
              </p>
            </div>

            <div>
              <span className="block text-[11px] font-extrabold tracking-[0.14em] text-[#ff8da3] uppercase">
                02 · PROPOSTA OFICIAL
              </span>
              <strong className="mt-1.5 block text-[18px] leading-snug font-extrabold tracking-tight text-white">
                Apresentação + ERP
              </strong>
              <p className="mt-1 text-[13px] leading-relaxed text-[#c3ccdf]">
                Apresentação comercial padronizada com leitura por IA e anexo do orçamento em PDF.
              </p>
            </div>

            <div>
              <span className="block text-[11px] font-extrabold tracking-[0.14em] text-[#ff8da3] uppercase">
                03 · ATENDIMENTO IA
              </span>
              <strong className="mt-1.5 block text-[18px] leading-snug font-extrabold tracking-tight text-white">
                WhatsApp Auditado
              </strong>
              <p className="mt-1 text-[13px] leading-relaxed text-[#c3ccdf]">
                Registros por áudio ou texto com avaliação automática em 2 camadas e regras de prompt.
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé institucional igual ao .cover-bottom da Apresentação */}
        <footer className="relative z-10 flex items-center justify-between border-l-4 border-[#e31c3f] bg-[#141d35]/85 px-5 py-3.5 backdrop-blur-xs">
          <p className="text-[13.5px] text-[#dbe3f4]">
            <strong className="font-extrabold text-white">Tawper Mangueiras e Conexões</strong> &nbsp;·&nbsp; Monte Aprazível/SP &amp; Maceió/AL
          </p>
          <span className="text-[12px] font-bold tracking-[0.08em] text-white/60 uppercase">
            +8 ANOS ENTREGANDO CONFIABILIDADE
          </span>
        </footer>
      </section>

      {/* =================================================================== */}
      {/* COLUNA DIREITA — PAINEL DE AUTENTICAÇÃO ALINHADO                    */}
      {/* =================================================================== */}
      <section className="flex min-h-dvh flex-col justify-between bg-[#f5f5f2] px-6 py-8 sm:px-12 lg:col-span-5 lg:bg-white lg:px-12 xl:px-16">
        {/* Topo mobile / Status de segurança */}
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <BrandLogo width={124} height={34} className="h-8 w-auto" />
          </div>
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#dce0e8] bg-white px-3 py-1 text-[11.5px] font-bold text-[#29387f] shadow-2xs">
            <ShieldCheck size={13} className="text-[#e31c3f]" />
            Ambiente Corporativo Seguro
          </div>
        </div>

        {/* Card Central de Login */}
        <div className="mx-auto my-auto w-full max-w-[410px] py-8">
          <div className="mb-7">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="block h-1 w-6 bg-[#e31c3f]" />
              <span className="text-[11.5px] font-extrabold tracking-[0.15em] text-[#29387f] uppercase">
                ACESSO À PLATAFORMA
              </span>
            </div>
            <h2 className="text-[30px] leading-[1.12] font-extrabold tracking-[-0.035em] text-[#141d35]">
              Entrar no Tawper OS
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#626b7d]">
              Entre com sua conta Google corporativa ou utilize seu e-mail e senha cadastrados na equipe.
            </p>
          </div>

          {/* Botão OAuth do Google */}
          <button
            type="button"
            disabled={busy || busyGoogle}
            onClick={handleGoogleLogin}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-[8px] border border-[#dce0e8] bg-white px-4 text-[14px] font-bold text-[#141d35] shadow-2xs transition-all hover:border-[#29387f]/40 hover:bg-[#f5f5f2]/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            <span>{busyGoogle ? "Conectando ao Google…" : "Continuar com o Google"}</span>
          </button>

          {/* Divisor */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#dce0e8]" />
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-[#626b7d] uppercase">
              ou e-mail e senha
            </span>
            <div className="h-px flex-1 bg-[#dce0e8]" />
          </div>

          {/* Formulário E-mail e Senha */}
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="mb-1.5 block text-[12px] font-extrabold tracking-[0.06em] text-[#141d35] uppercase"
              >
                E-mail corporativo
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#626b7d]"
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@tawper.com.br"
                  className="h-11 w-full rounded-[8px] border border-[#dce0e8] bg-white pr-3.5 pl-10 text-[14px] font-medium text-[#141d35] placeholder:text-[#626b7d]/60 outline-none transition-all focus:border-[#29387f] focus:ring-3 focus:ring-[#29387f]/12"
                  required
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="block text-[12px] font-extrabold tracking-[0.06em] text-[#141d35] uppercase"
                >
                  Senha
                </label>
                <span className="text-[11.5px] font-semibold text-[#626b7d]">Acesso gerenciado pelo Admin</span>
              </div>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#626b7d]"
                />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-[8px] border border-[#dce0e8] bg-white pr-10 pl-10 text-[14px] font-medium text-[#141d35] placeholder:text-[#626b7d]/60 outline-none transition-all focus:border-[#29387f] focus:ring-3 focus:ring-[#29387f]/12"
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-[#626b7d] hover:text-[#141d35]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-[8px] border border-[#e31c3f]/30 bg-[#fef2f2] p-3.5 text-[13px] leading-snug text-[#b91c1c]">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#e31c3f]" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || busyGoogle}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[#e31c3f] px-5 text-[14px] font-extrabold tracking-[0.02em] text-white shadow-sm transition-all hover:bg-[#c41534] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{busy ? "Autenticando…" : "Entrar no Tawper OS"}</span>
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="mt-6 rounded-[8px] border border-[#dce0e8] bg-[#f5f5f2]/70 px-4 py-3 text-[12px] leading-relaxed text-[#626b7d]">
            <strong className="font-bold text-[#141d35]">Política de acesso:</strong> somente usuários ativos na Equipe Tawper podem acessar o sistema. No login com Google, o e-mail precisa corresponder a um perfil aprovado pelo Administrador.
          </div>
        </div>

        {/* Rodapé da coluna direita */}
        <div className="flex items-center justify-between border-t border-[#dce0e8] pt-4 text-[11.5px] text-[#626b7d]">
          <span>© {new Date().getFullYear()} Tawper Mangueiras e Conexões</span>
          <span className="font-semibold text-[#29387f]">Tawper OS</span>
        </div>
      </section>
    </main>
  );
}

export default function EnterPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-[#0c101a] text-sm font-medium text-white/70">
          Carregando Tawper OS…
        </main>
      }
    >
      <EnterForm />
    </Suspense>
  );
}
