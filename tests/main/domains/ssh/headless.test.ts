import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../../../../src/main/ipc/domain-error.js";
import { SshHeadlessRuntime } from "../../../../src/main/domains/ssh/headless.js";
import type { SshRuntime } from "../../../../src/main/domains/ssh/runtime.js";

function fakeSsh() {
  const openHeadless = vi.fn(async () => "headless-h1");
  const executeHeadless = vi.fn(async () => ({
    stdout: "ok",
    stderr: "",
    exitCode: 0,
    truncated: false,
  }));
  const closeHeadless = vi.fn(async () => undefined);
  const ssh = {
    openHeadless,
    executeHeadless,
    closeHeadless,
  } as unknown as SshRuntime;
  return { ssh, openHeadless, executeHeadless, closeHeadless };
}

describe("SshHeadlessRuntime", () => {
  it("opens a headless connection and executes a command", async () => {
    const { ssh, openHeadless, executeHeadless, closeHeadless } = fakeSsh();
    const rt = new SshHeadlessRuntime(ssh);
    await rt.open("h1", {
      hostId: "h1",
      hostname: "10.0.0.10",
      port: 22,
      username: "ubuntu",
      authKind: "privateKey",
      credentialRef: "cred-1",
      identityId: "identity-1",
      keepaliveInterval: null,
    });
    expect(rt.hosts()).toEqual(["h1"]);
    const result = await rt.exec("h1", "uptime");
    expect(openHeadless).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: "h1", hostname: "10.0.0.10" }),
      "headless-h1",
    );
    expect(executeHeadless).toHaveBeenCalledWith(
      "headless-h1",
      "$HOME",
      "uptime",
      30_000,
      expect.anything(),
    );
    expect(result.stdout).toBe("ok");
    await rt.closeAll();
    expect(closeHeadless).toHaveBeenCalledWith("headless-h1");
  });

  it("throws for an unopened host", async () => {
    const rt = new SshHeadlessRuntime(fakeSsh().ssh);
    await expect(rt.exec("ghost", "uptime")).rejects.toBeInstanceOf(DomainError);
  });

  it("respects a custom timeout and cwd", async () => {
    const { ssh, executeHeadless } = fakeSsh();
    const rt = new SshHeadlessRuntime(ssh);
    await rt.open("h1");
    await rt.exec("h1", "sleep 1", { cwd: "/srv", timeoutMs: 5000 });
    expect(executeHeadless).toHaveBeenCalledWith(
      "headless-h1",
      "/srv",
      "sleep 1",
      5000,
      expect.anything(),
    );
  });
});
