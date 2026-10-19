"use client";

import { useRef, useState } from "react";

/**
 * Executa uma ação que grava no banco e acompanha o resultado: `busy` enquanto grava e `error`
 * com a mensagem do servidor quando recusa. Devolve `true` se deu certo.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return { busy, error, run, clear: () => setError("") };
}
