import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transcribe: vi.fn(), enqueue: vi.fn(), identity: vi.fn() }));
vi.mock("./audio-transcribe", () => ({ transcribeInboundAudio: mocks.transcribe }));
vi.mock("./store", () => ({ enqueueWhatsAppAgentMessage: mocks.enqueue }));
vi.mock("./config", () => ({ whatsappAgentEnabled: () => true, findWhatsAppAgentIdentity: mocks.identity }));

import { ingestWhatsAppAgentPayload } from "./ingest";

const voice = (base64 = "QUJD".repeat(40)) => ({
  data: { Info: { ID: "a1", Sender: "5517981640028@s.whatsapp.net" }, Message: { audioMessage: { mimetype: "audio/ogg" }, base64 } },
});

describe("entrada de áudio no agente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identity.mockReturnValue({ phone: "5517981640028", name: "Douglas", role: "gestor" });
    mocks.enqueue.mockResolvedValue({ duplicate: false });
  });

  it("transcreve e enfileira o texto com o marcador de áudio", async () => {
    mocks.transcribe.mockResolvedValue("cria uma tarefa pra Acme");
    await expect(ingestWhatsAppAgentPayload(voice())).resolves.toEqual({ duplicate: false, queued: true });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ eventId: "a1", displayName: "Douglas", text: "[áudio] cria uma tarefa pra Acme" }));
  });

  it("enfileira o aviso de falha quando a IA não consegue ouvir", async () => {
    mocks.transcribe.mockResolvedValue(null);
    await ingestWhatsAppAgentPayload(voice());
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ text: "[áudio sem transcrição]" }));
  });

  it("não derruba o webhook se a transcrição der erro", async () => {
    mocks.transcribe.mockRejectedValue(new Error("fora do ar"));
    await expect(ingestWhatsAppAgentPayload(voice())).resolves.toEqual({ duplicate: false, queued: true });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ text: "[áudio sem transcrição]" }));
  });

  it("não gasta IA com áudio de número não autorizado", async () => {
    mocks.identity.mockReturnValue(null);
    await expect(ingestWhatsAppAgentPayload(voice())).resolves.toEqual({ ignored: "unauthorized_sender" });
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
