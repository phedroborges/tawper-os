import { NextResponse } from "next/server";
import { invalidateCrmReadCache } from "@/server/crm";
import { duplicateQuoteRecord, listQuotes, saveQuoteRecord, setQuoteStatusRecord } from "@/server/quotes";
import { sendQuote } from "@/server/quote-send";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ quotes: await listQuotes() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler os orçamentos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    switch (body.action) {
      case "save":
        return NextResponse.json({ quote: await saveQuoteRecord(body.quote, body.actorId) });
      case "duplicate":
        return NextResponse.json({ quote: await duplicateQuoteRecord(body.id, body.actorId) });
      case "setStatus":
        invalidateCrmReadCache();
        return NextResponse.json({ quote: await setQuoteStatusRecord(body.id, body.status) });
      case "send": {
        const quote = await sendQuote(body.send);
        invalidateCrmReadCache();
        return NextResponse.json({ quote });
      }
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gravar o orçamento." }, { status: 400 });
  }
}
