import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ENCRYPTED_CREDENTIAL_PLACEHOLDER,
  HostFormPanel,
} from "@/features/servers/HostFormPanel";

const timestamp = "2026-07-30T00:00:00.000Z";
const savedHost = {
  id: "host-1",
  vaultId: "vault-1",
  groupId: null,
  name: "Saved host",
  address: "saved.example.test",
  username: "deploy",
  tags: [],
  notes: "",
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("HostFormPanel", () => {
  it("loads a selected private-key text file into the private-key field", async () => {
    const user = userEvent.setup();
    const privateKey = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "synthetic-key-material",
      "-----END OPENSSH PRIVATE KEY-----",
    ].join("\n");
    const file = new File([privateKey], "id_ed25519", { type: "text/plain" });

    render(
      <HostFormPanel
        groups={[]}
        identities={[]}
        hosts={[]}
        snippets={[]}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Identity"), "privateKey");
    await user.upload(screen.getByLabelText("Import private key file"), file);

    expect(await screen.findByText("id_ed25519")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText("-----BEGIN OPENSSH PRIVATE KEY-----"),
      ).toHaveValue(privateKey),
    );
  });

  it("defaults private-key credentials to saved and requires a username", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <HostFormPanel
        groups={[]}
        identities={[]}
        hosts={[]}
        snippets={[]}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Identity"), "privateKey");
    const saveCredential = screen.getByRole("checkbox", {
      name: "Save private key for future connections",
    });
    expect(saveCredential).toBeChecked();
    const privateKeyCredentials = screen.getByRole("group", {
      name: "Private key credentials",
    });
    const username = within(privateKeyCredentials).getByLabelText("Username");

    await user.type(screen.getByPlaceholderText("web-prod-03"), "Deploy host");
    await user.type(screen.getByPlaceholderText("10.0.0.30"), "deploy.example.test");
    await user.type(
      screen.getByPlaceholderText("-----BEGIN OPENSSH PRIVATE KEY-----"),
      "synthetic-private-key",
    );
    expect(screen.getByRole("button", { name: "Create server" })).toBeDisabled();

    await user.type(username, "deploy");
    await user.click(screen.getByRole("button", { name: "Create server" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ username: "deploy", authKind: "privateKey" }),
      expect.objectContaining({
        authKind: "privateKey",
        privateKey: "synthetic-private-key",
        saveCredential: true,
      }),
    );
  });

  it.each(["password", "privateKey"] as const)(
    "shows an encrypted placeholder for a saved %s credential without exposing a value",
    (savedAuthKind) => {
      render(
        <HostFormPanel
          groups={[]}
          identities={[]}
          hosts={[]}
          snippets={[]}
          initial={{ ...savedHost, authKind: savedAuthKind }}
          savedAuthKind={savedAuthKind}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const credentialInput = screen.getByPlaceholderText(
        ENCRYPTED_CREDENTIAL_PLACEHOLDER,
      );
      expect(credentialInput).toHaveAttribute(
        "placeholder",
        ENCRYPTED_CREDENTIAL_PLACEHOLDER,
      );
      expect(credentialInput).toHaveValue("");
    },
  );

  it("keeps the saved credential when an edited server is submitted unchanged", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <HostFormPanel
        groups={[]}
        identities={[]}
        hosts={[]}
        snippets={[]}
        initial={{ ...savedHost, authKind: "password" }}
        savedAuthKind="password"
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ authKind: "password" }),
      expect.objectContaining({
        authKind: "password",
        password: "",
        saveCredential: true,
      }),
    );
  });
});
