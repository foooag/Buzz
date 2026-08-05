const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("terminus", {
  invoke: (command, input) => ipcRenderer.invoke("terminus:invoke", command, input),
  stream: async (command, input, onEvent) => {
    const streamId = crypto.randomUUID();
    const listener = (_event, receivedStreamId, payload) => {
      if (receivedStreamId === streamId) onEvent(payload);
    };
    ipcRenderer.on("terminus:desktop-event", listener);
    try {
      return await ipcRenderer.invoke("terminus:stream", command, input, streamId);
    } catch (error) {
      ipcRenderer.removeListener("terminus:desktop-event", listener);
      throw error;
    }
  },
  finiteStream: async (command, input, onEvent) => {
    const streamId = crypto.randomUUID();
    const listener = (_event, receivedStreamId, payload) => {
      if (receivedStreamId === streamId) onEvent(payload);
    };
    ipcRenderer.on("terminus:desktop-event", listener);
    try {
      return await ipcRenderer.invoke("terminus:finite-stream", command, input, streamId);
    } finally {
      ipcRenderer.removeListener("terminus:desktop-event", listener);
    }
  },
  window: {
    minimize: () => ipcRenderer.invoke("terminus:window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("terminus:window:toggle-maximize"),
  },
  updater: {
    check: () => ipcRenderer.invoke("terminus:update:check"),
    close: () => ipcRenderer.invoke("terminus:update:close"),
    downloadAndInstall: async (onEvent) => {
      const listener = (_event, payload) => onEvent(payload);
      ipcRenderer.on("terminus:update:event", listener);
      try {
        await ipcRenderer.invoke("terminus:update:download");
      } finally {
        ipcRenderer.removeListener("terminus:update:event", listener);
      }
    },
    relaunch: () => ipcRenderer.invoke("terminus:update:relaunch"),
  },
});
