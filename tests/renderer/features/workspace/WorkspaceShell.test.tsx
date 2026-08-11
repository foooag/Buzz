import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";

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
});
