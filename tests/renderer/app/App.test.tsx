import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import type { TerminalApi } from "@/features/shell/terminalApi";
import type { SshApi } from "@/features/ssh/sshApi";
import type { InventoryApi } from "@/features/inventory/inventoryApi";
import {
  recordConnectionAttempt,
  markConnectionConnected,
} from "@/features/workspace/connectionHistory";
import { useTerminalStore } from "@/features/shell/terminalStore";
import { createPaneNode } from "@/features/shell/terminalTree";

describe("Termius-compatible application shell", () => {
  it("opens on Servers with the observed primary navigation and quick connect", async () => {
    render(<App />);

    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Servers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "SFTP" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Port Forwarding" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Servers" })).toBeVisible();
    const quickConnect = await screen.findByRole("textbox", {
      name: "Find a host or enter an SSH command",
    });
    expect(quickConnect).toHaveAttribute(
      "placeholder",
      "Search servers or connect directly — try “ssh deploy@10.0.0.20”",
    );
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("switches destinations without losing the desktop shell", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: "SFTP" }));

    expect(screen.getByRole("heading", { name: /^SFTP$/ })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(screen.getByRole("link", { name: "SFTP" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("activates the live session and routes to /terminal when a connected Recent row is clicked", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    useTerminalStore.setState({
      sessions: {},
      sessionOrder: [],
      activeSessionId: null,
    });

    const api: TerminalApi = {
      open: vi.fn().mockResolvedValue({ sessionId: "ssh-1", title: "deploy@host" }),
      close: vi.fn().mockResolvedValue(undefined),
      write: vi.fn(),
      resize: vi.fn(),
    } as unknown as TerminalApi;
    const ssh: SshApi = {
      open: vi.fn().mockResolvedValue({ sessionId: "ssh-1", title: "deploy@host" }),
      reconnect: vi.fn(),
    } as unknown as SshApi;
    const inventory: InventoryApi = {
      listHosts: vi.fn().mockResolvedValue([]),
    } as unknown as InventoryApi;

    // Seed a live workspace whose id equals the history entry's sessionId,
    // mirroring the real SSH-open flow (onSshOpened + markConnectionConnected).
    const paneId = "pane-ssh-1";
    useTerminalStore.getState().addSession({
      id: "ssh-1",
      title: "deploy@host",
      status: "connected",
      root: createPaneNode(paneId, "ssh-1"),
      activePaneId: paneId,
    });
    const historyId = recordConnectionAttempt({
      hostId: "host-1",
      host: "10.0.0.5",
      port: 22,
      username: "deploy",
    });
    markConnectionConnected(historyId, "ssh-1");

    render(<App api={api} ssh={ssh} inventory={inventory} />);

    await user.click(screen.getByRole("button", { name: /10\.0\.0\.5/ }));

    expect(useTerminalStore.getState().activeSessionId).toBe("ssh-1");
    expect(window.location.hash).toContain("/terminal");
  });

  it("falls back to /history when the Recent row has no live session", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    useTerminalStore.setState({
      sessions: {},
      sessionOrder: [],
      activeSessionId: null,
    });

    const api: TerminalApi = {
      open: vi.fn().mockResolvedValue({ sessionId: "gone", title: "deploy@host" }),
      close: vi.fn().mockResolvedValue(undefined),
      write: vi.fn(),
      resize: vi.fn(),
    } as unknown as TerminalApi;
    const ssh: SshApi = {
      open: vi.fn().mockResolvedValue({ sessionId: "gone", title: "deploy@host" }),
      reconnect: vi.fn(),
    } as unknown as SshApi;
    const inventory: InventoryApi = {
      listHosts: vi.fn().mockResolvedValue([]),
    } as unknown as InventoryApi;

    // History entry with a sessionId that is NOT present as a live workspace.
    const historyId = recordConnectionAttempt({
      hostId: "host-2",
      host: "10.0.0.9",
      port: 22,
      username: "deploy",
    });
    markConnectionConnected(historyId, "gone");

    render(<App api={api} ssh={ssh} inventory={inventory} />);

    await user.click(screen.getByRole("button", { name: /10\.0\.0\.9/ }));

    expect(window.location.hash).toContain("/history");
    expect(useTerminalStore.getState().activeSessionId).not.toBe("gone");
  });
});
