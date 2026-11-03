import { USERS } from "./constants";

/** Lista pública de e-mails de login (sem senha) — só para a tela Entrar. */
export const OPERATOR_LOGIN_HINTS = USERS.map((user) => ({
  id: user.id,
  name: user.name,
  short: user.short,
  role: user.role,
  email: `${user.id.replace(/^u-/, "").toLowerCase()}@tawper.com.br`,
  initials: user.initials,
  color: user.color,
}));
