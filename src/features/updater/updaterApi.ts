import { checkForUpdate, relaunchApp } from "../../app/ipc";
import type { AvailableUpdate, UpdateDownloadEvent } from "../../app/ipc";

export type { AvailableUpdate, UpdateDownloadEvent };

export type UpdaterApi = {
  check: () => Promise<AvailableUpdate | null>;
  relaunch: () => Promise<void>;
};

export const updaterApi: UpdaterApi = {
  check: () => checkForUpdate(),
  relaunch: () => relaunchApp(),
};
