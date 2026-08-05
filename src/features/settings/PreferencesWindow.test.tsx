import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryApi } from "../inventory/inventoryApi";
import { useInventoryStore } from "../inventory/inventoryStore";
import { PreferencesWindow } from "./PreferencesWindow";
import { defaultTerminalPreferences } from "./terminalPreferences";
import type { SshApi } from "../ssh/sshApi";
import { deterministicWindowControlsApi } from "./deterministicWindowControlsApi";

const ts = "2026-07-27T07:00:00.000Z";

function fakeApi(): InventoryApi {
  return {
    listVaults: vi.fn(async () => []),
    createVault: vi.fn(), updateVault: vi.fn(), deleteVault: vi.fn(),
    listGroups: vi.fn(async () => []), createGroup: vi.fn(),
    listHosts: vi.fn(async () => []),
    createHost: vi.fn(), updateHost: vi.fn(), deleteHost: vi.fn(),
    listIdentities: vi.fn(async () => [
      { id: "id-1", vaultId: "vault-1", name: "deploy-ed25519", username: "", type: "SSH key", algorithm: "ed25519", createdAt: ts, updatedAt: ts },
    ]),
    createIdentity: vi.fn(), updateIdentity: vi.fn(), deleteIdentity: vi.fn(),
  };
}

describe("PreferencesWindow", () => {
  beforeEach(() => useInventoryStore.setState({
    vaults: {}, vaultOrder: [], groups: {}, hosts: {}, identities: {},
    activeVaultId: "vault-1", status: "ready", errorCode: null,
  }));

  it("renders the real Credentials section from the inventory store", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<PreferencesWindow open inventoryApi={api} onClose={() => undefined} />);

    await user.click(screen.getByRole("button", { name: "Credentials" }));
    expect(await screen.findByText("deploy-ed25519")).toBeVisible();
  });

  it("writes terminal controls through the application preference contract", async () => {
    const user = userEvent.setup();
    const onPreferencesChange = vi.fn();
    const onThemeChange = vi.fn();
    render(
      <PreferencesWindow
        open
        inventoryApi={fakeApi()}
        onClose={() => undefined}
        terminalThemeId="pro"
        onTerminalThemeChange={onThemeChange}
        terminalPreferences={defaultTerminalPreferences}
        onTerminalPreferencesChange={onPreferencesChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Terminal" }));
    await user.click(screen.getByRole("switch", { name: "Terminal bell" }));
    expect(onPreferencesChange).toHaveBeenCalledWith({
      ...defaultTerminalPreferences,
      terminalBell: true,
    });

    await user.click(
      screen.getByRole("button", { name: /Termius Dark/ }),
    );
    expect(onThemeChange).toHaveBeenCalledWith("termius-dark");
  });

  it("loads and explicitly removes real trusted-host records", async () => {
    const user = userEvent.setup();
    const sshApi: SshApi = {
      storeCredential: vi.fn(),
      open: vi.fn(),
      decideHostKey: vi.fn(),
      reconnect: vi.fn(),
      listKnownHosts: vi.fn(async () => [
        {
          hostname: "ssh.example.test",
          port: 22221,
          algorithm: "ssh-ed25519",
          fingerprint: "SHA256:synthetic",
          firstConfirmedAt: ts,
          updatedAt: ts,
        },
      ]),
      deleteKnownHost: vi.fn(async () => undefined),
    };
    render(
      <PreferencesWindow
        open
        inventoryApi={fakeApi()}
        sshApi={sshApi}
        onClose={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Known Hosts" }));
    expect(await screen.findByText("ssh.example.test")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Remove ssh.example.test:22221" }),
    );
    expect(sshApi.deleteKnownHost).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(sshApi.deleteKnownHost).toHaveBeenCalledWith(
      "ssh.example.test",
      22221,
    );
  });

  it("wires the traffic-light dots to close/minimize/zoom", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const minimize = vi.spyOn(deterministicWindowControlsApi, "minimize");
    const toggleMaximize = vi.spyOn(
      deterministicWindowControlsApi,
      "toggleMaximize",
    );
    render(
      <PreferencesWindow
        open
        inventoryApi={fakeApi()}
        onClose={onClose}
        windowControls={deterministicWindowControlsApi}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Minimize" }));
    expect(minimize).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Zoom" }));
    expect(toggleMaximize).toHaveBeenCalled();
  });
});
