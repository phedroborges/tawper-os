import { NextResponse } from "next/server";
import { proofEnabled } from "@/server/integrations/stevo-proof/config";
import { getLiveMedia } from "@/server/integrations/stevo-proof/live-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CACHED = 40;
const MAX_BYTES = 8 * 1024 * 1024;
const cache = new Map<string, { bytes: Buffer; mime: string; fileName: string }>();

/** A Stevo entrega o arquivo no próprio webhook, em `base64` dentro da mensagem. */
async function load(id: string) {
  const hit = cache.get(id);
  if (hit) return hit;
  const media = await getLiveMedia(id);
  const raw = typeof media?.payload.base64 === "string" ? media.payload.base64 : "";
  if (!media || !raw) return null;
  const bytes = Buffer.from(raw.replace(/^data:[^,]*,/, ""), "base64");
  const entry = { bytes, mime: media.mime.split(";")[0] || "application/octet-stream", fileName: media.fileName };
  if (entry.bytes.length <= MAX_BYTES) {
    cache.set(id, entry);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  }
  return entry;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!proofEnabled()) return NextResponse.json({ error: "WhatsApp desligado." }, { status: 404 });
  const { id } = await params;
  try {
    const file = await load(id);
    if (!file) return NextResponse.json({ error: "Mídia indisponível." }, { status: 404 });
    const total = file.bytes.length;
    const headers: Record<string, string> = {
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=86400",
      "Accept-Ranges": "bytes",
    };
    if (file.fileName) headers["Content-Disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range && total > 0) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
      if (start > end || start >= total) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      return new NextResponse(new Uint8Array(file.bytes.subarray(start, end + 1)), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new NextResponse(new Uint8Array(file.bytes), { headers: { ...headers, "Content-Length": String(total) } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Falha ao abrir a mídia." }, { status: 500 });
  }
}
