import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmCard } from "../../../../src/renderer/features/agent/ConfirmCard";

describe("ConfirmCard", () => {
  it("shows the risk reason and approves once", async () => {
    const onDecide = vi.fn();
    render(
      <ConfirmCard
        confirmation={{
          confirmationId: "c1",
          level: "high",
          reason: "Command changes machine state.",
          projectedEffect: "Restarts a service",
        }}
        onDecide={onDecide}
      />,
    );

    expect(screen.getByText("Command changes machine state.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Approve once" }));
    expect(onDecide).toHaveBeenCalledWith(true);
  });
});
