import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmCard } from "@/features/agent/ConfirmCard";

describe("ConfirmCard", () => {
  it("shows the risk reason and approves on button click", async () => {
    const onResolve = vi.fn();
    render(
      <ConfirmCard
        confirmation={{
          confirmationId: "c1",
          level: "high",
          reason: "Runs a new container on a production host.",
          projectedEffect: "Starts shop on port 8080.",
          hostId: "h1",
          command: "docker run -d --name shop shop/app:1.4.2",
        }}
        onResolve={onResolve}
      />,
    );
    expect(screen.getByText(/Runs a new container/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Run command" }));
    expect(onResolve).toHaveBeenCalledWith(
      "run",
      "docker run -d --name shop shop/app:1.4.2",
    );
  });

  it("labels the action as edited when the command changes", async () => {
    const onResolve = vi.fn();
    render(
      <ConfirmCard
        confirmation={{
          confirmationId: "c1",
          level: "high",
          reason: "Destructive.",
          projectedEffect: "Deletes logs.",
          hostId: "h1",
          command: "rm -rf /var/log/old/*",
        }}
        onResolve={onResolve}
      />,
    );
    const input = screen.getByLabelText("Command to confirm");
    await userEvent.clear(input);
    await userEvent.type(input, "rm -rf /var/log/old/2025-01-01");
    expect(screen.getByRole("button", { name: "Run edited command" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Run edited command" }));
    expect(onResolve).toHaveBeenCalledWith(
      "run",
      "rm -rf /var/log/old/2025-01-01",
    );
  });
});
