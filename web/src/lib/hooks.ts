"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useStore } from "./store";

const noop = () => () => {};

/** true só no cliente, depois da hidratação — evita divergência com o HTML do servidor. */
export function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** Relógio da interface (atualiza a cada minuto). */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Todos os dados da demo (re-renderiza a cada mudança — suficiente para o volume da demo). */
export function useData() {
  return useStore();
}

export function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}
