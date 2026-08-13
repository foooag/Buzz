import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoryDropdown } from "../../../../src/renderer/features/agent/HistoryDropdown";
import type { AiSessionSummary } from "../../../../src/renderer/features/ai/aiSessionApi";

const session: AiSessionSummary = {
  id: "session-1",
  title: "Check production hosts",
  providerConfigId: "provider-1",
  sshSessionId: "",
  messageCount: 4,
  lastStatus: "idle",
  encryptedBytes: 128,
  createdAt: "2026-08-10T08:00:00.000Z",
  updatedAt: "2026-08-11T08:00:00.000Z",
};

describe("HistoryDropdown", () => {
  it("loads an existing session and starts a new chat", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onNew = vi.fn();
    render(
      <HistoryDropdown
        sessions={[session]}
        activeId={null}
        onLoad={onLoad}
        onNew={onNew}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Chat history" }));
    await user.click(screen.getByText(session.title));
    expect(onLoad).toHaveBeenCalledWith(session.id);

    await user.click(screen.getByRole("button", { name: "Chat history" }));
    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("renames and deletes sessions from the history popover", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <HistoryDropdown
        sessions={[session]}
        activeId={session.id}
        onLoad={vi.fn()}
        onNew={vi.fn()}
        onDelete={onDelete}
        onRename={onRename}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Chat history" }));
    await user.click(screen.getByRole("button", { name: `Rename ${session.title}` }));
    const input = screen.getByRole("textbox", { name: "Rename Agent history" });
    await user.clear(input);
    await user.type(input, "Restart web fleet{Enter}");
    expect(onRename).toHaveBeenCalledWith(session.id, "Restart web fleet");
    expect(onRename).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: `Delete ${session.title}` }));
    expect(onDelete).toHaveBeenCalledWith(session.id);
  });
});
