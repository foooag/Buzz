import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { EntryTable, type Entry } from "./EntryTable";
import { Breadcrumb } from "./LocalPane";
import type { RemoteEntry } from "./sftpTypes";

type RemotePaneProps = {
  entries: RemoteEntry[];
  cwd: string;
  busy: boolean;
  showHidden: boolean;
  connected: boolean;
  pendingUploadPaths: string[];
  onShowHiddenChange(showHidden: boolean): void;
  onRefresh(): void;
  onNavigate(path: string): void;
  /** Drop handler: the payload is the list of local paths being uploaded. */
  onDropUpload(payload: string[]): void;
  /** Drag a remote entry to trigger a download into the local cwd. */
  onDragRemoteEntry(entry: Entry, payload: string): void;
  /**
   * Per-file "Open With…" affordance. The panel joins the cwd + name and
   * mounts the OpenWithDialog. Absent for directories.
   */
  onOpenWith?(entry: Entry): void;
};

function toEntry(e: RemoteEntry): Entry {
  return {
    name: e.name,
    isDir: e.isDir,
    size: e.size,
    modified: e.modified,
    permissions: e.permissions !== null ? formatPermissions(e.permissions, e.isDir) : null,
  };
}

/**
 * Remote (SFTP) filesystem pane. Mirrors `LocalPane`'s layout but acts as the
 * drop target for uploads: a drop reads the dragged local paths and calls
 * `onDropUpload`, which the panel routes to `enqueueUpload`. Also serves as a
 * drag source for downloads into the local pane and renders the per-file
 * "Open With…" action when the panel wires it.
 */
export function RemotePane({
  entries,
  cwd,
  busy,
  showHidden,
  connected,
  pendingUploadPaths,
  onShowHiddenChange,
  onRefresh,
  onNavigate,
  onDropUpload,
  onDragRemoteEntry,
  onOpenWith,
}: RemotePaneProps) {
  const visible = useMemo(
    () =>
      (showHidden ? entries : entries.filter((entry) => !entry.name.startsWith("."))).map(toEntry),
    [entries, showHidden],
  );
  const [dragOver, setDragOver] = useState(false);

  return (
    <section
      className={`flex flex-col bg-background transition-colors data-[drag-over=true]:bg-acid-lime/5 ${dragOver ? "bg-acid-lime/5" : ""}`}
      aria-label="Remote files"
      data-testid="sftp-remote-pane"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const payload = event.dataTransfer.getData("text/plain");
        const paths = payload ? [payload] : [...pendingUploadPaths];
        if (paths.length > 0) onDropUpload(paths);
      }}
      data-drag-over={dragOver ? "true" : undefined}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-graphite px-4 py-2.5">
        <h2 id="sftp-remote-heading" className="m-0 text-caption font-w510 uppercase tracking-[0.08em] text-fog">
          Remote
        </h2>
        <Breadcrumb path={cwd} onNavigate={onNavigate} testId="sftp-remote-breadcrumb" />
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-caption text-fog">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => onShowHiddenChange(event.target.checked)}
              className="accent-acid-lime"
            />
            Show hidden
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            aria-label="Refresh remote listing"
            disabled={!connected}
          >
            Refresh
          </Button>
        </div>
      </header>
      {connected ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <EntryTable
            entries={visible}
            busy={busy}
            testId="sftp-remote-table"
            onSelect={(entry) => {
              if (entry.isDir) onNavigate(joinRemote(cwd, entry.name));
            }}
            onDragStart={(entry, payload) => onDragRemoteEntry(entry, payload)}
            rowAction={
              onOpenWith
                ? {
                    label: "Open With…",
                    ariaLabel: (entry) => `Open ${entry.name} with`,
                    onActivate: (entry) => onOpenWith(entry),
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <p className="px-4 py-4 text-caption text-fog" data-testid="sftp-remote-disconnected">
          Not connected.
        </p>
      )}
    </section>
  );
}

function joinRemote(cwd: string, name: string): string {
  if (cwd.endsWith("/")) return `${cwd}${name}`;
  return `${cwd}/${name}`;
}

function formatPermissions(mode: number, isDir: boolean): string {
  const r = (m: number, bit: number) => (m & bit ? "r" : "-");
  const w = (m: number, bit: number) => (m & bit ? "w" : "-");
  const x = (m: number, bit: number) => (m & bit ? "x" : "-");
  const type = isDir ? "d" : "-";
  return (
    type +
    r(mode, 0o400) + w(mode, 0o200) + x(mode, 0o100) +
    r(mode, 0o040) + w(mode, 0o020) + x(mode, 0o010) +
    r(mode, 0o004) + w(mode, 0o002) + x(mode, 0o001)
  );
}
