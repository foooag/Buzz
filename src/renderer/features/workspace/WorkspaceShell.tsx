import { useEffect, useState, type ReactNode } from "react";
import { History, LockKeyhole, Network, Settings } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { SessionRows } from "../shell/SessionRows";
import {
  formatHistoryWhen,
  listConnectionHistory,
  subscribeConnectionHistory,
  type HistoryEntry,
} from "./connectionHistory";

function recentDot(status: string): string {
  if (status === "connected") return "bg-pulse-green";
  if (status === "failed") return "bg-coral-red";
  return "bg-fog/50";
}

export type Destination =
  | "servers"
  | "agent"
  | "sftp"
  | "forwarding"
  | "history"
  | "terminal";

type WorkspaceShellProps = {
  children: ReactNode;
  onSessionActivate?: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onOpenSession?: (entry: HistoryEntry) => void;
  sidebarCompact?: boolean;
  onPreferences?: () => void;
};

export function WorkspaceShell({
  children,
  onSessionActivate = () => undefined,
  onSessionClose = () => undefined,
  onOpenSession = () => undefined,
  sidebarCompact = false,
  onPreferences = () => undefined,
}: WorkspaceShellProps) {
  const navigate = useNavigate();
  const [history, setHistory] = useState(listConnectionHistory);
  useEffect(
    () => subscribeConnectionHistory(() => setHistory(listConnectionHistory())),
    [],
  );
  return (
    <div
      data-sidebar-size={sidebarCompact ? "compact" : "expanded"}
      data-testid="workspace-shell"
      className="group/sidebar grid h-screen min-h-0 overflow-hidden grid-cols-[266px_minmax(0,1fr)] bg-background data-[sidebar-size=compact]:grid-cols-[82px_minmax(0,1fr)]"
    >
      <aside className="relative flex h-full min-h-0 flex-col border-r border-graphite bg-card px-2.5 pb-4 pt-3 text-card-foreground">
        <div className="flex items-center justify-between px-2.5 pb-3.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Preferences"
            title="Preferences"
            onClick={onPreferences}
          >
            <Settings size={17} />
          </Button>
          <div
            aria-label="Buzz home"
            className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-graphite text-mist"
          >
            <Network size={18} />
          </div>
        </div>

        <PrimaryNavigation />

        <SessionRows onActivate={onSessionActivate} onClose={onSessionClose} />

        <section
          aria-labelledby="recent-title"
          className="group-data-[sidebar-size=compact]/sidebar:hidden mx-0 mt-3 border-t border-graphite pt-3"
        >
          <div className="flex items-center justify-between px-3.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/70">
            <span className="flex items-center gap-2">
              <History size={12} />
              <h2 id="recent-title" className="m-0 text-[10px] font-semibold">
                Recent
              </h2>
            </span>
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="normal-case tracking-normal text-[11px] font-normal text-fog hover:text-mist"
            >
              Show more
            </button>
          </div>
          <div className="mt-1 grid gap-0.5">
            {history.slice(0, 4).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onOpenSession(entry)}
                className="flex min-w-0 items-center gap-2.5 rounded-[10px] px-3.5 py-1.5 text-left text-[12.5px] text-fog hover:bg-white/5 hover:text-mist"
              >
                <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${recentDot(entry.status)}`} />
                <span className="truncate">{entry.host}</span>
                <span className="ml-auto shrink-0 text-[11px] text-fog/60">{formatHistoryWhen(entry)}</span>
              </button>
            ))}
            {!history.length ? (
              <p className="m-0 px-3.5 py-2 text-[11.5px] text-fog/60">No recent connections</p>
            ) : null}
          </div>
        </section>

        <div className="mt-auto flex items-center gap-2 px-2.5 pt-3 text-xs text-muted-foreground">
          <span className="h-[7px] w-[7px] rounded-full bg-pulse-green ring-2 ring-pulse-green/15" />
          <LockKeyhole size={14} />
          <span className="group-data-[sidebar-size=compact]/sidebar:hidden">
            Local vault
          </span>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
