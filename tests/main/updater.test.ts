import { describe, expect, it, vi } from "vitest";
import {
  BackgroundUpdateController,
  getAvailableUpdateMetadata,
  getManualInstallerUrls,
  parseMacCodeSignature,
  quitAndInstallOrThrow,
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

  it("signals install failure when the updater errors while quitting", async () => {
    let errorListener: ((error: Error) => void) | undefined;
    const updater = {
      quitAndInstall: vi.fn(),
      on: vi.fn((_event: "error", listener: (error: Error) => void) => {
        errorListener = listener;
      }),
      removeListener: vi.fn(),
    };

    const pending = quitAndInstallOrThrow(updater, 60_000);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);

    errorListener?.(new Error("Code Signature Does Not Match"));
    await expect(pending).rejects.toThrow("Code Signature Does Not Match");
    expect(updater.removeListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
  });

  it("signals install failure when the installer never restarts the app", async () => {
    vi.useFakeTimers();
    try {
      const updater = {
        quitAndInstall: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
      };

      const pending = quitAndInstallOrThrow(updater, 15_000);
      vi.advanceTimersByTime(15_000);

      await expect(pending).rejects.toThrow(
        "did not restart the app within 15000ms",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps waiting while the installer takes over", async () => {
    const updater = {
      quitAndInstall: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    let settled = false;
    quitAndInstallOrThrow(updater, 60_000).catch(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("classifies macOS code signatures from codesign output", () => {
    expect(
      parseMacCodeSignature(0, "Identifier=dev.buzz.desktop\nSignature size=8964\n"),
    ).toBe("signed");
    expect(
      parseMacCodeSignature(0, "Identifier=dev.buzz.desktop\nSignature=adhoc\n"),
    ).toBe("adhoc");
    expect(
      parseMacCodeSignature(1, "code object is not signed at all"),
    ).toBe("unsigned");
  });

  it("derives DMG installer URLs from the release zip URL", () => {
    const zipUrl = new URL(
      "https://github.com/foooag/Buzz/releases/download/v0.2.0/Buzz-0.2.0-arm64.zip",
    );
    expect(
      getManualInstallerUrls({
        isUpdateAvailable: true,
        updateInfo: { version: "0.2.0", files: [{ url: zipUrl }] },
      }),
    ).toEqual([
      "https://github.com/foooag/Buzz/releases/download/v0.2.0/Buzz-0.2.0-arm64.dmg",
      "https://github.com/foooag/Buzz/releases/download/v0.2.0/Buzz-0.2.0.dmg",
    ]);
    expect(getManualInstallerUrls(null)).toEqual([]);
  });

  it("falls back to a manual DMG install on unsigned macOS builds", async () => {
    let reportProgress:
      | ((percent: number | undefined) => void)
      | undefined;
    let finishDownload: (() => void) | undefined;
    const download = new Promise<void>((resolve) => {
      finishDownload = resolve;
    });
    const manual = {
      download: vi.fn(
        (urls: readonly string[], onProgress: (p: number | undefined) => void) => {
          reportProgress = onProgress;
          expect(urls).toEqual([
            "https://github.com/foooag/Buzz/releases/download/v0.2.0/Buzz-0.2.0-arm64.dmg",
            "https://github.com/foooag/Buzz/releases/download/v0.2.0/Buzz-0.2.0.dmg",
          ]);
          return download;
        },
      ),
      open: vi.fn(async () => undefined),
    };
    const updater = {
      checkForUpdates: vi.fn(async () => ({
        isUpdateAvailable: true,
        updateInfo: {
          version: "0.2.0",
          files: [
            {
              url: new URL(
                "https://github.com/foooag/Buzz/releases/download/v0.2.0/Buzz-0.2.0-arm64.zip",
              ),
            },
          ],
        },
      })),
      downloadUpdate: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    const controller = new BackgroundUpdateController(
      updater,
      () => undefined,
      manual,
    );

    await expect(controller.check()).resolves.toMatchObject({ version: "0.2.0" });
    expect(controller.getState()).toEqual({
      phase: "manual-downloading",
      version: "0.2.0",
      percent: 0,
    });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();

    reportProgress?.(61.2);
    expect(controller.getState()).toEqual({
      phase: "manual-downloading",
      version: "0.2.0",
      percent: 61,
    });

    finishDownload?.();
    await vi.waitFor(() => {
      expect(controller.getState()).toEqual({
        phase: "manual-ready",
        version: "0.2.0",
      });
    });

    await controller.openInstaller();
    expect(manual.open).toHaveBeenCalledOnce();

    // A fresh check reuses the pending manual update instead of re-checking.
    await controller.check();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("retries the manual DMG download after a failure", async () => {
    const manual = {
      download: vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(undefined),
      open: vi.fn(async () => undefined),
    };
    const updater = {
      checkForUpdates: vi.fn(async () => ({
        isUpdateAvailable: true,
        updateInfo: { version: "0.2.0", files: [] },
      })),
      downloadUpdate: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    const controller = new BackgroundUpdateController(
      updater,
      () => undefined,
      manual,
    );

    await controller.check();
    await vi.waitFor(() => {
      expect(controller.getState()).toEqual({
        phase: "error",
        version: "0.2.0",
      });
    });

    await controller.retry();
    expect(manual.download).toHaveBeenCalledTimes(2);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      phase: "manual-ready",
      version: "0.2.0",
    });
  });
});
