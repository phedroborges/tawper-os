"use server";

import {
  getStevoQr,
  getStevoStatus,
  getStevoWebhook,
  refreshStevoQr,
  registerStevoWebhook,
  requestStevoPairing,
  sendStevoText,
  type StevoQr,
  type StevoStatus,
} from "./client";
import { appPublicUrl, assertProofEnabled, proofEnabled, stevoConfigured, stevoInstance, testNumber, webhookPublicUrl } from "./config";
import { listInbound, recordSent, type ProofEventView } from "./events";

export type ProofSnapshot = {
  enabled: boolean;
  configured: boolean;
  status: StevoStatus;
  qr: StevoQr;
  webhookUrl: string | null;
  publicUrl: string;
  instance: string;
  testNumber: string;
  webhook: unknown;
  events: ProofEventView[];
};

const emptyQr: StevoQr = { image: null, pairingCode: null, code: null };

export async function loadProofSnapshot(): Promise<ProofSnapshot> {
  const enabled = proofEnabled();
  const configured = stevoConfigured();
  if (!enabled || !configured) {
    return {
      enabled,
      configured,
      status: await getStevoStatus(),
      qr: emptyQr,
      webhookUrl: webhookPublicUrl(),
      publicUrl: appPublicUrl(),
      instance: stevoInstance(),
      testNumber: testNumber(),
      webhook: null,
      events: [],
    };
  }
  const status = await getStevoStatus();
  const qr = status.loggedIn ? emptyQr : await getStevoQr().catch(() => emptyQr);
  const webhook = await getStevoWebhook().catch(() => null);
  return {
    enabled,
    configured,
    status,
    qr,
    webhookUrl: webhookPublicUrl(),
    publicUrl: appPublicUrl(),
    instance: stevoInstance(),
    testNumber: testNumber(),
    webhook,
    events: listInbound(),
  };
}

export async function refreshProofQr() {
  assertProofEnabled();
  return refreshStevoQr();
}

export async function pairProofPhone(phone: string) {
  assertProofEnabled();
  return requestStevoPairing(phone);
}

export async function sendProofText(to: string, text: string) {
  assertProofEnabled();
  const body = text.trim();
  if (!body) throw new Error("Mensagem vazia.");
  const sent = await sendStevoText(to, body);
  recordSent(sent.number, body);
  return sent;
}

export async function registerProofWebhook() {
  assertProofEnabled();
  return registerStevoWebhook();
}
