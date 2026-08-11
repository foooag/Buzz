import type { Client } from "ssh2";
import { DomainError } from "../../ipc/domain-error.js";
import {
  executeOnClient,
  type CreateSshProfile,
  type SshCommandResult,
  type SshRuntime,
} from "./runtime.js";

export type HeadlessExecResult = SshCommandResult;

type HeadlessConnection = {
  connectionId: string;
  client: Client;
};

type HeadlessExec = typeof executeOnClient;

export class SshHeadlessRuntime {
  readonly #ssh: SshRuntime;
  readonly #concurrency: number;
  readonly #exec: HeadlessExec;
  readonly #connections = new Map<string, HeadlessConnection>();
  readonly #active = new Set<Promise<unknown>>();

  constructor(
    ssh: SshRuntime,
    concurrency = 4,
    exec: HeadlessExec = executeOnClient,
  ) {
    this.#ssh = ssh;
    this.#concurrency = Math.max(1, Math.floor(concurrency));
    this.#exec = exec;
  }

  async open(
    hostId: string,
    profile: CreateSshProfile,
    streamId?: string,
  ): Promise<void> {
    if (this.#connections.has(hostId)) return;
    const connectionId = `headless:${hostId}`;
    const client = await this.#ssh.connectClient(profile, connectionId, streamId);
    const existing = this.#connections.get(hostId);
    if (existing) {
      client.end();
      return;
    }
    this.#connections.set(hostId, { connectionId, client });
  }

  async exec(
    hostId: string,
    command: string,
    opts: { cwd?: string; timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<HeadlessExecResult> {
    const connection = this.#connections.get(hostId);
    if (!connection) {
      throw new DomainError(
        "AGENT_HOST_NOT_CONNECTED",
        "The Agent host connection is unavailable.",
      );
    }
    while (this.#active.size >= this.#concurrency) {
      await Promise.race(this.#active);
    }
    const execution = this.#exec(connection.client, command, {
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs ?? 30_000,
      signal: opts.signal,
    });
    this.#active.add(execution);
    try {
      return await execution;
    } finally {
      this.#active.delete(execution);
    }
  }

  async close(hostId: string): Promise<void> {
    const connection = this.#connections.get(hostId);
    if (!connection) return;
    this.#connections.delete(hostId);
    connection.client.end();
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.hosts().map((hostId) => this.close(hostId)));
  }

  hosts(): string[] {
    return [...this.#connections.keys()];
  }
}
