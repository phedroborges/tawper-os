import { stevoApiKey, stevoBaseUrl, stevoConfigured, webhookPublicUrl } from "./config";

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type StevoStatus = {
  configured: boolean;
  connected: boolean;
  loggedIn: boolean;
  proxy: boolean;
  name: string;
  phone: string;
};

export type StevoQr = {
  image: string | null;
  pairingCode: string | null;
  code: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function stevoFetch(path: string, init?: RequestInit): Promise<unknown> {
  if (!stevoConfigured()) throw new Error("Stevo não configurado.");
  const res = await fetch(`${stevoBaseUrl()}${path}`, {
    ...init,
    headers: {
      apikey: stevoApiKey(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 240) };
  }
  if (!res.ok) {
    const record = asRecord(body);
    const message =
      (record && typeof record.message === "string" && record.message) ||
      (record && typeof record.error === "string" && record.error) ||
      `Stevo respondeu ${res.status}`;
    throw new Error(message);
  }
  return body;
}

function findString(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 5 || !value || typeof value !== "object") return null;
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const record = value as Record<string, unknown>;
  for (const [key, found] of Object.entries(record)) {
    if (wanted.has(key.toLowerCase()) && typeof found === "string" && found.length > 4) return found;
  }
  for (const child of Object.values(record)) {
    const nested = findString(child, keys, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function parseQr(body: unknown): StevoQr {
  const imageRaw = findString(body, ["qrcode", "qr", "image", "base64"]);
  const code = findString(body, ["code"]);
  const pairing = findString(body, ["pairingcode", "pairing_code"]);
  if (!imageRaw) return { image: null, pairingCode: pairing, code };
  if (imageRaw.startsWith("data:")) return { image: imageRaw, pairingCode: pairing, code };
  if (imageRaw.startsWith("2@")) return { image: null, pairingCode: pairing, code: code ?? imageRaw };
  return { image: `data:image/png;base64,${imageRaw}`, pairingCode: pairing, code };
}

export async function getStevoStatus(): Promise<StevoStatus> {
  if (!stevoConfigured()) {
    return { configured: false, connected: false, loggedIn: false, proxy: false, name: "", phone: "" };
  }
  const body = asRecord(await stevoFetch("/instance/status"));
  const data = asRecord(body?.data) ?? body ?? {};
  let phone = "";
  let name = typeof data.Name === "string" ? data.Name : "";
  let proxy = false;
  try {
    const info = asRecord(await stevoFetch("/instance/proxy-info"));
    const pdata = asRecord(info?.data) ?? info ?? {};
    proxy = pdata.enabled === true;
  } catch {
    proxy = false;
  }
  if (data.LoggedIn === true) {
    try {
      const profile = asRecord(await stevoFetch("/instance/profile"));
      const pdata = asRecord(profile?.data) ?? profile ?? {};
      const rawPhone = pdata.phone ?? pdata.Phone ?? pdata.number ?? pdata.Number ?? pdata.id;
      if (typeof rawPhone === "string") phone = rawPhone;
      const rawName = pdata.name ?? pdata.Name ?? pdata.pushName;
      if (typeof rawName === "string" && rawName) name = rawName;
    } catch {
      // O status já basta para a tela da prova.
    }
  }
  return {
    configured: true,
    connected: data.Connected === true,
    loggedIn: data.LoggedIn === true,
    proxy,
    name,
    phone,
  };
}

export async function getStevoQr(): Promise<StevoQr> {
  let body = await stevoFetch("/instance/qr");
  let parsed = parseQr(body);
  if (!parsed.image && !parsed.code) {
    try {
      const connected = await stevoFetch("/instance/connect", {
        method: "POST",
        body: JSON.stringify({ immediate: false, subscribe: ["QRCODE", "CONNECTION"] }),
      });
      parsed = parseQr(connected);
      if (!parsed.image && !parsed.code) {
        body = await stevoFetch("/instance/qr");
        parsed = parseQr(body);
      }
    } catch {
      // QR ainda pode não ter sido gerado.
    }
  }
  return parsed;
}

export async function refreshStevoQr(): Promise<StevoQr> {
  await stevoFetch("/instance/reconnect", { method: "POST", body: JSON.stringify({}) });
  return getStevoQr();
}

export function toStevoNumber(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits.length >= 12 ? digits : null;
}

export async function requestStevoPairing(rawPhone: string) {
  const phone = toStevoNumber(rawPhone);
  if (!phone) throw new Error("Informe o celular com DDD. Exemplo: 64 99999-9999.");
  const payload = { phone, subscribe: ["CONNECTION"] };
  let code = pairingCodeOf(await stevoFetch("/instance/pair", { method: "POST", body: JSON.stringify(payload) }));
  if (!code) {
    code = pairingCodeOf(
      await stevoFetch("/instance/connect", {
        method: "POST",
        body: JSON.stringify({ ...payload, immediate: false }),
      }),
    );
  }
  if (!code) throw new Error("O Stevo não devolveu um código. Aguarde alguns segundos e tente de novo.");
  return { code, phone };
}

function pairingCodeOf(body: unknown) {
  const data = asRecord(asRecord(body)?.data) ?? asRecord(body) ?? {};
  const raw = data.PairingCode ?? data.pairingCode ?? data.pairing_code;
  if (typeof raw !== "string") return "";
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export async function sendStevoText(to: string, text: string) {
  const number = toStevoNumber(to);
  if (!number) throw new Error("Informe um celular brasileiro com DDD.");
  await stevoFetch("/send/text", {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });
  return { number };
}

const WEBHOOK_EVENTS = ["MESSAGE", "CONNECTION", "MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED", "SEND_MESSAGE"];

export async function registerStevoWebhook() {
  const url = webhookPublicUrl();
  if (!url) {
    throw new Error("Defina APP_PUBLIC_URL (HTTPS público do EasyPanel) e STEVO_WEBHOOK_TOKEN.");
  }
  const body = {
    url,
    enabled: true,
    webhookByEvents: false,
    events: WEBHOOK_EVENTS,
  };
  const paths = ["/webhook/set", "/webhook"];
  let lastError = "Não foi possível registrar o webhook na Stevo.";
  for (const path of paths) {
    try {
      const result = (await stevoFetch(path, { method: "POST", body: JSON.stringify(body) })) as Json;
      return { url, result };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

export async function getStevoWebhook() {
  const paths = ["/webhook/find", "/webhook"];
  for (const path of paths) {
    try {
      return await stevoFetch(path);
    } catch {
      // tenta o próximo formato conhecido da SM v2
    }
  }
  return null;
}
