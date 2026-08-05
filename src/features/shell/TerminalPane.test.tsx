import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerminalApi } from "./terminalApi";
import { TerminalPane } from "./TerminalPane";
import {
  createTerminalEventBus,
  type ResizeObserverFactory,
  type TerminalRuntime,
  type TerminalRuntimeFactory,
} from "./terminalRuntime";

function createHarness() {
  let dataListener: (data: string) => void = () => undefined;
  let resizeListener: ResizeObserverCallback = () => undefined;
  const dataSubscription = { dispose: vi.fn() };
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  const runtime: TerminalRuntime = {
    open: vi.fn(),
    write: vi.fn(),
    fit: vi.fn(),
    focus: vi.fn(),
    clear: vi.fn(),
    find: vi.fn(),
    hasSelection: vi.fn(() => false),
    getSelection: vi.fn(() => ""),
    paste: vi.fn(),
    selectAll: vi.fn(),
    setTheme: vi.fn(),
    setOptions: vi.fn(),
    dimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
    onData: vi.fn((listener) => {
      dataListener = listener;
      return dataSubscription;
    }),
    dispose: vi.fn(),
  };
  const runtimeFactory: TerminalRuntimeFactory = vi.fn(() => runtime);
  const resizeObserverFactory: ResizeObserverFactory = vi.fn((listener) => {
    resizeListener = listener;
    return observer;
  });
  const api: TerminalApi = {
    open: vi.fn(),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };

  return {
    api,
    dataSubscription,
    emitData: (data: string) => dataListener(data),
    eventBus: createTerminalEventBus(),
    observer,
    resize: () => resizeListener([], observer as unknown as ResizeObserver),
    resizeObserverFactory,
    runtime,
    runtimeFactory,
  };
}

describe("TerminalPane", () => {
  it("streams native bytes to xterm and xterm input to the PTY", async () => {
    const harness = createHarness();
    render(
      <TerminalPane
        paneId="pane-1"
        sessionId="session-1"
        api={harness.api}
        eventBus={harness.eventBus}
        runtimeFactory={harness.runtimeFactory}
        resizeObserverFactory={harness.resizeObserverFactory}
        themeId="pro"
      />,
    );

    act(() => {
      harness.eventBus.emit({
        type: "output",
        sessionId: "session-1",
        data: [65, 66],
      });
      harness.emitData("ls");
    });

    expect(harness.runtime.write).toHaveBeenCalledWith(
      new Uint8Array([65, 66]),
    );
    await waitFor(() =>
      expect(harness.api.write).toHaveBeenCalledWith(
        "session-1",
        new TextEncoder().encode("ls"),
      ),
    );
  });

  it("replays output that arrives before xterm mounts", () => {
    const harness = createHarness();
    harness.eventBus.emit({
      type: "output",
      sessionId: "session-1",
      data: [80, 82, 79, 77, 80, 84],
    });

    render(
      <TerminalPane
        paneId="pane-1"
        sessionId="session-1"
        api={harness.api}
        eventBus={harness.eventBus}
        runtimeFactory={harness.runtimeFactory}
        resizeObserverFactory={harness.resizeObserverFactory}
        themeId="pro"
      />,
    );

    expect(harness.runtime.write).toHaveBeenCalledWith(
      new Uint8Array([80, 82, 79, 77, 80, 84]),
    );
  });

  it("fits and sends only changed dimensions after resize", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    render(
      <TerminalPane
        paneId="pane-1"
        sessionId="session-1"
        api={harness.api}
        eventBus={harness.eventBus}
        runtimeFactory={harness.runtimeFactory}
        resizeObserverFactory={harness.resizeObserverFactory}
        themeId="pro"
      />,
    );

    act(() => {
      harness.resize();
      harness.resize();
      vi.advanceTimersByTime(50);
    });

    expect(harness.runtime.fit).toHaveBeenCalledTimes(2);
    expect(harness.api.resize).toHaveBeenCalledTimes(1);
    expect(harness.api.resize).toHaveBeenCalledWith("session-1", {
      cols: 80,
      rows: 24,
    });
    vi.useRealTimers();
  });

  it("updates theme in place and disposes every runtime resource", () => {
    const harness = createHarness();
    const view = render(
      <TerminalPane
        paneId="pane-1"
        sessionId="session-1"
        api={harness.api}
        eventBus={harness.eventBus}
        runtimeFactory={harness.runtimeFactory}
        resizeObserverFactory={harness.resizeObserverFactory}
        themeId="pro"
      />,
    );

    view.rerender(
      <TerminalPane
        paneId="pane-1"
        sessionId="session-1"
        api={harness.api}
        eventBus={harness.eventBus}
        runtimeFactory={harness.runtimeFactory}
        resizeObserverFactory={harness.resizeObserverFactory}
        themeId="solarized-dark"
      />,
    );
    expect(harness.runtime.setTheme).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(harness.observer.disconnect).toHaveBeenCalledOnce();
    expect(harness.dataSubscription.dispose).toHaveBeenCalledOnce();
    expect(harness.runtime.dispose).toHaveBeenCalledOnce();
  });
});
