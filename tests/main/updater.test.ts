import { describe, expect, it, vi } from "vitest";
import {
  BackgroundUpdateController,
  getAvailableUpdateMetadata,
} from "../../src/main/updater";

describe("desktop updater", () => {
  it("does not expose metadata when electron-updater reports no update", () => {
    expect(
      getAvailableUpdateMetadata({
        isUpdateAvailable: false,
        updateInfo: {
          version: "0.0.1-beta.6",
          releaseDate: "2026-08-15T00:00:00.000Z",
          releaseNotes: "Already installed.",
        },
      }),
    ).toBeNull();
  });

  it("returns available metadata and combines changelog entries", () => {
    expect(
      getAvailableUpdateMetadata({
        isUpdateAvailable: true,
        updateInfo: {
          version: "0.0.1-beta.7",
          releaseNotes: [
            { note: "<h2>What's Changed</h2>" },
            { note: "<ul><li>Updater fix</li></ul>" },
          ],
        },
      }),
    ).toEqual({
      version: "0.0.1-beta.7",
      body: "<h2>What's Changed</h2>\n\n<ul><li>Updater fix</li></ul>",
    });
  });

  it("downloads an available update in the background and reports progress", async () => {
    let progressListener: ((progress: { percent?: number }) => void) | undefined;
    let finishDownload: (() => void) | undefined;
    const download = new Promise<void>((resolve) => {
      finishDownload = resolve;
    });
    const updater = {
      checkForUpdates: vi.fn(async () => ({
        isUpdateAvailable: true,
        updateInfo: { version: "0.2.0" },
      })),
      downloadUpdate: vi.fn(() => download),
      on: vi.fn((_event, listener) => {
        progressListener = listener;
      }),
      off: vi.fn(),
    };
    const states: unknown[] = [];
    const controller = new BackgroundUpdateController(updater, (state) => states.push(state));

    await expect(controller.check()).resolves.toMatchObject({ version: "0.2.0" });
    expect(controller.getState()).toEqual({
      phase: "downloading",
      version: "0.2.0",
      percent: 0,
    });

    progressListener?.({ percent: 47.6 });
    expect(controller.getState()).toEqual({
      phase: "downloading",
      version: "0.2.0",
      percent: 48,
    });

    finishDownload?.();
    await vi.waitFor(() => {
      expect(controller.getState()).toEqual({ phase: "ready", version: "0.2.0" });
    });
    expect(states).toContainEqual({ phase: "ready", version: "0.2.0" });

    await controller.check();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
  });

  it("exposes a retryable state when the background download fails", async () => {
    const updater = {
      checkForUpdates: vi.fn(async () => ({
        isUpdateAvailable: true,
        updateInfo: { version: "0.2.0" },
      })),
      downloadUpdate: vi.fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce([]),
      on: vi.fn(),
      off: vi.fn(),
    };
    const controller = new BackgroundUpdateController(updater, () => undefined);

    await controller.check();
    await vi.waitFor(() => {
      expect(controller.getState()).toEqual({ phase: "error", version: "0.2.0" });
    });
    await controller.retry();

    expect(updater.downloadUpdate).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toEqual({ phase: "ready", version: "0.2.0" });
  });
});
