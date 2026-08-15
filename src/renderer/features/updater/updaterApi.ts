import {
  checkForUpdate,
  getUpdateStatus,
  relaunchApp,
  retryUpdateDownload,
  subscribeUpdateStatus,
} from "../../app/ipc";
import type { AvailableUpdate, UpdateStatus } from "../../app/ipc";

export type { AvailableUpdate, UpdateStatus };

export type UpdaterApi = {
  check: () => Promise<AvailableUpdate | null>;
  getStatus: () => Promise<UpdateStatus>;
  subscribe: (onStatusChange: (status: UpdateStatus) => void) => () => void;
  retry: () => Promise<void>;
  relaunch: () => Promise<void>;
};

export const updaterApi: UpdaterApi = {
  check: () => checkForUpdate(),
  getStatus: () => getUpdateStatus(),
  subscribe: (onStatusChange) => subscribeUpdateStatus(onStatusChange),
  retry: () => retryUpdateDownload(),
  relaunch: () => relaunchApp(),
};
