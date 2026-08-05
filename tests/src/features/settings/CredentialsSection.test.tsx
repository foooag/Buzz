import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryApi } from "@/features/inventory/inventoryApi";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import { CredentialsSection } from "@/features/settings/CredentialsSection";

const ts = "2026-07-27T07:00:00.000Z";

function fakeApi(): InventoryApi {
  return {
    listVaults: vi.fn(async () => []),
    createVault: vi.fn(), updateVault: vi.fn(), deleteVault: vi.fn(),
    listGroups: vi.fn(async () => []),
    createGroup: vi.fn(),
    listHosts: vi.fn(async () => []),
    createHost: vi.fn(), updateHost: vi.fn(), deleteHost: vi.fn(),
    listIdentities: vi.fn(async () => []),
    createIdentity: vi.fn(async (input) => ({ id: "id-new", createdAt: ts, updatedAt: ts, ...input })),
    updateIdentity: vi.fn(async (input) => ({ id: "id-1", createdAt: ts, updatedAt: ts, ...input })),
    deleteIdentity: vi.fn(async () => undefined),
  };
}

describe("CredentialsSection", () => {
  beforeEach(() => useInventoryStore.setState({
    vaults: {}, vaultOrder: [], groups: {}, hosts: {}, identities: {},
    activeVaultId: "vault-1", status: "ready", errorCode: null,
  }));

  it("lists identities from the store with an attached-host count", async () => {
    const api = fakeApi();
    vi.mocked(api.listIdentities).mockResolvedValue([
      { id: "id-1", vaultId: "vault-1", name: "deploy-ed25519", username: "", type: "SSH key", algorithm: "ed25519", passphrase: true, createdAt: ts, updatedAt: ts },
    ]);
    useInventoryStore.setState({
      hosts: { "h-1": { id: "h-1", vaultId: "vault-1", groupId: null, name: "web", address: "10.0.0.1", username: "", tags: [], notes: "", identity: "deploy-ed25519", createdAt: ts, updatedAt: ts } },
    });
    render(<CredentialsSection api={api} />);

    expect(await screen.findByText("deploy-ed25519")).toBeVisible();
    expect(screen.getByText(/1 host/)).toBeVisible();
  });

  it("creates an identity through the New key dialog", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<CredentialsSection api={api} />);

    await screen.findByText("No keys yet");
    await user.click(screen.getByRole("button", { name: "New key" }));
    await user.type(screen.getByLabelText("Name"), "bridge-ed25519");
    await user.click(screen.getByRole("button", { name: "Save identity" }));

    await waitFor(() => expect(api.createIdentity).toHaveBeenCalledWith(expect.objectContaining({ name: "bridge-ed25519", vaultId: "vault-1" })));
  });

  it("requires confirmation before deleting an identity", async () => {
    const api = fakeApi();
    vi.mocked(api.listIdentities).mockResolvedValue([
      { id: "id-1", vaultId: "vault-1", name: "deploy-ed25519", username: "", createdAt: ts, updatedAt: ts },
    ]);
    const user = userEvent.setup();
    render(<CredentialsSection api={api} />);

    await screen.findByText("deploy-ed25519");
    await user.click(screen.getByRole("button", { name: "Delete deploy-ed25519" }));
    expect(api.deleteIdentity).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(api.deleteIdentity).toHaveBeenCalledWith("id-1"));
  });
});
