import { describe, expect, it } from "vitest";
import { createDeterministicForwardingApi } from "./deterministicForwardingApi";

const baseRule = {
  hostId: "h-1",
  kind: "local" as const,
  bindHost: "127.0.0.1",
  bindPort: 8080,
  targetHost: "db.internal",
  targetPort: 5432,
};

describe("deterministicForwardingApi", () => {
  it("creates a rule with a generated id", async () => {
    const api = createDeterministicForwardingApi();
    const created = await api.createRule(baseRule);
    expect(created.id).toBeTruthy();
    expect(created.bindPort).toBe(8080);
  });

  it("lists rules scoped to a host", async () => {
    const api = createDeterministicForwardingApi();
    await api.createRule(baseRule);
    await api.createRule({ ...baseRule, hostId: "h-2" });
    const h1 = await api.listRules("h-1");
    expect(h1).toHaveLength(1);
    expect(h1[0]!.hostId).toBe("h-1");
  });

  it("starts and stops a forward, tracking active ids", async () => {
    const api = createDeterministicForwardingApi();
    const rule = await api.createRule(baseRule);
    expect(await api.listActive()).toEqual([]);
    await api.start(
      {
        hostId: "h-1",
        hostname: "example.test",
        port: 22,
        username: "tester",
        authKind: "password",
        credentialRef: "cred-1",
        identityId: null,
      },
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
    expect(await api.listActive()).toEqual([rule.id]);
    await api.stop(rule.id);
    expect(await api.listActive()).toEqual([]);
  });

  it("deletes a rule", async () => {
    const api = createDeterministicForwardingApi();
    const rule = await api.createRule(baseRule);
    await api.deleteRule(rule.id);
    expect(await api.listRules("h-1")).toEqual([]);
  });
});
