import type { Client } from "ssh2";
import { describe, expect, it, vi } from "vitest";
import { SshHeadlessRuntime } from "../../../../src/main/domains/ssh/headless";
import type {
  CreateSshProfile,
  SshCommandResult,
  SshRuntime,
} from "../../../../src/main/domains/ssh/runtime";

describe("SshHeadlessRuntime", () => {
  it("opens through connectClient and executes on the cached client", async () => {
    const client = { end: vi.fn() } as unknown as Client;
    const connectClient = vi.fn(async () => client);
    const exec = vi.fn(async (): Promise<SshCommandResult> => ({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      truncated: false,
    }));
    const runtime = new SshHeadlessRuntime(
      { connectClient } as unknown as SshRuntime,
      4,
      exec,
    );

    await runtime.open("h1", profile("h1"), "stream-1");
    await expect(runtime.exec("h1", "uptime", { cwd: "/srv", timeoutMs: 5_000 }))
      .resolves.toMatchObject({ stdout: "ok" });

    expect(connectClient).toHaveBeenCalledWith(
      profile("h1"),
      "headless:h1",
      "stream-1",
    );
    expect(exec).toHaveBeenCalledWith(client, "uptime", {
      cwd: "/srv",
      timeoutMs: 5_000,
      signal: undefined,
    });
    expect(runtime.hosts()).toEqual(["h1"]);
  });

  it("rejects execution for a host that was not opened", async () => {
    const runtime = new SshHeadlessRuntime({} as SshRuntime);

    await expect(runtime.exec("missing", "uptime"))
      .rejects.toMatchObject({ code: "AGENT_HOST_NOT_CONNECTED" });
  });

  it("limits concurrent executions", async () => {
    const client = { end: vi.fn() } as unknown as Client;
    const connectClient = vi.fn(async () => client);
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const exec = vi.fn(async (): Promise<SshCommandResult> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return { stdout: "", stderr: "", exitCode: 0, truncated: false };
    });
    const runtime = new SshHeadlessRuntime(
      { connectClient } as unknown as SshRuntime,
      2,
      exec,
    );
    await runtime.open("h1", profile("h1"));

    const executions = [1, 2, 3].map((index) => runtime.exec("h1", `cmd-${index}`));
    await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(2));
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(3));
    releases.splice(0).forEach((release) => release());
    await Promise.all(executions);

    expect(peak).toBe(2);
  });

  it("closes cached clients", async () => {
    const client = { end: vi.fn() } as unknown as Client;
    const runtime = new SshHeadlessRuntime({
      connectClient: vi.fn(async () => client),
    } as unknown as SshRuntime);
    await runtime.open("h1", profile("h1"));

    await runtime.closeAll();

    expect(client.end).toHaveBeenCalledOnce();
    expect(runtime.hosts()).toEqual([]);
  });
});

function profile(hostId: string): CreateSshProfile {
  return {
    hostId,
    hostname: `${hostId}.example.test`,
    username: "root",
    authKind: "password",
    credentialRef: `credential-${hostId}`,
  };
}
