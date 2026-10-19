import { NextResponse } from "next/server";
import { invalidateCrmReadCache } from "@/server/crm";
import { addActivityRecord, addContactRecord, completeActivityRecord, deleteCompanyRecord, moveDealRecord, registerCompany, updateCompanyRecord } from "@/server/persist";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let response: NextResponse;
    switch (body.action) {
      case "createCompany": {
        const saved = await registerCompany(body);
        response = NextResponse.json(saved);
        break;
      }
      case "updateCompany": {
        await updateCompanyRecord(body.id, body.patch, body.actorId);
        response = NextResponse.json({ ok: true });
        break;
      }
      case "addContact": {
        const id = await addContactRecord(body.contact, body.actorId);
        response = NextResponse.json({ id });
        break;
      }
      case "addActivity": {
        const id = await addActivityRecord(body.activity);
        response = NextResponse.json({ id });
        break;
      }
      case "completeActivity": {
        const nextId = await completeActivityRecord(body.id, body.resultado, body.next);
        response = NextResponse.json({ nextId });
        break;
      }
      case "deleteCompany": {
        await deleteCompanyRecord(body.id, body.actorId, body.reason);
        response = NextResponse.json({ ok: true });
        break;
      }
      case "moveDeal": {
        await moveDealRecord(body);
        response = NextResponse.json({ ok: true });
        break;
      }
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
    invalidateCrmReadCache();
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao gravar no banco.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
