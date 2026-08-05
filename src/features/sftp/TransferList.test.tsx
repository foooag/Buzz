import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransferList } from "./TransferList";
import type { TransferView } from "./sftpStore";

describe("TransferList", () => {
  it("renders an empty state when there are no transfers", () => {
    render(<TransferList transfers={[]} />);
    expect(screen.getByTestId("sftp-transfer-list-empty")).toBeInTheDocument();
  });

  it("renders an in-progress transfer with a cancel control", () => {
    const inProgress: TransferView = {
      transferId: "t1",
      sessionId: "s1",
      direction: "upload",
      itemCount: 1,
      items: {
        i1: { itemId: "i1", transferred: 50, total: 100, status: "active" },
      },
    };
    render(<TransferList transfers={[inProgress]} />);
    expect(screen.getByTestId("sftp-transfer-row")).toBeInTheDocument();
    expect(screen.getByTestId("sftp-transfer-progress-text")).toHaveTextContent("0 done, 1 active");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("renders a completed transfer summary without a cancel control", () => {
    const completed: TransferView = {
      transferId: "t2",
      sessionId: "s1",
      direction: "download",
      itemCount: 2,
      items: {
        i1: { itemId: "i1", transferred: 10, total: 10, status: "done" },
        i2: { itemId: "i2", transferred: 0, total: 4, status: "failed" },
      },
      summary: { succeeded: 1, failed: 1, skipped: 0 },
    };
    render(<TransferList transfers={[completed]} />);
    expect(screen.getByTestId("sftp-transfer-summary-text")).toHaveTextContent(
      "succeeded 1, failed 1, skipped 0",
    );
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });

  it("calls onCancelTransfer with the transfer id", async () => {
    const onCancel = vi.fn();
    const inProgress: TransferView = {
      transferId: "t3",
      sessionId: "s1",
      direction: "upload",
      itemCount: 1,
      items: { i1: { itemId: "i1", transferred: 1, total: 4, status: "active" } },
    };
    const user = userEvent.setup();
    render(<TransferList transfers={[inProgress]} onCancelTransfer={onCancel} />);
    await user.click(screen.getByRole("button", { name: /cancel upload transfer/i }));
    expect(onCancel).toHaveBeenCalledWith("t3");
  });
});
