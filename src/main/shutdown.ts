export type ShutdownMode = "quit" | "install-update";

export function createShutdownCoordinator(options: {
  cleanup: () => Promise<void>;
  quit: () => void;
  installUpdate: () => Promise<void> | void;
}) {
  let nativeQuitAllowed = false;
  let requestedMode: ShutdownMode = "quit";
  let pending: Promise<void> | undefined;

  return {
    shouldPreventNativeQuit: () => !nativeQuitAllowed,
    request(mode: ShutdownMode): Promise<void> {
      if (mode === "install-update") requestedMode = mode;
      if (pending) return pending;

      pending = options.cleanup().finally(async () => {
        nativeQuitAllowed = true;
        if (requestedMode === "install-update") {
          await options.installUpdate();
        } else {
          options.quit();
        }
      });
      return pending;
    },
  };
}
