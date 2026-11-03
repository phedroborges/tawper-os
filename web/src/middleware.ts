import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "tawper_session";

function authEnforced() {
  return process.env.NEXT_PUBLIC_TAWPER_USE_SUPABASE === "true" || Boolean(process.env.TAWPER_APP_PASSWORD);
}

function isPublic(pathname: string) {
  if (pathname === "/entrar") return true;
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/auth/login")) return true;
  if (pathname.startsWith("/api/auth/me")) return true;
  if (pathname.startsWith("/api/whatsapp/webhook")) return true;
  if (pathname.startsWith("/api/whatsapp/agent/webhook")) return true;
  if (pathname.startsWith("/api/internal/ai/whatsapp-worker")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export function middleware(request: NextRequest) {
  if (!authEnforced() || isPublic(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
