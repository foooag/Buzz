import { describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { useAgentChat } from "@/features/agent/chat/useAgentChat";
import type { AgentClient, AgentSnapshot } from "@/features/agent/agentTypes";

function fakeClient(): { client: AgentClient; prompts: ReturnType<typeof vi.fn> } {
  const prompts = vi.fn();
  const client = {
    create: vi.fn(async () => ({ agentId: "a1", providerConfigId: "cfg", status: "idle", hosts: [], messages: [] })),
    prompt: prompts.mockImplementation(async (_id: string, _text: string, _targets: string[], onEvent: (e: any) => void) => {
      onEvent({ type: "messageStart", message: { id: "a", role: "assistant", content: [], status: { type: "running" } } });
      onEvent({ type: "messageEnd", message: { id: "a", role: "assistant", content: [{ type: "text", text: "hi" }], status: { type: "complete", reason: "stop" } } });
      return { agentId: "a1", providerConfigId: "cfg", status: "idle", hosts: [], messages: [] } satisfies AgentSnapshot;
    }),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    decideTool: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as AgentClient;
  return { client, prompts };
}

function Probe({ client, onReady }: { client: AgentClient; onReady: (api: ReturnType<typeof useAgentChat>) => void }) {
  const chat = useAgentChat({
    agentClient: client,
    providerConfigId: "cfg",
    getGroupHostIds: () => ({}),
    getHosts: () => [],
    onSideEvent: () => undefined,
  });
  onReady(chat);
  return <div data-testid="status">{chat.status}</div>;
}

describe("useAgentChat", () => {
  it("creates an agent, sends a message, and streams a reply", async () => {
    const { client } = fakeClient();
    let api: ReturnType<typeof useAgentChat> | undefined;
    render(<Probe client={client} onReady={(a) => (api = a)} />);
    await waitFor(() => expect(client.create).toHaveBeenCalledWith({ providerConfigId: "cfg" }));

    act(() => api!.sendMessage("hello"));
    await waitFor(() => expect(api!.messages.some((m) => m.role === "assistant")).toBe(true));
    const asst = api!.messages.find((m) => m.role === "assistant")!;
    expect(asst.parts.some((p) => p.type === "text" && (p as any).text === "hi")).toBe(true);
  });
});
