import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConflictKind, ConflictResolution, ConflictPolicy, TransferId } from "./sftpTypes";

type ConflictDialogProps = {
  open: boolean;
  transferId: TransferId;
  itemId: string;
  /**
   * Safe relative leaf name of the conflicting target. The dialog never
   * displays absolute paths — only this sanitized name (mirrors the
   * `targetExists.targetName` / `remoteChanged.remoteName` payload).
   */
  targetName: string;
  /** Optional conflict kind; defaults to a generic target-exists prompt. */
  kind?: ConflictKind;
  onResolve: (
    transferId: TransferId,
    itemId: string,
    resolution: ConflictResolution,
  ) => void;
  onClose?: () => void;
};

/**
 * Accessible conflict-resolution modal. Mirrors the `HostKeyDialog` pattern
 * (role=dialog, labelled, Esc to dismiss). The user selects a policy
 * (Overwrite / Skip / Rename) then confirms with either a single-item
 * "Confirm" or "Apply to all" — the latter folds the chosen policy into an
 * `applyToAll` resolution so the backend reuses it for the rest of the batch.
 *
 * Esc dismisses as a Skip (the safe, non-destructive default), matching the
 * M0 parity contract: destructive actions require explicit confirmation, so
 * cancel must never imply Overwrite.
 */
export function ConflictDialog({
  open,
  transferId,
  itemId,
  targetName,
  kind,
  onResolve,
  onClose,
}: ConflictDialogProps) {
  const [policy, setPolicy] = useState<ConflictPolicy>("overwrite");
  const [newName, setNewName] = useState(targetName);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset the rename field whenever a new conflict target is presented.
  useEffect(() => {
    if (open) {
      setPolicy("overwrite");
      setNewName(targetName);
    }
  }, [open, targetName]);

  // Focus the dialog on open + bind Esc to skip.
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    node?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        emitSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transferId, itemId]);

  if (!open) return null;

  const isRename = policy === "rename";
  const heading = kind?.kind === "remoteChanged" ? "Remote file changed" : "File already exists";

  function emitSingle() {
    if (policy === "rename") {
      const trimmed = newName.trim();
      if (!trimmed) return;
      onResolve(transferId, itemId, { resolution: "rename", newName: trimmed });
    } else if (policy === "overwrite") {
      onResolve(transferId, itemId, { resolution: "overwrite" });
    } else {
      onResolve(transferId, itemId, { resolution: "skip" });
    }
    onClose?.();
  }

  function emitApplyToAll() {
    // Rename does not make sense as a batch policy (each target needs its own
    // name), so apply-to-all with rename selected is treated as skip.
    const applyPolicy: ConflictPolicy = policy === "rename" ? "skip" : policy;
    onResolve(transferId, itemId, { resolution: "applyToAll", applyToAll: applyPolicy });
    onClose?.();
  }

  function emitSkip() {
    onResolve(transferId, itemId, { resolution: "skip" });
    onClose?.();
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${heading}: ${targetName}`}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 outline-hidden"
      data-testid="sftp-conflict-dialog"
    >
      <div className="grid w-full max-w-[460px] gap-4 rounded-lg border border-graphite bg-card p-6 shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
        <div className="grid gap-1">
          <h2 className="m-0 text-body-lg font-w510 tracking-[-0.012em] text-paper">{heading}</h2>
          <p className="m-0 text-caption text-fog">
            <span data-testid="sftp-conflict-target">{targetName}</span> already exists.
          </p>
        </div>
        <div aria-label="Conflict resolution" className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={policy === "overwrite"}
            data-policy="overwrite"
            className="aria-pressed:border-acid-lime aria-pressed:bg-acid-lime/10 aria-pressed:text-acid-lime"
            onClick={() => setPolicy("overwrite")}
          >
            Overwrite
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={policy === "skip"}
            data-policy="skip"
            className="aria-pressed:border-acid-lime aria-pressed:bg-acid-lime/10 aria-pressed:text-acid-lime"
            onClick={() => setPolicy("skip")}
          >
            Skip
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={policy === "rename"}
            data-policy="rename"
            className="aria-pressed:border-acid-lime aria-pressed:bg-acid-lime/10 aria-pressed:text-acid-lime"
            onClick={() => setPolicy("rename")}
          >
            Rename
          </Button>
        </div>
        {isRename ? (
          <Label className="grid gap-1.5 text-caption font-w510 text-fog">
            New name
            <Input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              aria-label="New file name"
              data-testid="sftp-conflict-rename"
            />
          </Label>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={emitSkip}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={emitSingle}
            disabled={isRename && !newName.trim()}
          >
            Confirm
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={emitApplyToAll}>
            Apply to all
          </Button>
        </div>
      </div>
    </div>
  );
}
