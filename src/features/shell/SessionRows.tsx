import { GripVertical, Terminal as TerminalIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTerminalStore } from "./terminalStore";

type SessionRowsProps = {
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
};

export function SessionRows({ onActivate, onClose }: SessionRowsProps) {
  const sessionOrder = useTerminalStore((state) => state.sessionOrder);
  const sessions = useTerminalStore((state) => state.sessions);
  const activeSessionId = useTerminalStore((state) => state.activeSessionId);
  const moveSession = useTerminalStore((state) => state.moveSession);
  const [grabbed, setGrabbed] = useState<string | null>(null);

  if (sessionOrder.length === 0) return null;

  return (
    <nav aria-label="Sessions" className="mt-2.5 grid gap-1 border-t border-graphite pt-2.5">
      {sessionOrder.map((sessionId) => {
        const session = sessions[sessionId];
        if (!session) return null;
        const label =
          session.status === "exited"
            ? `${session.title} (exited)`
            : session.status === "error"
              ? `${session.title} (error)`
              : session.title;
        return (
          <div
            key={sessionId}
            data-active={activeSessionId === sessionId || undefined}
            className="group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-[10px] data-[active]:bg-graphite data-[active]:shadow-[inset_3px_0_#e4f222]"
          >
            <button
              type="button"
              aria-label={label}
              aria-current={activeSessionId === sessionId ? "page" : undefined}
              aria-grabbed={grabbed === sessionId}
              onClick={() => onActivate(sessionId)}
              onKeyDown={(event) => {
                if (event.key === " ") {
                  event.preventDefault();
                  setGrabbed((current) => (current === sessionId ? null : sessionId));
                } else if (grabbed === sessionId && event.key === "ArrowUp") {
                  event.preventDefault();
                  moveSession(sessionId, -1);
                } else if (grabbed === sessionId && event.key === "ArrowDown") {
                  event.preventDefault();
                  moveSession(sessionId, 1);
                } else if (event.key === "Escape") {
                  setGrabbed(null);
                }
              }}
              className="flex min-h-[38px] min-w-0 items-center gap-2.5 rounded-[10px] bg-transparent pl-3 pr-[26px] py-0 text-left text-caption text-fog hover:bg-white/5 aria-[current=page]:text-paper"
            >
              <GripVertical
                size={13}
                aria-hidden="true"
                className="opacity-0 group-hover/row:opacity-65"
              />
              <TerminalIcon size={16} aria-hidden="true" />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap group-data-[sidebar-size=compact]/sidebar:hidden">
                {session.title}
              </span>
              <span
                data-status={session.status}
                aria-hidden="true"
                className="ml-auto h-[7px] w-[7px] rounded-full bg-pulse-green data-[status=connecting]:bg-yellow-400 data-[status=exited]:bg-coral-red data-[status=error]:bg-coral-red"
              />
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Close ${session.title}`}
              onClick={() => onClose(sessionId)}
              className="absolute right-1.5 h-6 w-6 text-fog opacity-0 hover:text-mist group-hover/row:opacity-100 focus-visible:opacity-100"
            >
              <X size={13} />
            </Button>
          </div>
        );
      })}
    </nav>
  );
}
