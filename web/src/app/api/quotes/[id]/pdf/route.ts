import { NextResponse } from "next/server";
import { buildQuotePdf, loadQuotePdfContext } from "@/server/quote-pdf";
import { getQuote } from "@/server/quotes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const quote = await getQuote(id);
    const bytes = await buildQuotePdf(quote, await loadQuotePdfContext(quote, url.searchParams.get("contactId") ?? undefined));
    const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="Orcamento_${quote.numero}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível gerar o PDF." }, { status: 400 });
  }
}
