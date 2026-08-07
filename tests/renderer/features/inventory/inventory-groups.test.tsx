import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryApi } from "@/features/inventory/inventoryApi";
import { InventoryView } from "@/features/inventory/InventoryView";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { SshApi } from "@/features/ssh/sshApi";
import type { Host } from "@/shared/types";

const timestamp = "2026-07-11T07:00:00.000Z";

function fakeApi(): InventoryApi {
  const vaults: Awaited<ReturnType<InventoryApi["listVaults"]>> = [];
  const groups: Awaited<ReturnType<InventoryApi["listGroups"]>> = [];
  const hosts: Awaited<ReturnType<InventoryApi["listHosts"]>> = [];
  return {
    listVaults: vi.fn(async () => vaults),
    createVault: vi.fn(async (input) => {
      const vault = { id: `vault-${vaults.length + 1}`, ...input, createdAt: timestamp, updatedAt: timestamp };
      vaults.push(vault);
      return vault;
    }),
    updateVault: vi.fn(async () => ({} as never)),
    deleteVault: vi.fn(async () => undefined),
    listGroups: vi.fn(async () => groups),
    createGroup: vi.fn(async (input) => {
      const group = { id: `g-${groups.length + 1}`, ...input, createdAt: timestamp, updatedAt: timestamp };
      groups.push(group);
      return group;
    }),
    listHosts: vi.fn(async () => hosts),
    createHost: vi.fn(async (input) => {
      const host = { id: `host-${hosts.length + 1}`, ...input, createdAt: timestamp, updatedAt: timestamp };
      hosts.push(host);
      return host;
    }),
    updateHost: vi.fn(async (input) => {
      const index = hosts.findIndex((host) => host.id === input.id);
      if (index < 0) throw { code: "INVENTORY_NOT_FOUND" };
      const host = { ...hosts[index], ...input, updatedAt: timestamp };
      hosts[index] = host;
      return host;
    }),
    deleteHost: vi.fn(async () => undefined),
    listIdentities: vi.fn(async () => []),
    createIdentity: vi.fn(async () => ({} as never)),
    updateIdentity: vi.fn(async () => ({} as never)),
    deleteIdentity: vi.fn(async () => undefined),
  };
}

function seed(api: InventoryApi, vaultId: string) {
  return api.createGroup({ vaultId, parentId: null, name: "Databases", color: "teal" });
}

function sshMock(): SshApi {
  return {
    storeCredential: vi.fn(),
    open: vi.fn(async (profile) => ({
      sessionId: "ssh-session-1",
      title: profile.hostname,
    })),
    decideHostKey: vi.fn(),
    reconnect: vi.fn(),
    listKnownHosts: vi.fn(async () => []),
    deleteKnownHost: vi.fn(async () => undefined),
  };
}

describe("InventoryView group and connect affordances", () => {
  beforeEach(() => {
    localStorage.clear();
    useInventoryStore.setState({
      vaults: {}, vaultOrder: [], groups: {}, hosts: {}, identities: {},
      activeVaultId: null, status: "idle", errorCode: null,
    });
  });

  it("marks a grouped server card with the group color", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    const group = await seed(api, "vault-1");
    vi.mocked(api.listHosts).mockResolvedValue([
      {
        id: "host-1", vaultId: "vault-1", groupId: group.id, name: "Db Primary",
        address: "db.example.test", username: "postgres", tags: [], notes: "",
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);
    render(<InventoryView api={api} />);

    const card = await screen.findByRole("button", { name: "Select Db Primary" });
    const marker = card.querySelector<HTMLElement>("span[style*='background']");
    expect(marker).not.toBeNull();
    expect(marker!.style.background).toBe("rgb(2, 184, 204)");
  });

  it("double-clicking a server card opens a real SSH session", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    vi.mocked(api.listHosts).mockResolvedValue([
      {
        id: "host-1", vaultId: "vault-1", groupId: null, name: "Fast Host",
        address: "fast.example.test", username: "deploy", tags: [], notes: "",
        authKind: "password", credentialRef: "credential-1",
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);
    const ssh = sshMock();
    const onOpened = vi.fn();
    render(
      <InventoryView api={api} sshApi={ssh} onSshEvent={() => undefined} onSshOpened={onOpened} />,
    );

    fireEvent.doubleClick(await screen.findByRole("button", { name: "Select Fast Host" }));
    await waitFor(() => expect(ssh.open).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "fast.example.test", authKind: "password", credentialRef: "credential-1" }),
      { cols: 80, rows: 24 },
      expect.any(Function),
    ));
    expect(onOpened).toHaveBeenCalledWith({ sessionId: "ssh-session-1", title: "fast.example.test" });
  });

  it("opens the server editor when double-clicking a host without a saved credential", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    vi.mocked(api.listHosts).mockResolvedValue([
      {
        id: "host-1", vaultId: "vault-1", groupId: null, name: "No Credential Host",
        address: "nc.example.test", username: "", tags: [], notes: "",
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);
    render(
      <InventoryView api={api} sshApi={sshMock()} onSshEvent={() => undefined} onSshOpened={() => undefined} />,
    );

    fireEvent.doubleClick(await screen.findByRole("button", { name: "Select No Credential Host" }));
    expect(await screen.findByRole("heading", { name: "Edit server" })).toBeVisible();
  });

  it("updates group counts after editing a host's group", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    const groupA = await api.createGroup({ vaultId: "vault-1", parentId: null, name: "Group A", color: "coral" });
    const groupB = await api.createGroup({ vaultId: "vault-1", parentId: null, name: "Group B", color: "teal" });
    const storedHost: Host = {
      id: "host-1", vaultId: "vault-1", groupId: groupA.id, name: "Editable Host",
      address: "ssh.example.test", username: "deploy", tags: [], notes: "",
      protocol: "ssh", port: 22, createdAt: timestamp, updatedAt: timestamp,
    };
    vi.mocked(api.listHosts).mockImplementation(async () => [storedHost]);
    vi.mocked(api.updateHost).mockImplementation(async (input) => {
      if (input.id !== storedHost.id) throw { code: "INVENTORY_NOT_FOUND" };
      Object.assign(storedHost, input, { updatedAt: timestamp });
      return storedHost;
    });
    render(<InventoryView api={api} />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Select Editable Host" }));
    await user.click(screen.getByRole("button", { name: /^Edit$/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: /^Group$/ }), groupB.id);
    await user.click(screen.getByRole("button", { name: /^Save changes$/ }));

    // Group B now owns the host; both the rail and the detail panel reflect it.
    await waitFor(() => {
      const rail = screen.getByText("Groups").parentElement!;
      const groupBpill = Array.from(rail.querySelectorAll("span")).find((span) =>
        span.textContent?.trim().startsWith("Group B"),
      );
      expect(groupBpill).toBeTruthy();
      expect(groupBpill!.textContent).toContain("1");
    });
    expect(screen.getByText("Group B", { selector: "dd" })).toBeInTheDocument();
  });
});
