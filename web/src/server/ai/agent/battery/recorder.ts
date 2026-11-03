import { AsyncLocalStorage } from "node:async_hooks";

/** Gravações simuladas de cada rodada da bateria. Separadas por rodada, porque as rodadas correm em paralelo. */
export type Call = { name: string; args: unknown[] };

export const rodada = new AsyncLocalStorage<Call[]>();

export function recorder<T>(name: string, result: (...args: unknown[]) => T) {
  return async (...args: unknown[]) => {
    rodada.getStore()?.push({ name, args });
    return result(...args);
  };
}
