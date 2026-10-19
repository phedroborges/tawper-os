"use client";

import Image from "next/image";
import { useLayoutEffect } from "react";
import { useUI } from "@/lib/ui-store";

/** Tela única de espera da Central de conversas, até o WhatsApp terminar de abrir. */
export function ConversasLoading() {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-paper/90 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-4">
        <Image src="/brand/tawper-logo.png" alt="Tawper" width={293} height={83} className="h-auto w-[132px]" priority />
        <div className="h-0.5 w-36 overflow-hidden rounded bg-soft-2">
          <div className="h-full w-1/2 animate-pulse bg-navy" />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold text-ink">Abrindo conversas…</p>
          <p className="mt-0.5 text-[12.5px] text-muted">Carregando o WhatsApp da Tawper</p>
        </div>
      </div>
    </div>
  );
}

/** Encerra a tela de espera só depois que a lista de conversas montou. */
export function ConversasReady() {
  const endConversasLoad = useUI((s) => s.endConversasLoad);
  useLayoutEffect(() => {
    endConversasLoad();
  }, [endConversasLoad]);
  return null;
}
