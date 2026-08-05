import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdentityFormDialog } from "./IdentityFormDialog";

const ts = "2026-07-27T07:00:00.000Z";

describe("IdentityFormDialog", () => {
  it("disables submit until a name is entered, then submits the draft", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<IdentityFormDialog open onSubmit={onSubmit} onCancel={() => undefined} />);

    expect(screen.getByRole("heading", { name: "New identity" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save identity" })).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "deploy-ed25519");
    await user.click(screen.getByRole("button", { name: "Save identity" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "deploy-ed25519" }));
  });

  it("pre-fills fields in edit mode and only exposes Expires for certificates", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <IdentityFormDialog
        open
        initial={{
          id: "id-1", vaultId: "vault-1", name: "deploy-ed25519", username: "ubuntu",
          type: "SSH key", algorithm: "ed25519", passphrase: true,
          createdAt: ts, updatedAt: ts,
        }}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Edit identity" })).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("deploy-ed25519");
    expect(screen.queryByLabelText("Expires")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Type"), "SSH certificate");
    await user.clear(screen.getByLabelText("Expires"));
    await user.type(screen.getByLabelText("Expires"), "2026-12-01");
    await user.click(screen.getByRole("button", { name: "Save identity" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type: "SSH certificate", expires: "2026-12-01",
    }));
  });
});
