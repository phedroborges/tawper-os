"use client";

import { ArrowLeft, Building2, Columns3, MessageCircle, Plus, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

const SCREENS = [
  { path: "/meu-dia", label: "Meu Dia", icon: <Sun size={15} /> },
  { path: "/conversas", label: "Conversas", icon: <MessageCircle size={15} /> },
  { path: "/carteira", label: "Carteira", icon: <Building2 size={15} /> },
  { path: "/funis", label: "Funis", icon: <Columns3 size={15} /> },
];

/** O mesmo app renderizado dentro de uma moldura de celular (390 px) — sem precisar de outro aparelho. */
export default function CelularPage() {
  const [path, setPath] = useState("/meu-dia");
  const [nonce, setNonce] = useState(0);
  return (
    <div className="navy-flat min-h-dvh px-6 py-6 text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center">
        <div className="max-w-md pt-4">
          <Link href="/meu-dia" className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/60 hover:text-white">
            <ArrowLeft size={14} /> Voltar para o sistema
          </Link>
          <Image src="/brand/tawper-logo-white.png" alt="Tawper" width={150} height={42} />
          <div className="label mt-6 text-white/50">Aplicativo do vendedor</div>
          <h1 className="mt-2 text-[34px] leading-[1.05] font-bold tracking-[-0.03em]">O essencial com poucos toques, no campo.</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-white/70">
            É o mesmo sistema, responsivo. O vendedor vê o dia, responde o WhatsApp, registra o resultado em texto livre (ou áudio) e define o próximo passo — tudo pelo celular.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            {SCREENS.map((sc) => (
              <button
                key={sc.path}
                type="button"
                onClick={() => {
                  setPath(sc.path);
                  setNonce((n) => n + 1);
                }}
                className={cn("flex items-center gap-2 rounded-[6px] px-3 py-2.5 text-[13px] font-semibold ring-1 transition", path === sc.path ? "bg-white text-navy ring-white" : "bg-white/[0.05] text-white/80 ring-white/15 hover:bg-white/[0.1]")}
              >
                {sc.icon} {sc.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-[6px] bg-white/[0.05] p-3 text-[12.5px] text-white/70 ring-1 ring-white/10">
            <Plus size={16} className="mt-0.5 shrink-0 rounded-full bg-brand p-0.5 text-white" />
            No celular, o botão vermelho no centro abre o registro rápido com IA. Tudo que for feito aqui aparece na hora na versão desktop.
          </div>
        </div>

        <div className="relative shrink-0">
          <div className="relative h-[844px] w-[410px] max-w-[calc(100vw-2rem)] rounded-[58px] bg-[#0b0b0f] p-[10px] shadow-[0_40px_80px_#00000080,inset_0_0_0_2px_#2b2b33]">
            <div className="absolute top-[18px] left-1/2 z-10 h-[28px] w-[112px] -translate-x-1/2 rounded-full bg-black" />
            <iframe key={`${path}-${nonce}`} src={path} title="Tawper OS no celular" className="h-full w-full rounded-[48px] bg-paper" />
          </div>
        </div>
      </div>
    </div>
  );
}
