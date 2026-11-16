export const AVATAR_COLORS = [
  "#123a7b",
  "#29387f",
  "#d41624",
  "#e31c3f",
  "#0f7a5a",
  "#8a5a00",
  "#5b3fa6",
  "#2b4a78",
  "#141d35",
] as const;

/**
 * Lê um arquivo de imagem (JPG, PNG, WEBP), recorta ao centro em formato quadrado (1:1),
 * redimensiona para 256x256px e devolve um Data URL JPEG otimizado (~15–25 KB).
 */
export async function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem válido (JPG, PNG ou WEBP).");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("A imagem é muito grande (máximo 12 MB).");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível carregar a imagem selecionada."));
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Seu navegador não suporta processamento de imagem.");
    }

    // Fundo branco caso a imagem original seja PNG transparente
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Recorte centralizado 1:1 (cover)
    const minSide = Math.min(img.width, img.height);
    const sx = Math.max(0, (img.width - minSide) / 2);
    const sy = Math.max(0, (img.height - minSide) / 2);

    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
