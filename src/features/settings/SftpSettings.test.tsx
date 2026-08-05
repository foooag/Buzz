import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SftpSettings } from "./SftpSettings";

describe("SftpSettings", () => {
  it("shows an explicit empty state when there are no associations", () => {
    render(<SftpSettings associations={[]} />);
    expect(screen.getByText(/no file type associations/i)).toBeInTheDocument();
  });
  it("lists stored associations", () => {
    render(<SftpSettings associations={[{ extension: "csv", appPath: "/x", appName: "Numbers", updatedAt: "t" }]} />);
    expect(screen.getByText("csv")).toBeInTheDocument();
    expect(screen.getByText("Numbers")).toBeInTheDocument();
  });

  it("requires confirmation before removing an association", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <SftpSettings
        associations={[
          { extension: "csv", appPath: "/x", appName: "Numbers", updatedAt: "t" },
        ]}
        onDelete={onDelete}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Remove csv association" }),
    );
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: "Confirm remove csv association",
      }),
    );
    expect(onDelete).toHaveBeenCalledWith("csv");
  });
});
