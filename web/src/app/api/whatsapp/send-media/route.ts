import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { activeMember } from "@/server/auth/team";
import { MAX_MEDIA_BYTES, sendProofMedia } from "@/server/integrations/stevo-proof/outbound";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  try {
    const session = await withSession(request);
    const actor = await activeMember(session.userId);
    if (!actor) throw new Error("Perfil da sessão inválido.");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Envio inválido." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Escolha um arquivo." }, { status: 400 });
    if (file.size > MAX_MEDIA_BYTES) return NextResponse.json({ error: "Arquivo maior que 16 MB." }, { status: 413 });
    const sent = await sendProofMedia({
      to: field(form, "to"),
      caption: field(form, "caption"),
      agent: { id: session.userId, name: actor.name, role: session.role },
      file: { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type, name: file.name },
    });
    return NextResponse.json({ ok: true, ...sent });
  } catch (cause) {
    return jsonAuthError(cause) ?? NextResponse.json({ error: cause instanceof Error ? cause.message : "Não foi possível enviar o arquivo." }, { status: 400 });
  }
}
