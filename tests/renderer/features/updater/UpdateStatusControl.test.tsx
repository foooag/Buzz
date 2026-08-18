import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDeterministicUpdaterApi } from "@/features/updater/deterministicUpdaterApi";
import { UpdateStatusControl } from "@/features/updater/UpdateStatusControl";

describe("UpdateStatusControl", () => {
  it("checks silently and shows background download progress", async () => {
    const updater = createDeterministicUpdaterApi({
      update: { version: "0.2.0" },
      status: { phase: "downloading", version: "0.2.0", percent: 42 },
    });
    const check = vi.spyOn(updater.api, "check");

    render(<UpdateStatusControl api={updater.api} />);

    expect(
      await screen.findByRole("button", { name: "Downloading update 42%" }),
    ).toBeDisabled();
    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("changes to restart update after download and relaunches on click", async () => {
    const user = userEvent.setup();
    const updater = createDeterministicUpdaterApi({
      status: { phase: "downloading", version: "0.2.0", percent: 99 },
    });
    render(<UpdateStatusControl api={updater.api} />);
    await screen.findByRole("button", { name: "Downloading update 99%" });

    act(() => updater.setStatus({ phase: "ready", version: "0.2.0" }));
    await user.click(screen.getByRole("button", { name: "Restart to update" }));

    expect(updater.calls.relaunch).toBe(1);
  });

  it("restores the restart action when the install restart fails", async () => {
    const user = userEvent.setup();
    const updater = createDeterministicUpdaterApi({
      status: { phase: "ready", version: "0.2.0" },
      relaunchError: new Error("installer did not take over"),
    });
    render(<UpdateStatusControl api={updater.api} />);

    await user.click(
      await screen.findByRole("button", { name: "Restart to update" }),
    );
    expect(updater.calls.relaunch).toBe(1);

    // The button must leave the stuck "Restarting…" state and become retryable.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Restart to update" }),
      ).toBeEnabled(),
    );
  });

  it("opens the DMG on unsigned macOS builds and prompts for a manual drag", async () => {
    const user = userEvent.setup();
    const updater = createDeterministicUpdaterApi({
      status: { phase: "manual-downloading", version: "0.2.0", percent: 30 },
    });
    render(<UpdateStatusControl api={updater.api} />);
    expect(
      await screen.findByRole("button", { name: "Downloading installer 30%" }),
    ).toBeDisabled();

    act(() => updater.setStatus({ phase: "manual-ready", version: "0.2.0" }));
    await user.click(screen.getByRole("button", { name: "Open installer" }));
    expect(updater.calls.relaunch).toBe(1);

    expect(
      screen.getByRole("alertdialog", { name: "Update installer opened" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Drag Buzz into the Applications folder/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reopen installer" }));
    await waitFor(() => expect(updater.calls.relaunch).toBe(2));
    expect(
      screen.queryByRole("alertdialog", { name: "Update installer opened" }),
    ).not.toBeInTheDocument();
  });

  it("offers a retry when the silent download fails", async () => {
    const user = userEvent.setup();
    const updater = createDeterministicUpdaterApi({
      status: { phase: "error", version: "0.2.0" },
    });
    render(<UpdateStatusControl api={updater.api} />);

    await user.click(
      await screen.findByRole("button", { name: "Retry update download" }),
    );
    expect(updater.calls.retry).toBe(1);
  });
});
