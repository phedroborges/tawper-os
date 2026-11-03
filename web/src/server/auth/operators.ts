import "server-only";

import { USERS } from "@/lib/constants";
import type { User } from "@/lib/types";

/** Senha inicial dos operadores (pode sobrescrever com TAWPER_OPERATOR_PASSWORD). */
export const OPERATOR_PASSWORD = process.env.TAWPER_OPERATOR_PASSWORD || "@Tawper132#";

export type OperatorAccount = {
  user: User;
  email: string;
  legacyEmail: string;
};

/** E-mail de login: primeiro nome do id (u-murilo → murilo@tawper.com.br). */
export function operatorEmailForUserId(userId: string) {
  const slug = userId.replace(/^u-/, "").toLowerCase();
  return `${slug}@tawper.com.br`;
}

export function legacyOperatorEmailForUserId(userId: string) {
  const slug = userId.replace(/^u-/, "").toLowerCase();
  return `${slug}@usuarios.tawper.local`;
}

export function operatorAccounts(): OperatorAccount[] {
  return USERS.map((user) => ({
    user,
    email: operatorEmailForUserId(user.id),
    legacyEmail: legacyOperatorEmailForUserId(user.id),
  }));
}

export function findUserByOperatorEmail(email: string): User | undefined {
  const normalized = email.trim().toLowerCase();
  const account = operatorAccounts().find((item) => item.email === normalized || item.legacyEmail === normalized);
  return account?.user;
}
