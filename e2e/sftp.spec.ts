import { expect, test } from "@playwright/test";

/**
 * Deterministic SFTP browser flow. Native acceptance separately exercises the
 * real loopback SFTP server; this browser scenario verifies the complete UI
 * workflow without requiring native Electron IPC. The flow explicitly approves the
 * deterministic host key, then lists the seeded remote/local entries
 * and triggers an upload by dragging a local entry onto the remote pane,
 * asserting the transfer dock shows a row that reaches a completed summary.
 */
test("opens a deterministic SFTP session, lists entries, and uploads a local file", async ({
  page,
}) => {
  await page.goto("/?transport=deterministic-sftp");

  await page.getByRole("link", { name: "SFTP" }).click();

  const form = page.getByTestId("sftp-connect-form");
  await expect(form).toBeVisible();
  await page.getByLabel("Host").selectOption("h-web-prod-01");
  await page.getByRole("button", { name: /^connect$/i }).click();
  const hostKeyDialog = page.getByRole("dialog", { name: "Verify SFTP host key" });
  await expect(hostKeyDialog).toContainText("SHA256:synthetic");
  await hostKeyDialog.getByRole("button", { name: "Trust and connect" }).click();

  await expect(page.getByTestId("sftp-panel")).toBeVisible();

  // The deterministic transport seeds a default remote + local listing at "/".
  const remoteTable = page.getByTestId("sftp-remote-table");
  await expect(remoteTable).toContainText("readme.md");
  await expect(remoteTable).toContainText("documents");

  const localTable = page.getByTestId("sftp-local-table");
  await expect(localTable).toContainText("notes.txt");

  // Trigger an upload by dragging the local "notes.txt" row onto the remote
  // pane. The remote pane's drop handler routes the payload to enqueueUpload,
  // and the deterministic transport emits sftpTransferQueued then
  // sftpTransferCompleted after a short tick.
  const localRow = localTable.locator("tr[data-entry-name='notes.txt']");
  const remotePane = page.getByTestId("sftp-remote-pane");
  await localRow.dragTo(remotePane);

  const dock = page.getByTestId("sftp-transfer-dock");
  const transferRow = dock.getByTestId("sftp-transfer-row");
  await expect(transferRow).toHaveCount(1);
  await expect(transferRow).toHaveAttribute("data-direction", "upload");
  // The synthetic transfer completes after ~10ms; the summary text appears
  // once the store folds sftpTransferCompleted into the transfer view.
  await expect(transferRow).toHaveAttribute("data-completed", "true");
  await expect(dock.getByTestId("sftp-transfer-summary-text")).toContainText(
    /succeeded 1/,
  );
});
