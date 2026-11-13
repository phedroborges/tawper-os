import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { readQuotePdf } from "@/server/quotes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Entrega o PDF anexado. O arquivo fica em armazenamento privado; só sai por aqui, com sessão. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await withSession(request);
    const { id } = await params;
    const pdf = await readQuotePdf(id);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(pdf.bytes, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="${pdf.name}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível abrir o PDF." }, { status: 400 });
  }
}
