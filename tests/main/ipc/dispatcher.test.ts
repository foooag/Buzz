import { describe, expect, it, vi } from "vitest";
import { createAppCommandHandlers } from "../../../src/main/domains/app";
import { CommandDispatcher } from "../../../src/main/ipc/dispatcher";

describe("Electron command dispatcher", () => {
  it("runs migrated application commands entirely inside Electron", async () => {
    const legacyTransport = vi.fn();
    const dispatcher = new CommandDispatcher(
      createAppCommandHandlers("1.2.3"),
      legacyTransport,
    );

    await expect(dispatcher.invoke("app_health", undefined)).resolves.toEqual({
      ok: true,
      data: { name: "buzz", version: "1.2.3" },
    });
    expect(legacyTransport).not.toHaveBeenCalled();
  });

  it("forwards commands that have not migrated yet to the Rust service", async () => {
    const legacyTransport = vi.fn().mockResolvedValue({ ok: true, data: "opened" });
    const dispatcher = new CommandDispatcher(
      createAppCommandHandlers("1.2.3"),
      legacyTransport,
    );

    await expect(dispatcher.invoke("terminal_open", { target: "local" }, "stream-1"))
      .resolves.toEqual({ ok: true, data: "opened" });
    expect(legacyTransport).toHaveBeenCalledWith(
      "terminal_open",
      { target: "local" },
      "stream-1",
    );
  });

  it("sanitizes unexpected errors from Electron domain handlers", async () => {
    const dispatcher = new CommandDispatcher(
      { app_health: () => { throw new Error("/secret/path"); } },
      vi.fn(),
    );

    await expect(dispatcher.invoke("app_health", undefined)).resolves.toEqual({
      ok: false,
      error: {
        code: "IPC_ELECTRON_ERROR",
        message: "The desktop service could not complete the operation.",
      },
    });
  });

  it("lets a migrated handler fall back for legacy-owned sessions", async () => {
    const legacyTransport = vi.fn().mockResolvedValue({ ok: true, data: "legacy" });
    const dispatcher = new CommandDispatcher(
      { terminal_write: (_input, context) => context.fallback() },
      legacyTransport,
    );

    await expect(dispatcher.invoke(
      "terminal_write",
      { sessionId: "ssh-1", data: [65] },
    )).resolves.toEqual({ ok: true, data: "legacy" });
    expect(legacyTransport).toHaveBeenCalledWith(
      "terminal_write",
      { sessionId: "ssh-1", data: [65] },
      undefined,
    );
  });

  it("passes the renderer owner to migrated handlers", async () => {
    const handler = vi.fn((_input, context) => ({
      ok: true as const,
      data: context.ownerId,
    }));
    const dispatcher = new CommandDispatcher(
      { ai_agent_abort: handler },
      vi.fn(),
    );

    await expect(dispatcher.invoke(
      "ai_agent_abort",
      { agentId: "agent-1" },
      undefined,
      "renderer-42",
    )).resolves.toEqual({ ok: true, data: "renderer-42" });
    expect(handler).toHaveBeenCalledOnce();
  });
});
