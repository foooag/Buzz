import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryApi } from "@/features/inventory/inventoryApi";
import { InventoryView } from "@/features/inventory/InventoryView";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import type { SshApi } from "@/features/ssh/sshApi";

const timestamp = "2026-07-11T07:00:00.000Z";

function fakeApi(): InventoryApi {
  const vaults: Awaited<ReturnType<InventoryApi["listVaults"]>> = [];
  const hosts: Awaited<ReturnType<InventoryApi["listHosts"]>> = [];
  return {
    listVaults: vi.fn(async () => vaults),
    createVault: vi.fn(async (input) => {
      const vault = { id: `vault-${vaults.length + 1}`, ...input, createdAt: timestamp, updatedAt: timestamp };
      vaults.push(vault);
      return vault;
    }),
    updateVault: vi.fn(async (input) => {
      const index = vaults.findIndex((vault) => vault.id === input.id);
      if (index < 0) throw { code: "INVENTORY_NOT_FOUND" };
      const vault = { ...vaults[index], name: input.name, updatedAt: timestamp };
      vaults[index] = vault;
      return vault;
    }),
    deleteVault: vi.fn(async (id) => {
      const index = vaults.findIndex((vault) => vault.id === id);
      if (index >= 0) vaults.splice(index, 1);
    }),
    listGroups: vi.fn(async () => []), createGroup: vi.fn(),
    listHosts: vi.fn(async () => hosts),
    createHost: vi.fn(async (input) => {
      const host = { id: `host-${hosts.length + 1}`, ...input, createdAt: timestamp, updatedAt: timestamp };
      hosts.push(host);
      return host;
    }),
    updateHost: vi.fn(), deleteHost: vi.fn(async () => undefined),
    listIdentities: vi.fn(async () => []), createIdentity: vi.fn(),
    updateIdentity: vi.fn(),
    deleteIdentity: vi.fn(async () => undefined),
  };
}

describe("encrypted local inventory UI", () => {
  beforeEach(() => {
    localStorage.clear();
    useInventoryStore.setState({
      vaults: {}, vaultOrder: [], groups: {}, hosts: {}, identities: {},
      activeVaultId: null, status: "idle", errorCode: null,
    });
  });

  it("creates a vault and a validated synthetic host", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<InventoryView api={api} />);

    expect(await screen.findByRole("heading", { name: "No vaults yet" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create vault" }));
    await user.type(screen.getByRole("textbox", { name: "Vault name" }), "Synthetic Vault");
    await user.click(screen.getByRole("button", { name: "Save vault" }));

    // New Server opens the rich right-panel form; submit is disabled until valid.
    const newServerButtons = await screen.findAllByRole("button", { name: "New Server" });
    await user.click(newServerButtons[0]);
    expect(screen.getByRole("heading", { name: "New server" })).toBeVisible();
    const submit = screen.getByRole("button", { name: "Create server" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText("web-prod-03"), "Synthetic Host");
    await user.type(screen.getByPlaceholderText("10.0.0.30"), "demo.example.test");
    await user.click(submit);

    // Saved host shows in the grid and the detail panel opens.
    expect(await screen.findAllByText("Synthetic Host")).not.toHaveLength(0);
    expect(api.createHost).toHaveBeenCalledWith(expect.objectContaining({
      name: "Synthetic Host", address: "demo.example.test",
    }));
  });

  it("switches, renames, and deletes vaults", async () => {
    const api = fakeApi();
    await api.createVault({ name: "Primary Vault" });
    const user = userEvent.setup();
    render(<InventoryView api={api} />);

    expect(await screen.findByRole("combobox", { name: "Vault" })).toHaveTextContent("Primary Vault");

    await user.click(screen.getByRole("button", { name: "Create vault" }));
    await user.type(screen.getByRole("textbox", { name: "Vault name" }), "Secondary Vault");
    await user.click(screen.getByRole("button", { name: "Save vault" }));
    expect(screen.getByRole("combobox", { name: "Vault" })).toHaveTextContent("Secondary Vault");

    await user.click(screen.getByRole("button", { name: "Rename vault" }));
    const nameInput = screen.getByRole("textbox", { name: "New vault name" });
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed Vault");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByRole("combobox", { name: "Vault" })).toHaveTextContent("Renamed Vault");

    await user.click(screen.getByRole("button", { name: "Delete vault" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("every host, group, and identity");
    await user.click(screen.getByRole("button", { name: "Confirm delete vault" }));
    expect(await screen.findByRole("combobox", { name: "Vault" })).toHaveTextContent("Primary Vault");
    expect(api.deleteVault).toHaveBeenCalledWith("vault-2");
  });

  it("shows a locked vault retry state without exposing internal details", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockRejectedValue({ code: "VAULT_KEY_UNAVAILABLE", message: "/private/app-encryption.key" });
    render(<InventoryView api={api} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("app data encryption key");
    expect(screen.queryByText("/private/app-encryption.key")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry vault" })).toBeVisible();
    await waitFor(() => expect(api.listVaults).toHaveBeenCalledTimes(1));
  });

  it("opens the server editor instead of a duplicate SSH form when no credential is saved", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    vi.mocked(api.listHosts).mockResolvedValue([
      {
        id: "host-1", vaultId: "vault-1", groupId: null, name: "Synthetic Host",
        address: "ssh.example.test", username: "", tags: [], notes: "",
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);
    const ssh: SshApi = {
      storeCredential: vi.fn(), open: vi.fn(), decideHostKey: vi.fn(), reconnect: vi.fn(),
      listKnownHosts: vi.fn(async () => []), deleteKnownHost: vi.fn(async () => undefined),
    };
    const user = userEvent.setup();
    render(<InventoryView api={api} sshApi={ssh} onSshEvent={() => undefined} onSshOpened={() => undefined} />);

    // Missing credentials are managed in the single server form.
    await user.click(await screen.findByRole("button", { name: "Select Synthetic Host" }));
    const connectButtons = screen.getAllByRole("button", { name: "Connect" });
    const detailConnect = connectButtons.find((btn) => !btn.hasAttribute("disabled")) ?? connectButtons[0];
    await user.click(detailConnect);
    expect(screen.getByRole("heading", { name: "Edit server" })).toBeVisible();
    expect(screen.queryByRole("form", { name: "Connect SSH" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("server form");
  });

  it("connects after a renderer restart using the credential reference stored with the host", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    vi.mocked(api.listHosts).mockResolvedValue([
      {
        id: "host-1", vaultId: "vault-1", groupId: null, name: "Persistent Host",
        address: "ssh.example.test", username: "deploy", tags: [], notes: "",
        authKind: "privateKey", credentialRef: "persistent-credential-ref",
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);
    const ssh: SshApi = {
      storeCredential: vi.fn(),
      open: vi.fn(async () => ({ sessionId: "ssh-session-1", title: "Persistent Host" })),
      decideHostKey: vi.fn(), reconnect: vi.fn(),
      listKnownHosts: vi.fn(async () => []), deleteKnownHost: vi.fn(async () => undefined),
    };
    const user = userEvent.setup();
    render(
      <InventoryView
        api={api}
        sshApi={ssh}
        onSshEvent={() => undefined}
        onSshOpened={() => undefined}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Select Persistent Host" }));
    const connectButtons = screen.getAllByRole("button", { name: "Connect" });
    await user.click(connectButtons.find((button) => !button.hasAttribute("disabled"))!);

    await waitFor(() => expect(ssh.open).toHaveBeenCalledWith(
      expect.objectContaining({
        authKind: "privateKey",
        credentialRef: "persistent-credential-ref",
      }),
      { cols: 80, rows: 24 },
      expect.any(Function),
    ));
    expect(screen.queryByRole("form", { name: "Connect SSH" })).not.toBeInTheDocument();
  });

  it("stores a new server private key through the SSH credential vault", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    const ssh: SshApi = {
      storeCredential: vi.fn(async () => "credential-ref-1"),
      open: vi.fn(),
      decideHostKey: vi.fn(),
      reconnect: vi.fn(),
      listKnownHosts: vi.fn(async () => []),
      deleteKnownHost: vi.fn(async () => undefined),
    };
    const user = userEvent.setup();
    render(<InventoryView api={api} sshApi={ssh} />);

    const newServerButtons = await screen.findAllByRole("button", { name: "New Server" });
    await user.click(newServerButtons[0]);
    await user.type(screen.getByPlaceholderText("web-prod-03"), "Key Host");
    await user.type(screen.getByPlaceholderText("10.0.0.30"), "key.example.test");
    await user.type(screen.getByLabelText("Username"), "deploy");
    await user.selectOptions(screen.getByLabelText("Identity"), "privateKey");
    fireEvent.change(screen.getByPlaceholderText("-----BEGIN OPENSSH PRIVATE KEY-----"), {
      target: { value: "synthetic-private-key" },
    });
    expect(
      screen.getByRole("checkbox", { name: "Save private key for future connections" }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Create server" }));

    await waitFor(() =>
      expect(ssh.storeCredential).toHaveBeenCalledWith({
        type: "privateKey",
        privateKey: Array.from(new TextEncoder().encode("synthetic-private-key")),
        passphrase: null,
      }),
    );
    expect(api.createHost).toHaveBeenCalledWith(expect.objectContaining({
      authKind: "privateKey",
      credentialRef: "credential-ref-1",
    }));
    expect(JSON.stringify(vi.mocked(api.createHost).mock.calls)).not.toContain(
      "synthetic-private-key",
    );
    expect(localStorage.getItem("terminus.ssh.saved-credentials")).toBeNull();
  });

  it("saves a password entered while editing a server so the saved credential is reused for connecting", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    const storedHosts: Awaited<ReturnType<InventoryApi["listHosts"]>> = [
      {
        id: "host-1", vaultId: "vault-1", groupId: null, name: "Editable Host",
        address: "ssh.example.test", username: "deploy", tags: [], notes: "",
        authKind: "password", createdAt: timestamp, updatedAt: timestamp,
      },
    ];
    vi.mocked(api.listHosts).mockImplementation(async () => storedHosts);
    vi.mocked(api.updateHost).mockImplementation(async (input) => {
      const index = storedHosts.findIndex((host) => host.id === input.id);
      if (index < 0) throw { code: "INVENTORY_NOT_FOUND" };
      const host = { ...storedHosts[index], ...input, updatedAt: timestamp };
      storedHosts[index] = host;
      return host;
    });
    const ssh: SshApi = {
      storeCredential: vi.fn(async () => "credential-ref-1"),
      open: vi.fn(async () => ({ sessionId: "ssh-session-1", title: "ssh.example.test" })),
      decideHostKey: vi.fn(),
      reconnect: vi.fn(),
      listKnownHosts: vi.fn(async () => []),
      deleteKnownHost: vi.fn(async () => undefined),
    };
    const user = userEvent.setup();
    render(<InventoryView api={api} sshApi={ssh} onSshEvent={() => undefined} onSshOpened={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Select Editable Host" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Server password"), "saved-password");
    expect(
      screen.getByRole("checkbox", { name: "Save password for future connections" }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(ssh.storeCredential).toHaveBeenCalledWith({
      type: "password",
      password: "saved-password",
    }));
    expect(api.updateHost).toHaveBeenCalledWith(expect.objectContaining({
      id: "host-1",
      authKind: "password",
      credentialRef: "credential-ref-1",
    }));

    const connectButtons = screen.getAllByRole("button", { name: "Connect" });
    await user.click(connectButtons.find((button) => !button.hasAttribute("disabled"))!);
    await waitFor(() => expect(ssh.open).toHaveBeenCalledWith(
      expect.objectContaining({ authKind: "password", credentialRef: "credential-ref-1" }),
      { cols: 80, rows: 24 },
      expect.any(Function),
    ));
    expect(screen.queryByText("Save a password or private key in the server form before connecting.")).not.toBeInTheDocument();
  });

  it("requires explicit confirmation before deleting a host", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    vi.mocked(api.listHosts).mockResolvedValue([
      {
        id: "host-1", vaultId: "vault-1", groupId: null, name: "Synthetic Host",
        address: "demo.example.test", username: "", tags: [], notes: "",
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);
    const user = userEvent.setup();
    render(<InventoryView api={api} />);

    // Select the host, open the "More" menu, choose Delete host.
    await user.click(await screen.findByRole("button", { name: "Select Synthetic Host" }));
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete host" }));

    expect(api.deleteHost).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Delete host" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(api.deleteHost).toHaveBeenCalledWith("host-1"));
  });

  it("cycles server sorting through ascending, descending, and original order", async () => {
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    vi.mocked(api.listHosts).mockResolvedValue([
      {
        id: "host-z", vaultId: "vault-1", groupId: null, name: "Zulu",
        address: "z.example.test", username: "", tags: [], notes: "",
        createdAt: timestamp, updatedAt: timestamp,
      },
      {
        id: "host-a", vaultId: "vault-1", groupId: null, name: "Alpha",
        address: "a.example.test", username: "", tags: [], notes: "",
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);
    const user = userEvent.setup();
    render(<InventoryView api={api} />);
    const zulu = await screen.findByRole("button", { name: "Select Zulu" });
    const alpha = screen.getByRole("button", { name: "Select Alpha" });
    const sort = screen.getByRole("button", { name: "Sort servers" });

    await user.click(sort);
    expect(alpha.compareDocumentPosition(zulu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sort).toHaveTextContent("A–Z");

    await user.click(sort);
    expect(zulu.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sort).toHaveTextContent("Z–A");

    await user.click(sort);
    expect(zulu.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sort).toHaveTextContent("Sort");
  });

  it("runs selected real snippets and custom startup commands after SSH connects", async () => {
    localStorage.setItem("terminus.commandSnippets", JSON.stringify([
      { id: "snippet-1", name: "Enter app", command: "cd /srv/app" },
    ]));
    localStorage.setItem("terminus.ssh.saved-credentials", JSON.stringify({
      "host-1": { credentialRef: "credential-1", authKind: "password" },
    }));
    const api = fakeApi();
    vi.mocked(api.listVaults).mockResolvedValue([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    vi.mocked(api.listHosts).mockResolvedValue([
      {
        id: "host-1", vaultId: "vault-1", groupId: null, name: "Startup Host",
        address: "ssh.example.test", username: "tester", tags: [], notes: "",
        env: { APP_ENV: "stage", QUOTED: "it's safe" },
        startupSnippets: ["snippet-1"], startupCommands: ["source .venv/bin/activate"],
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);
    const ssh: SshApi = {
      storeCredential: vi.fn(),
      open: vi.fn(async () => ({ sessionId: "ssh-session-1", title: "ssh.example.test" })),
      decideHostKey: vi.fn(),
      reconnect: vi.fn(),
      listKnownHosts: vi.fn(async () => []),
      deleteKnownHost: vi.fn(),
    };
    const onSshStartup = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <InventoryView
        api={api}
        sshApi={ssh}
        onSshEvent={() => undefined}
        onSshOpened={() => undefined}
        onSshStartup={onSshStartup}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Select Startup Host" }));
    const connectButtons = screen.getAllByRole("button", { name: "Connect" });
    await user.click(connectButtons.find((button) => !button.hasAttribute("disabled"))!);
    await waitFor(() => expect(onSshStartup).toHaveBeenCalledWith(
      "ssh-session-1",
      [
        "export APP_ENV='stage'",
        "export QUOTED='it'\"'\"'s safe'",
        "cd /srv/app",
        "source .venv/bin/activate",
      ],
    ));
  });
});
