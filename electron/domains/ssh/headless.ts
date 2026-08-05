import { DomainError } from "../../ipc/domain-error.js";
import type { CreateSshProfile, SshRuntime } from "./runtime.js";

export type HeadlessExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
};

type HeadlessExecOptions = {
  cwd?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const HEADLESS_PREFIX = "headless-";

function placeholderProfile(hostId: string): CreateSshProfile {
  return {
    hostId,
    hostname: hostId,
    port: 22,
    username: "placeholder",
    authKind: "password",
    credentialRef: "",
  };
}

export class SshHeadlessRuntime {
  readonly #ssh: SshRuntime;
  readonly #connections = new Map<string, string>();

  constructor(ssh: SshRuntime) {
    this.#ssh = ssh;
  }

  async open(hostId: string, profile?: CreateSshProfile): Promise<void> {
    if (this.#connections.has(hostId)) return;
    const connectionId = `${HEADLESS_PREFIX}${hostId}`;
    await this.#ssh.openHeadless(profile ?? placeholderProfile(hostId), connectionId);
    this.#connections.set(hostId, connectionId);
  }

  async exec(
    hostId: string,
    command: string,
    opts: HeadlessExecOptions = {},
  ): Promise<HeadlessExecResult> {
    const connectionId = this.#connections.get(hostId);
    if (!connectionId) {
      throw new DomainError(
        "HEADLESS_NOT_CONNECTED",
        `No headless SSH connection for host ${hostId}.`,
      );
    }
    return this.#ssh.executeHeadless(
      connectionId,
      opts.cwd ?? "$HOME",
      command,
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      new AbortController().signal,
    );
  }

  async close(hostId: string): Promise<void> {
    const connectionId = this.#connections.get(hostId);
    if (!connectionId) return;
    this.#connections.delete(hostId);
    await this.#ssh.closeHeadless(connectionId).catch(() => undefined);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.#connections.keys()].map((hostId) => this.close(hostId)));
  }

  hosts(): string[] {
    return [...this.#connections.keys()];
  }

  has(hostId: string): boolean {
    return this.#connections.has(hostId);
  }
}
