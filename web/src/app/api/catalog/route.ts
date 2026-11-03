import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";

export const dynamic = "force-dynamic";

const GONE =
  "O catálogo de produtos (SKU/preço) foi desativado. Use /propostas para a proposta comercial. Os nomes de produto ficam só no contexto da IA.";

/** Leitura legada: lista vazia para não quebrar telas antigas de orçamento. */
export async function GET(request: Request) {
  try {
    withSession(request);
    return NextResponse.json({ products: [], retired: true, message: GONE });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler o catálogo." }, { status: 500 });
  }
}

/** Escrita do catálogo retirada do produto. */
export async function POST(request: Request) {
  try {
    withSession(request);
    return NextResponse.json({ error: GONE }, { status: 410 });
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: GONE }, { status: 410 });
  }
}
