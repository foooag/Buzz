import { describe, expect, it } from "vitest";
import { createHostInputSchema, createIdentityInputSchema, hostSchema, updateIdentityInputSchema, vaultSchema } from "./schemas";

const timestamp = "2026-07-11T07:00:00.000Z";

describe("inventory schemas", () => {
  it("accepts strict camelCase public models", () => {
    expect(
      vaultSchema.parse({
        id: "vault-1",
        name: "Synthetic Vault",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toMatchObject({ id: "vault-1", name: "Synthetic Vault" });

    expect(
      hostSchema.parse({
        id: "host-1",
        vaultId: "vault-1",
        groupId: null,
        name: "Synthetic Host",
        address: "demo.example.test",
        username: "tester",
        tags: ["Lab"],
        notes: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toMatchObject({ id: "host-1", vaultId: "vault-1" });
  });

  it("rejects unknown properties, empty IDs, and invalid timestamps", () => {
    expect(() =>
      vaultSchema.parse({
        id: "",
        name: "Synthetic Vault",
        createdAt: "today",
        updatedAt: timestamp,
        databasePath: "/private/fixture",
      }),
    ).toThrow();
  });

  it("normalizes host drafts before IPC", () => {
    expect(
      createHostInputSchema.parse({
        vaultId: " vault-1 ",
        groupId: null,
        name: " Synthetic Host ",
        address: " demo.example.test ",
        username: " tester ",
        tags: [" Lab ", "lab", "", "Demo"],
        notes: " synthetic ",
      }),
    ).toEqual({
      vaultId: "vault-1",
      groupId: null,
      name: "Synthetic Host",
      address: "demo.example.test",
      username: "tester",
      tags: ["Lab", "Demo"],
      notes: "synthetic",
    });
  });

  it("validates identity create and update drafts", () => {
    const create = createIdentityInputSchema.parse({
      vaultId: "vault-1",
      name: "deploy-ed25519",
      username: "ubuntu",
      type: "SSH key",
      algorithm: "ed25519",
      passphrase: true,
    });
    expect(create).toMatchObject({ vaultId: "vault-1", name: "deploy-ed25519", type: "SSH key" });

    const minimal = createIdentityInputSchema.parse({
      vaultId: "vault-1",
      name: "bare-key",
      username: "",
    });
    expect(minimal.algorithm).toBeUndefined();
    expect(minimal.passphrase).toBeUndefined();

    const update = updateIdentityInputSchema.parse({
      id: "id-1",
      vaultId: "vault-1",
      name: "prod-cert",
      username: "",
      type: "SSH certificate",
      expires: "2026-08-09",
    });
    expect(update).toMatchObject({ id: "id-1", type: "SSH certificate", expires: "2026-08-09" });
  });

  it("rejects unknown identity fields and blank identity ids", () => {
    expect(() =>
      createIdentityInputSchema.parse({
        vaultId: "vault-1",
        name: "deploy-ed25519",
        username: "",
        fingerprint: "leaked",
      }),
    ).toThrow();
    expect(() =>
      updateIdentityInputSchema.parse({ id: "", vaultId: "vault-1", name: "x", username: "" }),
    ).toThrow();
  });
});
