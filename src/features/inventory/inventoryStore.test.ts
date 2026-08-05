import { describe, expect, it } from "vitest";
import { createInventoryStore } from "./inventoryStore";

describe("inventory store", () => {
  it("tracks loading, ready, active vault, resources, and sanitized errors", () => {
    const store = createInventoryStore();
    store.getState().beginLoad();
    expect(store.getState().status).toBe("loading");

    store.getState().setVaults([
      {
        id: "vault-1",
        name: "Synthetic Vault",
        createdAt: "2026-07-11T07:00:00.000Z",
        updatedAt: "2026-07-11T07:00:00.000Z",
      },
    ]);
    expect(store.getState().activeVaultId).toBe("vault-1");
    expect(store.getState().status).toBe("ready");

    store.getState().fail("VAULT_KEY_UNAVAILABLE");
    expect(store.getState()).toMatchObject({
      status: "error",
      errorCode: "VAULT_KEY_UNAVAILABLE",
    });
  });

  it("replaces only identities via setIdentities", () => {
    const timestamp = "2026-07-11T07:00:00.000Z";
    const store = createInventoryStore();
    store.getState().setVaults([
      { id: "vault-1", name: "Synthetic Vault", createdAt: timestamp, updatedAt: timestamp },
    ]);
    store.getState().setResources(
      [{ id: "g-1", vaultId: "vault-1", parentId: null, name: "Prod", createdAt: timestamp, updatedAt: timestamp }],
      [{ id: "h-1", vaultId: "vault-1", groupId: null, name: "Host", address: "x", username: "", tags: [], notes: "", createdAt: timestamp, updatedAt: timestamp }],
      [{ id: "id-1", vaultId: "vault-1", name: "deploy", username: "", createdAt: timestamp, updatedAt: timestamp }],
    );

    store.getState().setIdentities([
      { id: "id-2", vaultId: "vault-1", name: "bridge", username: "", createdAt: timestamp, updatedAt: timestamp },
    ]);

    const state = store.getState();
    expect(Object.keys(state.identities)).toEqual(["id-2"]);
    expect(state.groups["g-1"]).toBeTruthy();
    expect(state.hosts["h-1"]).toBeTruthy();
    expect(state.status).toBe("ready");
  });
});
