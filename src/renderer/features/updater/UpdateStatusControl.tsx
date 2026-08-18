import { useEffect, useState } from "react";
import { CircleAlert, Download, PackageOpen, RefreshCw } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  updaterApi,
  type UpdateStatus,
  type UpdaterApi,
} from "./updaterApi";

const startupChecks = new WeakMap<UpdaterApi, Promise<unknown>>();

function startBackgroundCheck(api: UpdaterApi): void {
  if (startupChecks.has(api)) return;
  const pending = api.check().catch(() => undefined);
  startupChecks.set(api, pending);
}

function ManualUpdateDialog({
  open,
  version,
  onClose,
  onReopen,
}: {
  open: boolean;
  version: string;
  onClose: () => void;
  onReopen: () => void;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Update installer opened")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "Drag Buzz into the Applications folder to replace the old version, then reopen Buzz from Applications.",
            )}
            <span className="block pt-1 text-xs opacity-70">{version}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{t("Done")}</AlertDialogCancel>
          <AlertDialogAction onClick={onReopen}>
            {t("Reopen installer")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UpdateStatusControl({
  api = updaterApi,
}: {
  api?: UpdaterApi;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpdateStatus>({ phase: "idle" });
  const [restarting, setRestarting] = useState(false);
  const [manualPromptOpen, setManualPromptOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let receivedStatusEvent = false;
    const unsubscribe = api.subscribe((next) => {
      receivedStatusEvent = true;
      if (active) setStatus(next);
    });
    void api.getStatus()
      .then((current) => {
        if (active && !receivedStatusEvent) setStatus(current);
      })
      .catch(() => undefined)
      .finally(() => startBackgroundCheck(api));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  if (status.phase === "idle") return null;

  const restart = async () => {
    if (restarting) return;
    if (status.phase !== "ready" && status.phase !== "manual-ready") return;
    const manual = status.phase === "manual-ready";
    setRestarting(true);
    try {
      await api.relaunch();
      if (manual) setManualPromptOpen(true);
    } catch {
      // The installer did not take over; restore the action so it can be retried.
    } finally {
      setRestarting(false);
    }
  };

  const retry = async () => {
    if (status.phase !== "error") return;
    await api.retry().catch(() => undefined);
  };

  if (status.phase === "downloading" || status.phase === "manual-downloading") {
    const progress = status.percent === undefined ? "" : ` ${status.percent}%`;
    const downloadingInstaller = status.phase === "manual-downloading";
    const label = downloadingInstaller
      ? `${t("Downloading installer")}${progress}`
      : `${t("Downloading update")}${progress}`;
    return (
      <button
        type="button"
        disabled
        aria-label={label}
        title={label}
        className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-acid-lime"
      >
        <Download size={14} className="animate-bounce" />
        <span className="truncate group-data-[sidebar-size=compact]/sidebar:hidden">
          {label}
        </span>
      </button>
    );
  }

  if (status.phase === "error") {
    return (
      <button
        type="button"
        onClick={() => void retry()}
        aria-label={t("Retry update download")}
        title={t("Retry update download")}
        className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-coral-red hover:bg-white/5"
      >
        <CircleAlert size={14} />
        <span className="truncate group-data-[sidebar-size=compact]/sidebar:hidden">
          {t("Retry update")}
        </span>
      </button>
    );
  }

  if (status.phase === "manual-ready") {
    const label = restarting ? t("Opening…") : t("Open installer");
    return (
      <>
        <button
          type="button"
          onClick={() => void restart()}
          disabled={restarting}
          aria-label={label}
          title={`${label} · ${status.version}`}
          className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-md bg-acid-lime/12 px-1.5 py-1 font-medium text-acid-lime transition-colors hover:bg-acid-lime/20 disabled:cursor-wait"
        >
          <PackageOpen size={14} />
          <span className="truncate group-data-[sidebar-size=compact]/sidebar:hidden">
            {label}
          </span>
        </button>
        <ManualUpdateDialog
          open={manualPromptOpen}
          version={status.version}
          onClose={() => setManualPromptOpen(false)}
          onReopen={() => {
            setManualPromptOpen(false);
            void api.relaunch().catch(() => undefined);
          }}
        />
      </>
    );
  }

  const label = restarting ? t("Restarting…") : t("Restart to update");
  return (
    <button
      type="button"
      onClick={() => void restart()}
      disabled={restarting}
      aria-label={label}
      title={`${label} · ${status.version}`}
      className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-md bg-acid-lime/12 px-1.5 py-1 font-medium text-acid-lime transition-colors hover:bg-acid-lime/20 disabled:cursor-wait"
    >
      <RefreshCw size={14} className={restarting ? "animate-spin" : ""} />
      <span className="truncate group-data-[sidebar-size=compact]/sidebar:hidden">
        {label}
      </span>
    </button>
  );
}
