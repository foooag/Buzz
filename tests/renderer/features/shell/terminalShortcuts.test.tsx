import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useTerminalShortcuts,
  type TerminalShortcutActions,
} from "@/features/shell/terminalShortcuts";

function actions(): TerminalShortcutActions {
  return {
    openLocal: vi.fn(),
    openServers: vi.fn(),
    openPortForwarding: vi.fn(),
    closeActive: vi.fn(),
    activateIndex: vi.fn(),
    activateRelative: vi.fn(),
    toggleCommands: vi.fn(),
    toggleSidebar: vi.fn(),
    clearActive: vi.fn(),
    searchActive: vi.fn(),
    copyActive: vi.fn(),
    pasteActive: vi.fn(),
    selectAll: vi.fn(),
  };
}

function Harness({ shortcutActions }: { shortcutActions: TerminalShortcutActions }) {
  useTerminalShortcuts(shortcutActions);
  return (
    <div>
      <input aria-label="Editable field" />
      <button type="button">Terminal surface</button>
      <div className="terminal-pane">
        <textarea aria-label="Terminal input" />
      </div>
    </div>
  );
}

describe("terminal shortcuts", () => {
  it("leaves copy, paste, and select-all available inside editable fields", () => {
    const shortcutActions = actions();
    render(<Harness shortcutActions={shortcutActions} />);
    const input = screen.getByRole("textbox", { name: "Editable field" });

    expect(fireEvent.keyDown(input, { key: "v", metaKey: true })).toBe(true);
    fireEvent.keyDown(input, { key: "c", metaKey: true });
    fireEvent.keyDown(input, { key: "a", metaKey: true });

    expect(shortcutActions.pasteActive).not.toHaveBeenCalled();
    expect(shortcutActions.copyActive).not.toHaveBeenCalled();
    expect(shortcutActions.selectAll).not.toHaveBeenCalled();
  });

  it("still handles terminal paste outside editable controls", () => {
    const shortcutActions = actions();
    render(<Harness shortcutActions={shortcutActions} />);

    expect(
      fireEvent.keyDown(screen.getByRole("button", { name: "Terminal surface" }), {
        key: "v",
        metaKey: true,
      }),
    ).toBe(false);
    expect(shortcutActions.pasteActive).toHaveBeenCalledOnce();
  });

  it("handles app shortcuts from xterm's internal textarea", () => {
    const shortcutActions = actions();
    render(<Harness shortcutActions={shortcutActions} />);

    expect(
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Terminal input" }), {
        key: "w",
        metaKey: true,
      }),
    ).toBe(false);
    expect(shortcutActions.closeActive).toHaveBeenCalledOnce();
  });

  it("leaves copy available when browser text is selected", () => {
    const shortcutActions = actions();
    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected chat text",
    } as Selection);
    render(<Harness shortcutActions={shortcutActions} />);

    expect(
      fireEvent.keyDown(screen.getByRole("button", { name: "Terminal surface" }), {
        key: "c",
        metaKey: true,
      }),
    ).toBe(true);
    expect(shortcutActions.copyActive).not.toHaveBeenCalled();

    getSelection.mockRestore();
  });

  it("navigates to Servers and Port Forwarding with the documented shortcuts", () => {
    const shortcutActions = actions();
    render(<Harness shortcutActions={shortcutActions} />);
    const surface = screen.getByRole("button", { name: "Terminal surface" });

    fireEvent.keyDown(surface, { key: "t", metaKey: true });
    fireEvent.keyDown(surface, { key: "p", metaKey: true });

    expect(shortcutActions.openServers).toHaveBeenCalledOnce();
    expect(shortcutActions.openPortForwarding).toHaveBeenCalledOnce();
  });
});
