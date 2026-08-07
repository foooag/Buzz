import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../../../src/main/ipc/dispatcher";
import { createTerminalCommandHandlers } from "../../../../src/main/domains/terminal/commands";
import { TerminalRuntime, type PtyProcess } from "../../../../src/main/domains/terminal/runtime";

describe("Electron terminal command handlers", () => {
  it("keeps Electron-owned PTY operations out of the legacy transport", async () => {
    const pty = new FakePty();
    const runtime = new TerminalRuntime(vi.fn(), { spawn: () => pty, shell: "/bin/sh" });
    const handlers = createTerminalCommandHandlers(runtime);
    const fallback = vi.fn();
    const context: CommandContext = { streamId: "stream-1", ownerId: "test-owner", fallback };

    const opened = await handlers.terminal_open?.({ size: { cols: 80, rows: 24 } }, context);
    expect(opened).toMatchObject({ ok: true, data: { title: "sh" } });
    if (!opened?.ok) throw new Error("PTY did not open");
    const sessionId = (opened.data as { sessionId: string }).sessionId;
    await handlers.terminal_write?.({ sessionId, data: [65] }, context);
    await handlers.terminal_resize?.({ sessionId, size: { cols: 90, rows: 25 } }, context);
    await handlers.terminal_close?.({ sessionId }, context);

    expect(fallback).not.toHaveBeenCalled();
    expect(pty.write).toHaveBeenCalledWith(Buffer.from([65]));
    expect(pty.resize).toHaveBeenCalledWith(90, 25);
    expect(pty.kill).toHaveBeenCalledOnce();
  });

  it("falls back for SSH-owned terminal sessions", async () => {
    const runtime = new TerminalRuntime(vi.fn(), {
      spawn: () => new FakePty(),
      shell: "/bin/sh",
    });
    const handlers = createTerminalCommandHandlers(runtime);
    const fallback = vi.fn().mockResolvedValue({ ok: true, data: "ssh" });
    const context: CommandContext = { ownerId: "test-owner", fallback };

    await expect(handlers.terminal_write?.(
      { sessionId: "ssh-1", data: [65] },
      context,
    )).resolves.toEqual({ ok: true, data: "ssh" });
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("routes Electron-owned SSH sessions before using the legacy fallback", async () => {
    const runtime = new TerminalRuntime(vi.fn(), {
      spawn: () => new FakePty(),
      shell: "/bin/sh",
    });
    const remote = {
      has: vi.fn(() => true),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const handlers = createTerminalCommandHandlers(runtime, remote);
    const fallback = vi.fn();
    const context: CommandContext = { ownerId: "test-owner", fallback };

    await handlers.terminal_write?.({ sessionId: "ssh-1", data: [65] }, context);
    await handlers.terminal_resize?.(
      { sessionId: "ssh-1", size: { cols: 90, rows: 25 } },
      context,
    );
    await handlers.terminal_close?.({ sessionId: "ssh-1" }, context);
    expect(remote.write).toHaveBeenCalledWith("ssh-1", [65]);
    expect(remote.resize).toHaveBeenCalledWith("ssh-1", { cols: 90, rows: 25 });
    expect(remote.close).toHaveBeenCalledWith("ssh-1");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("returns the established invalid-input response for malformed bytes", async () => {
    const runtime = new TerminalRuntime(vi.fn(), {
      spawn: () => new FakePty(),
      shell: "/bin/sh",
    });
    const handler = createTerminalCommandHandlers(runtime).terminal_write;
    const context: CommandContext = { ownerId: "test-owner", fallback: vi.fn() };

    await expect(handler?.({ sessionId: "pty-1", data: [256] }, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "IPC_INVALID_INPUT",
        message: "The desktop operation received invalid input.",
      },
    });
  });
});

class FakePty implements PtyProcess {
  readonly write = vi.fn();
  readonly resize = vi.fn();
  readonly kill = vi.fn();
  onData() { return { dispose: vi.fn() }; }
  onExit() { return { dispose: vi.fn() }; }
}
