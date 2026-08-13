import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal, type IDisposable, type ITheme } from "@xterm/xterm";
import type { SessionId, TerminalEvent, TerminalSize } from "./terminalTypes";

export type TerminalRuntimeOptions = {
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  terminalBell: boolean;
  optionAsMeta: boolean;
};

export type TerminalRuntime = {
  open: (container: HTMLElement) => void;
  write: (data: Uint8Array) => void;
  // Returns the dimensions after fitting, or undefined when nothing changed.
  // Callers use this to decide whether the host PTY needs a resize (FitAddon
  // itself never notifies the host).
  fit: () => TerminalSize | undefined;
  focus: () => void;
  clear: () => void;
  find: (query: string) => boolean;
  hasSelection: () => boolean;
  getSelection: () => string;
  paste: (data: string) => void;
  selectAll: () => void;
  setTheme: (theme: Readonly<ITheme>) => void;
  setOptions: (options: TerminalRuntimeOptions) => void;
  dimensions: () => TerminalSize;
  onData: (listener: (data: string) => void) => IDisposable;
  dispose: () => void;
};

export type TerminalRuntimeFactory = (
  theme: Readonly<ITheme>,
  options?: TerminalRuntimeOptions,
) => TerminalRuntime;

export type ResizeObserverHandle = Pick<ResizeObserver, "observe" | "disconnect">;
export type ResizeObserverFactory = (
  callback: ResizeObserverCallback,
) => ResizeObserverHandle;

export type TerminalEventBus = {
  emit: (event: TerminalEvent) => void;
  subscribe: (
    sessionId: SessionId,
    listener: (event: TerminalEvent) => void,
  ) => () => void;
};

export type TerminalRuntimeRegistry = {
  register: (paneId: string, runtime: TerminalRuntime) => () => void;
  get: (paneId: string) => TerminalRuntime | undefined;
};

export function createTerminalRuntimeRegistry(): TerminalRuntimeRegistry {
  const runtimes = new Map<string, TerminalRuntime>();
  return {
    register(paneId, runtime) {
      runtimes.set(paneId, runtime);
      return () => {
        if (runtimes.get(paneId) === runtime) runtimes.delete(paneId);
      };
    },
    get: (paneId) => runtimes.get(paneId),
  };
}

export function createTerminalEventBus(): TerminalEventBus {
  const listeners = new Map<SessionId, Set<(event: TerminalEvent) => void>>();
  const pending = new Map<SessionId, TerminalEvent[]>();
  return {
    emit(event) {
      const sessionListeners = listeners.get(event.sessionId);
      if (sessionListeners?.size) {
        sessionListeners.forEach((listener) => listener(event));
      } else {
        const events = pending.get(event.sessionId) ?? [];
        events.push(event);
        pending.set(event.sessionId, events.slice(-256));
      }
    },
    subscribe(sessionId, listener) {
      const sessionListeners = listeners.get(sessionId) ?? new Set();
      sessionListeners.add(listener);
      listeners.set(sessionId, sessionListeners);
      const queued = pending.get(sessionId);
      if (queued) {
        pending.delete(sessionId);
        queued.forEach(listener);
      }
      return () => {
        sessionListeners.delete(listener);
        if (sessionListeners.size === 0) listeners.delete(sessionId);
      };
    },
  };
}

export const terminalEventBus = createTerminalEventBus();
export const terminalRuntimeRegistry = createTerminalRuntimeRegistry();

export const createResizeObserver: ResizeObserverFactory = (callback) =>
  new ResizeObserver(callback);

const defaultRuntimeOptions: TerminalRuntimeOptions = {
  fontFamily:
    '"Source Code Pro", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  scrollback: 10_000,
  terminalBell: false,
  optionAsMeta: true,
};

export const createXtermRuntime: TerminalRuntimeFactory = (
  theme,
  options = defaultRuntimeOptions,
) => {
  let bellEnabled = options.terminalBell;
  let openedContainer: HTMLElement | null = null;
  const terminal = new Terminal({
    allowProposedApi: false,
    convertEol: false,
    cursorBlink: true,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    macOptionIsMeta: options.optionAsMeta,
    scrollback: options.scrollback,
    theme: { ...theme },
  });
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  const webLinksAddon = new WebLinksAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(webLinksAddon);
  const bellSubscription = terminal.onBell(() => {
    if (!bellEnabled || !openedContainer) return;
    openedContainer.animate(
      [{ opacity: 1 }, { opacity: 0.72 }, { opacity: 1 }],
      { duration: 180, easing: "ease-out" },
    );
  });
  const fit = (): TerminalSize | undefined => {
    if (!openedContainer || openedContainer.closest("[hidden]"))
      return undefined;
    const bounds = openedContainer.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return undefined;
    const before = { cols: terminal.cols, rows: terminal.rows };
    fitAddon.fit();
    if (terminal.cols === before.cols && terminal.rows === before.rows)
      return undefined;
    return { cols: terminal.cols, rows: terminal.rows };
  };

  return {
    open: (container) => {
      openedContainer = container;
      terminal.open(container);
    },
    write: (data) => terminal.write(data),
    fit,
    focus: () => terminal.focus(),
    clear: () => terminal.clear(),
    find: (query) => searchAddon.findNext(query),
    hasSelection: () => terminal.hasSelection(),
    getSelection: () => terminal.getSelection(),
    paste: (data) => terminal.paste(data),
    selectAll: () => terminal.selectAll(),
    setTheme: (nextTheme) => {
      terminal.options.theme = { ...nextTheme };
    },
    setOptions: (nextOptions) => {
      bellEnabled = nextOptions.terminalBell;
      terminal.options.fontFamily = nextOptions.fontFamily;
      terminal.options.fontSize = nextOptions.fontSize;
      terminal.options.macOptionIsMeta = nextOptions.optionAsMeta;
      terminal.options.scrollback = nextOptions.scrollback;
      fit();
    },
    dimensions: () => ({ cols: terminal.cols, rows: terminal.rows }),
    onData: (listener) => terminal.onData(listener),
    dispose: () => {
      bellSubscription.dispose();
      terminal.dispose();
    },
  };
};
