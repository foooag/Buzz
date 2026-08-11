import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_STREAM_CHANNEL } from "../../../../src/shared/agent-stream";
import type { MultiHostAgentRuntime } from "../../../../src/main/domains/agent/agent-runtime";

const electron = vi.hoisted(() => ({
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

import { registerAgentStreamIpc } from "../../../../src/main/domains/agent/stream-ipc";

describe("Agent MessagePort IPC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects untrusted senders and invalid payloads", () => {
    const { window, webContents } = fakeWindow();
    registerAgentStreamIpc(window as never, runtime() as never);
    const handler = electron.on.mock.calls[0][1];
    const untrustedPort = new FakePort();

    handler({
      ports: [untrustedPort],
      sender: { id: 9 },
      senderFrame: webContents.mainFrame,
    }, { agentId: "agent-1", text: "uptime", targets: [] });
    expect(untrustedPort.close).toHaveBeenCalledOnce();

    const invalidPort = new FakePort();
    handler({
      ports: [invalidPort],
      sender: webContents,
      senderFrame: webContents.mainFrame,
    }, { agentId: "", text: "", targets: [] });
    expect(invalidPort.close).toHaveBeenCalledOnce();
  });

  it("streams events and aborts when the renderer closes its port", async () => {
    const { window, webContents } = fakeWindow();
    let finishPrompt: () => void = () => undefined;
    const agentRuntime = runtime();
    vi.mocked(agentRuntime.prompt).mockImplementation(
      async (_ownerId, _agentId, _text, _targets, emit) => {
        emit({ type: "agentStart" });
        await new Promise<void>((resolve) => {
          finishPrompt = resolve;
        });
        return {
          agentId: "agent-1",
          providerConfigId: "provider-1",
          status: "idle",
          hosts: [],
          messages: [],
        };
      },
    );
    registerAgentStreamIpc(window as never, agentRuntime as never);
    const handler = electron.on.mock.calls[0][1];
    const port = new FakePort();

    handler({
      ports: [port],
      sender: webContents,
      senderFrame: webContents.mainFrame,
    }, { agentId: "agent-1", text: "uptime", targets: ["h1"] });

    expect(port.start).toHaveBeenCalledOnce();
    expect(agentRuntime.prompt).toHaveBeenCalledWith(
      "42",
      "agent-1",
      "uptime",
      ["h1"],
      expect.any(Function),
    );
    expect(port.postMessage).toHaveBeenCalledWith({ type: "agentStart" });

    port.emit("close");
    expect(agentRuntime.abort).toHaveBeenCalledWith("42", "agent-1");
    finishPrompt();
    await vi.waitFor(() => expect(port.close).toHaveBeenCalled());
  });
});

class FakePort extends EventEmitter {
  start = vi.fn();
  postMessage = vi.fn();
  close = vi.fn();
}

function fakeWindow() {
  const webContents = { id: 42, mainFrame: { routingId: 1 } };
  return {
    webContents,
    window: {
      webContents,
      once: vi.fn(),
    },
  };
}

function runtime(): MultiHostAgentRuntime {
  return {
    prompt: vi.fn(),
    abort: vi.fn(),
  } as unknown as MultiHostAgentRuntime;
}
