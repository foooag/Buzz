import type { AvailableUpdate, UpdaterApi } from "./updaterApi";

// In-memory stub mirroring UpdaterApi. Tests configure the pending update and
// observe relaunch/download calls without touching the Electron updater.
export function createDeterministicUpdaterApi(options: {
  update?: AvailableUpdate | null;
} = {}) {
  const calls = { relaunch: 0, downloadAndInstall: 0 };
  const update: AvailableUpdate | null =
    options.update === undefined
      ? null
      : options.update === null
        ? null
        : {
            ...options.update,
            downloadAndInstall: async (onEvent) => {
              calls.downloadAndInstall += 1;
              await options.update?.downloadAndInstall(onEvent);
            },
          };

  const api: UpdaterApi = {
    check: () => Promise.resolve(update),
    relaunch: () => {
      calls.relaunch += 1;
      return Promise.resolve();
    },
  };

  return { api, calls };
}
