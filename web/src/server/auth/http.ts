import "server-only";

import { authErrorResponse, requireSession, type Session } from "./session";

export function withSession(request: Request): Session {
  return requireSession(request);
}

export function jsonAuthError(error: unknown) {
  return authErrorResponse(error);
}
