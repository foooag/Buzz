import { describe, expect, it, vi } from "vitest";
import { createShutdownCoordinator } from "../../src/main/shutdown";

describe("shutdown coordinator", () => {
  it("cleans up before handing control to the update installer", async () => {
    const calls: string[] = [];
    const coordinator = createShutdownCoordinator({
      cleanup: async () => {
        calls.push("cleanup");
      },
      quit: () => {
        calls.push("quit");
      },
      installUpdate: () => {
        calls.push("install");
      },
    });

    expect(coordinator.shouldPreventNativeQuit()).toBe(true);
    await coordinator.request("install-update");

    expect(calls).toEqual(["cleanup", "install"]);
    expect(coordinator.shouldPreventNativeQuit()).toBe(false);
  });

  it("upgrades an in-flight normal quit to an install restart", async () => {
    let finishCleanup: (() => void) | undefined;
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const quit = vi.fn();
    const installUpdate = vi.fn();
    const coordinator = createShutdownCoordinator({
      cleanup: () => cleanup,
      quit,
      installUpdate,
    });

    const pending = coordinator.request("quit");
    void coordinator.request("install-update");
    finishCleanup?.();
    await pending;

    expect(installUpdate).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
  });

  it("recovers with a plain quit after the installer fails to take over", async () => {
    const calls: string[] = [];
    const coordinator = createShutdownCoordinator({
      cleanup: async () => {
        calls.push("cleanup");
      },
      quit: () => {
        calls.push("quit");
      },
      installUpdate: async () => {
        throw new Error("installer did not take over");
      },
    });

    await expect(coordinator.request("install-update")).rejects.toThrow(
      "installer did not take over",
    );

    // The app stayed open, so native quit prevention must be restored.
    expect(coordinator.shouldPreventNativeQuit()).toBe(true);

    await coordinator.request("quit");
    // Cleanup runs again (it is idempotent) before the plain quit takes over.
    expect(calls).toEqual(["cleanup", "cleanup", "quit"]);
  });
});
