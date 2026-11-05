import "server-only";

import { AuthError, authErrorResponse, requireSession, type Session } from "./session";
import { activeMember, supabaseOn } from "./team";

/** Sessão válida e pessoa ainda ativa no painel Equipe; o papel vale o de agora, não o do login. */
export async function withSession(request: Request): Promise<Session> {
  const session = requireSession(request);
  if (!supabaseOn()) return session;
  const member = await activeMember(session.userId);
  if (!member) throw new AuthError("Seu acesso foi desativado. Fale com o administrador.");
  return { ...session, role: member.role };
}

export function jsonAuthError(error: unknown) {
  return authErrorResponse(error);
}
