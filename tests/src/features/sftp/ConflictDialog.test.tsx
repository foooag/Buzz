import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConflictDialog } from "@/features/sftp/ConflictDialog";

describe("ConflictDialog", () => {
  it("shows the target name and reports apply-to-all overwrite", async () => {
    const onResolve = vi.fn();
    render(<ConflictDialog open transferId="t1" itemId="i1" targetName="report.csv" onResolve={onResolve} />);
    expect(screen.getByText("report.csv")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /overwrite/i }));
    await userEvent.click(screen.getByRole("button", { name: /apply to all/i }));
    expect(onResolve).toHaveBeenCalledWith("t1", "i1", { resolution: "applyToAll", applyToAll: "overwrite" });
  });
});
