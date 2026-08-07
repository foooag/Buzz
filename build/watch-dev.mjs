// Launches Electron and restarts it whenever out/main changes.
// Designed as the VSCode "Debug Main Process" runtime — VSCode's
// autoAttachChildProcesses re-attaches the debugger to every respawn.
//
// Renderer (src/renderer/**) is handled separately by Vite HMR. Only the
// Electron main process (bundled to out/main/) triggers a restart here.
// For interactive rebuild-on-save, prefer `pnpm dev` (electron-vite dev);
// this script is the auto-attach debug path: run `pnpm build` first, then it
// respawns Electron whenever out/main/*.mjs changes.

import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const distDir = path.join(projectRoot, "out", "main");
const electronCliPath = path.join(projectRoot, "node_modules/electron/cli.js");

if (!existsSync(electronCliPath)) {
  console.error(`[watch-dev] Electron CLI not found at ${electronCliPath}`);
  process.exit(1);
}
if (!existsSync(distDir)) {
  console.error(
    `[watch-dev] ${distDir} not found. Run "pnpm build" first.`,
  );
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
if (extraArgs.length === 0) extraArgs.push(".");

const RESTART_DEBOUNCE_MS = 200;
const SHUTDOWN_GRACE_MS = 3000;

let electronProc = null;
let shouldRespawn = false;
let debounceTimer = null;
let forceKillTimer = null;

function spawnElectron() {
  shouldRespawn = false;
  console.log("[watch-dev] Spawning electron...");
  electronProc = spawn(process.execPath, [electronCliPath, ...extraArgs], {
    stdio: "inherit",
    env: process.env,
  });

  electronProc.on("exit", (code, signal) => {
    const wasRespawn = shouldRespawn;
    electronProc = null;
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
      forceKillTimer = null;
    }
    if (wasRespawn) {
      setTimeout(spawnElectron, 100);
      return;
    }
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

function triggerRestart(reason) {
  console.log(`[watch-dev] ${reason} - restarting electron...`);
  if (!electronProc) {
    spawnElectron();
    return;
  }
  shouldRespawn = true;
  electronProc.kill("SIGTERM");
  forceKillTimer = setTimeout(() => {
    if (electronProc) {
      console.log("[watch-dev] Graceful shutdown timed out, sending SIGKILL...");
      electronProc.kill("SIGKILL");
    }
  }, SHUTDOWN_GRACE_MS);
}

// fs.watch recursive is supported on macOS and Windows. For Linux a
// chokidar-based watcher would be required.
const watcher = watch(
  distDir,
  { recursive: true },
  (_event, filename) => {
    if (!filename) return;
    if (!/\.(js|cjs|mjs)$/i.test(filename)) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(
      () => triggerRestart(`${filename} changed`),
      RESTART_DEBOUNCE_MS,
    );
  },
);

function shutdown() {
  watcher.close();
  if (electronProc) {
    electronProc.kill("SIGTERM");
    setTimeout(() => {
      if (electronProc) electronProc.kill("SIGKILL");
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => watcher.close());

console.log(
  `[watch-dev] Watching ${path.relative(projectRoot, distDir)} for changes...`,
);
spawnElectron();
