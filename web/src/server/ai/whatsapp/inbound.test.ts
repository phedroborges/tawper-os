import { describe, expect, it } from "vitest";
import { parseWhatsAppAgentInbound } from "./inbound";

describe("webhook do agente interno no WhatsApp", () => {
  it("lê mensagem de texto do payload SM v2", () => {
    expect(parseWhatsAppAgentInbound({
      event: "Message",
      data: {
        Info: { ID: "msg-1", Sender: "5517981640028@s.whatsapp.net", Chat: "5517981640028@s.whatsapp.net", PushName: "Douglas" },
        Message: { conversation: "Quais tarefas tenho hoje?" },
      },
    })).toEqual({
      eventId: "msg-1",
      sender: "5517981640028",
      displayName: "Douglas",
      text: "Quais tarefas tenho hoje?",
    });
  });

  it("aceita envelope de webhook de conta", () => {
    expect(parseWhatsAppAgentInbound({
      event_id: "evt-2",
      data: {
        payload: {
          info: { Sender: "5511999990001@s.whatsapp.net", Chat: "5511999990001@s.whatsapp.net" },
          message: { extendedTextMessage: { text: "Resuma a empresa Acme" } },
        },
      },
    })?.text).toBe("Resuma a empresa Acme");
  });

  it("ignora mensagem do próprio bot, grupo e mídia sem legenda", () => {
    expect(parseWhatsAppAgentInbound({ data: { Info: { ID: "1", Sender: "5517981640028@s.whatsapp.net", IsFromMe: true }, Message: { conversation: "eco" } } })).toBeNull();
    expect(parseWhatsAppAgentInbound({ data: { Info: { ID: "2", Sender: "5517981640028:1@s.whatsapp.net", Chat: "1203630@g.us" }, Message: { conversation: "grupo" } } })).toBeNull();
    expect(parseWhatsAppAgentInbound({ data: { Info: { ID: "3", Sender: "5517981640028@s.whatsapp.net" }, Message: { audioMessage: { mimetype: "audio/ogg" } } } })).toBeNull();
  });
});
