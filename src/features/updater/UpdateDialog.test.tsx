import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UpdateDialog } from "./UpdateDialog";
import type { UpdaterApi } from "./updaterApi";

describe("UpdateDialog", () => {
  it("checks on startup, installs the accepted update, and relaunches", async () => {
    const relaunch = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const downloadAndInstall = vi.fn(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 40 } });
      onEvent({ event: "Progress", data: { chunkLength: 60 } });
      onEvent({ event: "Finished" });
    });
    const api: UpdaterApi = {
      check: vi.fn(async () => ({
        version: "0.2.0",
        body: "Security and reliability fixes.",
        close,
        downloadAndInstall,
      })),
      relaunch,
    };
    const user = userEvent.setup();

    render(
      <StrictMode>
        <UpdateDialog api={api} />
      </StrictMode>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Buzz update available · 0.2.0",
      }),
    ).toBeVisible();
    expect(screen.getByText("Security and reliability fixes.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Update now" }));

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalledOnce());
    await waitFor(() => expect(relaunch).toHaveBeenCalledOnce());
    expect(api.check).toHaveBeenCalledOnce();
  });

  it("keeps startup silent when no update is available", async () => {
    const api: UpdaterApi = {
      check: vi.fn(async () => null),
      relaunch: vi.fn(),
    };

    render(<UpdateDialog api={api} />);

    await waitFor(() => expect(api.check).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
