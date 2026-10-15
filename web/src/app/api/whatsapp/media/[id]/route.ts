import { NextResponse } from "next/server";
import { proofEnabled } from "@/server/integrations/stevo-proof/config";
import { loadLiveMediaFile } from "@/server/integrations/stevo-proof/live-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!proofEnabled()) return NextResponse.json({ error: "WhatsApp desligado." }, { status: 404 });
  const { id } = await params;
  try {
    const file = await loadLiveMediaFile(id);
    if (!file) return NextResponse.json({ error: "Mídia indisponível." }, { status: 404 });
    const total = file.bytes.length;
    const headers: Record<string, string> = {
      "Content-Type": file.mime,
      "Cache-Control": "private, no-cache",
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
