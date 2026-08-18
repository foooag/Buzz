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

      pending = options.cleanup().finally(() => {
        nativeQuitAllowed = true;
        if (requestedMode !== "install-update") {
          options.quit();
          return;
        }
        return Promise.resolve(options.installUpdate()).catch((error) => {
          // The installer never took over. Restore the pre-shutdown state so a
          // later plain quit is not blocked by this rejected promise and does
          // not re-run the install.
          nativeQuitAllowed = false;
          requestedMode = "quit";
          pending = undefined;
          throw error;
        });
      });
      return pending;
    },
  };
}
