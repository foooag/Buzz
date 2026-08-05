import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DomainError } from "../../ipc/domain-error.js";

export type TerminalSize = { cols: number; rows: number };

export type TerminalEvent =
  | { type: "output"; sessionId: string; data: number[] }
  | { type: "exit"; sessionId: string; exitCode: number | null }
  | { type: "error"; sessionId: string; error: { code: string; message: string } };

export type PtyProcess = {
  onData(listener: (data: string | Buffer) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
  write(data: string | Buffer): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
};

export type PtySpawner = (
  shell: string,
  args: string[],
  options: {
    name: string;
    cols: number;
    rows: number;
    env: NodeJS.ProcessEnv;
    encoding: null;
  },
) => PtyProcess;

type Session = {
  process: PtyProcess;
  exited: boolean;
};

export class TerminalRuntime {
  readonly #emit: (streamId: string | undefined, event: TerminalEvent) => void;
  readonly #spawn: PtySpawner;
  readonly #shell: string;
  readonly #sessions = new Map<string, Session>();

  constructor(
    emit: (streamId: string | undefined, event: TerminalEvent) => void,
    options: { spawn?: PtySpawner; shell?: string } = {},
  ) {
    this.#emit = emit;
    this.#spawn = options.spawn ?? loadNodePtySpawner();
    this.#shell = options.shell ?? defaultShell();
  }

  open(size: TerminalSize, streamId?: string): { sessionId: string; title: string } {
    validateSize(size);
    const sessionId = randomUUID();
    let process: PtyProcess;
    try {
      process = this.#spawn(this.#shell, [], {
        name: "xterm-256color",
        cols: size.cols,
        rows: size.rows,
        env: { ...globalThis.process.env, TERM: "xterm-256color" },
        encoding: null,
      });
    } catch {
      throw new DomainError("PTY_OPEN_FAILED", "The local terminal could not be opened.");
    }

    const session: Session = { process, exited: false };
    this.#sessions.set(sessionId, session);
    process.onData((data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
      this.#emit(streamId, { type: "output", sessionId, data: Array.from(bytes) });
    });
    process.onExit(({ exitCode }) => {
      session.exited = true;
      this.#emit(streamId, {
        type: "exit",
        sessionId,
        exitCode: Number.isInteger(exitCode) && exitCode >= 0 ? exitCode : null,
      });
    });

    return {
      sessionId,
      title: path.basename(this.#shell) || "Local Terminal",
    };
  }

  has(sessionId: string): boolean {
    return this.#sessions.has(sessionId);
  }

  write(sessionId: string, data: readonly number[]): void {
    const session = this.#session(sessionId);
    try {
      session.process.write(Buffer.from(data));
    } catch {
      throw new DomainError(
        "TERMINAL_WRITE_FAILED",
        "The terminal input could not be delivered.",
      );
    }
  }

  resize(sessionId: string, size: TerminalSize): void {
    validateSize(size);
    const session = this.#session(sessionId);
    try {
      session.process.resize(size.cols, size.rows);
    } catch {
      throw new DomainError(
        "TERMINAL_RESIZE_FAILED",
        "The terminal window could not be resized.",
      );
    }
  }

  close(sessionId: string): void {
    const session = this.#sessions.get(sessionId);
    if (!session) return;
    this.#sessions.delete(sessionId);
    if (session.exited) return;
    try {
      session.process.kill();
    } catch {
      throw new DomainError(
        "TERMINAL_CLOSE_FAILED",
        "The local terminal process could not be stopped.",
      );
    }
  }

  closeAll(): void {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    for (const session of sessions) {
      if (session.exited) continue;
      try {
        session.process.kill();
      } catch {
        // Application shutdown remains best-effort, matching the native manager.
      }
    }
  }

  #session(sessionId: string): Session {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      throw new DomainError("SESSION_NOT_FOUND", "The terminal session is no longer available.");
    }
    return session;
  }
}

export function validateSize(size: TerminalSize): TerminalSize {
  if (
    !Number.isInteger(size.cols) || !Number.isInteger(size.rows) ||
    size.cols < 1 || size.rows < 1 || size.cols > 1000 || size.rows > 500
  ) {
    throw new DomainError(
      "INVALID_TERMINAL_SIZE",
      "Terminal dimensions are outside the supported range.",
    );
  }
  return size;
}

function defaultShell(): string {
  if (globalThis.process.platform === "win32") {
    return globalThis.process.env.COMSPEC || "cmd.exe";
  }
  return globalThis.process.env.SHELL || "/bin/sh";
}

function loadNodePtySpawner(): PtySpawner {
  const nodePty = createRequire(import.meta.url)("node-pty") as typeof import("node-pty");
  return (shell, args, options) => nodePty.spawn(
    shell,
    args,
    options,
  ) as unknown as PtyProcess;
}
