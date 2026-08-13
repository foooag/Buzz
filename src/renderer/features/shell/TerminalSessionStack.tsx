import { useEffect } from "react";
import type { TerminalApi } from "./terminalApi";
import { TerminalWorkspace } from "./TerminalWorkspace";
import { terminalRuntimeRegistry } from "./terminalRuntime";
import type {
  ResizeObserverFactory,
  TerminalEventBus,
  TerminalRuntimeFactory,
  TerminalRuntimeOptions,
  TerminalRuntimeRegistry,
} from "./terminalRuntime";
import { useTerminalStore } from "./terminalStore";
import { findPane } from "./terminalTree";
import type { TerminalEvent } from "./terminalTypes";
import type { AiConfigApi } from "../ai/aiConfigTypes";
import type { TerminalPreferences } from "../settings/terminalPreferences";

type TerminalSessionStackProps = {
  api: TerminalApi;
  eventBus: TerminalEventBus;
  runtimeFactory?: TerminalRuntimeFactory;
  resizeObserverFactory?: ResizeObserverFactory;
  themeId: string;
  onThemeChange: (themeId: string) => void;
  commandDrawerOpen: boolean;
  focusCommandSearch: boolean;
  onCommandDrawerChange: (open: boolean) => void;
  terminalSearchOpen: boolean;
  onTerminalSearchChange: (open: boolean) => void;
  runtimeRegistry?: TerminalRuntimeRegistry;
  runtimeOptions?: TerminalRuntimeOptions;
  onTerminalEvent: (event: TerminalEvent) => void;
  restartSession?: (
    sessionId: string,
    onEvent: (event: TerminalEvent) => void,
  ) => Promise<string>;
  onEmpty: () => void;
  terminalPreferences?: TerminalPreferences;
  aiConfigApi?: AiConfigApi;
  isSshSession?: (sessionId: string) => boolean;
};

export function TerminalSessionStack(props: TerminalSessionStackProps) {
  const sessionOrder = useTerminalStore((state) => state.sessionOrder);
  const activeSessionId = useTerminalStore((state) => state.activeSessionId);
  const activePaneId = useTerminalStore((state) =>
    state.activeSessionId
      ? state.sessions[state.activeSessionId]?.activePaneId
      : undefined,
  );
  const runtimeRegistry = props.runtimeRegistry ?? terminalRuntimeRegistry;

  // When the active pane changes (session switch, split focus, etc.) refit the
  // terminal so it adapts to its now-visible container and grab keyboard focus.
  // `display:none` breaks FitAddon (getComputedStyle returns 0px) and
  // ResizeObserver is unreliable on the none→visible transition, so an explicit
  // refit on activation is required. Defer one frame so layout has recomputed —
  // and so TerminalPane's mount effect has registered the runtime (this effect
  // can run before that registration on the same commit, so the registry read
  // must happen inside the deferred callback, not at effect time).
  useEffect(() => {
    if (!activeSessionId || !activePaneId) return;
    const session = useTerminalStore.getState().sessions[activeSessionId];
    const hostSessionId = session
      ? findPane(session.root, activePaneId)?.sessionId
      : undefined;
    const raf = requestAnimationFrame(() => {
      const runtime = runtimeRegistry.get(activePaneId);
      if (!runtime) return;
      // Refit the now-visible terminal; if its cols/rows actually changed, tell
      // the host PTY. Without this the PTY keeps the cols it was opened with,
      // the remote shell hard-wraps to that stale width, and switching back to
      // a session shows garbled / over-wrapped output.
      const size = runtime.fit();
      if (size && hostSessionId) void props.api.resize(hostSessionId, size);
      runtime.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [activeSessionId, activePaneId, runtimeRegistry, props.api]);

  if (sessionOrder.length === 0) return null;

  return (
    <div className="relative h-full w-full min-h-0 min-w-0">
      {sessionOrder.map((sessionId) => (
        <div
          key={sessionId}
          hidden={activeSessionId !== sessionId}
          className="absolute inset-0 h-full w-full"
        >
          <TerminalWorkspace sessionId={sessionId} {...props} />
        </div>
      ))}
    </div>
  );
}
