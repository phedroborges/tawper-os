"use server";

import {
  getStevoQr,
  getStevoStatus,
  getStevoStatusCached,
  ensureLiveWebhook,
  refreshStevoQr,
  registerStevoWebhook,
  requestStevoPairing,
  revokeStevoMessage,
  sendStevoText,
  toStevoNumber,
  type StevoQr,
  type StevoStatus,
} from "./client";
import { appPublicUrl, assertProofEnabled, proofEnabled, signMessages, stevoConfigured, stevoInstance, testNumber, webhookPublicUrl } from "./config";
import { listMessages, recordSent, type ProofEventView } from "./events";
import {
  deleteLiveConversation,
  getLiveConversation,
  getLiveMessage,
  hideLiveMessage,
  listLiveConversations,
  listLiveConversationsFor,
  listLiveMessagesFor,
  markLiveRead,
  markLiveRevoked,
  peerVariants,
  setLiveOwner,
  type LiveConversation,
} from "./live-store";

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
  conversations: LiveConversation[];
};

/**
 * Atendente que está usando a tela. Sem login (Fase 3) o perfil vem do seletor do app:
 * organiza o atendimento, não é controle de acesso (ADR-003).
 */
export type Agent = { id: string; name: string; role: string };

const emptyQr: StevoQr = { image: null, pairingCode: null, code: null };

function isManagerRole(role: string) {
  return role === "admin" || role === "gestor";
}

function checkAgent(agent: Agent) {
  if (!agent?.id || !agent.name) throw new Error("Escolha seu perfil de atendente no topo da tela.");
}

function peerOf(raw: string) {
  const peer = toStevoNumber(raw);
  if (!peer) throw new Error("Informe um celular brasileiro com DDD.");
  return peer;
}

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
      conversations: [],
    };
  }
  const status = await getStevoStatusCached();
  const qr = status.loggedIn ? emptyQr : await getStevoQr().catch(() => emptyQr);
  if (status.loggedIn) ensureLiveWebhook().catch(() => undefined);
  const [events, conversations] = await Promise.all([listMessages(), listLiveConversations().catch(() => null)]);
  return {
    enabled,
    configured,
    status,
    qr,
    webhookUrl: webhookPublicUrl(),
    publicUrl: appPublicUrl(),
    instance: stevoInstance(),
    testNumber: testNumber(),
    webhook: null,
    events,
    conversations: conversations ?? [],
  };
}

export type CompanyChatSnapshot = {
  live: boolean;
  status: StevoStatus;
  events: ProofEventView[];
  conversations: LiveConversation[];
};

/** Conversas do WhatsApp real dos contatos de uma empresa, casadas pelo número (com e sem o 9º dígito). */
export async function loadCompanyChat(phones: string[]): Promise<CompanyChatSnapshot> {
  if (!proofEnabled() || !stevoConfigured()) {
    return { live: false, status: await getStevoStatus(), events: [], conversations: [] };
  }
  const peers = [...new Set(phones.map((phone) => toStevoNumber(phone)).filter((peer): peer is string => Boolean(peer)).flatMap(peerVariants))];
  const status = await getStevoStatusCached();
  const [stored, conversations] = await Promise.all([
    listLiveMessagesFor(peers).catch(() => null),
    listLiveConversationsFor(peers).catch(() => null),
  ]);
  const wanted = new Set(peers);
  const events = stored ?? (await listMessages()).filter((event) => wanted.has(event.peer ?? ""));
  return { live: true, status, events, conversations: conversations ?? [] };
}

export async function refreshProofQr() {
  assertProofEnabled();
  return refreshStevoQr();
}

export async function pairProofPhone(phone: string) {
  assertProofEnabled();
  return requestStevoPairing(phone);
}

export async function sendProofText(to: string, text: string, agent?: Agent) {
  assertProofEnabled();
  const body = text.trim();
  if (!body) throw new Error("Mensagem vazia.");
  if (!agent) {
    const sent = await sendStevoText(to, body);
    await recordSent(sent.number, body, undefined, sent.messageId);
    return sent;
  }
  checkAgent(agent);
  const peer = peerOf(to);
  // Banco fora do ar não pode impedir o atendente de responder.
  const conversation = await getLiveConversation(peer).catch(() => null);
  if (conversation?.ownerId && conversation.ownerId !== agent.id) {
    throw new Error(`Esta conversa está com ${conversation.ownerName || "outro atendente"}. Assuma ou peça a transferência para responder.`);
  }
  const outgoing = signMessages() ? `*${agent.name}:*\n${body}` : body;
  const sent = await sendStevoText(peer, outgoing);
  await recordSent(sent.number, outgoing, { id: agent.id, name: agent.name }, sent.messageId);
  return sent;
}

/** Assumir (target = o próprio agente), transferir (target = outro) ou liberar para a fila (target = null). */
export async function assignProofConversation(peerRaw: string, target: { id: string; name: string } | null, agent: Agent) {
  assertProofEnabled();
  checkAgent(agent);
  const peer = peerOf(peerRaw);
  const conversation = await getLiveConversation(peer);
  const owner = conversation?.ownerId ?? null;
  const manager = isManagerRole(agent.role);
  const mine = owner === agent.id;
  const claimingFree = !owner && target?.id === agent.id;
  if (!manager && !mine && !claimingFree) {
    throw new Error(owner ? `Esta conversa está com ${conversation?.ownerName || "outro atendente"}. Só o responsável ou um gestor pode mudar.` : "Assuma a conversa antes de transferir.");
  }
  await setLiveOwner(peer, target);
  return { peer, owner: target };
}

export async function markProofRead(peerRaw: string, agent: Agent) {
  assertProofEnabled();
  checkAgent(agent);
  const peer = peerOf(peerRaw);
  const conversation = await getLiveConversation(peer).catch(() => null);
  if (conversation && conversation.ownerId && conversation.ownerId !== agent.id) return;
  await markLiveRead(peer).catch(() => undefined);
}

async function checkCanEdit(peer: string, agent: Agent) {
  checkAgent(agent);
  const conversation = await getLiveConversation(peer);
  if (isManagerRole(agent.role) || !conversation?.ownerId || conversation.ownerId === agent.id) return;
  throw new Error(`Esta conversa está com ${conversation.ownerName || "outro atendente"}. Só o responsável ou um gestor pode apagar.`);
}

/**
 * "me": some do Tawper (o celular continua com a mensagem, a Stevo não tem essa rota).
 * "everyone": apaga no WhatsApp do cliente; só mensagens enviadas pelo número.
 */
export async function deleteProofMessage(id: string, scope: "me" | "everyone", agent: Agent) {
  assertProofEnabled();
  checkAgent(agent);
  const message = await getLiveMessage(id);
  if (!message) throw new Error("Mensagem não encontrada.");
  await checkCanEdit(message.peer, agent);
  if (scope === "me") {
    await hideLiveMessage({ id });
    return;
  }
  if (message.direction !== "out") throw new Error("Só dá para apagar para todos as mensagens enviadas por este número.");
  if (message.revoked) return;
  if (!message.externalId) throw new Error("Esta mensagem não tem o código do WhatsApp; só dá para apagar para você.");
  await revokeStevoMessage(message.peer, message.externalId);
  await markLiveRevoked({ id });
}

/** Apaga a conversa no Tawper. No celular ela continua: a Stevo não expõe apagar conversa. */
export async function deleteProofConversation(peerRaw: string, agent: Agent) {
  assertProofEnabled();
  const peer = peerOf(peerRaw);
  await checkCanEdit(peer, agent);
  await deleteLiveConversation(peer);
}

export async function registerProofWebhook() {
  assertProofEnabled();
  return registerStevoWebhook();
}
