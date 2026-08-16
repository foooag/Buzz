import type { AvailableUpdate, UpdateStatus, UpdaterApi } from "./updaterApi";

// In-memory stub mirroring UpdaterApi. Tests configure the pending update and
// observe relaunch/download calls without touching the Electron updater.
export function createDeterministicUpdaterApi(options: {
  update?: AvailableUpdate | null;
  status?: UpdateStatus;
} = {}) {
  const calls = { relaunch: 0, retry: 0 };
  const update = options.update ?? null;
  let status: UpdateStatus = options.status ?? { phase: "idle" };
  const subscribers = new Set<(next: UpdateStatus) => void>();

  const api: UpdaterApi = {
    check: () => Promise.resolve(update),
    getStatus: () => Promise.resolve(status),
    subscribe: (subscriber) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    retry: () => {
      calls.retry += 1;
      return Promise.resolve();
    },
    relaunch: () => {
      calls.relaunch += 1;
      return Promise.resolve();
    },
  };

  return {
    api,
    calls,
    setStatus(next: UpdateStatus) {
      status = next;
      subscribers.forEach((subscriber) => subscriber(next));
    },
  };
}
