import { spawnSync } from "node:child_process";

export type AvailableUpdateMetadata = {
  version: string;
  date?: string;
  body?: string;
};

export type BackgroundUpdateState =
  | { phase: "idle" }
  | { phase: "downloading"; version: string; percent?: number }
  | { phase: "ready"; version: string }
  | { phase: "manual-downloading"; version: string; percent?: number }
  | { phase: "manual-ready"; version: string }
  | { phase: "error"; version?: string };

// macOS builds without a valid code signature (unsigned or ad-hoc) cannot be
// auto-updated by Squirrel.Mac, so those installs fall back to downloading the
// release DMG and asking the user to drag it into /Applications manually.
export type ManualInstaller = {
  download: (
    installerUrls: readonly string[],
    onProgress: (percent: number | undefined) => void,
  ) => Promise<void>;
  open: () => Promise<void>;
};

export type MacCodeSignatureStatus = "signed" | "adhoc" | "unsigned";

export function parseMacCodeSignature(
  exitCode: number | null,
  output: string,
): MacCodeSignatureStatus {
  if (exitCode !== 0) return "unsigned";
  return /Signature=adhoc\b/i.test(output) ? "adhoc" : "signed";
}

export function detectMacCodeSignature(appPath: string): MacCodeSignatureStatus {
  try {
    const result = spawnSync(
      "codesign",
      ["-dv", "--verbose=2", appPath],
      { encoding: "utf8" },
    );
    return parseMacCodeSignature(
      result.status,
      `${result.stderr ?? ""}${result.stdout ?? ""}`,
    );
  } catch {
    return "unsigned";
  }
}

type DownloadProgress = {
  percent?: number;
  transferred?: number;
  total?: number;
};

type AutoUpdaterLike = {
  checkForUpdates: () => Promise<UpdateCheckResult | null>;
  downloadUpdate: () => Promise<unknown>;
  on: (
    event: "download-progress",
    listener: (progress: DownloadProgress) => void,
  ) => unknown;
  off: (
    event: "download-progress",
    listener: (progress: DownloadProgress) => void,
  ) => unknown;
};

type InstallOnQuitUpdater = {
  quitAndInstall: (isSilent: boolean, isForceRunAfter: boolean) => void;
  on: (event: "error", listener: (error: Error) => void) => unknown;
  removeListener: (event: "error", listener: (error: Error) => void) => unknown;
};

// How long the installer may take to quit the app after quitAndInstall before
// we report failure back to the renderer. In the happy path the process exits
// before this fires, so the timeout only surfaces for stuck installs.
const INSTALL_TAKEOVER_TIMEOUT_MS = 15_000;

// quitAndInstall hands control to the platform installer, which quits the app
// asynchronously. On macOS it silently does nothing when the native Squirrel
// fetch fails (e.g. an unsigned build cannot be auto-updated), so the returned
// promise rejects on updater errors or a takeover timeout instead of leaving
// the renderer waiting forever for a restart that never happens.
export function quitAndInstallOrThrow(
  updater: InstallOnQuitUpdater,
  timeoutMs: number = INSTALL_TAKEOVER_TIMEOUT_MS,
): Promise<void> {
  return new Promise<void>((_resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onError = (error: unknown) => {
      if (timer !== undefined) clearTimeout(timer);
      updater.removeListener("error", onError);
      reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    };
    timer = setTimeout(() => {
      onError(
        new Error(
          `The update installer did not restart the app within ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);
    // Listen before quitting: the Windows installer path can dispatch its
    // error synchronously from inside quitAndInstall.
    updater.on("error", onError);
    updater.quitAndInstall(false, true);
  });
}

export class BackgroundUpdateController {
  private state: BackgroundUpdateState = { phase: "idle" };
  private availableUpdate: AvailableUpdateMetadata | undefined;
  private installerUrls: readonly string[] = [];
  private checkPromise: Promise<AvailableUpdateMetadata | null> | undefined;
  private downloadPromise: Promise<void> | undefined;

  constructor(
    private readonly updater: AutoUpdaterLike,
    private readonly emit: (state: BackgroundUpdateState) => void,
    private readonly manual?: ManualInstaller,
  ) {}

  getState(): BackgroundUpdateState {
    return this.state;
  }

  check(): Promise<AvailableUpdateMetadata | null> {
    if (
      this.availableUpdate &&
      (this.state.phase === "downloading" ||
        this.state.phase === "ready" ||
        this.state.phase === "manual-downloading" ||
        this.state.phase === "manual-ready")
    ) {
      return Promise.resolve(this.availableUpdate);
    }
    if (this.checkPromise) return this.checkPromise;
    this.checkPromise = this.checkAndDownload().finally(() => {
      this.checkPromise = undefined;
    });
    return this.checkPromise;
  }

  retry(): Promise<void> {
    if (this.state.phase !== "error" || !this.state.version) {
      return this.check().then(() => undefined);
    }
    return this.manual
      ? this.startManualDownload(this.state.version)
      : this.startDownload(this.state.version);
  }

  async openInstaller(): Promise<void> {
    if (this.state.phase !== "manual-ready" || !this.manual) {
      throw new Error("The manual installer is not ready to open.");
    }
    await this.manual.open();
  }

  private async checkAndDownload(): Promise<AvailableUpdateMetadata | null> {
    const result = await this.updater.checkForUpdates();
    const metadata = getAvailableUpdateMetadata(result);
    if (!metadata) {
      this.availableUpdate = undefined;
      this.setState({ phase: "idle" });
      return null;
    }
    this.availableUpdate = metadata;
    this.installerUrls = getManualInstallerUrls(result);
    if (this.manual) {
      void this.startManualDownload(metadata.version);
    } else {
      void this.startDownload(metadata.version);
    }
    return metadata;
  }

  private startDownload(version: string): Promise<void> {
    if (this.downloadPromise) return this.downloadPromise;
    this.setState({ phase: "downloading", version, percent: 0 });

    const onProgress = (progress: DownloadProgress) => {
      const calculated = progress.percent ?? (
        progress.total && progress.transferred !== undefined
          ? (progress.transferred / progress.total) * 100
          : undefined
      );
      this.setState({
        phase: "downloading",
        version,
        ...(calculated === undefined
          ? {}
          : { percent: Math.max(0, Math.min(100, Math.round(calculated))) }),
      });
    };

    this.updater.on("download-progress", onProgress);
    this.downloadPromise = this.updater.downloadUpdate()
      .then(() => this.setState({ phase: "ready", version }))
      .catch(() => this.setState({ phase: "error", version }))
      .finally(() => {
        this.updater.off("download-progress", onProgress);
        this.downloadPromise = undefined;
      });
    return this.downloadPromise;
  }

  private startManualDownload(version: string): Promise<void> {
    if (!this.manual) {
      return Promise.reject(new Error("No manual installer configured."));
    }
    if (this.downloadPromise) return this.downloadPromise;
    this.setState({ phase: "manual-downloading", version, percent: 0 });

    let lastPercent = 0;
    this.downloadPromise = this.manual.download(
      this.installerUrls,
      (percent) => {
        if (percent === undefined) return;
        const rounded = Math.max(0, Math.min(100, Math.round(percent)));
        if (rounded === lastPercent) return;
        lastPercent = rounded;
        this.setState({ phase: "manual-downloading", version, percent: rounded });
      },
    )
      .then(() => this.setState({ phase: "manual-ready", version }))
      .catch(() => this.setState({ phase: "error", version }))
      .finally(() => {
        this.downloadPromise = undefined;
      });
    return this.downloadPromise;
  }

  private setState(state: BackgroundUpdateState): void {
    this.state = state;
    this.emit(state);
  }
}

type ReleaseNote = {
  note?: string | null;
};

type UpdateCheckResult = {
  isUpdateAvailable: boolean;
  updateInfo: {
    version: string;
    releaseDate?: string;
    releaseNotes?: string | readonly ReleaseNote[] | null;
    files?: readonly { url?: unknown }[] | null;
  };
};

export function getAvailableUpdateMetadata(
  result: UpdateCheckResult | null,
): AvailableUpdateMetadata | null {
  if (!result?.isUpdateAvailable) return null;

  const body = formatReleaseNotes(result.updateInfo.releaseNotes);
  return {
    version: result.updateInfo.version,
    date: result.updateInfo.releaseDate,
    ...(body ? { body } : {}),
  };
}

// Derives release DMG candidates from the auto-update zip URL. electron-updater
// only publishes the zip in latest-mac.yml, so the DMG is assumed to sit next
// to it under the same name (with an arch-less fallback for universal builds).
export function getManualInstallerUrls(
  result: UpdateCheckResult | null,
): string[] {
  const zipUrl = (result?.updateInfo.files ?? [])
    .map((file) => String(file.url ?? ""))
    .find((url) => url.toLowerCase().endsWith(".zip"));
  if (!zipUrl) return [];

  const dmgUrl = `${zipUrl.slice(0, -".zip".length)}.dmg`;
  const universalUrl = dmgUrl.replace(
    /-(arm64|x64|universal)(?=\.dmg$)/i,
    "",
  );
  return universalUrl === dmgUrl ? [dmgUrl] : [dmgUrl, universalUrl];
}

function formatReleaseNotes(
  releaseNotes: UpdateCheckResult["updateInfo"]["releaseNotes"],
): string | undefined {
  if (typeof releaseNotes === "string") {
    return releaseNotes.trim() || undefined;
  }
  if (!releaseNotes) return undefined;

  const notes = releaseNotes
    .map((release) => release.note?.trim())
    .filter((note): note is string => Boolean(note));
  return notes.length > 0 ? notes.join("\n\n") : undefined;
}
