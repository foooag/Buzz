import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";

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
});
