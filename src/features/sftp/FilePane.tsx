import type { ReactNode } from "react";
import {
  Download,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Upload,
} from "lucide-react";
import { EntryTable, type Entry } from "./EntryTable";
import { SourcePicker, type SftpSourceOption } from "./SourcePicker";

export type FilePaneProps = {
  source: SftpSourceOption;
  sources: SftpSourceOption[];
  onSourceChange: (source: SftpSourceOption) => void;
  entries: Entry[];
  busy: boolean;
  onNavigate: (entryName: string) => void;
  onRefresh: () => void;
  onUpload?: () => void;
  onDownload?: () => void;
  onNewFolder?: () => void;
};

/**
 * Unified file pane matching the design prototype. Renders a SourcePicker
 * dropdown, current path pill, contextual action buttons (New folder / Upload
 * for remote; Download for local), Refresh, and More, plus a file table with
 * Name, Size, Modified, and Perms columns.
 */
export function FilePane({
  source,
  sources,
  onSourceChange,
  entries,
  busy,
  onNavigate,
  onRefresh,
  onUpload,
  onDownload,
  onNewFolder,
}: FilePaneProps) {
  const isRemote = source.kind === "remote";

  return (
    <section
      className="flex min-h-0 flex-1 flex-col rounded-lg border border-graphite/70 bg-obsidian/30"
      aria-label={isRemote ? "Remote files" : "Local files"}
      data-testid={isRemote ? "sftp-remote-pane" : "sftp-local-pane"}
    >
      <header className="flex items-center justify-between gap-2 border-b border-graphite/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <SourcePicker source={source} sources={sources} onSelect={onSourceChange} />
          <span className="truncate rounded-pill bg-graphite/60 px-2 py-0.5 font-mono text-[11px] text-fog">
            {source.sublabel ?? source.label}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {isRemote ? (
            <>
              <IconGhost icon={<FolderPlus size={15} />} label="New folder" onClick={onNewFolder} />
              <IconGhost icon={<Upload size={15} />} label="Upload" onClick={onUpload} />
            </>
          ) : (
            <IconGhost icon={<Download size={15} />} label="Download" onClick={onDownload} />
          )}
          <IconGhost icon={<RefreshCw size={15} />} label="Refresh" onClick={onRefresh} />
          <IconGhost icon={<MoreHorizontal size={15} />} label="More" />
        </div>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <EntryTable
          entries={entries}
          busy={busy}
          testId={isRemote ? "sftp-remote-table" : "sftp-local-table"}
          onSelect={(entry) => {
            if (entry.isDir) onNavigate(entry.name);
          }}
        />
      </div>
    </section>
  );
}

function IconGhost({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-mist"
    >
      {icon}
    </button>
  );
}
