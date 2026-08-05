import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { EntryTable, type Entry } from "./EntryTable";
import type { LocalEntry } from "./sftpTypes";

type LocalPaneProps = {
  entries: LocalEntry[];
  cwd: string;
  busy: boolean;
  showHidden: boolean;
  onShowHiddenChange(showHidden: boolean): void;
  onRefresh(): void;
  onNavigate(path: string): void;
  /**
   * Called with the absolute path of a dragged local entry. The remote pane
   * receives the drop and triggers `enqueueUpload` with these paths.
   */
  onDragLocalEntry(entry: Entry, payload: string): void;
};

function toEntry(e: LocalEntry): Entry {
  return {
    name: e.name,
    isDir: e.isDir,
    size: e.size,
    modified: e.modified,
    permissions: e.permissions !== null ? formatPermissions(e.permissions, e.isDir) : null,
  };
}

/**
 * Local filesystem pane of the dual-pane SFTP panel. Renders the local
 * listing with a path breadcrumb, a show-hidden toggle, and acts as the drag
 * source for uploads. Navigation into a subdirectory calls `onNavigate` with
 * the joined path; the parent owns the cwd and triggers `refreshLocal`.
 */
export function LocalPane({
  entries,
  cwd,
  busy,
  showHidden,
  onShowHiddenChange,
  onRefresh,
  onNavigate,
  onDragLocalEntry,
}: LocalPaneProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const visible = useMemo(
    () =>
      (showHidden ? entries : entries.filter((entry) => !entry.name.startsWith("."))).map(toEntry),
    [entries, showHidden],
  );

  return (
    <section
      className="flex flex-col bg-background"
      aria-label="Local files"
      data-testid="sftp-local-pane"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-graphite px-4 py-2.5">
        <h2 id="sftp-local-heading" className="m-0 text-caption font-w510 uppercase tracking-[0.08em] text-fog">
          Local
        </h2>
        <Breadcrumb path={cwd} onNavigate={onNavigate} testId="sftp-local-breadcrumb" />
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
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh} aria-label="Refresh local listing">
            Refresh
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <EntryTable
          entries={visible}
          busy={busy}
          testId="sftp-local-table"
          onSelect={(entry) => {
            if (entry.isDir) onNavigate(joinPath(cwd, entry.name));
            setSelected(entry.name);
          }}
          onDragStart={(entry, payload) => onDragLocalEntry(entry, payload)}
        />
      </div>
      {selected ? (
        <p className="border-t border-graphite px-4 py-1.5 text-caption text-fog" data-testid="sftp-local-selected">
          Selected: {selected}
        </p>
      ) : null}
    </section>
  );
}

export function Breadcrumb({
  path,
  onNavigate,
  testId,
}: {
  path: string;
  onNavigate(path: string): void;
  testId: string;
}) {
  const segments = path.split("/").filter(Boolean);
  return (
    <nav aria-label="Current path" className="flex flex-wrap items-center gap-0.5 text-caption text-fog" data-testid={testId}>
      <button type="button" className="text-fog hover:text-mist" onClick={() => onNavigate("/")}>/</button>
      {segments.map((segment, index) => {
        const target = "/" + segments.slice(0, index + 1).join("/");
        return (
          <span key={target} className="flex items-center gap-0.5">
            <span aria-hidden="true">/</span>
            <button type="button" className="text-fog hover:text-mist" onClick={() => onNavigate(target)}>
              {segment}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

export function joinPath(cwd: string, name: string): string {
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
