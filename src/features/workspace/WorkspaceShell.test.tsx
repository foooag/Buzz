import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";

describe("WorkspaceShell", () => {
  it("relies on native window controls instead of rendering a duplicate set", () => {
    const { container } = render(
      <WorkspaceShell
        destination="servers"
        onDestinationChange={() => undefined}
      >
        <div>Workspace content</div>
      </WorkspaceShell>,
    );

    expect(container.querySelector("aside > [aria-hidden='true']")).toBeNull();
    expect(screen.getByRole("button", { name: "Preferences" })).toBeVisible();
  });
});
