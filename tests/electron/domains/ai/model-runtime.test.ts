import { afterEach, describe, expect, it, vi } from "vitest";
import { AiModelRuntime } from "../../../../electron/domains/ai/model-runtime";
import type { AiConfigRepository } from "../../../../electron/domains/ai/repository";
import type { ResolvedAiProviderConfig } from "../../../../electron/domains/ai/types";

afterEach(() => vi.unstubAllGlobals());

describe("Electron AI model runtime", () => {
  it("probes an OpenAI-compatible endpoint through the approved Pi runtime", async () => {
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => response(["OK"]));
    vi.stubGlobal("fetch", fetch);
    const runtime = new AiModelRuntime({} as AiConfigRepository);

    await expect(runtime.probe(config())).resolves.toMatchObject({
      status: "connected",
      capabilities: { streaming: "supported", toolCalling: "supported" },
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });

  it("returns the native Pi stream for an Electron Agent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(["hello", " world"])));
    const resolved = config();
    const repository = { getResolved: vi.fn(() => resolved) } as unknown as AiConfigRepository;
    const runtime = new AiModelRuntime(repository);
    const events = [];
    const stream = runtime.stream(resolved.public.id, {
      messages: [{ role: "user", content: "say hello", timestamp: Date.now() }],
    });
    for await (const event of stream) events.push(event);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text_delta", delta: "hello" }),
      expect.objectContaining({ type: "text_delta", delta: " world" }),
      expect.objectContaining({ type: "done", reason: "stop" }),
    ]));
    expect(runtime.model(resolved.public.id)).toMatchObject({
      id: "model-test",
      provider: "terminus:provider-1",
    });
  });
});

function config(): ResolvedAiProviderConfig {
  const timestamp = new Date().toISOString();
  return {
    public: {
      id: "provider-1", providerKind: "ollama", name: "Local", modelId: "model-test",
      baseUrl: "http://127.0.0.1:11434/v1", credentialConfigured: false,
      isDefault: true, connectionStatus: "untested",
      capabilities: {
        streaming: "untested", toolCalling: "untested",
        structuredOutput: "untested", reasoning: "untested",
      },
      createdAt: timestamp, updatedAt: timestamp,
    },
  };
}

function response(deltas: string[]): Response {
  const chunks = deltas.map((content) => `data: ${JSON.stringify({
    id: "chatcmpl-test", object: "chat.completion.chunk", created: 1,
    model: "model-test", choices: [{ index: 0, delta: { content }, finish_reason: null }],
  })}\n\n`);
  chunks.push(`data: ${JSON.stringify({
    id: "chatcmpl-test", object: "chat.completion.chunk", created: 1,
    model: "model-test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 2, completion_tokens: deltas.length, total_tokens: deltas.length + 2 },
  })}\n\ndata: [DONE]\n\n`);
  return new Response(chunks.join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}
