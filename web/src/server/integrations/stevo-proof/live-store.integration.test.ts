import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { listLiveMessages, listLiveMessagesFor, listLivePreviews } from "./live-store";

const url = process.env.TAWPER_TEST_DATABASE_URL;
const local = url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname) && new URL(url).pathname === "/tawper_test" ? url : undefined;

describe.skipIf(!local)("central com PostgreSQL isolado", () => {
  const db = postgres(local ?? "postgres://localhost/unused", { ssl: "require", max: 1 });
  const oldPeer = "5561999990001";
  const busyPeer = "5561999990002";
  afterAll(async () => {
    if (!local) return;
    await db`delete from public.whatsapp_live_messages where peer in ${db([oldPeer, busyPeer])}`;
    await db`delete from public.whatsapp_live_conversations where peer in ${db([oldPeer, busyPeer])}`;
    await db.end();
  });
  it("mantém a conversa antiga e seu histórico após mais de 500 mensagens em outra conversa", async () => {
    process.env.DATABASE_URL = local;
    await listLiveMessages();
    await db`insert into public.whatsapp_live_conversations(peer, last_message_at) values (${oldPeer}, now() - interval '2 days'), (${busyPeer}, now())`;
    await db`insert into public.whatsapp_live_messages(id, peer, direction, body, sent_at) values ('teste-antigo-1', ${oldPeer}, 'in', 'primeira', now() - interval '2 days'), ('teste-antigo-2', ${oldPeer}, 'out', 'segunda', now() - interval '1 day')`;
    await db`insert into public.whatsapp_live_messages(id, peer, direction, body, sent_at) select 'teste-volume-' || n, ${busyPeer}, 'in', 'volume', now() - n * interval '1 second' from generate_series(1, 550) n`;
    const previews = await listLivePreviews();
    expect(previews?.find((message) => message.peer === oldPeer)?.preview).toBe("segunda");
    expect(previews?.filter((message) => message.peer === busyPeer)).toHaveLength(1);
    const history = await listLiveMessagesFor([oldPeer]);
    expect(history?.map((message) => message.preview)).toEqual(["segunda", "primeira"]);
  });
});
