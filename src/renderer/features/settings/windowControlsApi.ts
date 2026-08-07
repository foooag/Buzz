import { minimizeWindow, toggleMaximizeWindow } from "../../app/ipc";

export type WindowControlsApi = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
};

export const windowControlsApi: WindowControlsApi = {
  minimize: minimizeWindow,
  toggleMaximize: toggleMaximizeWindow,
};
