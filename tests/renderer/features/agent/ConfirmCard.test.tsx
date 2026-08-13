import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmCard } from "../../../../src/renderer/features/agent/ConfirmCard";

describe("ConfirmCard", () => {
  it("shows the command, AI interpretation, and risk reason before approval", async () => {
    const onDecide = vi.fn();
    render(
      <ConfirmCard
        confirmation={{
          confirmationId: "c1",
          level: "high",
          command: "sudo systemctl restart nginx",
          reason: "Command changes machine state.",
          projectedEffect: "Restarts Nginx, briefly interrupting active connections.",
        }}
        onDecide={onDecide}
      />,
    );

    expect(screen.getByText("sudo systemctl restart nginx")).toBeVisible();
    expect(screen.getByText(
      "Restarts Nginx, briefly interrupting active connections.",
    )).toBeVisible();
    expect(screen.getByText("Command changes machine state.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Run command" }));
    expect(onDecide).toHaveBeenCalledWith(true);
  });
});
