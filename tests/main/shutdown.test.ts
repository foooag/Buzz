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
});
