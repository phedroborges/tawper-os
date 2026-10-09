/**
 * Prova técnica descartável da Fase 0 (PLANO 8.2).
 * Não importar este módulo em telas de CRM, /conversas ou regras comerciais.
 */

export function proofEnabled() {
  return process.env.STEVO_PROOF_ENABLED === "true";
}

export function stevoConfigured() {
  return Boolean(stevoBaseUrl() && stevoApiKey());
}

export function stevoBaseUrl() {
  return (process.env.STEVO_SERVER_URL ?? process.env.STEVO_API_URL ?? "").replace(/\/$/, "");
}

export function stevoInstance() {
  return process.env.STEVO_INSTANCE ?? "tawper-os";
}

export function stevoApiKey() {
  return process.env.STEVO_API_KEY ?? "";
}

export function webhookToken() {
  return process.env.STEVO_WEBHOOK_TOKEN ?? "";
}

export function appPublicUrl() {
  return (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
}

export function webhookPublicUrl() {
  const base = appPublicUrl();
  const token = webhookToken();
  if (!base || !token) return null;
  return `${base}/api/whatsapp/webhook?token=${encodeURIComponent(token)}`;
}

export function testNumber() {
  return (process.env.STEVO_TEST_NUMBER ?? "").replace(/\D/g, "");
}

export function assertProofEnabled() {
  if (!proofEnabled()) {
    throw new Error("A prova da Stevo está desligada. Defina STEVO_PROOF_ENABLED=true.");
  }
  if (!stevoConfigured()) {
    throw new Error("Stevo não configurado. Defina STEVO_API_URL e STEVO_API_KEY no servidor.");
  }
}
