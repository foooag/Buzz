import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import {
  recordConnectionAttempt,
  markConnectionConnected,
} from "@/features/workspace/connectionHistory";

describe("WorkspaceShell", () => {
  it("relies on native window controls instead of rendering a duplicate set", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/servers"]}>
        <WorkspaceShell>
          <div>Workspace content</div>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    expect(container.querySelector("aside > [aria-hidden='true']")).toBeNull();
    expect(screen.getByRole("button", { name: "Preferences" })).toBeVisible();
  });

  it("invokes onOpenSession with the recent entry when a connected row is clicked", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    const historyId = recordConnectionAttempt({
      hostId: "host-1",
      host: "10.0.0.5",
      port: 22,
      username: "deploy",
    });
    markConnectionConnected(historyId, "live-session-1");

    const onOpenSession = vi.fn();
    render(
      <MemoryRouter initialEntries={["/servers"]}>
        <WorkspaceShell onOpenSession={onOpenSession}>
          <div>Workspace content</div>
        </WorkspaceShell>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /10\.0\.0\.5/ }));

    expect(onOpenSession).toHaveBeenCalledTimes(1);
    expect(onOpenSession.mock.calls[0][0]).toMatchObject({
      id: historyId,
      sessionId: "live-session-1",
      host: "10.0.0.5",
    });
  });
});
