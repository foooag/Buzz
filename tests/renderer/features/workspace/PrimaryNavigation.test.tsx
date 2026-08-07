import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrimaryNavigation } from "@/features/workspace/PrimaryNavigation";

describe("PrimaryNavigation", () => {
  it("offers the Agent destination alongside the workspace nav", async () => {
    const onChange = vi.fn();
    render(
      <PrimaryNavigation
        destination="servers"
        onDestinationChange={onChange}
      />,
    );
    const agentLink = screen.getByRole("link", { name: "Agent" });
    expect(agentLink).toBeVisible();
    await userEvent.click(agentLink);
    expect(onChange).toHaveBeenCalledWith("agent");
  });
});
