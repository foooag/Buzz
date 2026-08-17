import { describe, expect, it, vi } from "vitest";
import { createQuickScriptsCommandHandlers } from "../../../../src/main/domains/quickscripts/commands";
import type { QuickScriptsService } from "../../../../src/main/domains/quickscripts/service";
import type { CommandContext } from "../../../../src/main/ipc/dispatcher";

const context: CommandContext = { ownerId: "test-owner", fallback: vi.fn() };

function fakeService(): Record<keyof QuickScriptsService, ReturnType<typeof vi.fn>> {
  return {
    generate: vi.fn(async () => ({ hostId: "host-1", createdCount: 2, mode: "llm", durationMs: 5, droppedCount: 0 })),
    list: vi.fn(async () => []),
    update: vi.fn(async () => ({ id: "qs-1" })),
    delete: vi.fn(async () => undefined),
    deleteForHost: vi.fn(async () => undefined),
    clearAll: vi.fn(async () => undefined),
  } as never;
}

describe("Electron quickscripts command handlers", () => {
  it("routes every quickscript IPC command to the service", async () => {
    const service = fakeService();
    const broadcast = vi.fn();
    const handlers = createQuickScriptsCommandHandlers(service as never, broadcast);
    const cases = [
      ["quickscript_generate", { sshSessionId: "ssh-1" }, "generate"],
      ["quickscript_list", { hostId: "host-1" }, "list"],
      ["quickscript_update", { id: "qs-1", patch: { status: "pinned" } }, "update"],
      ["quickscript_delete", { id: "qs-1" }, "delete"],
      ["quickscript_clear_data", {}, "clearAll"],
      ["quickscript_clear_data", { hostId: "host-1" }, "deleteForHost"],
    ] as const;
    for (const [name, input, method] of cases) {
      const handler = handlers[name];
      expect(handler, `${name} should be handled by Electron`).toBeTypeOf("function");
      await expect(Promise.resolve(handler?.(input, context))).resolves.toEqual({ ok: true, data: expect.anything() });
      expect(service[method]).toHaveBeenCalled();
    }
    expect(broadcast).toHaveBeenCalledWith({ hostId: "host-1", sshSessionId: "ssh-1", createdCount: 2, mode: "llm" });
  });

  it("does not broadcast for empty generations", async () => {
    const service = fakeService();
    service.generate.mockResolvedValueOnce({ hostId: "host-1", createdCount: 0, mode: "empty", durationMs: 1, droppedCount: 0 });
    const broadcast = vi.fn();
    const handlers = createQuickScriptsCommandHandlers(service as never, broadcast);
    await handlers["quickscript_generate"]?.({ sshSessionId: "ssh-1" }, context);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("rejects malformed input before calling the service", async () => {
    const service = fakeService();
    const handlers = createQuickScriptsCommandHandlers(service as never);
    const result = await handlers["quickscript_generate"]?.({ sshSessionId: "" }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "IPC_INVALID_INPUT" } });
    expect(service.generate).not.toHaveBeenCalled();
  });
});
