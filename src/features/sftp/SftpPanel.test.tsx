import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createDeterministicSftpApi } from "./deterministicSftpApi";
import { SftpPanel } from "./SftpPanel";
import { useInventoryStore } from "../inventory/inventoryStore";

/**
 * The panel drives a session through the deterministic transport: pick a host
 * from the quick-connect dropdown, click Connect, and explicitly approve the
 * synthetic host-key prompt so the deterministic `open` resolves. After that
 * both panes render the seeded listings. The inventory store is
 * reset each test so the host dropdown falls back to the design seed.
 */
describe("SftpPanel", () => {
  beforeEach(() => {
    useInventoryStore.setState({
      vaults: {},
      vaultOrder: [],
      groups: {},
      hosts: {},
      identities: {},
      activeVaultId: null,
      status: "idle",
      errorCode: null,
    });
  });

  it("renders the disconnected shell with Connect disabled until a host is chosen", () => {
    const api = createDeterministicSftpApi();
    render(<SftpPanel api={api} />);

    expect(screen.getByTestId("sftp-connect-form")).toBeInTheDocument();
    expect(screen.getByText("No SFTP connection")).toBeVisible();
    expect(screen.getByRole("button", { name: /^connect$/i })).toBeDisabled();
  });

  it("renders both panes and lists seeded entries after connecting", async () => {
    const api = createDeterministicSftpApi();
    api.seedRemote("/", [
      { name: "readme.md", isDir: false, size: 128, modified: null, permissions: null },
      { name: "documents", isDir: true, size: 0, modified: null, permissions: null },
    ]);
    api.seedLocal("/", [
      { name: "notes.txt", isDir: false, size: 64, modified: null, permissions: null },
    ]);

    const user = userEvent.setup();
    render(<SftpPanel api={api} />);

    await user.selectOptions(screen.getByLabelText("Host"), "h-web-prod-01");
    await user.click(screen.getByRole("button", { name: /^connect$/i }));
    expect(await screen.findByRole("dialog", { name: "Verify SFTP host key" })).toBeVisible();
    expect(screen.getByText("SHA256:synthetic")).toBeVisible();
    expect(screen.queryByTestId("sftp-remote-pane")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Trust and connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("sftp-local-pane")).toBeInTheDocument();
      expect(screen.getByTestId("sftp-remote-pane")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId("sftp-local-table")).toHaveTextContent("notes.txt");
      expect(screen.getByTestId("sftp-remote-table")).toHaveTextContent("readme.md");
      expect(screen.getByTestId("sftp-remote-table")).toHaveTextContent("documents");
    });
  });

  it("does not connect after rejecting an unknown SFTP host key", async () => {
    const api = createDeterministicSftpApi();
    const user = userEvent.setup();
    render(<SftpPanel api={api} />);

    await user.selectOptions(screen.getByLabelText("Host"), "h-web-prod-01");
    await user.click(screen.getByRole("button", { name: /^connect$/i }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("The SFTP connection could not be opened.")).toBeVisible();
    expect(screen.queryByTestId("sftp-remote-pane")).not.toBeInTheDocument();
  });
});
