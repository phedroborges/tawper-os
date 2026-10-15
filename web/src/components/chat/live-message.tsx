import { FileText } from "lucide-react";
import type { MediaKind } from "@/server/integrations/stevo-proof/events";
import { cn } from "@/lib/utils";

export const REVOKED_TEXT = "Mensagem apagada";

const PLACEHOLDER = /^\[(imagem|áudio|vídeo|documento|figurinha)\]$/;

export function MediaView({ id, kind, text }: { id: string; kind: MediaKind; text: string }) {
  const src = `/api/whatsapp/media/${encodeURIComponent(id)}`;
  if (kind === "image" || kind === "sticker") {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={kind === "sticker" ? "Figurinha" : "Imagem recebida"} loading="lazy" className={cn("rounded-[6px] bg-white/60 object-contain", kind === "sticker" ? "h-28 w-28" : "max-h-72 w-full max-w-[280px]")} />
      </a>
    );
  }
  if (kind === "audio") return <audio controls preload="none" src={src} className="h-10 w-[260px] max-w-full" />;
  if (kind === "video") return <video controls preload="none" src={src} className="max-h-72 w-full max-w-[280px] rounded-[6px] bg-black" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-[6px] bg-white/70 px-2 py-1.5 font-medium text-navy underline-offset-2 hover:underline">
      <FileText size={15} /> {text.replace(/^\[documento\]\s*/, "") || "Abrir documento"}
    </a>
  );
}

/** A assinatura `*Nome:*` vai para o cliente; na tela o autor já aparece no rodapé do balão. */
export function withoutSignature(text: string, author: string) {
  if (!author) return text;
  const signature = `*${author}:*`;
  if (text === signature) return "";
  return text.startsWith(`${signature}\n`) ? text.slice(signature.length + 1) : text;
}

export function visibleText(message: { text: string; author: string; media?: MediaKind }) {
  const text = withoutSignature(message.text, message.author);
  if (!message.media) return text;
  if (PLACEHOLDER.test(text) || (message.media === "document" && text.startsWith("[documento]"))) return "";
  return text;
}
