import {
  Columns2,
  PanelRightOpen,
  Rows2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TerminalApi } from "./terminalApi";
import { Button } from "@/components/ui/button";
import { CommandDrawer } from "./CommandDrawer";
import { TerminalPane } from "./TerminalPane";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  ResizeObserverFactory,
  TerminalEventBus,
  TerminalRuntimeFactory,
  TerminalRuntimeOptions,
  TerminalRuntimeRegistry,
} from "./terminalRuntime";
import { terminalRuntimeRegistry } from "./terminalRuntime";
import { useTerminalStore } from "./terminalStore";
import { terminalThemes } from "./terminalTheme";
import { createPaneNode, findPane } from "./terminalTree";
import type { SplitNode } from "./terminalTypes";
import type { TerminalEvent } from "./terminalTypes";
import { AiAssistantPanel } from "../ai/AiAssistantPanel";
import type { AiConfigApi } from "../ai/aiConfigTypes";
import {
  defaultTerminalPreferences,
  terminalFontFamily,
  type TerminalPreferences,
} from "../settings/terminalPreferences";

type TerminalWorkspaceProps = {
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

export function TerminalWorkspace({
  api,
  eventBus,
  runtimeFactory,
  resizeObserverFactory,
  themeId,
  onThemeChange,
  commandDrawerOpen,
  focusCommandSearch,
  onCommandDrawerChange,
  terminalSearchOpen,
  onTerminalSearchChange,
  runtimeRegistry = terminalRuntimeRegistry,
  onTerminalEvent,
  restartSession,
  onEmpty,
  terminalPreferences = defaultTerminalPreferences,
  aiConfigApi,
  isSshSession,
}: TerminalWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(true);
  const activeSessionId = useTerminalStore((state) => state.activeSessionId);
  const session = useTerminalStore((state) =>
    state.activeSessionId ? state.sessions[state.activeSessionId] : undefined,
  );
  const splitActivePane = useTerminalStore((state) => state.splitActivePane);
  const closePane = useTerminalStore((state) => state.closePane);
  const setActivePane = useTerminalStore((state) => state.setActivePane);
  const updateSplitRatio = useTerminalStore((state) => state.updateSplitRatio);
  const runtimeOptions = useMemo<TerminalRuntimeOptions>(
    () => ({
      fontFamily: terminalFontFamily(terminalPreferences.fontId),
      fontSize: terminalPreferences.fontSize,
      scrollback: terminalPreferences.scrollbackLines,
      terminalBell: terminalPreferences.terminalBell,
      optionAsMeta: terminalPreferences.optionAsMeta,
    }),
    [terminalPreferences],
  );
  const runCommandSnippet = useCallback(
    (command: string) => {
      if (!session) return;
      const runtime = runtimeRegistry.get(session.activePaneId);
      runtime?.paste(`${command}\r`);
      runtime?.focus();
    },
    [runtimeRegistry, session],
  );

  const split = useCallback(
    async (direction: "horizontal" | "vertical") => {
      if (!session) return;
      const opened = await api.open({ cols: 80, rows: 24 }, onTerminalEvent);
      const paneId = `pane-${opened.sessionId}`;
      splitActivePane(
        createPaneNode(paneId, opened.sessionId),
        direction,
        `split-${crypto.randomUUID()}`,
      );
    },
    [api, onTerminalEvent, session, splitActivePane],
  );

  const restart = useCallback(async () => {
    if (!session) return;
    const pane = findPane(session.root, session.activePaneId);
    if (!pane) return;
    const nextSessionId = restartSession
      ? await restartSession(pane.sessionId, onTerminalEvent)
      : await (async () => {
          await api.close(pane.sessionId).catch(() => undefined);
          return (await api.open({ cols: 80, rows: 24 }, onTerminalEvent)).sessionId;
        })();
    useTerminalStore
      .getState()
      .replaceSession(session.id, pane.sessionId, nextSessionId);
  }, [api, onTerminalEvent, restartSession, session]);

  const closeActivePane = useCallback(async () => {
    if (!session || !activeSessionId) return;
    const pane = findPane(session.root, session.activePaneId);
    if (!pane) return;
    await api.close(pane.sessionId);
    closePane(activeSessionId, pane.paneId);
    if (useTerminalStore.getState().sessionOrder.length === 0) onEmpty();
  }, [activeSessionId, api, closePane, onEmpty, session]);

  // ⌘I / Ctrl+I toggles AI mode (matches the design prototype).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === "i" || event.key === "I")) {
        event.preventDefault();
        setAiOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!session) return null;

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-black text-[#f2f2f2]" aria-label={session.title}>
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="absolute right-3 top-2.5 z-10 flex items-center gap-1.5 rounded-[10px] border border-white/10 bg-[rgb(22_23_24/0.82)] p-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.25)] backdrop-blur-md" aria-label="Terminal actions">
            <Button type="button" aria-pressed={aiOpen} aria-label="Toggle AI mode (⌘I)" title="Toggle AI mode  (⌘I)" className={`h-[30px] gap-1.5 px-2.5 text-[12px] font-medium tracking-tight ${aiOpen ? "bg-acid-lime text-void hover:brightness-105" : "bg-transparent text-mist hover:bg-white/10"}`} onClick={() => setAiOpen((open) => !open)}>
              <Sparkles size={15} /> AI
            </Button>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-white/10" />
            {terminalSearchOpen ? (
              <label className="flex items-center gap-1.5 px-1.5 text-[#b7bdd0]">
                <span className="sr-only">Search terminal</span>
                <input
                  autoFocus
                  type="search"
                  value={searchQuery}
                  placeholder="Search terminal"
                  className="h-[30px] w-[140px] rounded-md border border-white/10 bg-transparent px-2 text-[13px] text-white outline-hidden placeholder:text-[#b7bdd0]/70"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter")
                      runtimeRegistry.get(session.activePaneId)?.find(searchQuery);
                    else if (event.key === "Escape") onTerminalSearchChange(false);
                  }}
                />
              </label>
            ) : null}
            {session.status === "exited" || session.status === "error" ? (
              <Button type="button" variant="ghost" size="icon" aria-label="Restart terminal" className="h-[30px] w-[30px] text-[#b7bdd0] hover:bg-white/10 hover:text-white" onClick={() => void restart()}>
                <RotateCcw size={16} />
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="icon" aria-label="Split right" className="h-[30px] w-[30px] text-[#b7bdd0] hover:bg-white/10 hover:text-white" onClick={() => void split("vertical")}>
              <Columns2 size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Split down" className="h-[30px] w-[30px] text-[#b7bdd0] hover:bg-white/10 hover:text-white" onClick={() => void split("horizontal")}>
              <Rows2 size={16} />
            </Button>
            <label className="flex items-center gap-1.5 px-1.5 text-[#b7bdd0]">
              <SlidersHorizontal size={15} />
              <span className="sr-only">Terminal theme</span>
              <Select value={themeId} onValueChange={(value) => onThemeChange(value)}>
                <SelectTrigger className="h-[30px] max-w-[116px] gap-1.5 border-white/10 bg-transparent px-2 text-[#b7bdd0]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {terminalThemes.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Toggle commands"
              data-active={commandDrawerOpen || undefined}
              className="h-[30px] w-[30px] text-[#b7bdd0] hover:bg-white/10 hover:text-white"
              onClick={() => onCommandDrawerChange(!commandDrawerOpen)}
            >
              <PanelRightOpen size={16} />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Close active pane" className="h-[30px] w-[30px] text-[#b7bdd0] hover:bg-white/10 hover:text-white" onClick={() => void closeActivePane()}>
              <X size={16} />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="terminal-workspace-panes min-w-0 flex-1">
              <SplitTree
                api={api}
                eventBus={eventBus}
                node={session.root}
                workspaceId={session.id}
                activePaneId={session.activePaneId}
                runtimeFactory={runtimeFactory}
                resizeObserverFactory={resizeObserverFactory}
                themeId={themeId}
                setActivePane={setActivePane}
                updateSplitRatio={updateSplitRatio}
                runtimeRegistry={runtimeRegistry}
                runtimeOptions={runtimeOptions}
                rightClickPaste={terminalPreferences.rightClickPaste}
              />
            </div>
            {commandDrawerOpen ? (
              <CommandDrawer focusSearch={focusCommandSearch} onRun={runCommandSnippet} />
            ) : null}
          </div>
        </div>
        {aiOpen ? (
          <AiAssistantPanel
            onClose={() => setAiOpen(false)}
            providerApi={aiConfigApi}
            sshSessionId={(() => {
              const activePane = findPane(session.root, session.activePaneId);
              return activePane && isSshSession?.(activePane.sessionId)
                ? activePane.sessionId
                : undefined;
            })()}
          />
        ) : null}
      </div>
    </section>
  );
}

type SplitTreeProps = {
  node: SplitNode;
  workspaceId: string;
  activePaneId: string;
  api: TerminalApi;
  eventBus: TerminalEventBus;
  runtimeFactory?: TerminalRuntimeFactory;
  resizeObserverFactory?: ResizeObserverFactory;
  themeId: string;
  setActivePane: (workspaceId: string, paneId: string) => void;
  updateSplitRatio: (workspaceId: string, splitId: string, ratio: number) => void;
  runtimeRegistry: TerminalRuntimeRegistry;
  runtimeOptions: TerminalRuntimeOptions;
  rightClickPaste: boolean;
};

type SplitSeparatorProps = {
  direction: "horizontal" | "vertical";
  ratio: number;
  splitId: string;
  workspaceId: string;
  updateSplitRatio: (
    workspaceId: string,
    splitId: string,
    ratio: number,
  ) => void;
};

function SplitSeparator({
  direction,
  ratio,
  splitId,
  workspaceId,
  updateSplitRatio,
}: SplitSeparatorProps) {
  const activePointerId = useRef<number | null>(null);
  const activeMouseSplit = useRef<HTMLElement | null>(null);

  const resizeFromPoint = useCallback(
    (split: HTMLElement, clientX: number, clientY: number) => {
      const bounds = split.getBoundingClientRect();
      const size = direction === "vertical" ? bounds.width : bounds.height;
      if (size <= 0) return;
      const offset =
        direction === "vertical"
          ? clientX - bounds.left
          : clientY - bounds.top;
      if (!Number.isFinite(offset)) return;
      updateSplitRatio(workspaceId, splitId, offset / size);
    },
    [direction, splitId, updateSplitRatio, workspaceId],
  );

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!activeMouseSplit.current) return;
      resizeFromPoint(activeMouseSplit.current, event.clientX, event.clientY);
    };
    const onMouseUp = () => {
      activeMouseSplit.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizeFromPoint]);

  const stopDragging = (element: HTMLButtonElement, pointerId: number) => {
    if (activePointerId.current !== pointerId) return;
    activePointerId.current = null;
    if (element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture?.(pointerId);
    }
  };

  return (
    <button
      type="button"
      className="terminal-split__separator"
      role="separator"
      aria-label="Resize split"
      aria-orientation={direction === "vertical" ? "vertical" : "horizontal"}
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(ratio * 100)}
      style={
        direction === "vertical"
          ? { left: `calc(${ratio * 100}% - 3px)` }
          : { top: `calc(${ratio * 100}% - 3px)` }
      }
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        event.preventDefault();
        activePointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (activePointerId.current !== event.pointerId) return;
        const split = event.currentTarget.parentElement;
        if (!split) return;
        resizeFromPoint(split, event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        stopDragging(event.currentTarget, event.pointerId);
      }}
      onPointerCancel={(event) => {
        stopDragging(event.currentTarget, event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        if (activePointerId.current === event.pointerId) {
          activePointerId.current = null;
        }
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        activeMouseSplit.current = event.currentTarget.parentElement;
      }}
      onKeyDown={(event) => {
        const delta =
          event.key === "ArrowRight" || event.key === "ArrowDown"
            ? 0.05
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? -0.05
              : 0;
        if (!delta) return;
        event.preventDefault();
        updateSplitRatio(workspaceId, splitId, ratio + delta);
      }}
    />
  );
}

function SplitTree(props: SplitTreeProps) {
  const { node } = props;
  if (node.type === "pane") {
    return (
      <div
        className="terminal-leaf"
        data-active={props.activePaneId === node.paneId || undefined}
        onMouseDown={() => props.setActivePane(props.workspaceId, node.paneId)}
      >
        <TerminalPane
          api={props.api}
          eventBus={props.eventBus}
          paneId={node.paneId}
          resizeObserverFactory={props.resizeObserverFactory}
          runtimeFactory={props.runtimeFactory}
          runtimeRegistry={props.runtimeRegistry}
          sessionId={node.sessionId}
          themeId={props.themeId}
          runtimeOptions={props.runtimeOptions}
          rightClickPaste={props.rightClickPaste}
        />
      </div>
    );
  }

  const style =
    node.direction === "vertical"
      ? { gridTemplateColumns: `${node.ratio}fr ${(1 - node.ratio).toFixed(3)}fr` }
      : { gridTemplateRows: `${node.ratio}fr ${(1 - node.ratio).toFixed(3)}fr` };
  return (
    <div className={`terminal-split terminal-split--${node.direction}`} style={style}>
      <SplitTree {...props} node={node.first} />
      <SplitSeparator
        direction={node.direction}
        ratio={node.ratio}
        splitId={node.id}
        workspaceId={props.workspaceId}
        updateSplitRatio={props.updateSplitRatio}
      />
      <SplitTree {...props} node={node.second} />
    </div>
  );
}
