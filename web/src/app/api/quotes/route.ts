import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { invalidateCrmReadCache } from "@/server/crm";
import { attachQuoteRecord, listQuotes, setQuoteStatusRecord } from "@/server/quotes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await withSession(request);
    return NextResponse.json({ quotes: await listQuotes() });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler os orçamentos." }, { status: 500 });
  }
}

/** Formulário com arquivo = anexar o orçamento feito no sistema da empresa. JSON = mudar o status. */
export async function POST(request: Request) {
  try {
    const session = await withSession(request);
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("arquivo");
      if (!(file instanceof File)) throw new Error("Anexe o PDF do orçamento.");
      const text = (key: string) => String(form.get(key) ?? "");
      const quote = await attachQuoteRecord(
        {
          companyId: text("companyId"),
          dealId: text("dealId"),
          numeroExterno: text("numero"),
          valor: Number(text("valor")),
          condicao: text("condicao"),
          validadeDias: Number(text("validade")),
          observacoes: text("observacoes"),
          contactId: text("contactId") || undefined,
          file: { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name },
        },
        session.userId,
      );
      invalidateCrmReadCache();
      return NextResponse.json({ quote });
    }
    const body = await request.json();
    if (body.action !== "setStatus") return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    const quote = await setQuoteStatusRecord(body.id, body.status);
    invalidateCrmReadCache();
    return NextResponse.json({ quote });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gravar o orçamento." }, { status: 400 });
  }
}
