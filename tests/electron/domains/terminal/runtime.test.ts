import { describe, expect, it, vi } from "vitest";
import { TerminalRuntime, type PtyProcess } from "../../../../electron/domains/terminal/runtime";

describe("Electron local PTY runtime", () => {
  it("opens, preserves output bytes, writes, resizes, exits and closes", () => {
    const pty = new FakePty();
    const emit = vi.fn();
    const spawn = vi.fn(() => pty);
    const runtime = new TerminalRuntime(emit, { spawn, shell: "/bin/test-shell" });

    const opened = runtime.open({ cols: 80, rows: 24 }, "stream-1");
    expect(opened.title).toBe("test-shell");
    expect(runtime.has(opened.sessionId)).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      "/bin/test-shell",
      [],
      expect.objectContaining({ name: "xterm-256color", cols: 80, rows: 24, encoding: null }),
    );

    pty.emitData(Buffer.from([0, 27, 255]));
    expect(emit).toHaveBeenCalledWith("stream-1", {
      type: "output",
      sessionId: opened.sessionId,
      data: [0, 27, 255],
    });
    runtime.write(opened.sessionId, [65, 0, 255]);
    expect(pty.write).toHaveBeenCalledWith(Buffer.from([65, 0, 255]));
    runtime.resize(opened.sessionId, { cols: 100, rows: 30 });
    expect(pty.resize).toHaveBeenCalledWith(100, 30);

    pty.emitExit(7);
    expect(emit).toHaveBeenCalledWith("stream-1", {
      type: "exit",
      sessionId: opened.sessionId,
      exitCode: 7,
    });
    runtime.close(opened.sessionId);
    expect(pty.kill).not.toHaveBeenCalled();
    expect(runtime.has(opened.sessionId)).toBe(false);
  });

  it("rejects dimensions outside the native terminal contract", () => {
    const runtime = new TerminalRuntime(vi.fn(), {
      spawn: () => new FakePty(),
      shell: "/bin/sh",
    });

    expect(() => runtime.open({ cols: 0, rows: 24 })).toThrowError(
      expect.objectContaining({ code: "INVALID_TERMINAL_SIZE" }),
    );
    expect(() => runtime.open({ cols: 80, rows: 501 })).toThrowError(
      expect.objectContaining({ code: "INVALID_TERMINAL_SIZE" }),
    );
  });

  it("kills every live PTY during application shutdown", () => {
    const first = new FakePty();
    const second = new FakePty();
    const ptys = [first, second];
    const runtime = new TerminalRuntime(vi.fn(), {
      spawn: () => ptys.shift() as FakePty,
      shell: "/bin/sh",
    });
    runtime.open({ cols: 80, rows: 24 });
    runtime.open({ cols: 80, rows: 24 });

    runtime.closeAll();
    expect(first.kill).toHaveBeenCalledOnce();
    expect(second.kill).toHaveBeenCalledOnce();
    expect(runtime.has("missing")).toBe(false);
  });
});

class FakePty implements PtyProcess {
  readonly write = vi.fn();
  readonly resize = vi.fn();
  readonly kill = vi.fn();
  #data?: (data: string | Buffer) => void;
  #exit?: (event: { exitCode: number }) => void;

  onData(listener: (data: string | Buffer) => void) {
    this.#data = listener;
    return { dispose: vi.fn() };
  }

  onExit(listener: (event: { exitCode: number }) => void) {
    this.#exit = listener;
    return { dispose: vi.fn() };
  }

  emitData(data: string | Buffer): void {
    this.#data?.(data);
  }

  emitExit(exitCode: number): void {
    this.#exit?.({ exitCode });
  }
}
