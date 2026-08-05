import { describe, expect, it, vi } from "vitest";
import {
  callCommand,
  callFiniteStreamingCommand,
  callStreamingCommand,
  IpcCommandError,
  type InvokeTransport,
} from "./ipc";
import type { TerminusDesktopBridge } from "./electron";

function installBridge(
  bridge: Partial<TerminusDesktopBridge>,
): TerminusDesktopBridge {
  const complete = {
    invoke: vi.fn(),
    stream: vi.fn(),
    finiteStream: vi.fn(),
    window: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
    },
    updater: {
      check: vi.fn(),
      close: vi.fn(),
      downloadAndInstall: vi.fn(),
      relaunch: vi.fn(),
    },
    ...bridge,
  } as TerminusDesktopBridge;
  window.terminus = complete;
  return complete;
}

describe("callCommand", () => {
  it("uses the isolated Electron preload bridge by default", async () => {
    const bridge = installBridge({
      invoke: vi.fn().mockResolvedValue({ ok: true, data: { name: "buzz" } }),
    });

    await expect(callCommand("app_health", undefined)).resolves.toEqual({
      name: "buzz",
    });
    expect(bridge.invoke).toHaveBeenCalledWith("app_health", undefined);
  });

  it("unwraps successful command data", async () => {
    const transport = vi.fn().mockResolvedValue({
      ok: true,
      data: { name: "buzz", version: "0.1.0" },
    });

    await expect(
      callCommand("app_health", undefined, transport),
    ).resolves.toEqual({ name: "buzz", version: "0.1.0" });
    expect(transport).toHaveBeenCalledWith("app_health", { input: undefined });
  });

  it("throws a typed command error without losing structured details", async () => {
    const transport = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "VAULT_LOCKED",
        message: "Unlock the vault to continue.",
        details: { retryable: true },
      },
    });

    const error = await callCommand("host_list", {}, transport).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(IpcCommandError);
    expect(error).toMatchObject({
      code: "VAULT_LOCKED",
      message: "Unlock the vault to continue.",
      details: { retryable: true },
    });
  });

  it("sanitizes unknown transport failures", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const transport = vi.fn().mockRejectedValue({
      command: "host_list",
      secret: "must-not-leak",
    });

    const error = await callCommand("host_list", {}, transport).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(IpcCommandError);
    expect(error).toMatchObject({
      code: "IPC_TRANSPORT_ERROR",
      message: "The desktop service could not be reached.",
    });
    expect(JSON.stringify(error)).not.toContain("must-not-leak");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("must-not-leak");
    errorLog.mockRestore();
  });
});

describe("callStreamingCommand", () => {
  it("uses the preload stream and forwards events by default", async () => {
    const stream = vi.fn(
      async <TEvent, T>(_command: string, _input: unknown, onEvent: (event: TEvent) => void) => {
        onEvent({ type: "output", data: [65] } as TEvent);
        return { ok: true, data: { sessionId: "session-1" } as T };
      },
    ) as unknown as TerminusDesktopBridge["stream"];
    installBridge({ stream });
    const events: unknown[] = [];

    await expect(
      callStreamingCommand("terminal_open", { size: { cols: 80, rows: 24 } }, (event) =>
        events.push(event),
      ),
    ).resolves.toEqual({ sessionId: "session-1" });
    expect(events).toEqual([{ type: "output", data: [65] }]);
  });

  it("routes channel events and unwraps command data", async () => {
    const events: unknown[] = [];
    const channel = { onmessage: (_event: unknown) => undefined };
    const channelFactory = vi.fn(() => channel);
    const calls: Array<[string, Record<string, unknown>]> = [];
    const transport: InvokeTransport = async <T,>(
      command: string,
      args: Record<string, unknown>,
    ) => {
        calls.push([command, args]);
        const onEvent = args.onEvent as typeof channel;
        onEvent.onmessage({
          type: "output",
          sessionId: "session-1",
          data: [65],
        });
        return {
          ok: true as const,
          data: {
            sessionId: "session-1",
            title: "Local Terminal",
          } as T,
        };
    };

    await expect(
      callStreamingCommand(
        "terminal_open",
        { size: { cols: 80, rows: 24 } },
        (event) => events.push(event),
        transport,
        channelFactory,
      ),
    ).resolves.toEqual({ sessionId: "session-1", title: "Local Terminal" });
    expect(channelFactory).toHaveBeenCalledOnce();
    expect(events).toEqual([
      { type: "output", sessionId: "session-1", data: [65] },
    ]);
    expect(calls).toEqual([
      [
        "terminal_open",
        {
          input: { size: { cols: 80, rows: 24 } },
          onEvent: channel,
        },
      ],
    ]);
  });

  it("sanitizes a streaming transport failure", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const channelFactory = () => ({
      onmessage: (_event: unknown) => undefined,
    });
    const transport = vi.fn().mockRejectedValue({ secret: "must-not-leak" });

    const error = await callStreamingCommand(
      "terminal_open",
      { size: { cols: 80, rows: 24 } },
      () => undefined,
      transport,
      channelFactory,
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(IpcCommandError);
    expect(error).toMatchObject({ code: "IPC_TRANSPORT_ERROR" });
    expect(JSON.stringify(error)).not.toContain("must-not-leak");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("must-not-leak");
    errorLog.mockRestore();
  });
});

describe("callFiniteStreamingCommand", () => {
  it("uses the finite preload stream and forwards Agent events", async () => {
    const finiteStream = vi.fn(
      async <TEvent, T>(
        _command: string,
        _input: unknown,
        onEvent: (event: TEvent) => void,
      ) => {
        onEvent({ type: "messageUpdate", message: { role: "assistant" } } as TEvent);
        return { ok: true, data: { status: "idle" } as T };
      },
    ) as unknown as TerminusDesktopBridge["finiteStream"];
    installBridge({ finiteStream });
    const events: unknown[] = [];

    await expect(callFiniteStreamingCommand(
      "ai_agent_prompt",
      { agentId: "agent-1", text: "Hello" },
      (event) => events.push(event),
    )).resolves.toEqual({ status: "idle" });
    expect(finiteStream).toHaveBeenCalledOnce();
    expect(events).toEqual([
      { type: "messageUpdate", message: { role: "assistant" } },
    ]);
  });
});
