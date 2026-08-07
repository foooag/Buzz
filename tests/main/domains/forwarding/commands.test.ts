import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../../../src/main/ipc/dispatcher";
import { createForwardingCommandHandlers } from "../../../../src/main/domains/forwarding/commands";
import type { ForwardingRepository } from "../../../../src/main/domains/forwarding/repository";
import type { PortForwardingRuntime } from "../../../../src/main/domains/forwarding/runtime";

describe("Electron forwarding command handlers", () => {
  it("routes all forwarding commands in Electron", async () => {
    const runtime = {
      start: vi.fn(async () => "start"),
      decideHostKey: vi.fn(() => "decideHostKey"),
      stop: vi.fn(() => "stop"),
      listActive: vi.fn(() => "listActive"),
    } as unknown as PortForwardingRuntime;
    const repository = {
      listForHost: vi.fn(() => "listForHost"),
      createRule: vi.fn(() => "createRule"),
      updateRule: vi.fn(() => "updateRule"),
      delete: vi.fn(() => "delete"),
    } as unknown as ForwardingRepository;
    const handlers = createForwardingCommandHandlers(runtime, repository);
    const context: CommandContext = { streamId: "stream-1", ownerId: "test-owner", fallback: vi.fn() };
    const profile = {
      hostId: "h1", hostname: "host", port: 22, username: "user",
      authKind: "password", credentialRef: "ref", identityId: null,
    };
    const startRule = {
      id: "r1", kind: "local", bindHost: "127.0.0.1", bindPort: 8080,
      targetHost: "target", targetPort: 80,
    };
    const storedRule = {
      ...startRule, hostId: "h1", label: null, createdAt: "", updatedAt: "",
    };
    const cases = [
      ["port_forward_start", { profile, rule: startRule }, "start"],
      ["port_forward_decide_host_key", { ruleId: "r1", trust: true }, "decideHostKey"],
      ["port_forward_stop", { ruleId: "r1" }, "stop"],
      ["port_forward_list_active", {}, "listActive"],
      ["port_forward_list_rules", { hostId: "h1" }, "listForHost"],
      ["port_forward_create_rule", { rule: storedRule }, "createRule"],
      ["port_forward_update_rule", { rule: storedRule }, "updateRule"],
      ["port_forward_delete_rule", { ruleId: "r1" }, "delete"],
    ] as const;

    for (const [name, input, expected] of cases) {
      await expect(handlers[name]?.(input, context)).resolves.toEqual({
        ok: true,
        data: expected,
      });
    }
    expect(runtime.start).toHaveBeenCalledWith(profile, startRule, "stream-1");
    expect(context.fallback).not.toHaveBeenCalled();
  });

  it("rejects malformed rules at the IPC boundary", async () => {
    const runtime = { start: vi.fn() } as unknown as PortForwardingRuntime;
    const handlers = createForwardingCommandHandlers(
      runtime,
      {} as ForwardingRepository,
    );
    const context: CommandContext = { ownerId: "test-owner", fallback: vi.fn() };

    await expect(handlers.port_forward_start?.({
      profile: {
        hostId: "h1", hostname: "host", port: 22, username: "user",
        authKind: "password", credentialRef: "ref",
      },
      rule: {
        id: "r1", kind: "local", bindHost: "127.0.0.1", bindPort: 70_000,
        targetHost: "target", targetPort: 80,
      },
    }, context)).resolves.toMatchObject({ ok: false, error: { code: "IPC_INVALID_INPUT" } });
    expect(runtime.start).not.toHaveBeenCalled();
  });
});
