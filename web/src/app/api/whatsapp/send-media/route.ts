import { NextResponse } from "next/server";
import { MAX_MEDIA_BYTES, sendProofMedia } from "@/server/integrations/stevo-proof/outbound";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });
  if (file.size > MAX_MEDIA_BYTES) return NextResponse.json({ error: "Arquivo maior que 16 MB." }, { status: 413 });
  try {
    const sent = await sendProofMedia({
      to: field(form, "to"),
      caption: field(form, "caption"),
      agent: { id: field(form, "agentId"), name: field(form, "agentName"), role: field(form, "agentRole") },
      file: { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, name: file.name },
    });
    return NextResponse.json({ ok: true, ...sent });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Não foi possível enviar o arquivo." }, { status: 400 });
  }
}
