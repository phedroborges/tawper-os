import { storedWhatsApp } from "@/lib/br-ids";
import { NextResponse } from "next/server";
import {
  analyzeRunWithEvaluator,
  buildDemoExternalCallers,
  buildDemoIaSessions,
  classifySessionIntervention,
  evaluateSellerOrderQuality,
  type AllowlistMember,
  type ExternalCallerBlock,
  type IaMessageItem,
  type IaRunAudit,
  type IaRunStepAudit,
  type IaSessionBlock,
  type LearnedRule,
  type OrderQualityExample,
} from "@/lib/ia-sessions";
import { buildSeed } from "@/lib/seed";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { whatsappAgentUsers } from "@/server/ai/whatsapp/config";
import { evaluateSessionById } from "@/server/ai/whatsapp/evaluator";
import {
  appendLearnedRule,
  loadLearnedRules,
  saveLearnedRules,
} from "@/server/ai/whatsapp/learned-rules";
import { withSession } from "@/server/auth/http";

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  sender_key: string;
  sender_phone: string | null;
  profile_id: string | null;
  status?: string | null;
  last_message_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  session_id: string;
  direction: "inbound" | "outbound";
  media_kind: string;
  body_text: string | null;
  raw_payload?: Record<string, unknown> | null;
  created_at: string;
};

type RunRow = {
  id: string;
  channel: string;
  session_id: string | null;
  actor_profile_id: string | null;
  company_id: string | null;
  question: string;
  response_text: string | null;
  model: string;
  status: "running" | "completed" | "failed" | "blocked";
  used_fallback: boolean;
  latency_ms: number | null;
  total_tokens?: number | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
};

type StepRow = {
  id: string;
  run_id: string;
  step_index: number;
  tool_name: string;
  tool_kind: "read" | "write";
  status: "ok" | "blocked" | "error";
  request_summary?: Record<string, unknown> | null;
  response_summary?: Record<string, unknown> | null;
  latency_ms: number | null;
  error_message: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
  short_name: string;
  initials: string;
  color: string;
  role: string;
  region: string;
  whatsapp?: string | null;
};

type CompanyRow = {
  id: string;
  trade_name: string | null;
  legal_name: string;
};

type LiveConvRow = {
  id: string;
  contact_name: string | null;
  phone: string;
  company_id: string | null;
  last_message_at: string | null;
  unread_count?: number | null;
};

type LiveMsgRow = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
};

function cleanDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneKey(value: string | null | undefined) {
  const digits = cleanDigits(value);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeModelLabel(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || v === "gpt-4o-mini" || v === "gpt-4o") return "gpt-5.6-luna";
  return v.replace(/^openai\//i, "");
}

let cachedResponseData: Record<string, unknown> | null = null;
let cachedResponseAt = 0;
const CACHE_TTL_MS = 8_000;

function formatPayloadSummary(payload?: Record<string, unknown> | null): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const entries = Object.entries(payload).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== "",
  );
  if (entries.length === 0) return undefined;
  return entries
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

function synthesizeMessagesFromRuns(runs: IaRunAudit[]): IaMessageItem[] {
  const out: IaMessageItem[] = [];
  const ordered = [...runs].sort((a, b) => a.at.localeCompare(b.at));
  for (const run of ordered) {
    out.push({
      id: `syn-in-${run.id}`,
      at: run.at,
      direction: "in",
      body: run.pergunta,
      audio: run.audio,
    });
    if (run.resposta) {
      const replyTime = new Date(new Date(run.at).getTime() + (run.latencyMs || 1200)).toISOString();
      out.push({
        id: `syn-out-${run.id}`,
        at: replyTime,
        direction: "out",
        body: run.resposta,
        gravou: run.gravou,
        fromEvaluator: run.marcas.some((m) => m.startsWith("auto_corrigido:")),
      });
    }
  }
  return out;
}

async function buildAllowlistSummary(
  profilesById: Map<string, ProfileRow>,
  sessions: IaSessionBlock[],
): Promise<AllowlistMember[]> {
  const configured = await whatsappAgentUsers().catch(() => []);
  const seed = buildSeed();
  const sessionBySeller = new Map<string, IaSessionBlock>();
  for (const s of sessions) {
    if (!sessionBySeller.has(s.sellerId)) sessionBySeller.set(s.sellerId, s);
  }

  if (configured.length > 0) {
    const allProfiles = Array.from(profilesById.values());
    return configured.map((u) => {
      const matchedProfile =
        (u.profileId ? profilesById.get(u.profileId) : undefined) ??
        allProfiles.find(
          (p) =>
            (p.whatsapp && phoneKey(p.whatsapp) === phoneKey(u.phone)) ||
            p.full_name.toLowerCase() === u.name.toLowerCase() ||
            p.short_name.toLowerCase() === u.name.split(" ")[0]?.toLowerCase(),
        ) ??
        seed.users.find(
          (su) =>
            su.name.toLowerCase() === u.name.toLowerCase() ||
            su.short.toLowerCase() === u.name.split(" ")[0]?.toLowerCase(),
        );
      const resolvedId = u.profileId ?? matchedProfile?.id ?? `linked-${phoneKey(u.phone)}`;
      const s =
        sessionBySeller.get(resolvedId) ??
        sessions.find((sess) => phoneKey(sess.phone) === phoneKey(u.phone));
      const role: "admin" | "gestor" | "vendedor" =
        u.role === "admin" ? "admin" : u.role === "gestor" ? "gestor" : "vendedor";
      return {
        phone: u.phone ?? "",
        name: u.name,
        role,
        profileId: resolvedId,
        hasActiveSession: Boolean(s),
        lastActivityAt: s?.lastActivityAt,
      };
    });
  }

  return seed.users.map((u, idx) => {
    const dbProfile = profilesById.get(u.id);
    const s = sessionBySeller.get(u.id);
    const role: "admin" | "gestor" | "vendedor" =
      u.role === "admin" ? "admin" : u.role === "gestor" ? "gestor" : "vendedor";
    return {
      phone: dbProfile?.whatsapp ?? s?.phone ?? `+55 34 9991${idx + 1}-00${idx + 1}0`,
      name: dbProfile?.full_name ?? u.name,
      role,
      profileId: u.id,
      hasActiveSession: Boolean(s),
      lastActivityAt: s?.lastActivityAt,
    };
  });
}

function buildTopicsAndExamples(
  runs: IaRunAudit[],
  companyMap: Map<string, string>,
): {
  topicsSummary: string;
  companiesMentioned: { id?: string; nome: string }[];
  goodOrderExamples: OrderQualityExample[];
  badOrderExamples: OrderQualityExample[];
} {
  const companyByName = new Map<string, { id?: string; nome: string }>();
  const goodOrderExamples: OrderQualityExample[] = [];
  const badOrderExamples: OrderQualityExample[] = [];

  for (const run of runs) {
    if (run.companyName) {
      companyByName.set(run.companyName.toLowerCase(), {
        id: run.companyId,
        nome: run.companyName,
      });
    } else if (run.companyId && companyMap.has(run.companyId)) {
      const name = companyMap.get(run.companyId)!;
      companyByName.set(name.toLowerCase(), { id: run.companyId, nome: name });
    }

    const q =
      run.orderQuality ??
      evaluateSellerOrderQuality({
        question: run.pergunta,
        hasCompanyId: Boolean(run.companyId),
        gravou: run.gravou,
        marcas: run.marcas,
        resposta: run.resposta,
      });

    const ex: OrderQualityExample = {
      id: run.id,
      at: run.at,
      question: run.pergunta,
      audio: run.audio,
      companyName: run.companyName,
      grade: q.grade,
      score: q.score,
      missing: q.missing,
      outcome:
        run.gravou.length > 0
          ? `Gravou: ${run.gravou.join(", ")}`
          : q.feedback,
    };

    if (q.grade === "completo" && goodOrderExamples.length < 4) {
      goodOrderExamples.push(ex);
    } else if (q.grade !== "completo" && badOrderExamples.length < 4) {
      badOrderExamples.push(ex);
    }
  }

  const companiesMentioned = Array.from(companyByName.values()).slice(0, 6);
  const writesTotal = runs.reduce((acc, r) => acc + r.gravou.length, 0);
  const latestRun = runs[0];

  let topicsSummary = "";
  if (companiesMentioned.length > 0) {
    const names = companiesMentioned.slice(0, 3).map((c) => c.nome).join(", ");
    topicsSummary = `Tratando de ${names}${
      companiesMentioned.length > 3 ? ` (+${companiesMentioned.length - 3})` : ""
    }`;
    if (writesTotal > 0) {
      topicsSummary += ` · ${writesTotal} ação(ões) gravada(s) no CRM`;
    } else {
      topicsSummary += ` · alinhamento e consulta de carteira`;
    }
  } else if (latestRun) {
    topicsSummary =
      writesTotal > 0
        ? `Atualização operacional no CRM (${writesTotal} gravação(ões))`
        : `Alinhamento comercial: "${latestRun.pergunta.slice(0, 72)}${
            latestRun.pergunta.length > 72 ? "…" : ""
          }"`;
  } else {
    topicsSummary = "Sem atendimentos recentes registrados para este vendedor.";
  }

  return {
    topicsSummary,
    companiesMentioned,
    goodOrderExamples,
    badOrderExamples,
  };
}

export async function GET(request: Request) {
  if (cachedResponseData && Date.now() - cachedResponseAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedResponseData);
  }

  const seed = buildSeed();

  if (!process.env.DATABASE_URL) {
    const learnedRules: LearnedRule[] = await loadLearnedRules().catch(() => []);
    const sessions = buildDemoIaSessions(seed);
    const allowlist = await buildAllowlistSummary(new Map(), sessions);
    const externalCallers = buildDemoExternalCallers(seed.companies);
    const payload = {
      live: false,
      sessions,
      allowlist,
      externalCallers,
      learnedRules,
    };
    cachedResponseData = payload;
    cachedResponseAt = Date.now();
    return NextResponse.json(payload);
  }

  try {
    await withSession(request);
    const admin = getSupabaseAdmin();

    const [
      learnedRules,
      sessionsRes,
      messagesRes,
      runsRes,
      profilesRes,
      companiesRes,
      liveConvsRes,
      liveMsgsRes,
    ] = await Promise.all([
      loadLearnedRules().catch(() => [] as LearnedRule[]),
      admin
        .from("ai_channel_sessions")
        .select("id, sender_key, sender_phone, profile_id, status, last_message_at, updated_at")
        .eq("channel", "whatsapp")
        .order("last_message_at", { ascending: false })
        .limit(40),
      admin
        .from("ai_channel_messages")
        .select("id, session_id, direction, media_kind, body_text, raw_payload, created_at")
        .order("created_at", { ascending: false })
        .limit(160),
      admin
        .from("ai_agent_runs")
        .select(
          "id, channel, session_id, actor_profile_id, company_id, question, response_text, model, status, used_fallback, latency_ms, total_tokens, error_message, created_at, finished_at",
        )
        .order("created_at", { ascending: false })
        .limit(80),
      admin
        .from("profiles")
        .select("id, full_name, short_name, initials, color, role, region, whatsapp")
        .eq("is_active", true),
      admin
        .from("companies")
        .select("id, trade_name, legal_name")
        .is("deleted_at", null)
        .limit(150),
      admin
        .from("whatsapp_live_conversations")
        .select("id, contact_name, phone, company_id, last_message_at, unread_count")
        .order("last_message_at", { ascending: false })
        .limit(30),
      admin
        .from("whatsapp_live_messages")
        .select("id, conversation_id, direction, body, created_at")
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    const rawRuns = ((runsRes.data ?? []) as RunRow[]).filter(
      (r) => r.channel === "whatsapp" || r.channel === "web_assistant",
    );
    const runIds = rawRuns.map((r) => r.id);

    const stepsByRun = new Map<string, IaRunStepAudit[]>();
    const writesByRun = new Map<string, string[]>();
    const marksByRun = new Map<string, string[]>();

    if (runIds.length > 0) {
      const stepsRes = await admin
        .from("ai_agent_steps")
        .select(
          "id, run_id, step_index, tool_name, tool_kind, status, request_summary, response_summary, latency_ms, error_message",
        )
        .in("run_id", runIds)
        .order("step_index", { ascending: true });

      for (const row of (stepsRes.data ?? []) as StepRow[]) {
        if (row.tool_name === "anotacao_interna") {
          const req = row.request_summary ?? {};
          const gravou = Array.isArray(req.gravou)
            ? req.gravou.filter((x): x is string => typeof x === "string")
            : [];
          const marcas = Array.isArray(req.marcas)
            ? req.marcas.filter((x): x is string => typeof x === "string")
            : [];
          if (gravou.length > 0) writesByRun.set(row.run_id, gravou);
          if (marcas.length > 0) marksByRun.set(row.run_id, marcas);
          continue;
        }
        const list = stepsByRun.get(row.run_id) ?? [];
        list.push({
          stepNumber: row.step_index,
          kind: row.tool_kind,
          toolName: row.tool_name,
          status: row.status === "ok" ? "completed" : row.status,
          durationMs: row.latency_ms ?? 0,
          requestSummary: formatPayloadSummary(row.request_summary),
          responseSummary: formatPayloadSummary(row.response_summary),
        });
        stepsByRun.set(row.run_id, list);

        if (row.tool_kind === "write" && row.status === "ok") {
          const prev = writesByRun.get(row.run_id) ?? [];
          if (!prev.includes(row.tool_name)) {
            prev.push(row.tool_name);
            writesByRun.set(row.run_id, prev);
          }
        }
      }
    }

    const profilesById = new Map<string, ProfileRow>();
    for (const p of (profilesRes.data ?? []) as ProfileRow[]) {
      profilesById.set(p.id, p);
    }

    const companyNameById = new Map<string, string>();
    for (const c of (companiesRes.data ?? []) as CompanyRow[]) {
      const name = (c.trade_name || c.legal_name || "").trim();
      if (name) companyNameById.set(c.id, name);
    }

    const messagesBySession = new Map<string, IaMessageItem[]>();
    for (const m of (messagesRes.data ?? []) as MessageRow[]) {
      const list = messagesBySession.get(m.session_id) ?? [];
      const payload = m.raw_payload ?? {};
      const gravou = Array.isArray(payload.gravou)
        ? payload.gravou.filter((x): x is string => typeof x === "string")
        : undefined;
      list.push({
        id: m.id,
        at: m.created_at,
        direction: m.direction === "inbound" ? "in" : "out",
        body: m.body_text ?? "",
        audio: m.media_kind === "audio",
        actionPending: Boolean(payload.propostaPendente),
        contexto: typeof payload.contexto === "string" ? payload.contexto : undefined,
        gravou,
        fromEvaluator: Boolean(payload.fromEvaluator),
      });
      messagesBySession.set(m.session_id, list);
    }

    const runsBySession = new Map<string, IaRunAudit[]>();
    const runsByProfile = new Map<string, IaRunAudit[]>();

    for (const r of rawRuns) {
      const steps = stepsByRun.get(r.id) ?? [];
      const gravou = writesByRun.get(r.id) ?? [];
      const marcas = [...(marksByRun.get(r.id) ?? [])];
      if (r.used_fallback && !marcas.includes("fluxo_antigo")) {
        marcas.push("fluxo_antigo");
      }
      if (r.error_message && !marcas.includes(r.error_message)) {
        marcas.push(r.error_message);
      }

      const companyName = r.company_id ? companyNameById.get(r.company_id) : undefined;
      const runAudit: IaRunAudit = {
        id: r.id,
        at: r.created_at,
        status: r.status,
        model: normalizeModelLabel(r.model),
        caminho: r.used_fallback ? "fluxo_antigo" : "ferramentas",
        latencyMs: r.latency_ms ?? 0,
        tokens: r.total_tokens ?? 0,
        pergunta: r.question,
        resposta: r.response_text ?? "",
        audio: marcas.includes("audio"),
        companyId: r.company_id ?? undefined,
        companyName,
        gravou,
        marcas,
        errorMessage: r.error_message ?? undefined,
        steps,
      };
      runAudit.orderQuality = evaluateSellerOrderQuality({
        question: runAudit.pergunta,
        hasCompanyId: Boolean(runAudit.companyId),
        gravou: runAudit.gravou,
        marcas: runAudit.marcas,
        resposta: runAudit.resposta,
      });
      runAudit.evaluator = analyzeRunWithEvaluator(runAudit);

      if (r.session_id) {
        const list = runsBySession.get(r.session_id) ?? [];
        list.push(runAudit);
        runsBySession.set(r.session_id, list);
      } else if (r.actor_profile_id) {
        const list = runsByProfile.get(r.actor_profile_id) ?? [];
        list.push(runAudit);
        runsByProfile.set(r.actor_profile_id, list);
      }
    }

    const sessionRows = (sessionsRes.data ?? []) as SessionRow[];
    const blocks: IaSessionBlock[] = [];
    const coveredProfiles = new Set<string>();

    for (const s of sessionRows) {
      const profile = s.profile_id ? profilesById.get(s.profile_id) : undefined;
      if (s.profile_id) coveredProfiles.add(s.profile_id);

      const sessionRuns = [
        ...(runsBySession.get(s.id) ?? []),
        ...(s.profile_id ? (runsByProfile.get(s.profile_id) ?? []) : []),
      ]
        .filter((v, idx, arr) => arr.findIndex((item) => item.id === v.id) === idx)
        .sort((a, b) => b.at.localeCompare(a.at));

      const rawMsgs = (messagesBySession.get(s.id) ?? [])
        .slice()
        .sort((a, b) => a.at.localeCompare(b.at));
      const sessionMessages =
        rawMsgs.length > 0 ? rawMsgs : synthesizeMessagesFromRuns(sessionRuns);

      const messagesFromSeller = sessionMessages.filter((m) => m.direction === "in").length;
      const messagesFromIa = sessionMessages.filter((m) => m.direction === "out").length;
      const audioCount = sessionMessages.filter((m) => m.audio).length;
      const classification = classifySessionIntervention({
        runs: sessionRuns,
        messages: sessionMessages,
      });

      const { topicsSummary, companiesMentioned, goodOrderExamples, badOrderExamples } =
        buildTopicsAndExamples(sessionRuns, companyNameById);

      const latestRun = sessionRuns[0];
      const latestEvaluator = latestRun
        ? latestRun.evaluator ?? analyzeRunWithEvaluator(latestRun)
        : undefined;

      blocks.push({
        id: s.id,
        sellerId: profile?.id ?? s.profile_id ?? s.sender_key,
        sellerName: profile?.full_name ?? s.sender_phone ?? "Vendedor WhatsApp",
        sellerShort: profile?.short_name ?? (s.sender_phone ? s.sender_phone.slice(-4) : "WA"),
        phone: s.sender_phone ?? profile?.whatsapp ?? s.sender_key,
        status: s.status === "closed" ? "closed" : s.status === "expired" ? "expired" : "active",
        attendant:
          classification.level === "intervencao"
            ? "IA WhatsApp · Requer Revisão"
            : classification.autoHealedCount > 0
              ? "IA WhatsApp + IA Avaliadora (Auto-Corrigido)"
              : "IA WhatsApp (Autônoma)",
        modelLabel: normalizeModelLabel(latestRun?.model),
        intervention: classification.level,
        interventionReasons: classification.reasons,
        ...classification,
        messagesTotal: sessionMessages.length,
        messagesFromSeller,
        messagesFromIa,
        audioCount,
        lastActivityAt: s.last_message_at,
        lastQuestion:
          latestRun?.pergunta ??
          sessionMessages.filter((m) => m.direction === "in").at(-1)?.body ??
          "",
        lastReply:
          latestRun?.resposta ??
          sessionMessages.filter((m) => m.direction === "out").at(-1)?.body ??
          "",
        lastGravou: latestRun?.gravou ?? [],
        topicsSummary,
        companiesMentioned,
        goodOrderExamples,
        badOrderExamples,
        evaluatorSummary: latestEvaluator,
        runs: sessionRuns.slice(0, 15),
        messages: sessionMessages.slice(-40),
      });
    }

    for (const [profileId, profileRuns] of runsByProfile.entries()) {
      if (coveredProfiles.has(profileId) || profileRuns.length === 0) continue;
      const profile = profilesById.get(profileId);
      if (!profile) continue;

      const sortedRuns = [...profileRuns].sort((a, b) => b.at.localeCompare(a.at));
      const synthesizedMessages = synthesizeMessagesFromRuns(sortedRuns);
      const classification = classifySessionIntervention({
        runs: sortedRuns,
        messages: synthesizedMessages,
      });

      const { topicsSummary, companiesMentioned, goodOrderExamples, badOrderExamples } =
        buildTopicsAndExamples(sortedRuns, companyNameById);
      const latestRun = sortedRuns[0];
      const latestEvaluator = latestRun
        ? latestRun.evaluator ?? analyzeRunWithEvaluator(latestRun)
        : undefined;

      blocks.push({
        id: `profile-${profileId}`,
        sellerId: profile.id,
        sellerName: profile.full_name,
        sellerShort: profile.short_name,
        phone: profile.whatsapp ?? "App / WhatsApp",
        status: "active",
        attendant: "IA WhatsApp (Autônoma)",
        modelLabel: normalizeModelLabel(latestRun?.model),
        intervention: classification.level,
        interventionReasons: classification.reasons,
        ...classification,
        messagesTotal: synthesizedMessages.length,
        messagesFromSeller: synthesizedMessages.filter((m) => m.direction === "in").length,
        messagesFromIa: synthesizedMessages.filter((m) => m.direction === "out").length,
        audioCount: synthesizedMessages.filter((m) => m.audio).length,
        lastActivityAt: latestRun?.at ?? new Date().toISOString(),
        lastQuestion: latestRun?.pergunta ?? "",
        lastReply: latestRun?.resposta ?? "",
        lastGravou: latestRun?.gravou ?? [],
        topicsSummary,
        companiesMentioned,
        goodOrderExamples,
        badOrderExamples,
        evaluatorSummary: latestEvaluator,
        runs: sortedRuns.slice(0, 15),
        messages: synthesizedMessages.slice(-40),
      });
    }

    if (blocks.length === 0) {
      const demoSessions = buildDemoIaSessions(seed);
      const allowlist = await buildAllowlistSummary(profilesById, demoSessions);
      const externalCallers = buildDemoExternalCallers(seed.companies);
      return NextResponse.json({
        live: false,
        sessions: demoSessions,
        allowlist,
        externalCallers,
        learnedRules,
      });
    }

    const allowlist = await buildAllowlistSummary(profilesById, blocks);
    const allowlistKeys = new Set(
      allowlist.map((a) => phoneKey(a.phone)).filter((k) => k.length > 0),
    );

    const externalCallers: ExternalCallerBlock[] = [];
    const liveMsgsByConv = new Map<string, LiveMsgRow[]>();
    for (const lm of (liveMsgsRes.data ?? []) as LiveMsgRow[]) {
      const list = liveMsgsByConv.get(lm.conversation_id) ?? [];
      list.push(lm);
      liveMsgsByConv.set(lm.conversation_id, list);
    }

    for (const lc of (liveConvsRes.data ?? []) as LiveConvRow[]) {
      const key = phoneKey(lc.phone);
      if (key && allowlistKeys.has(key)) continue;
      const msgs = (liveMsgsByConv.get(lc.id) ?? [])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const lastMsg = msgs.at(-1);
      const matchedCompanyName = lc.company_id ? companyNameById.get(lc.company_id) : undefined;

      externalCallers.push({
        peer: lc.phone,
        contactName: lc.contact_name || `Contato ${lc.phone.slice(-4)}`,
        lastMessageAt: lc.last_message_at ?? lastMsg?.created_at ?? new Date().toISOString(),
        lastMessageBody:
          lastMsg?.body ?? "Mensagem recebida fora da Lista de Acesso da equipe.",
        messagesCount: msgs.length,
        unreadCount: lc.unread_count ?? 1,
        matchedCompanyId: lc.company_id ?? undefined,
        matchedCompanyName,
        messages: msgs.slice(-15).map((m) => ({
          id: m.id,
          at: m.created_at,
          direction: m.direction,
          body: m.body,
        })),
      });
    }

    const payload = {
      live: true,
      sessions: blocks,
      allowlist,
      externalCallers:
        externalCallers.length > 0
          ? externalCallers
          : buildDemoExternalCallers(seed.companies),
      learnedRules,
    };
    cachedResponseData = payload;
    cachedResponseAt = Date.now();
    return NextResponse.json(payload);
  } catch {
    const learnedRules = await loadLearnedRules().catch(() => [] as LearnedRule[]);
    const sessions = buildDemoIaSessions(seed);
    const allowlist = await buildAllowlistSummary(new Map(), sessions);
    const externalCallers = buildDemoExternalCallers(seed.companies);
    return NextResponse.json({
      live: false,
      sessions,
      allowlist,
      externalCallers,
      learnedRules,
    });
  }
}

export async function POST(req: Request) {
  cachedResponseData = null;
  cachedResponseAt = 0;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      action?:
        | "resolve"
        | "flag"
        | "auto_evaluate"
        | "toggle_rule"
        | "save_rule"
        | "delete_rule"
        | "authorize_caller";
      note?: string;
      ruleId?: string;
      rule?: Partial<LearnedRule>;
      callerPhone?: string;
      profileId?: string;
    };

    if (body.action === "toggle_rule" && body.ruleId) {
      const current = await loadLearnedRules();
      const updated = current.map((r) =>
        r.id === body.ruleId ? { ...r, active: !r.active } : r,
      );
      const saved = await saveLearnedRules(updated);
      return NextResponse.json({ ok: true, learnedRules: saved });
    }

    if (body.action === "delete_rule" && body.ruleId) {
      const current = await loadLearnedRules();
      const updated = current.filter((r) => r.id !== body.ruleId);
      const saved = await saveLearnedRules(updated);
      return NextResponse.json({ ok: true, learnedRules: saved });
    }

    if (body.action === "save_rule" && body.rule) {
      const current = await loadLearnedRules();
      if (body.rule.id) {
        const updated = current.map((r) =>
          r.id === body.rule?.id
            ? {
                ...r,
                rule: body.rule.rule?.trim() || r.rule,
                originSellerName: body.rule.originSellerName?.trim() || r.originSellerName,
                beforeQuestion: body.rule.beforeQuestion?.trim() || r.beforeQuestion,
                beforeError: body.rule.beforeError?.trim() || r.beforeError,
                afterResolution: body.rule.afterResolution?.trim() || r.afterResolution,
                active: body.rule.active ?? r.active,
              }
            : r,
        );
        const saved = await saveLearnedRules(updated);
        return NextResponse.json({ ok: true, learnedRules: saved });
      }
      const saved = await appendLearnedRule({
        active: true,
        rule:
          body.rule.rule?.trim() ||
          "Sempre confirme empresa, resultado e próximo passo com data antes de encerrar.",
        originSellerName: body.rule.originSellerName?.trim() || "Gestor",
        beforeQuestion: body.rule.beforeQuestion?.trim() || "Diretriz operacional do gestor",
        beforeError:
          body.rule.beforeError?.trim() || "Prevenção de falha operacional no atendimento.",
        afterResolution:
          body.rule.afterResolution?.trim() || "Regra injetada diretamente no prompt da IA.",
        autoGenerated: false,
      });
      return NextResponse.json({ ok: true, learnedRules: saved });
    }

    if (body.action === "authorize_caller" && body.callerPhone && body.profileId) {
      if (process.env.DATABASE_URL) {
        const admin = getSupabaseAdmin();
        const phone = storedWhatsApp(body.callerPhone) ?? body.callerPhone.trim();
        await admin
          .from("profiles")
          .update({ phone_e164: phone })
          .eq("id", body.profileId);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "auto_evaluate" && body.sessionId) {
      if (!process.env.DATABASE_URL || body.sessionId.startsWith("demo-")) {
        const savedRules = await appendLearnedRule({
          active: true,
          rule: "Quando o vendedor citar usina/cliente e prazo relativo no relato, valide a empresa exata na carteira dele e grave a tarefa + histórico na mesma execução.",
          originSellerName: "IA Avaliadora",
          beforeQuestion: body.note?.trim() || "Pedido com divergência apontada na auditoria",
          beforeError:
            "A IA Avaliadora detectou divergência entre o pedido do vendedor e a gravação anterior.",
          afterResolution:
            "IA Avaliadora reprocessou o contexto da conversa, corrigiu o registro no CRM e gerou regra preventiva.",
          autoGenerated: true,
        });
        return NextResponse.json({
          ok: true,
          learnedRules: savedRules,
          result: {
            evaluated: true,
            autoHealed: true,
            summary:
              "IA Avaliadora auditou a conversa, corrigiu o registro no CRM e adicionou uma nova regra ativa ao prompt.",
          },
        });
      }

      const result = await evaluateSessionById(body.sessionId);
      const learnedRules = await loadLearnedRules();
      return NextResponse.json({ ok: true, result, learnedRules });
    }

    if (!body.sessionId || !body.action) {
      return NextResponse.json(
        { ok: false, error: "Parâmetros inválidos" },
        { status: 400 },
      );
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ ok: true, mode: "demo" });
    }

    const admin = getSupabaseAdmin();
    if (body.action === "resolve") {
      const { data: latestRun } = await admin
        .from("ai_agent_runs")
        .select("id")
        .eq("session_id", body.sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (latestRun?.id) {
        await admin
          .from("ai_agent_runs")
          .update({
            status: "completed",
            used_fallback: false,
            error_message: null,
          })
          .eq("id", latestRun.id);
      }
    } else if (body.action === "flag") {
      const { data: latestRun } = await admin
        .from("ai_agent_runs")
        .select("id")
        .eq("session_id", body.sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (latestRun?.id) {
        await admin
          .from("ai_agent_runs")
          .update({
            error_message: `intervencao_gestor:${body.note?.trim() || "Revisar atendimento"}`,
          })
          .eq("id", latestRun.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, mode: "fallback" });
  }
}
