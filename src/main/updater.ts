export type AvailableUpdateMetadata = {
  version: string;
  date?: string;
  body?: string;
};

export type BackgroundUpdateState =
  | { phase: "idle" }
  | { phase: "downloading"; version: string; percent?: number }
  | { phase: "ready"; version: string }
  | { phase: "error"; version?: string };

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

export class BackgroundUpdateController {
  private state: BackgroundUpdateState = { phase: "idle" };
  private availableUpdate: AvailableUpdateMetadata | undefined;
  private checkPromise: Promise<AvailableUpdateMetadata | null> | undefined;
  private downloadPromise: Promise<void> | undefined;

  constructor(
    private readonly updater: AutoUpdaterLike,
    private readonly emit: (state: BackgroundUpdateState) => void,
  ) {}

  getState(): BackgroundUpdateState {
    return this.state;
  }

  check(): Promise<AvailableUpdateMetadata | null> {
    if (
      this.availableUpdate &&
      (this.state.phase === "downloading" || this.state.phase === "ready")
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
    return this.startDownload(this.state.version);
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
    void this.startDownload(metadata.version);
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
