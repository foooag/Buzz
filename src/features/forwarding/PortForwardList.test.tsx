import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createDeterministicForwardingApi } from "./deterministicForwardingApi";
import { PortForwardList } from "./PortForwardList";

const profile = {
  hostId: "h-1",
  hostname: "example.test",
  port: 22,
  username: "tester",
  authKind: "password" as const,
  credentialRef: "cred-1",
  identityId: null,
};

describe("PortForwardList", () => {
  it("shows an empty state when no rules exist", async () => {
    const api = createDeterministicForwardingApi();
    render(<PortForwardList hostId="h-1" profile={profile} api={api} />);
    expect(
      await screen.findByText(/no port forwarding rules/i),
    ).toBeInTheDocument();
  });

  it("lists saved rules with their bind and target", async () => {
    const api = createDeterministicForwardingApi();
    await api.createRule({
      hostId: "h-1",
      kind: "local",
      bindHost: "127.0.0.1",
      bindPort: 8080,
      targetHost: "db.internal",
      targetPort: 5432,
    });
    render(<PortForwardList hostId="h-1" profile={profile} api={api} />);
    expect(await screen.findByText(/127\.0\.0\.1:8080/)).toBeInTheDocument();
    expect(screen.getByText(/db\.internal:5432/)).toBeInTheDocument();
  });

  it("starts a forward when the start button is clicked", async () => {
    const api = createDeterministicForwardingApi();
    const rule = await api.createRule({
      hostId: "h-1",
      kind: "local",
      bindHost: "127.0.0.1",
      bindPort: 8080,
      targetHost: "db.internal",
      targetPort: 5432,
    });
    render(<PortForwardList hostId="h-1" profile={profile} api={api} />);
    const start = await screen.findByRole("button", { name: /start/i });
    await userEvent.click(start);
    await waitFor(async () => {
      expect(await api.listActive()).toEqual([rule.id]);
    });
  });

  it("stops a running forward", async () => {
    const api = createDeterministicForwardingApi();
    const rule = await api.createRule({
      hostId: "h-1",
      kind: "local",
      bindHost: "127.0.0.1",
      bindPort: 8080,
      targetHost: "db.internal",
      targetPort: 5432,
    });
    await api.start(
      profile,
      {
        id: rule.id,
        kind: rule.kind,
        bindHost: rule.bindHost,
        bindPort: rule.bindPort,
        targetHost: rule.targetHost,
        targetPort: rule.targetPort,
      },
      () => {},
    );
    render(<PortForwardList hostId="h-1" profile={profile} api={api} />);
    const stop = await screen.findByRole("button", { name: /stop/i });
    await userEvent.click(stop);
    await waitFor(async () => {
      expect(await api.listActive()).toEqual([]);
    });
  });

  it("deletes a rule", async () => {
    const api = createDeterministicForwardingApi();
    await api.createRule({
      hostId: "h-1",
      kind: "local",
      bindHost: "127.0.0.1",
      bindPort: 8080,
      targetHost: "db.internal",
      targetPort: 5432,
    });
    render(<PortForwardList hostId="h-1" profile={profile} api={api} />);
    const remove = await screen.findByRole("button", { name: /delete/i });
    await userEvent.click(remove);
    await waitFor(async () => {
      expect(await api.listRules("h-1")).toEqual([]);
    });
    expect(await api.listActive()).toEqual([]);
  });
});
