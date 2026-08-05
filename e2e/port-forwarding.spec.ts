import { expect, test } from "@playwright/test";

test("creates, edits, and deletes a port forwarding rule", async ({ page }) => {
  await page.addInitScript(() => {
    const timestamp = "2026-07-30T07:00:00.000Z";
    localStorage.setItem("terminus.e2e.inventory", JSON.stringify({
      vaults: [{ id: "vault-1", name: "E2E", createdAt: timestamp, updatedAt: timestamp }],
      groups: [],
      identities: [],
      hosts: [{
        id: "host-1",
        vaultId: "vault-1",
        groupId: null,
        name: "bastion-test",
        address: "127.0.0.1",
        username: "tester",
        tags: [],
        notes: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
    }));
  });
  await page.goto("/?transport=deterministic-inventory");
  await page.getByRole("link", { name: "Port Forwarding" }).click();

  await page.getByRole("button", { name: "New rule" }).click();
  const createDialog = page.getByRole("dialog", { name: "New port forwarding rule" });
  await createDialog.getByRole("textbox", { name: "Label (optional)" }).fill("Synthetic tunnel");
  await createDialog.getByRole("combobox", { name: "SSH host" }).selectOption("host-1");
  await createDialog.getByRole("spinbutton", { name: "Bind port" }).fill("9000");
  await createDialog.getByRole("button", { name: "Create rule" }).click();
  await expect(page.getByText("Synthetic tunnel", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit Synthetic tunnel" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit port forwarding rule" });
  await editDialog.getByRole("textbox", { name: "Label (optional)" }).fill("Updated tunnel");
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Updated tunnel", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete Updated tunnel" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete port forwarding rule" });
  await deleteDialog.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("Updated tunnel", { exact: true })).toHaveCount(0);
});
