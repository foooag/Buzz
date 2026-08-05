import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../../../../electron/ipc/domain-error";
import type { CommandContext } from "../../../../electron/ipc/dispatcher";
import { createSshCommandHandlers } from "../../../../electron/domains/ssh/commands";
import type { KnownHostsRepository } from "../../../../electron/domains/ssh/known-hosts";
import type { SshRuntime } from "../../../../electron/domains/ssh/runtime";

describe("Electron SSH command handlers", () => {
  it("routes all six SSH commands through Electron services", async () => {
    const runtime = fakeRuntime();
    const knownHosts = fakeKnownHosts();
    const handlers = createSshCommandHandlers(runtime, knownHosts);
    const context: CommandContext = { streamId: "stream-1", ownerId: "test-owner", fallback: vi.fn() };
    const cases = [
      ["ssh_store_credential", {
        credential: { type: "password", password: "secret" },
      }, "storeCredential"],
      ["ssh_open", {
        profile: {
          hostId: "h1", hostname: "host", port: 22, username: "user",
          authKind: "password", credentialRef: "ref", identityId: null,
        },
        size: { cols: 80, rows: 24 },
      }, "open"],
      ["ssh_decide_host_key", { sessionId: "s1", trust: true }, "decideHostKey"],
      ["ssh_reconnect", { sessionId: "s1" }, "reconnect"],
      ["ssh_list_known_hosts", {}, "list"],
      ["ssh_delete_known_host", { hostname: "host", port: 22 }, "remove"],
    ] as const;

    for (const [name, input, method] of cases) {
      const result = await handlers[name]?.(input, context);
      expect(result).toEqual({ ok: true, data: method });
    }
    expect(runtime.open).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "host" }),
      { cols: 80, rows: 24 },
      "stream-1",
    );
  });

  it("rejects malformed credential bytes before storing secrets", async () => {
    const runtime = fakeRuntime();
    const handler = createSshCommandHandlers(runtime, fakeKnownHosts()).ssh_store_credential;
    const context: CommandContext = { ownerId: "test-owner", fallback: vi.fn() };

    await expect(handler?.({
      credential: { type: "privateKey", privateKey: [256], passphrase: null },
    }, context)).resolves.toMatchObject({
      ok: false,
      error: { code: "IPC_INVALID_INPUT" },
    });
    expect(runtime.storeCredential).not.toHaveBeenCalled();
  });

  it("preserves sanitized SSH domain failures", async () => {
    const runtime = fakeRuntime();
    vi.mocked(runtime.open).mockRejectedValue(
      new DomainError("SSH_CONNECTION_FAILED", "The SSH server could not be reached."),
    );
    const handler = createSshCommandHandlers(runtime, fakeKnownHosts()).ssh_open;
    const context: CommandContext = { ownerId: "test-owner", fallback: vi.fn() };

    await expect(handler?.({
      profile: {
        hostId: "h1", hostname: "host", port: 22, username: "user",
        authKind: "password", credentialRef: "ref", identityId: null,
      },
      size: { cols: 80, rows: 24 },
    }, context)).resolves.toEqual({
      ok: false,
      error: {
        code: "SSH_CONNECTION_FAILED",
        message: "The SSH server could not be reached.",
      },
    });
  });
});

function fakeRuntime(): SshRuntime {
  return {
    storeCredential: vi.fn(async () => "storeCredential"),
    open: vi.fn(async () => "open"),
    decideHostKey: vi.fn(() => "decideHostKey"),
    reconnect: vi.fn(async () => "reconnect"),
  } as unknown as SshRuntime;
}

function fakeKnownHosts(): KnownHostsRepository {
  return {
    list: vi.fn(() => "list"),
    remove: vi.fn(() => "remove"),
  } as unknown as KnownHostsRepository;
}
