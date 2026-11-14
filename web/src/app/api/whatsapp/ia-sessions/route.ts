import { NextResponse } from "next/server";
import {
  classifySessionIntervention,
  type IaMessageItem,
  type IaRunAudit,
  type IaRunStepAudit,
  type IaSessionBlock,
} from "@/lib/ia-sessions";
import { getSupabaseAdmin, TAWPER_ORG_ID } from "@/lib/supabase/admin";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { AuthError } from "@/server/auth/session";
import { supabaseOn } from "@/server/auth/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertManager(role: string) {
  if (role !== "admin" && role !== "gestor") {
    const denied = new AuthError("O gerenciamento da IA no WhatsApp é exclusivo para gestores.");
    denied.status = 403;
    throw denied;
  }
}

/** Lê sessões, mensagens trocadas, runs e passos do agente WhatsApp IA para auditoria e gestão. */
export async function GET(request: Request) {
  try {
    const session = await withSession(request);
    assertManager(session.role);
    if (!supabaseOn()) {
      return NextResponse.json({ live: false, sessions: [] });
    }

    const db = getSupabaseAdmin();
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

    const [sessionsRes, profilesRes, runsRes, messagesRes] = await Promise.all([
      db
        .from("ai_agent_sessions")
        .select("id, profile_id, external_channel_user_id, title, status, created_at, updated_at")
        .eq("organization_id", TAWPER_ORG_ID)
        .eq("channel", "whatsapp")
        .order("updated_at", { ascending: false })
        .limit(100),
      db
        .from("profiles")
        .select("id, full_name, display_name, whatsapp")
        .eq("organization_id", TAWPER_ORG_ID),
      db
        .from("ai_agent_runs")
        .select("id, session_id, actor_profile_id, company_id, status, model, input_summary, output_summary, input_tokens, output_tokens, latency_ms, error_message, created_at")
        .eq("organization_id", TAWPER_ORG_ID)
        .eq("agent_key", "whatsapp_agent")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("ai_channel_messages")
        .select("id, session_id, direction, body, metadata, created_at")
        .eq("organization_id", TAWPER_ORG_ID)
        .eq("channel", "whatsapp")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    for (const r of [sessionsRes, profilesRes, runsRes, messagesRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const runRows = runsRes.data ?? [];
    const runIds = runRows.slice(0, 250).map((r) => r.id as string);
    const stepsMap = new Map<string, IaRunStepAudit[]>();
    if (runIds.length > 0) {
      const stepsRes = await db
        .from("ai_agent_steps")
        .select("run_id, step_number, kind, tool_name, status, duration_ms")
        .in("run_id", runIds)
        .order("step_number", { ascending: true });
      if (!stepsRes.error) {
        for (const st of stepsRes.data ?? []) {
          const runId = st.run_id as string;
          const list = stepsMap.get(runId) ?? [];
          list.push({
            stepNumber: Number(st.step_number ?? 0),
            kind: String(st.kind ?? ""),
            toolName: (st.tool_name as string | null) ?? undefined,
            status: String(st.status ?? ""),
            durationMs: Number(st.duration_ms ?? 0),
          });
          stepsMap.set(runId, list);
        }
      }
    }

    const profileMap = new Map<string, { name: string; short: string; phone: string }>();
    for (const p of profilesRes.data ?? []) {
      const name = String(p.full_name || p.display_name || "Equipe");
      profileMap.set(p.id as string, {
        name,
        short: String(p.display_name || name.split(" ")[0] || "Equipe"),
        phone: String(p.whatsapp ?? ""),
      });
    }

    const msgsBySession = new Map<string, IaMessageItem[]>();
    for (const m of messagesRes.data ?? []) {
      const sid = m.session_id as string | null;
      if (!sid) continue;
      const meta = obj(m.metadata);
      const item: IaMessageItem = {
        id: m.id as string,
        at: m.created_at as string,
        direction: m.direction === "out" ? "out" : "in",
        body: String(m.body ?? ""),
        audio: Boolean(meta.audio),
        actionPending: meta.action_status === "pending",
      };
      const arr = msgsBySession.get(sid) ?? [];
      arr.push(item);
      msgsBySession.set(sid, arr);
    }

    const runsBySession = new Map<string, IaRunAudit[]>();
    for (const r of runRows) {
      const sid = (r.session_id as string | null) ?? `profile:${(r.actor_profile_id as string | null) ?? "unknown"}`;
      const input = obj(r.input_summary);
      const output = obj(r.output_summary);
      const caminho = input.caminho === "fluxo_antigo" ? "fluxo_antigo" : "ferramentas";
      const runItem: IaRunAudit = {
        id: r.id as string,
        at: r.created_at as string,
        status: String(r.status ?? "completed"),
        model: (r.model as string | null) ?? undefined,
        caminho,
        latencyMs: Number(r.latency_ms ?? 0),
        tokens: Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0),
        pergunta: String(input.pergunta ?? ""),
        resposta: String(output.resposta ?? ""),
        audio: Boolean(input.audio),
        companyId: (r.company_id as string | null) ?? undefined,
        gravou: strList(output.gravou),
        marcas: strList(output.marcas),
        errorMessage: (r.error_message as string | null) ?? undefined,
        steps: stepsMap.get(r.id as string) ?? [],
      };
      const arr = runsBySession.get(sid) ?? [];
      arr.push(runItem);
      runsBySession.set(sid, arr);
    }

    const seenKeys = new Set<string>();
    const blocks: IaSessionBlock[] = [];
    const nowMs = Date.now();

    for (const s of sessionsRes.data ?? []) {
      const sid = s.id as string;
      seenKeys.add(sid);
      const profileId = (s.profile_id as string | null) ?? "";
      const prof = profileId ? profileMap.get(profileId) : undefined;
      const messages = (msgsBySession.get(sid) ?? []).sort((a, b) => a.at.localeCompare(b.at));
      const runs = (runsBySession.get(sid) ?? []).sort((a, b) => b.at.localeCompare(a.at));
      const diag = classifySessionIntervention({ runs, messages, nowMs });

      const fromSeller = messages.filter((m) => m.direction === "in").length || runs.length;
      const fromIa = messages.filter((m) => m.direction === "out").length || runs.filter((r) => Boolean(r.resposta)).length;
      const latestRun = runs[0];
      const latestMsgIn = [...messages].reverse().find((m) => m.direction === "in");
      const latestMsgOut = [...messages].reverse().find((m) => m.direction === "out");
      const modelLabel = runs.find((r) => r.model)?.model ?? "Agente IA";
      const lastActivityAt =
        messages.at(-1)?.at ?? latestRun?.at ?? (s.updated_at as string) ?? (s.created_at as string);

      blocks.push({
        id: sid,
        sellerId: profileId,
        sellerName: prof?.name ?? String(s.title || s.external_channel_user_id || "Vendedor sem vínculo"),
        sellerShort: prof?.short ?? String(s.title || "Equipe"),
        phone: String(s.external_channel_user_id ?? prof?.phone ?? ""),
        status: s.status === "closed" ? "closed" : s.status === "expired" ? "expired" : "active",
        attendant: diag.level === "intervencao" ? "Escalar para gestor" : "Agente Tawper IA",
        modelLabel,
        intervention: diag.level,
        interventionReasons: diag.reasons,
        messagesTotal: messages.length || fromSeller + fromIa,
        messagesFromSeller: fromSeller,
        messagesFromIa: fromIa,
        audioCount: runs.filter((r) => r.audio).length,
        writesCount: diag.writesCount,
        consultsCount: diag.consultsCount,
        errorsCount: diag.errorsCount,
        pendingActionsCount: diag.pendingActionsCount,
        iaScorePct: diag.iaScorePct,
        avgLatencyMs: diag.avgLatencyMs,
        lastActivityAt,
        lastQuestion: latestRun?.pergunta || latestMsgIn?.body || "—",
        lastReply: latestRun?.resposta || latestMsgOut?.body || "—",
        lastGravou: latestRun?.gravou ?? [],
        reviewedBy: diag.reviewedBy,
        runs: runs.slice(0, 40),
        messages: messages.slice(-60),
      });
    }

    // Inclui também runs históricos que ainda não possuem sessão vinculada
    for (const [key, runs] of runsBySession.entries()) {
      if (seenKeys.has(key) || !key.startsWith("profile:")) continue;
      const profileId = key.slice("profile:".length);
      const prof = profileId !== "unknown" ? profileMap.get(profileId) : undefined;
      const sortedRuns = [...runs].sort((a, b) => b.at.localeCompare(a.at));
      const diag = classifySessionIntervention({ runs: sortedRuns, messages: [], nowMs });
      const latestRun = sortedRuns[0];
      blocks.push({
        id: key,
        sellerId: profileId === "unknown" ? "" : profileId,
        sellerName: prof?.name ?? "Vendedor sem vínculo",
        sellerShort: prof?.short ?? "Equipe",
        phone: prof?.phone ?? "",
        status: "active",
        attendant: diag.level === "intervencao" ? "Escalar para gestor" : "Agente Tawper IA",
        modelLabel: sortedRuns.find((r) => r.model)?.model ?? "Agente IA",
        intervention: diag.level,
        interventionReasons: diag.reasons,
        messagesTotal: sortedRuns.length * 2,
        messagesFromSeller: sortedRuns.length,
        messagesFromIa: sortedRuns.filter((r) => Boolean(r.resposta)).length,
        audioCount: sortedRuns.filter((r) => r.audio).length,
        writesCount: diag.writesCount,
        consultsCount: diag.consultsCount,
        errorsCount: diag.errorsCount,
        pendingActionsCount: diag.pendingActionsCount,
        iaScorePct: diag.iaScorePct,
        avgLatencyMs: diag.avgLatencyMs,
        lastActivityAt: latestRun?.at ?? since,
        lastQuestion: latestRun?.pergunta ?? "—",
        lastReply: latestRun?.resposta ?? "—",
        lastGravou: latestRun?.gravou ?? [],
        reviewedBy: diag.reviewedBy,
        runs: sortedRuns.slice(0, 40),
        messages: [],
      });
    }

    const weight = { intervencao: 0, atencao: 1, normal: 2, revisado: 3 };
    blocks.sort(
      (a, b) => weight[a.intervention] - weight[b.intervention] || b.lastActivityAt.localeCompare(a.lastActivityAt),
    );

    return NextResponse.json({ live: true, sessions: blocks });
  } catch (e) {
    return (
      jsonAuthError(e) ??
      NextResponse.json(
        { error: e instanceof Error ? e.message : "Falha ao carregar os atendimentos da IA." },
        { status: 500 },
      )
    );
  }
}

/** Permite ao gestor marcar uma sessão como revisada (intervenção resolvida) ou sinalizar nova revisão. */
export async function POST(request: Request) {
  try {
    const session = await withSession(request);
    assertManager(session.role);
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      action?: "resolve" | "flag";
      note?: string;
    };

    if (!body.sessionId || !body.action) {
      return NextResponse.json({ error: "Informe sessionId e action." }, { status: 400 });
    }
    if (!supabaseOn() || !UUID.test(body.sessionId)) {
      return NextResponse.json({ ok: true, demo: true });
    }

    const db = getSupabaseAdmin();
    const { data: runs, error: runErr } = await db
      .from("ai_agent_runs")
      .select("id, output_summary")
      .eq("organization_id", TAWPER_ORG_ID)
      .eq("session_id", body.sessionId)
      .eq("agent_key", "whatsapp_agent")
      .order("created_at", { ascending: false })
      .limit(20);
    if (runErr) throw new Error(runErr.message);

    let reviewer = "Gestor";
    if (UUID.test(session.userId)) {
      const { data: prof } = await db
        .from("profiles")
        .select("display_name, full_name")
        .eq("id", session.userId)
        .maybeSingle();
      reviewer = String(prof?.display_name || prof?.full_name || "Gestor");
    }
    const targetMark = body.action === "resolve" ? `revisado:${reviewer}` : "errou";

    for (const r of runs ?? []) {
      const output = obj(r.output_summary);
      const currentMarks = strList(output.marcas);
      const filtered =
        body.action === "resolve"
          ? [...currentMarks.filter((m) => !m.startsWith("revisado:")), targetMark]
          : currentMarks.includes("errou")
            ? currentMarks
            : [...currentMarks.filter((m) => !m.startsWith("revisado:")), targetMark];
      await db
        .from("ai_agent_runs")
        .update({ output_summary: { ...output, marcas: filtered } })
        .eq("id", r.id as string);
      if (body.action === "flag") break;
    }

    if (body.action === "resolve") {
      // Limpa ações antigas marcadas como pendentes na sessão após revisão do gestor.
      await db
        .from("ai_channel_messages")
        .update({ metadata: { action_status: "resolved_by_manager" } })
        .eq("session_id", body.sessionId)
        .filter("metadata->>action_status", "eq", "pending");
    }

    await db.from("audit_events").insert({
      organization_id: TAWPER_ORG_ID,
      actor_profile_id: UUID.test(session.userId) ? session.userId : null,
      origin: "manual",
      entity_type: "ai_agent_session",
      entity_id: body.sessionId,
      field_name: body.action === "resolve" ? "intervencao_humana" : "sinalizacao_auditoria",
      old_value: body.action === "resolve" ? "pendente" : "normal",
      new_value: body.note?.trim() || (body.action === "resolve" ? `revisado por ${reviewer}` : "sinalizado para revisão"),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return (
      jsonAuthError(e) ??
      NextResponse.json(
        { error: e instanceof Error ? e.message : "Falha ao atualizar status da sessão." },
        { status: 500 },
      )
    );
  }
}
