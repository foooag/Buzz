import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useAgentChat } from "@/features/agent/chat/useAgentChat";
import type { AgentClient, AgentSnapshot } from "@/features/agent/agentTypes";

// Isolated in its own file because vitest isolates module state per file: the
// AI SDK `Chat` instance driven by a full stream in a sibling test leaves
// scheduler/microtask state in the shared worker that prevents the next
// `useChat` mount from committing (container renders empty, the create
// effect never fires). Running this assertion alone in a file mounts cleanly.
function fakeClient(): AgentClient {
  return {
    create: vi.fn(async () => ({ agentId: "a1", providerConfigId: "cfg", status: "idle", hosts: [], messages: [] })),
    prompt: vi.fn(async () => ({ agentId: "a1", providerConfigId: "cfg", status: "idle", hosts: [], messages: [] } satisfies AgentSnapshot)),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    decideTool: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as AgentClient;
}

function Probe({ client }: { client: AgentClient }) {
  useAgentChat({
    agentClient: client,
    providerConfigId: "cfg",
    getGroupHostIds: () => ({}),
    getHosts: () => [],
    onSideEvent: () => undefined,
  });
  return <div data-testid="status" />;
}

describe("useAgentChat (unmount)", () => {
  it("closes the agent on unmount", async () => {
    const client = fakeClient();
    const { unmount } = render(<Probe client={client} />);
    await waitFor(() => expect(client.create).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(client.close).toHaveBeenCalledWith("a1"));
  });
});
