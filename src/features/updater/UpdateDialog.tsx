import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n";
import {
  updaterApi,
  type AvailableUpdate,
  type UpdaterApi,
} from "./updaterApi";

type InstallState =
  | { phase: "ready" }
  | { phase: "downloading"; downloaded: number; total?: number }
  | { phase: "restarting" }
  | { phase: "error" };

const updateChecks = new WeakMap<
  UpdaterApi,
  Promise<AvailableUpdate | null>
>();

export function UpdateDialog({ api = updaterApi }: { api?: UpdaterApi }) {
  const { t } = useI18n();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [installState, setInstallState] = useState<InstallState>({
    phase: "ready",
  });

  useEffect(() => {
    let active = true;
    let pending = updateChecks.get(api);
    if (!pending) {
      pending = api.check();
      updateChecks.set(api, pending);
    }

    void pending
      .then((available) => {
        if (active && available) setUpdate(available);
      })
      .catch(() => {
        updateChecks.delete(api);
        // Update checks are best-effort and must never block application startup.
      });

    return () => {
      active = false;
    };
  }, [api]);

  if (!update) return null;

  const install = async () => {
    setInstallState({ phase: "downloading", downloaded: 0 });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setInstallState({
            phase: "downloading",
            downloaded: 0,
            total: event.data.contentLength,
          });
        } else if (event.event === "Progress") {
          setInstallState((current) => {
            if (current.phase !== "downloading") return current;
            return {
              ...current,
              downloaded: current.downloaded + event.data.chunkLength,
            };
          });
        }
      });
      setInstallState({ phase: "restarting" });
      await api.relaunch();
    } catch {
      setInstallState({ phase: "error" });
    }
  };

  const busy =
    installState.phase === "downloading" ||
    installState.phase === "restarting";
  const progress =
    installState.phase === "downloading" && installState.total
      ? Math.min(
          100,
          Math.round(
            (installState.downloaded / installState.total) * 100,
          ),
        )
      : undefined;

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Download className="text-acid-lime" />
            {t("Buzz update available")} · {update.version}
          </AlertDialogTitle>
          <AlertDialogDescription>
            A new version was found on GitHub. Install it now and restart
            Buzz to finish updating.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {update.body ? (
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-graphite bg-carbon/60 p-3 text-sm text-mist">
            {update.body}
          </div>
        ) : null}

        {installState.phase === "downloading" ? (
          <div className="grid gap-2">
            <div className="flex justify-between text-xs text-fog">
              <span>Downloading update…</span>
              <span>{progress === undefined ? "" : `${progress}%`}</span>
            </div>
            <div
              role="progressbar"
              aria-label="Downloading update"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-1.5 overflow-hidden rounded-full bg-graphite"
            >
              <div
                className={`h-full rounded-full bg-acid-lime transition-[width] ${
                  progress === undefined ? "w-1/3 animate-pulse" : ""
                }`}
                style={
                  progress === undefined
                    ? undefined
                    : { width: `${progress}%` }
                }
              />
            </div>
          </div>
        ) : null}

        {installState.phase === "restarting" ? (
          <p className="m-0 text-sm text-mist">Update installed. Restarting…</p>
        ) : null}

        {installState.phase === "error" ? (
          <p role="alert" className="m-0 text-sm text-coral-red">
            The update could not be installed. Check your connection and try
            again.
          </p>
        ) : null}

        <AlertDialogFooter>
          {!busy ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                updateChecks.delete(api);
                void update.close();
                setUpdate(null);
              }}
            >
              Later
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy}
            onClick={() => void install()}
          >
            {busy ? <RefreshCw className="animate-spin" /> : <Download />}
            {installState.phase === "error"
              ? "Try again"
              : installState.phase === "restarting"
                ? "Restarting…"
                : installState.phase === "downloading"
                  ? "Installing…"
                  : "Update now"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
