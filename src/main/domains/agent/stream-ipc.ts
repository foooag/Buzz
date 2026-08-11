import { ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";
import { z } from "zod";
import {
  AGENT_STREAM_CHANNEL,
  type AgentStreamRequest,
} from "../../../shared/agent-stream.js";
import type { MultiHostAgentRuntime } from "./agent-runtime.js";

const requestSchema = z.object({
  agentId: z.string().trim().min(1).max(128),
  text: z.string().trim().min(1).max(100_000),
  targets: z.array(z.string().trim().min(1).max(256)).max(1_000),
  vaultId: z.string().trim().min(1).max(256).optional(),
});

export function registerAgentStreamIpc(
  mainWindow: BrowserWindow,
  runtime: MultiHostAgentRuntime,
): void {
  const handler = (event: IpcMainEvent, raw: unknown) => {
    const [port] = event.ports;
    if (!port) return;
    if (
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    ) {
      port.close();
      return;
    }
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      port.close();
      return;
    }
    const request: AgentStreamRequest = parsed.data;
    const ownerId = String(event.sender.id);
    let finished = false;
    port.start();
    port.once("close", () => {
      if (finished) return;
      try {
        runtime.abort(ownerId, request.agentId);
      } catch {
        // The Agent may already have completed or been closed.
      }
    });
    void runtime.prompt(
      ownerId,
      request.agentId,
      request.text,
      request.targets,
      (agentEvent) => port.postMessage(agentEvent),
    ).catch(() => undefined).finally(() => {
      finished = true;
      port.close();
    });
  };
  ipcMain.on(AGENT_STREAM_CHANNEL, handler);
  mainWindow.once("closed", () => {
    ipcMain.removeListener(AGENT_STREAM_CHANNEL, handler);
  });
}
