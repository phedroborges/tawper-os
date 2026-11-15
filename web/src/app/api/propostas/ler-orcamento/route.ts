import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { aiConfigured } from "@/server/ai/openai";
import { jsonAuthError, withSession } from "@/server/auth/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

export interface ParsedErpBudget {
  ok: true;
  usedAi: boolean;
  fileName: string;
  pageCount: number;
  numeroOrcamento: string;
  valorTotal: number | null;
  condicaoDetectada: string | null;
  resumoExecutivo: string;
  destaques: string[];
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const unwrapped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const val: unknown = JSON.parse(unwrapped);
    return val && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, unknown>) : null;
  } catch {
    const start = unwrapped.indexOf("{");
    const end = unwrapped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const val: unknown = JSON.parse(unwrapped.slice(start, end + 1));
        return val && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeParsedBudget(
  raw: Record<string, unknown>,
  fallback: { fileName: string; pageCount: number; numero: string; valor: number | null },
  usedAi: boolean,
): ParsedErpBudget {
  const num = typeof raw.numeroOrcamento === "string" ? raw.numeroOrcamento.trim().slice(0, 40) : "";
  const rawTotal = raw.valorTotal;
  let valorTotal: number | null = null;
  if (typeof rawTotal === "number" && Number.isFinite(rawTotal) && rawTotal > 0) {
    valorTotal = Math.round(rawTotal * 100) / 100;
  } else if (typeof rawTotal === "string") {
    const cleaned = Number(rawTotal.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(cleaned) && cleaned > 0) valorTotal = Math.round(cleaned * 100) / 100;
  }

  const condicao =
    typeof raw.condicaoDetectada === "string" && raw.condicaoDetectada.trim()
      ? raw.condicaoDetectada.trim().slice(0, 100)
      : null;

  const resumo =
    typeof raw.resumoExecutivo === "string" && raw.resumoExecutivo.trim()
      ? raw.resumoExecutivo.trim().slice(0, 600)
      : `Orçamento oficial emitido no ERP Tawper (${fallback.pageCount} página(s) anexada(s) integralmente ao final desta proposta).`;

  const destaques = Array.isArray(raw.destaques)
    ? raw.destaques
        .map((x) => (typeof x === "string" ? x.trim().slice(0, 140) : ""))
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return {
    ok: true,
    usedAi,
    fileName: fallback.fileName,
    pageCount: fallback.pageCount,
    numeroOrcamento: num || fallback.numero,
    valorTotal: valorTotal ?? fallback.valor,
    condicaoDetectada: condicao,
    resumoExecutivo: resumo,
    destaques,
  };
}

function heuristicFromFileAndBytes(fileName: string, bytes: Uint8Array) {
  const baseName = fileName.replace(/\.pdf$/i, "");
  const nameNum = baseName.match(/\b(\d{3,10})\b/)?.[1] ?? "";
  // Extração conservadora apenas para texto não comprimido visível no buffer
  const ascii = Buffer.from(bytes.slice(0, 160_000)).toString("latin1");
  const moneyMatches = [...ascii.matchAll(/R\$\s*([\d.]+,\d{2})/g)]
    .map((m) => Number(m[1].replace(/\./g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  const valor = moneyMatches.length > 0 ? Math.max(...moneyMatches) : null;
  return { numero: nameNum, valor };
}

const SYSTEM_PROMPT = `Você analisa um PDF de orçamento gerado no ERP externo da Tawper Mangueiras e Conexões.
Sua função é APENAS ler os dados literais presentes no documento para preencher o resumo executivo da proposta comercial.
Regras:
- Nunca invente preço, número de orçamento, condição ou item que não esteja escrito no PDF.
- Não monte tabela nem invente catálogo interno: faça um resumo executivo curto e qualitativo do escopo apresentado no orçamento.
- Responda SOMENTE um JSON válido no formato:
{
  "numeroOrcamento": string,
  "valorTotal": number | null,
  "condicaoDetectada": string | null,
  "resumoExecutivo": string,
  "destaques": string[]
}`;

async function readPdfWithAi(bytes: Uint8Array, fileName: string): Promise<Record<string, unknown> | null> {
  if (!aiConfigured()) return null;

  const gatewayEnabled = Boolean(process.env.AI_GATEWAY_API_KEY);
  const openAiKey = process.env.OPENAI_API_KEY;

  if (gatewayEnabled) {
    const models = (
      process.env.AI_EXTRACTION_MODELS ||
      "google/gemini-3.5-flash-lite,openai/gpt-5.6-luna"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2);

    for (const model of models) {
      try {
        const res = await generateText({
          model: gateway(model),
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: `Extraia número, valor total, condição de pagamento e resumo qualitativo do orçamento anexo (${fileName}).` },
                { type: "file", data: bytes, mediaType: "application/pdf", filename: fileName },
              ],
            },
          ],
          maxOutputTokens: 900,
          abortSignal: AbortSignal.timeout(45_000),
        });
        const parsed = parseJsonObject(res.text);
        if (parsed) return parsed;
      } catch {
        // tenta próximo provedor/modelo
      }
    }
  }

  if (openAiKey) {
    try {
      const b64 = Buffer.from(bytes).toString("base64");
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          response_format: { type: "json_object" },
          max_tokens: 900,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Extraia número, valor total, condição de pagamento e resumo qualitativo do orçamento anexo (${fileName}).`,
                },
                {
                  type: "file",
                  file: {
                    filename: fileName,
                    file_data: `data:application/pdf;base64,${b64}`,
                  },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = body.choices?.[0]?.message?.content;
        if (text) {
          const parsed = parseJsonObject(text);
          if (parsed) return parsed;
        }
      }
    } catch {
      // cai para retorno determinístico sem bloquear o vendedor
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    await withSession(request);
    const form = await request.formData();
    const file = form.get("arquivo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie um arquivo PDF de orçamento." }, { status: 400 });
    }
    if (!file.size || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "O PDF do orçamento deve ter entre 1 byte e 10 MB." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
      return NextResponse.json({ error: "O arquivo anexado não é um PDF válido." }, { status: 400 });
    }

    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    const heuristic = heuristicFromFileAndBytes(file.name, bytes);

    const aiRaw = await readPdfWithAi(bytes, file.name);
    const result = normalizeParsedBudget(
      aiRaw ?? {},
      {
        fileName: file.name,
        pageCount,
        numero: heuristic.numero,
        valor: heuristic.valor,
      },
      Boolean(aiRaw),
    );

    return NextResponse.json(result);
  } catch (e) {
    return (
      jsonAuthError(e) ??
      NextResponse.json(
        { error: e instanceof Error ? e.message : "Não foi possível ler o PDF do orçamento." },
        { status: 400 },
      )
    );
  }
}
