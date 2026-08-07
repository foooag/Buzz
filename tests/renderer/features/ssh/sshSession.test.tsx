import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HostKeyDialog } from "@/features/ssh/HostKeyDialog";
import type { SshApi } from "@/features/ssh/sshApi";
import { SshConnectForm } from "@/features/ssh/SshConnectForm";

function fakeApi(): SshApi {
  return {
    storeCredential: vi.fn(async () => "credential-1"),
    open: vi.fn(async () => ({ sessionId: "ssh-session-1", title: "ssh.example.test" })),
    decideHostKey: vi.fn(async () => undefined),
    reconnect: vi.fn(async () => ({ sessionId: "ssh-session-2", title: "ssh.example.test" })),
    listKnownHosts: vi.fn(async () => []),
    deleteKnownHost: vi.fn(async () => undefined),
  };
}

describe("verified SSH frontend flow", () => {
  it("validates a password profile and clears the secret after submission", async () => {
    const api = fakeApi();
    const onOpened = vi.fn();
    const user = userEvent.setup();
    render(
      <SshConnectForm
        api={api}
        hostId="host-1"
        defaultHostname="ssh.example.test"
        defaultPort={22221}
        onCancel={() => undefined}
        onEvent={() => undefined}
        onOpened={onOpened}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Username" }), "tester");
    await user.type(screen.getByLabelText("Password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: "Connect SSH" }));

    await waitFor(() => expect(api.storeCredential).toHaveBeenCalledWith({
      type: "password", password: "synthetic-password",
    }));
    await waitFor(() =>
      expect(api.open).toHaveBeenCalledWith(
        expect.objectContaining({ port: 22221 }),
        { cols: 80, rows: 24 },
        expect.any(Function),
      ),
    );
    expect(screen.getByLabelText("Password")).toHaveValue("");
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith({
      sessionId: "ssh-session-1", title: "ssh.example.test",
    }));
  });

  it("switches to private-key authentication without persisting secret input", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(
      <SshConnectForm api={api} hostId="host-1" defaultHostname="ssh.example.test"
        onCancel={() => undefined} onEvent={() => undefined} onOpened={() => undefined} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Authentication" }));
    await user.click(screen.getByRole("option", { name: "Private key" }));
    await user.type(screen.getByRole("textbox", { name: "Username" }), "tester");
    await user.type(screen.getByLabelText("Private key"), "synthetic-private-key");
    await user.type(screen.getByLabelText("Passphrase"), "synthetic-passphrase");
    await user.click(screen.getByRole("button", { name: "Connect SSH" }));

    await waitFor(() => expect(api.storeCredential).toHaveBeenCalledWith(expect.objectContaining({
      type: "privateKey", passphrase: "synthetic-passphrase",
    })));
    expect(screen.getByLabelText("Private key")).toHaveValue("");
    expect(screen.getByLabelText("Passphrase")).toHaveValue("");
  });

  it("requires an explicit fingerprint decision and blocks changed keys", async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    const pending = {
      sessionId: "ssh-session-1", host: "ssh.example.test", port: 22,
      algorithm: "ssh-ed25519", fingerprint: "SHA256:synthetic",
    };
    const { rerender } = render(<HostKeyDialog api={api} pending={pending} onClose={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "Verify SSH host key" })).toHaveTextContent("SHA256:synthetic");
    await user.click(screen.getByRole("button", { name: "Trust and connect" }));
    expect(api.decideHostKey).toHaveBeenCalledWith("ssh-session-1", true);

    rerender(<HostKeyDialog api={api} changed={{ sessionId: "ssh-session-1" }} onClose={() => undefined} />);
    expect(screen.getByRole("alertdialog", { name: "SSH host key changed" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /trust/i })).not.toBeInTheDocument();
  });

  it("persists the connection as a server when the checkbox is checked", async () => {
    const api = fakeApi();
    const onSaveAsServer = vi.fn(async () => undefined);
    const onOpened = vi.fn();
    const user = userEvent.setup();
    render(
      <SshConnectForm
        api={api}
        hostId="quick:ssh.example.test:22221"
        defaultHostname="ssh.example.test"
        defaultPort={22221}
        defaultUsername="tester"
        onCancel={() => undefined}
        onEvent={() => undefined}
        onOpened={onOpened}
        onSaveAsServer={onSaveAsServer}
      />,
    );

    await user.type(screen.getByLabelText("Password"), "synthetic-password");
    await user.click(
      screen.getByRole("checkbox", { name: /save this connection as a server/i }),
    );
    await user.click(screen.getByRole("button", { name: "Connect SSH" }));

    await waitFor(() => expect(onSaveAsServer).toHaveBeenCalledWith({
      hostname: "ssh.example.test",
      port: 22221,
      username: "tester",
      authKind: "password",
      credentialRef: "credential-1",
    }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith({
      sessionId: "ssh-session-1", title: "ssh.example.test",
    }));
  });

  it("does not persist a server when the checkbox is unchecked", async () => {
    const api = fakeApi();
    const onSaveAsServer = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(
      <SshConnectForm
        api={api}
        hostId="quick:ssh.example.test:22"
        defaultHostname="ssh.example.test"
        onCancel={() => undefined}
        onEvent={() => undefined}
        onOpened={() => undefined}
        onSaveAsServer={onSaveAsServer}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Username" }), "tester");
    await user.type(screen.getByLabelText("Password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: "Connect SSH" }));

    await waitFor(() => expect(onSaveAsServer).not.toHaveBeenCalled());
  });

  it("keeps the session open even when persisting as a server fails", async () => {
    const api = fakeApi();
    const onSaveAsServer = vi.fn(async () => {
      throw new Error("storage full");
    });
    const onOpened = vi.fn();
    const user = userEvent.setup();
    render(
      <SshConnectForm
        api={api}
        hostId="quick:ssh.example.test:22"
        defaultHostname="ssh.example.test"
        defaultUsername="tester"
        onCancel={() => undefined}
        onEvent={() => undefined}
        onOpened={onOpened}
        onSaveAsServer={onSaveAsServer}
      />,
    );

    await user.type(screen.getByLabelText("Password"), "synthetic-password");
    await user.click(screen.getByRole("checkbox", { name: /save this connection as a server/i }));
    await user.click(screen.getByRole("button", { name: "Connect SSH" }));

    await waitFor(() => expect(onOpened).toHaveBeenCalled());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "could not be saved as a server",
    );
  });
});
