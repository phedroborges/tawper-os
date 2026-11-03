import { NextResponse } from "next/server";
import { USERS } from "@/lib/constants";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { invalidateCrmReadCache } from "@/server/crm";
import { duplicateQuoteRecord, listQuotes, saveQuoteRecord, setQuoteStatusRecord } from "@/server/quotes";
import { sendQuote } from "@/server/quote-send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    withSession(request);
    return NextResponse.json({ quotes: await listQuotes() });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler os orçamentos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = withSession(request);
    const body = await request.json();
    const actor = USERS.find((user) => user.id === session.userId);
    switch (body.action) {
      case "save": {
        const quote = await saveQuoteRecord(body.quote, session.userId);
        invalidateCrmReadCache();
        return NextResponse.json({ quote });
      }
      case "duplicate": {
        const quote = await duplicateQuoteRecord(body.id, session.userId);
        invalidateCrmReadCache();
        return NextResponse.json({ quote });
      }
      case "setStatus":
        invalidateCrmReadCache();
        return NextResponse.json({ quote: await setQuoteStatusRecord(body.id, body.status) });
      case "send": {
        const send = body.send ?? {};
        if (send.via === "whatsapp") {
          if (!actor) throw new Error("Perfil da sessão inválido.");
          const quote = await sendQuote({
            quoteId: send.quoteId,
            via: "whatsapp",
            contactId: send.contactId,
            message: send.message,
            agent: { id: session.userId, name: actor.name, role: session.role },
          });
          invalidateCrmReadCache();
          return NextResponse.json({ quote });
        }
        const quote = await sendQuote({
          quoteId: send.quoteId,
          via: "manual",
          contactId: send.contactId,
          actorId: session.userId,
        });
        invalidateCrmReadCache();
        return NextResponse.json({ quote });
      }
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gravar o orçamento." }, { status: 400 });
  }
}
