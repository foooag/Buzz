import type { ReactNode } from "react";
import { File, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared entry-table row shape used by both panes. `Entry` is the minimal
 * projection the table needs from `RemoteEntry` / `LocalEntry`.
 */
export type Entry = {
  name: string;
  isDir: boolean;
  size: number;
  modified: string | null;
  permissions: string | null;
};

type EntryTableProps = {
  entries: Entry[];
  busy: boolean;
  testId: string;
  onSelect?(entry: Entry): void;
  /** Optional per-row drag source. `payload` is what the drop handler reads. */
  onDragStart?(entry: Entry, payload: string): void;
  /**
   * Optional per-row action button rendered in a trailing cell (e.g. the
   * remote pane's "Open With…" affordance). Absent on the local pane.
   */
  rowAction?: { label: string; ariaLabel: (entry: Entry) => string; onActivate(entry: Entry): void };
};

/**
 * Compact, accessible entry table. Renders name, size, and modified columns;
 * doubles as the drag source for cross-pane transfers. Empty/loading states
 * are explicit so the panes stay composable.
 */
export function EntryTable({ entries, busy, testId, onSelect, onDragStart, rowAction }: EntryTableProps) {
  if (busy && entries.length === 0) {
    return <p className="px-3 py-4 text-caption text-fog" data-testid={`${testId}-loading`}>Loading…</p>;
  }
  if (entries.length === 0) {
    return <p className="px-3 py-4 text-caption text-fog" data-testid={`${testId}-empty`}>This folder is empty.</p>;
  }
  return (
    <table className="w-full border-collapse text-caption" data-testid={testId}>
      <thead className="sticky top-0 bg-carbon text-[10.5px] uppercase tracking-[0.05em] text-fog/60">
        <tr className="border-b border-graphite">
          <th scope="col" className="px-3 py-2 text-left font-w510">Name</th>
          <th scope="col" className="px-3 py-2 text-right font-w510">Size</th>
          <th scope="col" className="px-3 py-2 text-left font-w510">Modified</th>
          <th scope="col" className="hidden px-3 py-2 text-left font-w510 lg:table-cell">Perms</th>
          {rowAction ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.name}
            data-entry-name={entry.name}
            data-entry-dir={entry.isDir ? "true" : "false"}
            draggable={typeof onDragStart === "function"}
            tabIndex={typeof onSelect === "function" ? 0 : undefined}
            onClick={onSelect ? () => onSelect(entry) : undefined}
            onKeyDown={
              onSelect
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(entry);
                    }
                  }
                : undefined
            }
            onDragStart={
              onDragStart
                ? (event) => {
                    event.dataTransfer.setData("text/plain", onDragStartPayload(entry, onDragStart));
                    event.dataTransfer.effectAllowed = "copy";
                  }
                : undefined
            }
            className="border-b border-graphite/60 outline-none transition-colors hover:bg-white/5 focus-visible:bg-white/5"
          >
            <td className="px-3 py-1.5 text-mist">
              <span className="inline-flex items-center gap-2">{entry.isDir ? <FolderIcon /> : <FileIcon />}{entry.name}</span>
            </td>
            <td className="px-3 py-1.5 text-right text-fog">{entry.isDir ? "—" : formatSize(entry.size)}</td>
            <td className="px-3 py-1.5 text-fog">{entry.modified ? formatDate(entry.modified) : "—"}</td>
            <td className="hidden px-3 py-1.5 font-mono text-[11.5px] text-fog/80 lg:table-cell">{entry.permissions ?? "—"}</td>
            {rowAction ? (
              <td className="px-3 py-1.5 text-right">
                {!entry.isDir ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-caption"
                    aria-label={rowAction.ariaLabel(entry)}
                    onClick={(event) => {
                      event.stopPropagation();
                      rowAction.onActivate(entry);
                    }}
                  >
                    {rowAction.label}
                  </Button>
                ) : null}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function onDragStartPayload(entry: Entry, onDragStart: (entry: Entry, payload: string) => void): string {
  let payload = "";
  onDragStart(entry, payload);
  return entry.name;
}

function FolderIcon(): ReactNode {
  return <Folder size={14} className="shrink-0 text-signal-teal" />;
}

function FileIcon(): ReactNode {
  return <File size={14} className="shrink-0 text-fog/70" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
