import { useEffect, useState } from "react";
import { CircleAlert, Download, RefreshCw } from "lucide-react";
import { useI18n } from "@/shared/i18n";
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

export function UpdateStatusControl({
  api = updaterApi,
}: {
  api?: UpdaterApi;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpdateStatus>({ phase: "idle" });
  const [restarting, setRestarting] = useState(false);

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
    if (status.phase !== "ready" || restarting) return;
    setRestarting(true);
    try {
      await api.relaunch();
    } catch {
      setRestarting(false);
    }
  };

  const retry = async () => {
    if (status.phase !== "error") return;
    await api.retry().catch(() => undefined);
  };

  if (status.phase === "downloading") {
    const progress = status.percent === undefined ? "" : ` ${status.percent}%`;
    const label = `${t("Downloading update")}${progress}`;
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
          {t("Downloading update")}{progress}
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
