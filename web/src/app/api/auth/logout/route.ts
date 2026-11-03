import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookie = clearSessionCookie();
  response.cookies.set(cookie.name, cookie.value, cookie);
  return response;
}
