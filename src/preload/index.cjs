const { contextBridge, ipcRenderer } = require("electron");
const AGENT_STREAM_CHANNEL = "agent:stream";

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
  streamAgent: (request, onEvent, onClose) => {
    const channel = new MessageChannel();
    const listener = (event) => onEvent(event.data);
    const closeListener = () => onClose?.();
    channel.port1.addEventListener("message", listener);
    channel.port1.addEventListener("close", closeListener);
    channel.port1.start();
    ipcRenderer.postMessage(AGENT_STREAM_CHANNEL, request, [channel.port2]);
    return () => {
      channel.port1.removeEventListener("message", listener);
      channel.port1.removeEventListener("close", closeListener);
      channel.port1.close();
    };
  },
  onQuickScriptGenerated: (onEvent) => {
    const listener = (_event, payload) => onEvent(payload);
    ipcRenderer.on("terminus:quickscript-generated", listener);
    return () => ipcRenderer.removeListener("terminus:quickscript-generated", listener);
  },
  window: {
    minimize: () => ipcRenderer.invoke("terminus:window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("terminus:window:toggle-maximize"),
  },
  updater: {
    check: () => ipcRenderer.invoke("terminus:update:check"),
    status: () => ipcRenderer.invoke("terminus:update:status"),
    onStatusChange: (onStatusChange) => {
      const listener = (_event, status) => onStatusChange(status);
      ipcRenderer.on("terminus:update:status-changed", listener);
      return () => ipcRenderer.removeListener("terminus:update:status-changed", listener);
    },
    retry: () => ipcRenderer.invoke("terminus:update:retry"),
    relaunch: () => ipcRenderer.invoke("terminus:update:relaunch"),
  },
});
