import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PortForwardForm } from "./PortForwardForm";

describe("PortForwardForm", () => {
  it("submits a new local rule", async () => {
    const onSubmit = vi.fn();
    render(
      <PortForwardForm
        open
        hostId="h-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText(/bind port/i), "8080");
    await userEvent.type(
      screen.getByLabelText(/target host/i),
      "db.internal",
    );
    await userEvent.type(screen.getByLabelText(/target port/i), "5432");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        hostId: "h-1",
        kind: "local",
        bindHost: "127.0.0.1",
        bindPort: 8080,
        targetHost: "db.internal",
        targetPort: 5432,
      }),
    );
  });

  it("hides target fields for dynamic forwarding", async () => {
    render(
      <PortForwardForm
        open
        hostId="h-1"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    await userEvent.click(screen.getByLabelText(/kind/i));
    await userEvent.click(
      screen.getByRole("option", { name: /dynamic/i }),
    );
    expect(screen.queryByLabelText(/target host/i)).not.toBeInTheDocument();
  });

  it("rejects a zero bind port", async () => {
    const onSubmit = vi.fn();
    render(
      <PortForwardForm
        open
        hostId="h-1"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.type(screen.getByLabelText(/bind port/i), "0");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid port/i)).toBeInTheDocument();
  });

  it("preserves the id when editing an existing rule", async () => {
    const onSubmit = vi.fn();
    render(
      <PortForwardForm
        open
        hostId="h-1"
        initial={{
          id: "r-1",
          hostId: "h-1",
          kind: "local",
          bindHost: "127.0.0.1",
          bindPort: 8080,
          targetHost: "db.internal",
          targetPort: 5432,
          label: null,
          createdAt: "2026-07-30T00:00:00.000Z",
          updatedAt: "2026-07-30T00:00:00.000Z",
        }}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );
    const bindPort = screen.getByLabelText(/bind port/i);
    await userEvent.clear(bindPort);
    await userEvent.type(bindPort, "9090");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r-1", bindPort: 9090 }),
    );
  });
});
