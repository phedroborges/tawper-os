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

  it("ignora mensagem do próprio bot, grupo e imagem sem legenda", () => {
    expect(parseWhatsAppAgentInbound({ data: { Info: { ID: "1", Sender: "5517981640028@s.whatsapp.net", IsFromMe: true }, Message: { conversation: "eco" } } })).toBeNull();
    expect(parseWhatsAppAgentInbound({ data: { Info: { ID: "2", Sender: "5517981640028:1@s.whatsapp.net", Chat: "1203630@g.us" }, Message: { conversation: "grupo" } } })).toBeNull();
    expect(parseWhatsAppAgentInbound({ data: { Info: { ID: "3", Sender: "5517981640028@s.whatsapp.net" }, Message: { imageMessage: { mimetype: "image/jpeg" } } } })).toBeNull();
  });

  it("entrega o recado de voz com o arquivo para transcrever", () => {
    const parsed = parseWhatsAppAgentInbound({
      data: {
        Info: { ID: "a1", Sender: "5517981640028@s.whatsapp.net", PushName: "Douglas" },
        Message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true }, base64: "T2dnUw".repeat(40) },
      },
    });
    expect(parsed).toMatchObject({ eventId: "a1", sender: "5517981640028", text: "", audio: { mime: "audio/ogg; codecs=opus" } });
    expect(parsed?.audio?.base64.length).toBe(240);
  });

  it("acha o base64 dentro do envelope de conta e do áudio com wrapper", () => {
    const parsed = parseWhatsAppAgentInbound({
      event_id: "evt-9",
      data: { payload: { info: { Sender: "5511999990001@s.whatsapp.net" }, message: { ephemeralMessage: { message: { audioMessage: { mimetype: "audio/ogg", base64: "QUJD".repeat(40) } } } } } },
    });
    expect(parsed?.audio?.base64.length).toBe(160);
  });

  it("áudio sem arquivo ainda chega, para o agente avisar que não ouviu", () => {
    const parsed = parseWhatsAppAgentInbound({ data: { Info: { ID: "a2", Sender: "5517981640028@s.whatsapp.net" }, Message: { audioMessage: { mimetype: "audio/ogg" } } } });
    expect(parsed?.audio).toEqual({ base64: "", mime: "audio/ogg" });
  });

  it("texto continua tendo prioridade sobre áudio", () => {
    expect(parseWhatsAppAgentInbound({ data: { Info: { ID: "a3", Sender: "5517981640028@s.whatsapp.net" }, Message: { conversation: "oi" } } })?.audio).toBeUndefined();
  });
});
