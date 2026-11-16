"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar, Button } from "@/components/ui/primitives";
import { AVATAR_COLORS, fileToAvatarDataUrl } from "@/lib/avatar-upload";
import { cn } from "@/lib/utils";

export function AvatarPicker({
  name,
  initials,
  color,
  avatarUrl,
  onChangeAvatar,
  onChangeColor,
  size = 64,
  compact = false,
}: {
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string;
  onChangeAvatar: (nextUrl: string | undefined) => void;
  onChangeColor?: (nextColor: string) => void;
  size?: number;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFileSelected(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 256);
      onChangeAvatar(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível processar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-2.5", compact ? "py-1" : "")}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <Avatar
            name={name || "Usuário"}
            initials={initials || "US"}
            color={color || "#123a7b"}
            avatarUrl={avatarUrl}
            size={size}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            title="Alterar foto de perfil"
            aria-label="Alterar foto de perfil"
            className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full border border-white bg-navy text-white shadow-sm transition hover:bg-navy-2 disabled:opacity-50"
          >
            <Camera size={12} />
          </button>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="hidden"
              onChange={(e) => void onFileSelected(e.target.files?.[0])}
            />
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Camera size={13} />
              {busy ? "Processando…" : avatarUrl ? "Trocar foto" : "Enviar foto"}
            </Button>
            {avatarUrl && (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setError("");
                  onChangeAvatar(undefined);
                }}
              >
                <Trash2 size={13} />
                Remover foto
              </Button>
            )}
          </div>

          {onChangeColor && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11.5px] text-muted">Cor do perfil:</span>
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={`Cor ${c}`}
                  aria-label={`Selecionar cor ${c}`}
                  onClick={() => onChangeColor(c)}
                  className={cn(
                    "size-4.5 rounded-full transition-transform",
                    color === c ? "scale-110 ring-2 ring-ink ring-offset-2" : "opacity-80 hover:opacity-100",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}

          {!compact && (
            <p className="text-[11.5px] text-muted">
              JPG, PNG ou WEBP. Recortamos e otimizamos automaticamente em formato quadrado.
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-[12px] font-medium text-brand">{error}</p>}
    </div>
  );
}
