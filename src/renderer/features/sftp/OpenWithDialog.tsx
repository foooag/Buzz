import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SftpApi } from "./sftpApi";
import type { Association, ConflictKind, ConflictResolution, SftpSessionId, WatcherId } from "./sftpTypes";

type OpenWithDialogProps = {
  open: boolean;
  sessionId: SftpSessionId;
  /** Absolute remote path; only the safe leaf name is ever rendered. */
  remotePath: string;
  api: SftpApi;
  /** Current associations, so the app field can be prefilled for the extension. */
  associations?: Association[];
  /**
   * Watcher status surfaced from the store once `api.openWith` has launched.
   * Lets the dialog reflect launched / saved / conflict / closed states.
   */
  watcherStatus?: "launched" | "saved" | "conflict" | "closed";
  /** Active Open-With conflict from the store, if any. */
  activeConflict?: { watcherId: WatcherId; remoteName: string; kind: ConflictKind } | null;
  onResolveConflict?(resolution: ConflictResolution): void;
  /** Fired with the watcher id once `api.openWith` resolves. */
  onLaunched?(watcherId: WatcherId): void;
  onClose?(): void;
};

/**
 * Open-With dialog. Collects an application name (prefilled from a remembered
 * association for the file's extension), offers a "Remember for this file
 * type" checkbox, and launches the editor via `api.openWith`. On launch with
 * Remember checked and no existing association for the extension, it persists
 * the new association via `api.setAssociation`. When the store surfaces an
 * active Open-With conflict (remote changed while editing), an inline prompt
 * reuses the same resolution options as the transfer ConflictDialog.
 */
export function OpenWithDialog({
  open,
  sessionId,
  remotePath,
  api,
  associations = [],
  watcherStatus,
  activeConflict,
  onResolveConflict,
  onLaunched,
  onClose,
}: OpenWithDialogProps) {
  const leaf = useMemo(() => remotePath.split("/").pop() ?? remotePath, [remotePath]);
  const extension = useMemo(() => {
    const dot = leaf.lastIndexOf(".");
    if (dot <= 0 || dot === leaf.length - 1) return "";
    return leaf.slice(dot + 1).toLowerCase();
  }, [leaf]);

  const remembered = useMemo(() => {
    return extension ? associations.find((assoc) => assoc.extension === extension) : undefined;
  }, [associations, extension]);

  const [appName, setAppName] = useState("");
  const [remember, setRemember] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Prefill from a remembered association (or clear) whenever the target or
  // association list changes.
  useEffect(() => {
    if (!open) return;
    setAppName(remembered?.appName ?? "");
    setRemember(Boolean(remembered));
  }, [open, remembered]);

  // Focus + Esc to close.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleOpen() {
    const trimmed = appName.trim();
    if (!trimmed) return;
    const hasExisting = Boolean(remembered);
    if (remember && !hasExisting && extension) {
      // The M4 dialog collects an application name; the backend resolves the
      // install path. Persisting uses the name as the path placeholder so the
      // association round-trips through `listAssociations`.
      await api.setAssociation(extension, trimmed, trimmed);
    }
    const watcherId = await api.openWith(sessionId, remotePath, trimmed);
    if (watcherId) onLaunched?.(watcherId);
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Open with: ${leaf}`}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 outline-hidden"
      data-testid="sftp-open-with-dialog"
    >
      <div className="grid w-full max-w-[460px] gap-4 rounded-lg border border-graphite bg-card p-6 shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
        <div className="grid gap-1">
          <h2 className="m-0 text-body-lg font-w510 tracking-[-0.012em] text-paper">Open with</h2>
          <p className="m-0 text-caption text-fog">
            File: <span data-testid="sftp-open-with-target">{leaf}</span>
          </p>
        </div>
        <Label className="grid gap-1.5 text-caption font-w510 text-fog">
          Application
          <Input
            type="text"
            value={appName}
            onChange={(event) => setAppName(event.target.value)}
            aria-label="Application"
            data-testid="sftp-open-with-app"
          />
        </Label>
        <label className="flex items-center gap-2 text-caption text-fog">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="accent-acid-lime"
          />
          Remember for this file type
        </label>
        {watcherStatus ? (
          <p className="m-0 text-caption text-fog" data-testid="sftp-open-with-status">
            Status: {watcherStatus}
          </p>
        ) : null}
        {activeConflict ? (
          <OpenWithConflictPrompt
            kind={activeConflict.kind}
            onResolve={(resolution) => onResolveConflict?.(resolution)}
          />
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void handleOpen();
            }}
            disabled={!appName.trim()}
          >
            Open
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline conflict prompt for the Open-With flow (remote file changed while the
 * local workspace copy was open). Reuses the same resolution vocabulary as the
 * transfer ConflictDialog but stays compact since the watcher already holds
 * the context.
 */
function OpenWithConflictPrompt({
  kind,
  onResolve,
}: {
  kind: ConflictKind;
  onResolve: (resolution: ConflictResolution) => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Remote file changed"
      className="grid gap-2 rounded-md border border-coral-red/40 bg-coral-red/10 p-3"
      data-testid="sftp-open-with-conflict"
    >
      <p className="m-0 text-caption text-mist">
        {kind.kind === "remoteChanged"
          ? "The remote file changed while you were editing."
          : "A conflict was detected."}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onResolve({ resolution: "overwrite" })}>
          Overwrite
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onResolve({ resolution: "skip" })}>
          Skip
        </Button>
      </div>
    </div>
  );
}
