import { describe, expect, it } from "vitest";
import { createDeterministicForwardingApi } from "./deterministicForwardingApi";
import { createForwardingStore } from "./forwardingStore";

const baseRule = {
  hostId: "h-1",
  kind: "local" as const,
  bindHost: "127.0.0.1",
  bindPort: 8080,
  targetHost: "db.internal",
  targetPort: 5432,
};

describe("forwardingStore", () => {
  it("loads rules for a host", async () => {
    const api = createDeterministicForwardingApi();
    await api.createRule(baseRule);
    const store = createForwardingStore(api);
    await store.getState().loadRules("h-1");
    expect(store.getState().rulesByHostId["h-1"]).toHaveLength(1);
  });

  it("creates a rule and indexes it under the host", async () => {
    const api = createDeterministicForwardingApi();
    const store = createForwardingStore(api);
    const created = await store.getState().createRule(baseRule);
    expect(store.getState().rulesByHostId["h-1"]?.[0]?.id).toBe(created.id);
  });

  it("deletes a rule and removes it from active", async () => {
    const api = createDeterministicForwardingApi();
    const store = createForwardingStore(api);
    const created = await store.getState().createRule(baseRule);
    await store.getState().deleteRule(created.id, "h-1");
    expect(store.getState().rulesByHostId["h-1"]).toEqual([]);
    expect(store.getState().activeIds.has(created.id)).toBe(false);
  });

  it("tracks active state when starting and stopping", async () => {
    const api = createDeterministicForwardingApi();
    const store = createForwardingStore(api);
    const created = await store.getState().createRule(baseRule);
    await store.getState().startRule(
      {
        hostId: "h-1",
        hostname: "example.test",
        port: 22,
        username: "tester",
        authKind: "password",
        credentialRef: "cred-1",
        identityId: null,
      },
      created,
    );
    expect(store.getState().activeIds.has(created.id)).toBe(true);
    await store.getState().stopRule(created.id);
    expect(store.getState().activeIds.has(created.id)).toBe(false);
  });
});
