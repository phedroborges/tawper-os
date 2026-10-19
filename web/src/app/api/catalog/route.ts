import { NextResponse } from "next/server";
import { listProducts, saveProduct, setProductActive } from "@/server/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ products: await listProducts() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler o catálogo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    switch (body.action) {
      case "save":
        return NextResponse.json({ product: await saveProduct(body.product) });
      case "setActive":
        return NextResponse.json({ product: await setProductActive(body.id, Boolean(body.ativo)) });
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gravar o produto." }, { status: 400 });
  }
}
