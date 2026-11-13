import { confirmRouteRecord, saveRouteRecord } from "@/server/routes";
import { NextResponse } from "next/server";
import { jsonAuthError, withSession } from "@/server/auth/http";
import { invalidateCrmReadCache } from "@/server/crm";
import { addActivityRecord, addContactRecord, completeActivityRecord, deleteCompanyRecord, moveDealRecord, registerCompany, updateCompanyRecord } from "@/server/persist";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await withSession(request);
    const body = await request.json();
    let response: NextResponse;
    switch (body.action) {
      case "createCompany": {
        const saved = await registerCompany({ ...body, actorId: session.userId });
        response = NextResponse.json(saved);
        break;
      }
      case "updateCompany": {
        await updateCompanyRecord(body.id, body.patch, session.userId);
        response = NextResponse.json({ ok: true });
        break;
      }
      case "addContact": {
        const id = await addContactRecord(body.contact, session.userId);
        response = NextResponse.json({ id });
        break;
      }
      case "addActivity": {
        const id = await addActivityRecord(body.activity, { actorId: session.userId, actorType: "user" });
        response = NextResponse.json({ id });
        break;
      }
      case "completeActivity": {
        const nextId = await completeActivityRecord(body.id, body.resultado, body.next, { actorId: session.userId, actorType: "user" });
        response = NextResponse.json({ nextId });
        break;
      }
      case "deleteCompany": {
        await deleteCompanyRecord(body.id, session.userId, body.reason);
        response = NextResponse.json({ ok: true });
        break;
      }
      case "saveRoute": {
        const id = await saveRouteRecord(body.route, body.ownerId, session.userId);
        response = NextResponse.json({ id });
        break;
      }
      case "confirmRoute": {
        await confirmRouteRecord(body.id);
        response = NextResponse.json({ ok: true });
        break;
      }
      case "moveDeal": {
        await moveDealRecord({ ...body, actorId: session.userId });
        response = NextResponse.json({ ok: true });
        break;
      }
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
    invalidateCrmReadCache();
    return response;
  } catch (e) {
    return jsonAuthError(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gravar no banco." }, { status: 400 });
  }
}
