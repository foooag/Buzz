import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { terminalApi, type TerminalApi } from "./terminalApi";
import {
  createResizeObserver,
  createXtermRuntime,
  terminalEventBus,
  terminalRuntimeRegistry,
  type ResizeObserverFactory,
  type TerminalEventBus,
  type TerminalRuntime,
  type TerminalRuntimeFactory,
  type TerminalRuntimeOptions,
  type TerminalRuntimeRegistry,
} from "./terminalRuntime";
import { getTerminalTheme } from "./terminalTheme";
import type { PaneId, SessionId, TerminalSize } from "./terminalTypes";

type TerminalPaneProps = {
  paneId: PaneId;
  sessionId: SessionId;
  themeId: string;
  api?: TerminalApi;
  eventBus?: TerminalEventBus;
  runtimeFactory?: TerminalRuntimeFactory;
  resizeObserverFactory?: ResizeObserverFactory;
  runtimeRegistry?: TerminalRuntimeRegistry;
  runtimeOptions?: TerminalRuntimeOptions;
  rightClickPaste?: boolean;
};

export function TerminalPane({
  paneId,
  sessionId,
  themeId,
  api = terminalApi,
  eventBus = terminalEventBus,
  runtimeFactory = createXtermRuntime,
  resizeObserverFactory = createResizeObserver,
  runtimeRegistry = terminalRuntimeRegistry,
  runtimeOptions,
  rightClickPaste = true,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<TerminalRuntime | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const runtime = runtimeFactory(getTerminalTheme(themeId), runtimeOptions);
    runtimeRef.current = runtime;
    const unregisterRuntime = runtimeRegistry.register(paneId, runtime);
    runtime.open(container);
    const dataSubscription = runtime.onData((data) => {
      void api.write(sessionId, new TextEncoder().encode(data));
    });
    const unsubscribe = eventBus.subscribe(sessionId, (event) => {
      if (event.type === "output") runtime.write(new Uint8Array(event.data));
    });

    let lastSize: TerminalSize | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = resizeObserverFactory(() => {
      // Keep-alive sessions sit below an ancestor with the `hidden` attribute.
      // Fitting in that state is unsafe: FitAddon can resolve `width: 100%` as
      // 100 pixels and shrink both xterm and the remote PTY to only a handful
      // of columns. Output received before the session is shown again then
      // arrives permanently hard-wrapped to that bogus width.
      if (container.closest("[hidden]")) return;
      runtime.fit();
      const size = runtime.dimensions();
      if (lastSize?.cols === size.cols && lastSize.rows === size.rows) return;
      lastSize = size;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void api.resize(sessionId, size), 50);
    });
    observer.observe(container);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      unregisterRuntime();
      unsubscribe();
      dataSubscription.dispose();
      runtime.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [
    api,
    eventBus,
    paneId,
    resizeObserverFactory,
    runtimeFactory,
    runtimeRegistry,
    sessionId,
  ]);

  useEffect(() => {
    runtimeRef.current?.setTheme(getTerminalTheme(themeId));
  }, [themeId]);

  useEffect(() => {
    if (runtimeOptions) runtimeRef.current?.setOptions(runtimeOptions);
  }, [runtimeOptions]);

  return (
    <div
      ref={containerRef}
      className="terminal-pane"
      data-pane-id={paneId}
      data-testid="terminal-pane"
      role="application"
      aria-label="Terminal"
      onContextMenu={(event) => {
        if (!rightClickPaste) return;
        event.preventDefault();
        void navigator.clipboard
          ?.readText()
          .then((text) => runtimeRef.current?.paste(text))
          .catch(() => undefined);
      }}
    />
  );
}
