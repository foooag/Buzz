import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { useInventoryStore } from "@/features/inventory/inventoryStore";
import { setSavedCredential } from "@/features/ssh/savedCredentials";
import { createDeterministicForwardingApi } from "@/features/forwarding/deterministicForwardingApi";
import { createForwardingState } from "@/features/forwarding/forwardingStore";
import { PortForwardingPage } from "@/features/workspace/ResourcePages";

const timestamp = "2026-07-30T07:00:00.000Z";

describe("port forwarding page", () => {
  beforeEach(() => {
    useInventoryStore.setState({
      hosts: {
        "host-1": {
          id: "host-1",
          vaultId: "vault-1",
          groupId: null,
          name: "Loopback SSH",
          address: "127.0.0.1",
          port: 22221,
          username: "tester",
          tags: [],
          notes: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    });
    setSavedCredential("host-1", {
      credentialRef: "credential-1",
      authKind: "password",
    });
  });

  it("creates a rule via the store and starts/stops the transport", async () => {
    const api = createDeterministicForwardingApi();
    const startSpy = vi.spyOn(api, "start");
    const stopSpy = vi.spyOn(api, "stop");
    const store = create<import("@/features/forwarding/forwardingStore").ForwardingState>()(
      createForwardingState(api),
    );
    const user = userEvent.setup();
    render(<PortForwardingPage store={store} keepaliveInterval={45} />);

    await user.click(screen.getByRole("button", { name: "New rule" }));
    await user.type(screen.getByLabelText(/Label/), "Real loopback");
    await user.selectOptions(screen.getByLabelText("SSH host"), "host-1");
    await user.clear(screen.getByLabelText("Bind port"));
    await user.type(screen.getByLabelText("Bind port"), "18080");
    await user.clear(screen.getByLabelText("Target port"));
    await user.type(screen.getByLabelText("Target port"), "80");
    await user.click(screen.getByRole("button", { name: "Create rule" }));

    const toggle = await screen.findByRole("switch", { name: "Toggle Real loopback" });
    await user.click(toggle);
    await waitFor(() =>
      expect(startSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "127.0.0.1",
          port: 22221,
          credentialRef: "credential-1",
          keepaliveInterval: 45,
        }),
        expect.objectContaining({ kind: "local", bindPort: 18080, targetPort: 80 }),
        expect.any(Function),
      ),
    );
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));

    await user.click(toggle);
    await waitFor(() => expect(stopSpy).toHaveBeenCalled());
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });
});
