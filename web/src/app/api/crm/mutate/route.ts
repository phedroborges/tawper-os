import { NextResponse } from "next/server";
import { addActivityRecord, addContactRecord, completeActivityRecord, deleteCompanyRecord, registerCompany, updateCompanyRecord } from "@/server/persist";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    switch (body.action) {
      case "createCompany": {
        const saved = await registerCompany(body);
        return NextResponse.json(saved);
      }
      case "updateCompany": {
        await updateCompanyRecord(body.id, body.patch, body.actorId);
        return NextResponse.json({ ok: true });
      }
      case "addContact": {
        const id = await addContactRecord(body.contact, body.actorId);
        return NextResponse.json({ id });
      }
      case "addActivity": {
        const id = await addActivityRecord(body.activity);
        return NextResponse.json({ id });
      }
      case "completeActivity": {
        const nextId = await completeActivityRecord(body.id, body.resultado, body.next);
        return NextResponse.json({ nextId });
      }
      case "deleteCompany": {
        await deleteCompanyRecord(body.id, body.actorId, body.reason);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao gravar no banco.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
