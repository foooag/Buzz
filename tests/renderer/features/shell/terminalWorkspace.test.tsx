import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import type { TerminalApi } from "@/features/shell/terminalApi";
import {
  type ResizeObserverFactory,
  type TerminalRuntime,
  type TerminalRuntimeFactory,
} from "@/features/shell/terminalRuntime";
import { resetTerminalStore } from "@/features/shell/terminalStore";
import type { TerminalEvent } from "@/features/shell/terminalTypes";

function createHarness() {
  let nextSession = 1;
  const eventHandlers = new Map<string, (event: TerminalEvent) => void>();
  const api: TerminalApi = {
    open: vi.fn(async (_size, onEvent) => {
      const current = nextSession++;
      eventHandlers.set(`session-${current}`, onEvent);
      return {
        sessionId: `session-${current}`,
        title: `Local Terminal ${current}`,
      };
    }),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  type HarnessRuntime = TerminalRuntime & {
    hasSelection: ReturnType<typeof vi.fn>;
    getSelection: ReturnType<typeof vi.fn>;
    paste: ReturnType<typeof vi.fn>;
    selectAll: ReturnType<typeof vi.fn>;
  };
  const runtimes: HarnessRuntime[] = [];
  const runtimeFactory: TerminalRuntimeFactory = vi.fn(() => {
    const runtime: HarnessRuntime = {
      open: vi.fn(),
      write: vi.fn(),
      fit: vi.fn(),
      focus: vi.fn(),
      clear: vi.fn(),
      find: vi.fn(() => false),
      hasSelection: vi.fn(() => true),
      getSelection: vi.fn(() => "selected text"),
      paste: vi.fn(),
      selectAll: vi.fn(),
      setTheme: vi.fn(),
      setOptions: vi.fn(),
      dimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    };
    runtimes.push(runtime);
    return runtime;
  });
  const resizeObserverFactory: ResizeObserverFactory = () => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
  });
  return {
    api,
    emit: (event: TerminalEvent) => eventHandlers.get(event.sessionId)?.(event),
    resizeObserverFactory,
    runtimeFactory,
    runtimes,
  };
}

function mockElementRect(
  element: Element,
  { width, height }: { width: number; height: number },
) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

function firePointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  {
    clientX = 0,
    clientY = 0,
    pointerId,
  }: { clientX?: number; clientY?: number; pointerId: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  fireEvent(element, event);
}

describe("Termius-compatible terminal workspace", () => {
  beforeEach(() => {
    resetTerminalStore();
    localStorage.clear();
  });

  it("opens local terminals as active sidebar session rows", async () => {
    const harness = createHarness();
    render(<App {...harness} />);

    fireEvent.keyDown(document, { key: "l", metaKey: true });
    const first = await screen.findByRole("button", {
      name: "Local Terminal 1",
    });
    expect(first).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Sessions" })).toContainElement(
      first,
    );
    expect(screen.getAllByTestId("terminal-pane")).toHaveLength(1);

    fireEvent.keyDown(document, { key: "l", metaKey: true });
    const second = await screen.findByRole("button", {
      name: "Local Terminal 2",
    });
    expect(second).toHaveAttribute("aria-current", "page");
    fireEvent.keyDown(document, { key: "1", metaKey: true });
    expect(first).toHaveAttribute("aria-current", "page");
  });

  it("keeps both sessions' terminals mounted (no black screen) when switching", async () => {
    const harness = createHarness();
    render(<App {...harness} />);

    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 2" });

    // Both sessions' panes stay mounted simultaneously (keep-alive), rather
    // than the inactive one being unmounted — which is what caused the
    // black-screen-after-switch bug.
    const panes = screen.getAllByTestId("terminal-pane");
    expect(panes).toHaveLength(2);
    // Only the active session's pane is visible; the hidden one is display:none.
    expect(panes[0]).not.toBeVisible();
    expect(panes[1]).toBeVisible();

    // Switch back to session 1.
    fireEvent.keyDown(document, { key: "1", metaKey: true });
    expect(panes[0]).toBeVisible();
    expect(panes[1]).not.toBeVisible();

    // Switching must not have disposed the first session's xterm runtime —
    // disposal destroyed the scrollback and produced the empty black terminal.
    expect(harness.runtimes[0]?.dispose).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("terminal-pane")).toHaveLength(2);
  });

  it("resizes the host PTY when switching back to a session whose size changed", async () => {
    const harness = createHarness();
    render(<App {...harness} />);

    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 2" });

    // While session 1 is hidden its PTY keeps the cols it was opened with. Make
    // the refit on re-activation report a different size so we can assert the
    // host is notified; otherwise the remote shell wraps to the stale width.
    const firstRuntime = harness.runtimes[0];
    (harness.api.resize as ReturnType<typeof vi.fn>).mockClear();
    firstRuntime.fit = vi.fn(() => ({ cols: 118, rows: 30 }));

    fireEvent.keyDown(document, { key: "1", metaKey: true });
    await waitFor(() =>
      expect(harness.api.resize).toHaveBeenCalledWith("session-1", {
        cols: 118,
        rows: 30,
      }),
    );

    // When the refit finds no size change (undefined) the host is left alone.
    (harness.api.resize as ReturnType<typeof vi.fn>).mockClear();
    firstRuntime.fit = vi.fn(() => undefined);
    fireEvent.keyDown(document, { key: "2", metaKey: true });
    fireEvent.keyDown(document, { key: "1", metaKey: true });
    await waitFor(() => expect(firstRuntime.fit).toHaveBeenCalled());
    expect(harness.api.resize).not.toHaveBeenCalled();
  });

  it("creates an independent split and returns to Servers after final close", async () => {
    const harness = createHarness();
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });

    fireEvent.click(screen.getByRole("button", { name: "Split right" }));
    await waitFor(() =>
      expect(screen.getAllByTestId("terminal-pane")).toHaveLength(2),
    );
    expect(harness.api.open).toHaveBeenCalledTimes(2);
    const separator = screen.getByRole("separator", { name: "Resize split" });
    expect(separator).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "55");

    fireEvent.click(screen.getByRole("button", { name: "Close active pane" }));
    await waitFor(() =>
      expect(screen.getAllByTestId("terminal-pane")).toHaveLength(1),
    );
    fireEvent.keyDown(document, { key: "w", metaKey: true });
    await screen.findByRole("heading", { name: "Servers" });
    expect(screen.queryByRole("navigation", { name: "Sessions" })).not.toBeInTheDocument();
  });

  it("resizes vertical and horizontal splits by dragging their separators", async () => {
    const verticalHarness = createHarness();
    const verticalView = render(<App {...verticalHarness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });
    fireEvent.click(screen.getByRole("button", { name: "Split right" }));
    const verticalSeparator = await screen.findByRole("separator", {
      name: "Resize split",
    });
    expect(verticalSeparator).toHaveAttribute("aria-orientation", "vertical");
    mockElementRect(verticalSeparator.parentElement!, {
      width: 1000,
      height: 600,
    });

    fireEvent.mouseDown(verticalSeparator, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 700 });
    fireEvent.mouseUp(window, { clientX: 700 });
    expect(verticalSeparator).toHaveAttribute("aria-valuenow", "70");

    verticalView.unmount();
    resetTerminalStore();
    const horizontalHarness = createHarness();
    render(<App {...horizontalHarness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });
    fireEvent.click(screen.getByRole("button", { name: "Split down" }));
    const horizontalSeparator = await screen.findByRole("separator", {
      name: "Resize split",
    });
    expect(horizontalSeparator).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
    mockElementRect(horizontalSeparator.parentElement!, {
      width: 1000,
      height: 600,
    });

    firePointerEvent(horizontalSeparator, "pointerdown", {
      clientY: 300,
      pointerId: 2,
    });
    firePointerEvent(horizontalSeparator, "pointermove", {
      clientY: 180,
      pointerId: 2,
    });
    firePointerEvent(horizontalSeparator, "pointerup", {
      clientY: 180,
      pointerId: 2,
    });
    expect(horizontalSeparator).toHaveAttribute("aria-valuenow", "30");
  });

  it("toggles the command drawer and compact sidebar with Termius shortcuts", async () => {
    const harness = createHarness();
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });

    fireEvent.keyDown(document, { key: "s", metaKey: true });
    expect(screen.getByRole("complementary", { name: "Commands" })).toBeVisible();
    fireEvent.keyDown(document, { key: "b", altKey: true, shiftKey: true });
    expect(screen.getByTestId("workspace-shell")).toHaveAttribute(
      "data-sidebar-size",
      "compact",
    );
  });

  it("renders the AI composer in a right sidebar and restores terminal width when closed", async () => {
    const harness = createHarness();
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });

    const aiSidebar = screen.getByRole("complementary", {
      name: "AI Assistant",
    });
    expect(aiSidebar).toHaveAttribute("data-screen-label", "AI sidebar");
    expect(
      within(aiSidebar).getByPlaceholderText(
        "Describe what you want done on web-prod-01…",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Toggle AI mode (⌘I)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(
      within(aiSidebar).getByRole("button", { name: "Close AI sidebar" }),
    );
    expect(
      screen.queryByRole("complementary", { name: "AI Assistant" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle AI mode (⌘I)" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.keyDown(document, { key: "i", metaKey: true });
    expect(
      screen.getByRole("complementary", { name: "AI Assistant" }),
    ).toBeVisible();
  });

  it("clears scrollback and searches the focused terminal", async () => {
    const harness = createHarness();
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(harness.runtimes[0]?.clear).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "f", metaKey: true });
    const search = screen.getByRole("searchbox", { name: "Search terminal" });
    fireEvent.change(search, { target: { value: "needle" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(harness.runtimes[0]?.find).toHaveBeenCalledWith("needle");
  });

  it("matches terminal copy, interrupt, paste, and select-all semantics", async () => {
    const harness = createHarness();
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => "pasted text"),
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });

    fireEvent.keyDown(document, { key: "c", metaKey: true });
    await waitFor(() =>
      expect(clipboard.writeText).toHaveBeenCalledWith("selected text"),
    );

    harness.runtimes[0]?.hasSelection.mockReturnValue(false);
    fireEvent.keyDown(document, { key: "c", metaKey: true });
    await waitFor(() =>
      expect(harness.api.write).toHaveBeenCalledWith(
        "session-1",
        new Uint8Array([3]),
      ),
    );

    fireEvent.keyDown(document, { key: "v", metaKey: true });
    await waitFor(() =>
      expect(harness.runtimes[0]?.paste).toHaveBeenCalledWith("pasted text"),
    );
    fireEvent.keyDown(document, { key: "a", metaKey: true });
    expect(harness.runtimes[0]?.selectAll).toHaveBeenCalledOnce();
  });

  it("keeps scrollback visible and can restart an exited shell", async () => {
    const harness = createHarness();
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });

    harness.emit({
      type: "exit",
      sessionId: "session-1",
      exitCode: 1,
    });

    const restart = await screen.findByRole("button", {
      name: "Restart terminal",
    });
    expect(
      screen.getByRole("button", { name: "Local Terminal 1 (exited)" }),
    ).toBeVisible();
    fireEvent.click(restart);
    await waitFor(() => expect(harness.api.open).toHaveBeenCalledTimes(2));
    expect(harness.api.close).toHaveBeenCalledWith("session-1");
    expect(
      screen.getByRole("button", { name: "Local Terminal 1" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("exposes all observed themes and applies selection without replacing a session", async () => {
    const harness = createHarness();
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Terminal theme" }));
    expect(screen.getAllByRole("option")).toHaveLength(13);
    await user.click(screen.getByRole("option", { name: "Solarized Dark" }));

    expect(localStorage.getItem("terminus.terminalTheme")).toBe(
      "solarized-dark",
    );
    expect(harness.api.open).toHaveBeenCalledTimes(1);
    expect(harness.runtimes[0]?.setTheme).toHaveBeenLastCalledWith(
      expect.objectContaining({ background: "#002b36" }),
    );
  });

  it("supports keyboard session reordering and command-search focus", async () => {
    const harness = createHarness();
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    const first = await screen.findByRole("button", {
      name: "Local Terminal 1",
    });
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    const second = await screen.findByRole("button", {
      name: "Local Terminal 2",
    });

    second.focus();
    fireEvent.keyDown(second, { key: " " });
    fireEvent.keyDown(second, { key: "ArrowUp" });
    fireEvent.keyDown(second, { key: " " });
    expect(
      second.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "s", metaKey: true, shiftKey: true });
    expect(screen.getByRole("searchbox", { name: "Search commands" })).toHaveFocus();
  });

  it("creates, searches, runs, and deletes command snippets", async () => {
    const harness = createHarness();
    const user = userEvent.setup();
    render(<App {...harness} />);
    fireEvent.keyDown(document, { key: "l", metaKey: true });
    await screen.findByRole("button", { name: "Local Terminal 1" });
    fireEvent.keyDown(document, { key: "s", metaKey: true });

    await user.click(screen.getByRole("button", { name: "Add snippet" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "List files");
    await user.type(screen.getByRole("textbox", { name: "Command" }), "ls -la");
    await user.click(screen.getByRole("button", { name: "Save snippet" }));

    await user.click(screen.getByRole("button", { name: "Run List files" }));
    expect(harness.runtimes[0]?.paste).toHaveBeenCalledWith("ls -la\r");
    expect(harness.runtimes[0]?.focus).toHaveBeenCalled();

    await user.type(screen.getByRole("searchbox", { name: "Search commands" }), "missing");
    expect(screen.getByText("No matching snippets")).toBeVisible();
    await user.clear(screen.getByRole("searchbox", { name: "Search commands" }));
    await user.click(screen.getByRole("button", { name: "Delete List files" }));
    expect(screen.getByText("No snippets yet")).toBeVisible();
    expect(localStorage.getItem("terminus.commandSnippets")).toBe("[]");
  });
});
