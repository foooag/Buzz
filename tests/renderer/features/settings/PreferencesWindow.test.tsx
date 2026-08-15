import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryApi } from "@/features/inventory/inventoryApi";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import { PreferencesWindow } from "@/features/settings/PreferencesWindow";
import { defaultTerminalPreferences } from "@/features/settings/terminalPreferences";
import type { SshApi } from "@/features/ssh/sshApi";
import { deterministicWindowControlsApi } from "@/features/settings/deterministicWindowControlsApi";
import { createDeterministicUpdaterApi } from "@/features/updater/deterministicUpdaterApi";
import type { AvailableUpdate } from "@/features/updater/updaterApi";

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

  it("runs a manual update check from the changelog area and reports up-to-date", async () => {
    const user = userEvent.setup();
    const { api } = createDeterministicUpdaterApi({ update: null });
    render(
      <PreferencesWindow
        open
        inventoryApi={fakeApi()}
        onClose={() => undefined}
        updater={api}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Up to date")).toBeVisible();
  });

  it("surfaces a found version badge and the update dialog on manual check", async () => {
    const user = userEvent.setup();
    const update: AvailableUpdate = {
      version: "0.2.0",
      body: "Security and reliability fixes.",
      close: vi.fn(async () => undefined),
      downloadAndInstall: vi.fn(async () => undefined),
    };
    const { api } = createDeterministicUpdaterApi({ update });
    render(
      <PreferencesWindow
        open
        inventoryApi={fakeApi()}
        onClose={() => undefined}
        updater={api}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(
      await screen.findByRole("heading", {
        name: "Buzz update available · 0.2.0",
      }),
    ).toBeVisible();
    expect(screen.getByText("Buzz 0.2.0 is available")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Check for updates" }),
    ).not.toBeInTheDocument();
  });
});
