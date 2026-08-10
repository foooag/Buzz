import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useChat } from "@ai-sdk/react";
import { createAgentChatTransport } from "@/features/agent/chat/agentChatTransport";
import type { AgentClient, AgentEvent, AgentSnapshot } from "@/features/agent/agentTypes";

function fakeClient(promptImpl: (onEvent: (e: AgentEvent) => void) => Promise<AgentSnapshot>): AgentClient {
  return {
    create: vi.fn(async () => ({ agentId: "a1", providerConfigId: "cfg", status: "idle", hosts: [], messages: [] })),
    prompt: vi.fn(async (_id, _text, _targets, onEvent) => promptImpl(onEvent)),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    decideTool: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as AgentClient;
}

function Harness({ client, onSideEvent }: { client: AgentClient; onSideEvent?: (e: AgentEvent) => void }) {
  const transport = createAgentChatTransport({
    agentClient: client,
    getAgentId: () => "a1",
    resolveTargets: () => [],
    onSideEvent: onSideEvent ?? (() => undefined),
    onComplete: () => undefined,
  });
  const { messages, sendMessage, status } = useChat({ transport });
  return (
    <div>
      <button onClick={() => sendMessage({ text: "hello" })}>send</button>
      <ul data-testid="status">{status}</ul>
      <ul>
        {messages.map((m) => (
          <li key={m.id} data-testid={`msg-${m.role}`}>
            {m.parts.map((p, i) => (
              <span key={i} data-testid={`${m.role === "assistant" ? "part" : "user-part"}-${p.type}`}>{("text" in p ? p.text : "") || (p.type.startsWith("tool-") ? "tool" : "")}</span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("agentChatTransport", () => {
  it("streams cumulative assistant text into a single text part", async () => {
    const client = fakeClient(async (onEvent) => {
      onEvent({ type: "messageStart", message: { id: "a", role: "assistant", content: [], status: { type: "running" } } });
      onEvent({ type: "messageUpdate", message: { id: "a", role: "assistant", content: [{ type: "text", text: "1." }], status: { type: "running" } } });
      onEvent({ type: "messageUpdate", message: { id: "a", role: "assistant", content: [{ type: "text", text: "1.70" }], status: { type: "running" } } });
      onEvent({ type: "messageEnd", message: { id: "a", role: "assistant", content: [{ type: "text", text: "1.70" }], status: { type: "complete", reason: "stop" } } });
      return { agentId: "a1", providerConfigId: "cfg", status: "idle", hosts: [], messages: [] };
    });
    render(<Harness client={client} />);
    act(() => screen.getByText("send").click());
    await waitFor(() => expect(screen.getByTestId("part-text")).toHaveTextContent("1.70"));
  });

  it("streams reasoning then text as separate parts", async () => {
    const client = fakeClient(async (onEvent) => {
      onEvent({ type: "messageStart", message: { id: "a", role: "assistant", content: [], status: { type: "running" } } });
      onEvent({ type: "messageUpdate", message: { id: "a", role: "assistant", content: [{ type: "reasoning", text: "think" }], status: { type: "running" } } });
      onEvent({ type: "messageUpdate", message: { id: "a", role: "assistant", content: [{ type: "reasoning", text: "think" }, { type: "text", text: "answer" }], status: { type: "running" } } });
      onEvent({ type: "messageEnd", message: { id: "a", role: "assistant", content: [{ type: "reasoning", text: "think" }, { type: "text", text: "answer" }], status: { type: "complete", reason: "stop" } } });
      return { agentId: "a1", providerConfigId: "cfg", status: "idle", hosts: [], messages: [] };
    });
    render(<Harness client={client} />);
    act(() => screen.getByText("send").click());
    await waitFor(() => expect(screen.getAllByTestId("part-reasoning")[0]).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("part-text")).toHaveTextContent("answer"));
  });

  it("emits a tool part and resolves output on toolEnd, teeing side events", async () => {
    const sideEvents: AgentEvent[] = [];
    const client = fakeClient(async (onEvent) => {
      onEvent({ type: "messageStart", message: { id: "a", role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "host_exec", args: { hostId: "h1", command: "uptime" }, argsText: "{}" }], status: { type: "requires-action", reason: "tool-calls" } } });
      onEvent({ type: "toolStart", toolCallId: "c1", toolName: "host_exec", args: { hostId: "h1", command: "uptime" } });
      onEvent({ type: "toolEnd", toolCallId: "c1", toolName: "host_exec", result: { details: { exitCode: 0, stdout: "ok" } }, isError: false });
      onEvent({ type: "messageEnd", message: { id: "a", role: "assistant", content: [{ type: "tool-call", toolCallId: "c1", toolName: "host_exec", args: { hostId: "h1", command: "uptime" }, argsText: "{}", result: { details: { exitCode: 0, stdout: "ok" } }, isError: false }], status: { type: "complete", reason: "stop" } } });
      return { agentId: "a1", providerConfigId: "cfg", status: "idle", hosts: [], messages: [] };
    });
    render(<Harness client={client} onSideEvent={(e) => sideEvents.push(e)} />);
    act(() => screen.getByText("send").click());
    await waitFor(() => expect(screen.getByTestId("part-tool-host_exec")).toBeInTheDocument());
    expect(sideEvents.some((e) => e.type === "toolStart")).toBe(true);
    expect(sideEvents.some((e) => e.type === "toolEnd")).toBe(true);
  });

  it("calls abort when the consumer stops", async () => {
    let resolvePrompt!: (s: AgentSnapshot) => void;
    const client = fakeClient(() => new Promise((r) => { resolvePrompt = r; }));
    const { rerender } = render(<Harness client={client} />);
    // Harness stops are not exposed; this test only asserts abort is wired via a direct transport call below.
    void rerender;
    void resolvePrompt;
    // Direct unit check: transport.sendMessages respects abortSignal.
    const t = createAgentChatTransport({ agentClient: client, getAgentId: () => "a1", resolveTargets: () => [], onSideEvent: () => undefined, onComplete: () => undefined });
    const ctrl = new AbortController();
    const stream = await t.sendMessages({ trigger: "submit-message", chatId: "c", messageId: undefined, messages: [], abortSignal: ctrl.signal });
    const reader = stream.getReader();
    ctrl.abort();
    await reader.read().catch(() => undefined);
    await waitFor(() => expect(client.abort).toHaveBeenCalledWith("a1"));
  });
});
