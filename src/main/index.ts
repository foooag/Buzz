import { app, BrowserWindow, ipcMain, type WebContents } from "electron";
import path from "node:path";
import type { CommandName } from "./command-names.js";
import type { CommandDispatcher as ElectronCommandDispatcher } from "./ipc/dispatcher.js";
import type { InventoryRepository } from "./domains/inventory/repository.js";
import type { TerminalRuntime as ElectronTerminalRuntime } from "./domains/terminal/runtime.js";
import type { SshRuntime as ElectronSshRuntime } from "./domains/ssh/runtime.js";
import type { SshPersistence } from "./domains/ssh/service.js";
import type { PortForwardingRuntime as ElectronPortForwardingRuntime } from "./domains/forwarding/runtime.js";
import type { ForwardingRepository } from "./domains/forwarding/repository.js";
import type { SftpRuntime as ElectronSftpRuntime } from "./domains/sftp/runtime.js";
import type { SftpAssociations } from "./domains/sftp/associations.js";
import type { AiService } from "./domains/ai/service.js";
import type { MultiHostAgentRuntime } from "./domains/agent/agent-runtime.js";
import type { SshHeadlessRuntime } from "./domains/ssh/headless.js";

const streamOwners = new Map<string, WebContents>();
let commandDispatcher: ElectronCommandDispatcher | undefined;
let inventoryRepository: InventoryRepository | undefined;
let terminalRuntime: ElectronTerminalRuntime | undefined;
let sshRuntime: ElectronSshRuntime | undefined;
let sshPersistence: SshPersistence | undefined;
let portForwardingRuntime: ElectronPortForwardingRuntime | undefined;
let forwardingRepository: ForwardingRepository | undefined;
let sftpRuntime: ElectronSftpRuntime | undefined;
let sftpAssociations: SftpAssociations | undefined;
let aiService: AiService | undefined;
let headlessRuntime: SshHeadlessRuntime | undefined;
let agentRuntime: MultiHostAgentRuntime | undefined;
let mainWindow: BrowserWindow | undefined;
let allowQuit = false;
let shutdownStarted = false;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: "Buzz",
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, "..", "preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const ownerId = String(window.webContents.id);
  window.webContents.once("destroyed", () => {
    void aiService?.agents.closeOwner(ownerId);
    void agentRuntime?.closeOwner(ownerId);
  });
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = app.isPackaged
      ? url.startsWith("file:")
      : url.startsWith("http://127.0.0.1:1420");
    if (!allowed) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  if (app.isPackaged) void window.loadFile(path.join(import.meta.dirname, "..", "renderer", "index.html"));
  else void window.loadURL("http://127.0.0.1:1420");
  return window;
}

function installIpcHandlers(): void {
  ipcMain.handle("terminus:invoke", async (event, command: unknown, input: unknown) => {
    if (typeof command !== "string" || !(await isAllowedCommand(command))) {
      throw new Error("Desktop command is not allowed.");
    }
    return commandDispatcher?.invoke(command as CommandName, input, undefined, String(event.sender.id));
  });
  ipcMain.handle(
    "terminus:stream",
    async (event, command: unknown, input: unknown, streamId: unknown) => {
      if (
        typeof command !== "string" ||
        !(await isAllowedCommand(command)) ||
        typeof streamId !== "string" ||
        streamId.length > 128
      ) {
        throw new Error("Desktop stream is not allowed.");
      }
      streamOwners.set(streamId, event.sender);
      event.sender.once("destroyed", () => streamOwners.delete(streamId));
      return commandDispatcher?.invoke(
        command as CommandName,
        input,
        streamId,
        String(event.sender.id),
      );
    },
  );
  ipcMain.handle(
    "terminus:finite-stream",
    async (event, command: unknown, input: unknown, streamId: unknown) => {
      if (
        typeof command !== "string" ||
        !(await isAllowedCommand(command)) ||
        typeof streamId !== "string" ||
        streamId.length > 128
      ) {
        throw new Error("Desktop finite stream is not allowed.");
      }
      streamOwners.set(streamId, event.sender);
      try {
        return await commandDispatcher?.invoke(
          command as CommandName,
          input,
          streamId,
          String(event.sender.id),
        );
      } finally {
        streamOwners.delete(streamId);
      }
    },
  );
  ipcMain.handle("terminus:window:minimize", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize(),
  );
  ipcMain.handle("terminus:window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window?.isMaximized()) window.unmaximize();
    else window?.maximize();
  });
  ipcMain.handle("terminus:update:check", async () => {
    if (!app.isPackaged) return null;
    const autoUpdater = await getAutoUpdater();
    const result = await autoUpdater.checkForUpdates();
    if (!result) return null;
    return {
      version: result.updateInfo.version,
      date: result.updateInfo.releaseDate,
      body: typeof result.updateInfo.releaseNotes === "string"
        ? result.updateInfo.releaseNotes
        : undefined,
    };
  });
  ipcMain.handle("terminus:update:close", async () => undefined);
  ipcMain.handle("terminus:update:download", async (event) => {
    const autoUpdater = await getAutoUpdater();
    const send = (payload: unknown) => event.sender.send("terminus:update:event", payload);
    const progress = (info: { delta: number; total: number }) =>
      send({ event: "Progress", data: { chunkLength: info.delta } });
    autoUpdater.on("download-progress", progress);
    send({ event: "Started", data: {} });
    try {
      await autoUpdater.downloadUpdate();
      send({ event: "Finished" });
    } finally {
      autoUpdater.off("download-progress", progress);
    }
  });
  ipcMain.handle("terminus:update:relaunch", async () => {
    const autoUpdater = await getAutoUpdater();
    autoUpdater.quitAndInstall(false, true);
  });
}

async function isAllowedCommand(value: unknown): Promise<boolean> {
  const commands = await import("./command-names.js");
  return commands.isCommandName(value);
}

async function getAutoUpdater() {
  const electronUpdater = await import("electron-updater");
  return electronUpdater.default.autoUpdater;
}

const configuredTestData = !app.isPackaged ? process.env.TERMINUS_E2E_DATA_DIR : undefined;

function emitStreamEvent(streamId: string | undefined, event: unknown): void {
  if (!streamId) return;
  const owner = streamOwners.get(streamId);
  if (owner && !owner.isDestroyed()) owner.send("terminus:desktop-event", streamId, event);
}

async function start(): Promise<void> {
  await app.whenReady();
  const [
    { createAppCommandHandlers },
    { createInventoryCommandHandlers },
    { openE2eInventoryService, openInventoryService },
    { createTerminalCommandHandlers },
    { TerminalRuntime },
    { createSshCommandHandlers },
    { SshRuntime },
    { openSshPersistence },
    { createForwardingCommandHandlers },
    { PortForwardingRuntime },
    { ForwardingRepository },
    { createSftpCommandHandlers },
    { SftpRuntime },
    { SftpAssociations },
    { createAiCommandHandlers },
    { openAiService },
    { createAgentCommandHandlers },
    { MultiHostAgentRuntime },
    { SshHeadlessRuntime },
    { createAgentHostResolver },
    { CommandDispatcher },
  ] = await Promise.all([
    import("./domains/app.js"),
    import("./domains/inventory/commands.js"),
    import("./domains/inventory/service.js"),
    import("./domains/terminal/commands.js"),
    import("./domains/terminal/runtime.js"),
    import("./domains/ssh/commands.js"),
    import("./domains/ssh/runtime.js"),
    import("./domains/ssh/service.js"),
    import("./domains/forwarding/commands.js"),
    import("./domains/forwarding/runtime.js"),
    import("./domains/forwarding/repository.js"),
    import("./domains/sftp/commands.js"),
    import("./domains/sftp/runtime.js"),
    import("./domains/sftp/associations.js"),
    import("./domains/ai/commands.js"),
    import("./domains/ai/service.js"),
    import("./domains/agent/commands.js"),
    import("./domains/agent/agent-runtime.js"),
    import("./domains/ssh/headless.js"),
    import("./domains/agent/host-resolution.js"),
    import("./ipc/dispatcher.js"),
  ]);
  const dataDirectory = configuredTestData ?? app.getPath("userData");
  const isolatedE2e = Boolean(
    configuredTestData && process.env.TERMINUS_ISOLATED_E2E,
  );
  inventoryRepository = isolatedE2e
    ? openE2eInventoryService(dataDirectory)
    : await openInventoryService(dataDirectory);
  sshPersistence = await openSshPersistence(dataDirectory, isolatedE2e);
  sshRuntime = new SshRuntime(
    sshPersistence.credentials,
    sshPersistence.knownHosts,
    emitStreamEvent,
  );
  portForwardingRuntime = new PortForwardingRuntime(sshRuntime);
  forwardingRepository = ForwardingRepository.open(path.join(
    dataDirectory,
    isolatedE2e ? "forwarding.e2e.sqlite3" : "forwarding.sqlite3",
  ));
  sftpRuntime = new SftpRuntime(
    sshRuntime,
    emitStreamEvent,
    path.join(dataDirectory, isolatedE2e ? "sftp-open-e2e" : "sftp-open"),
  );
  sftpAssociations = SftpAssociations.open(path.join(
    dataDirectory,
    isolatedE2e ? "sftp.e2e.sqlite3" : "sftp.sqlite3",
  ));
  terminalRuntime = new TerminalRuntime(emitStreamEvent);
  aiService = await openAiService(dataDirectory, isolatedE2e, sshRuntime);
  headlessRuntime = new SshHeadlessRuntime(sshRuntime);
  agentRuntime = new MultiHostAgentRuntime(
    aiService.models,
    aiService.history,
    aiService.risk,
    headlessRuntime,
    createAgentHostResolver(inventoryRepository, sshPersistence.credentials),
  );
  commandDispatcher = new CommandDispatcher(
    {
      ...createAppCommandHandlers(app.getVersion()),
      ...createInventoryCommandHandlers(inventoryRepository),
      ...createTerminalCommandHandlers(terminalRuntime, sshRuntime),
      ...createSshCommandHandlers(sshRuntime, sshPersistence.knownHosts),
      ...createForwardingCommandHandlers(portForwardingRuntime, forwardingRepository),
      ...createSftpCommandHandlers(sftpRuntime, sftpAssociations),
      ...createAiCommandHandlers(aiService, emitStreamEvent),
      ...createAgentCommandHandlers(agentRuntime, emitStreamEvent),
    },
    async () => ({
      ok: false,
      error: {
        code: "IPC_COMMAND_UNAVAILABLE",
        message: "The desktop command is unavailable.",
      },
    }),
  );
  installIpcHandlers();
  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (event) => {
    if (allowQuit) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    void (async () => {
      await aiService?.close();
      aiService = undefined;
      await agentRuntime?.closeAll();
      agentRuntime = undefined;
      await headlessRuntime?.closeAll();
      headlessRuntime = undefined;
      terminalRuntime?.closeAll();
      terminalRuntime = undefined;
      portForwardingRuntime?.closeAll();
      portForwardingRuntime = undefined;
      await sftpRuntime?.closeAll();
      sftpRuntime = undefined;
      sftpAssociations?.close();
      sftpAssociations = undefined;
      await sshRuntime?.closeAll();
      sshRuntime = undefined;
      forwardingRepository?.close();
      forwardingRepository = undefined;
      sshPersistence?.close();
      sshPersistence = undefined;
      inventoryRepository?.close();
      inventoryRepository = undefined;
    })().finally(() => {
      allowQuit = true;
      app.quit();
    });
  });
}

void start();
