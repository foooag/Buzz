import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeterministicForwardingApi } from "../forwarding/deterministicForwardingApi";
import type { InventoryApi } from "../inventory/inventoryApi";
import { useInventoryStore } from "../inventory/inventoryStore";
import type { SshApi } from "../ssh/sshApi";
import { parseQuickSshTarget, ServersPage } from "./ServersPage";

const inventory: InventoryApi = {
  listVaults: vi.fn(async () => []),
  createVault: vi.fn(),
  updateVault: vi.fn(),
  deleteVault: vi.fn(),
  listGroups: vi.fn(async () => []),
  createGroup: vi.fn(),
  listHosts: vi.fn(async () => []),
  createHost: vi.fn(),
  updateHost: vi.fn(),
  deleteHost: vi.fn(),
  listIdentities: vi.fn(async () => []),
  createIdentity: vi.fn(),
  updateIdentity: vi.fn(),
  deleteIdentity: vi.fn(),
};

const ssh: SshApi = {
  storeCredential: vi.fn(),
  open: vi.fn(),
  decideHostKey: vi.fn(),
  reconnect: vi.fn(),
  listKnownHosts: vi.fn(async () => []),
  deleteKnownHost: vi.fn(),
};

describe("SSH quick connect", () => {
  beforeEach(() => {
    localStorage.clear();
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

  it("parses safe SSH command shapes and rejects unsupported options", () => {
    expect(parseQuickSshTarget("ssh -p 22221 tester@127.0.0.1")).toEqual({
      hostname: "127.0.0.1",
      port: 22221,
      username: "tester",
    });
    expect(parseQuickSshTarget("ssh -p2200 host.example")).toEqual({
      hostname: "host.example",
      port: 2200,
      username: "",
    });
    expect(parseQuickSshTarget("ssh -o ProxyCommand=bad host")).toBeNull();
    expect(parseQuickSshTarget("just a search")).toBeNull();
  });

  it("opens a real SSH credential form from the Connect button", async () => {
    const user = userEvent.setup();
    render(
      <ServersPage
        inventoryApi={inventory}
        sshApi={ssh}
        onSshEvent={() => undefined}
        onSshOpened={() => undefined}
        sshKeepaliveInterval={45}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Find a host or enter an SSH command" });
    await user.type(input, "ssh -p 22221 tester@127.0.0.1");
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(screen.getByRole("form", { name: "Connect SSH" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Hostname" })).toHaveValue("127.0.0.1");
    expect(screen.getByRole("textbox", { name: "Port" })).toHaveValue("22221");
    expect(screen.getByRole("textbox", { name: "Username" })).toHaveValue("tester");
  });

  it("shows the port forwarding section for an SSH host", async () => {
    const timestamp = "2026-07-30T00:00:00.000Z";
    const inventoryWithHost: InventoryApi = {
      ...inventory,
      listVaults: vi.fn(async () => [
        {
          id: "vault-1",
          name: "Synthetic Vault",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]),
      listHosts: vi.fn(async () => [
        {
          id: "host-1",
          vaultId: "vault-1",
          groupId: null,
          name: "Forwarding Host",
          address: "ssh.example.test",
          username: "tester",
          authKind: "password" as const,
          credentialRef: "credential-1",
          protocol: "ssh" as const,
          port: 22,
          tags: [],
          notes: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]),
    };
    const user = userEvent.setup();
    render(
      <ServersPage
        inventoryApi={inventoryWithHost}
        forwardingApi={createDeterministicForwardingApi()}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Select Forwarding Host" }),
    );
    expect(await screen.findByText("Port forwarding")).toBeInTheDocument();
    expect(
      await screen.findByText(/no port forwarding rules/i),
    ).toBeInTheDocument();
  });
});
