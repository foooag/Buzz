// Isolated in its own file because vitest isolates module state per file: the
// AI SDK `Chat` instance driven by a full stream in a sibling test leaves
// scheduler/microtask state that can prevent the next `useChat` mount from
// committing. These tests only mount/click (no sendMessage), so they run
// alone here to avoid contamination from stream-driving tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPage } from "@/features/agent/AgentPage";
import type { AgentClient, AgentEvent } from "@/features/agent/agentTypes";
import type { AiConfigApi, AiProviderConfig } from "@/features/ai/aiConfigTypes";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { Group, Host } from "@/shared/types";
import {
  AGENT_ACTIVE_KEY,
  AGENT_SESSIONS_KEY,
  saveSessionsToDisk,
  type AgentSession,
} from "@/features/agent/sessionStore";

const timestamp = "2026-08-05T00:00:00.000Z";

function provider(): AiProviderConfig {
  return {
    id: "cfg-1",
    providerKind: "anthropic",
    name: "Claude",
    baseUrl: "https://api.anthropic.com",
    modelId: "claude-sonnet-5",
    credentialConfigured: true,
    isDefault: true,
    connectionStatus: "connected",
    capabilities: {
      streaming: "supported",
      toolCalling: "supported",
      structuredOutput: "supported",
      reasoning: "untested",
    },
    createdAt: "now",
    updatedAt: "now",
  };
}

function providerApi(): AiConfigApi {
  return { list: vi.fn(async () => [provider()]) } as unknown as AiConfigApi;
}

function fakeClient(): AgentClient {
  return {
    create: vi.fn(async () => ({
      agentId: "a1",
      providerConfigId: "cfg-1",
      status: "idle",
      hosts: [],
      messages: [],
    })),
    prompt: vi.fn(
      async (
        _agentId: string,
        _text: string,
        _targets: string[],
        onEvent?: (event: AgentEvent) => void,
      ) => {
        onEvent?.({ type: "agentStart" });
        onEvent?.({
          type: "messageStart",
          message: {
            id: "assistant-1",
            role: "assistant",
            content: [],
            status: { type: "running" },
          },
        });
        onEvent?.({
          type: "messageEnd",
          message: {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "On it." }],
            status: { type: "complete", reason: "stop" },
          },
        });
        onEvent?.({
          type: "agentEnd",
          snapshot: {
            agentId: "a1",
            providerConfigId: "cfg-1",
            status: "idle",
            hosts: [],
            messages: [],
          },
        });
        return {
          agentId: "a1",
          providerConfigId: "cfg-1",
          status: "idle",
          hosts: [],
          messages: [],
        };
      },
    ),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    decideTool: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as AgentClient;
}

function storedSession(overrides: Partial<AgentSession>): AgentSession {
  return {
    id: "s1",
    title: "Stored task",
    input: "",
    messages: [
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "check @web-prod-01" }],
      },
      {
        id: "m1",
        role: "assistant",
        content: [{ type: "text", text: "On it." }],
        status: { type: "complete", reason: "stop" },
      },
    ],
    hosts: [],
    phase: "done",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function seedInventory() {
  const groups: Group[] = [{
    id: "g1",
    vaultId: "v1",
    parentId: null,
    name: "Production",
    color: "coral",
    count: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
  const hosts: Host[] = [{
    id: "h1",
    vaultId: "v1",
    groupId: "g1",
    name: "web-prod-01",
    address: "10.0.0.10",
    username: "ubuntu",
    tags: [],
    notes: "",
    status: "online",
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
  useInventoryStore.getState().setResources(groups, hosts, []);
}

beforeEach(() => {
  window.localStorage.clear();
  useInventoryStore.getState().setResources([], [], []);
});

describe("AgentPage session restore and delete", () => {
  it("restores a stored session on mount and switches back to it", async () => {
    saveSessionsToDisk([
      storedSession({
        id: "s1",
        title: "Stored task",
        input: "restored draft @web-prod-01",
        messages: [
          { id: "u1", role: "user", content: [{ type: "text", text: "check @web-prod-01" }] },
          { id: "m1", role: "assistant", content: [{ type: "text", text: "On it." }], status: { type: "complete", reason: "stop" } },
        ],
      }),
      storedSession({
        id: "s2",
        title: "Another task",
        messages: [
          { id: "u2", role: "user", content: [{ type: "text", text: "another request" }] },
          { id: "m2", role: "assistant", content: [{ type: "text", text: "Got it." }], status: { type: "complete", reason: "stop" } },
        ],
      }),
    ]);
    window.localStorage.setItem(AGENT_ACTIVE_KEY, "s1");
    seedInventory();
    render(<AgentPage agentClient={fakeClient()} providerApi={providerApi()} />);
    // Hydrated conversation renders, including the composer draft.
    expect(await screen.findByText("check @web-prod-01")).toBeVisible();
    expect(screen.getByText("On it.")).toBeVisible();
    expect(screen.getByLabelText("Message agent")).toHaveValue(
      "restored draft @web-prod-01",
    );

    // Open history and switch to the other session.
    await userEvent.click(screen.getByRole("button", { name: "Chat history" }));
    await userEvent.click(screen.getByText("Another task"));
    expect(await screen.findByText("another request")).toBeVisible();
    expect(screen.queryByText("check @web-prod-01")).not.toBeInTheDocument();

    // Switch back to the first session.
    await userEvent.click(screen.getByRole("button", { name: "Chat history" }));
    await userEvent.click(screen.getByText("Stored task"));
    expect(await screen.findByText("check @web-prod-01")).toBeVisible();
  });

  it("deletes a session from history", async () => {
    saveSessionsToDisk([storedSession({ id: "s1", title: "Stored task" })]);
    seedInventory();
    render(<AgentPage agentClient={fakeClient()} providerApi={providerApi()} />);
    await userEvent.click(screen.getByRole("button", { name: "Chat history" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Stored task" }));
    await waitFor(() => {
      const sessions = JSON.parse(
        window.localStorage.getItem(AGENT_SESSIONS_KEY) ?? "[]",
      ) as AgentSession[];
      expect(sessions).toHaveLength(0);
    });
  });
});
