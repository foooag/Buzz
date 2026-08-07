import { describe, expect, it } from "vitest";
import {
  createGroup,
  createHost,
  createIdentity,
  createVault,
  type ModelFactory,
} from "../../../../src/main/domains/inventory/models";

const factory: ModelFactory = {
  id: () => "generated-id",
  now: () => "2026-08-05T03:00:00.000Z",
};

describe("Electron inventory models", () => {
  it("normalizes vault fields and assigns server-owned metadata", () => {
    expect(createVault({ name: "  Personal  " }, factory)).toEqual({
      id: "generated-id",
      name: "Personal",
      createdAt: "2026-08-05T03:00:00.000Z",
      updatedAt: "2026-08-05T03:00:00.000Z",
    });
    expect(() => createVault({ name: "  " }, factory)).toThrowError(
      expect.objectContaining({ code: "INVENTORY_VALIDATION_FAILED" }),
    );
  });

  it("normalizes groups and rejects unsupported colors", () => {
    expect(createGroup({
      vaultId: " vault-1 ",
      parentId: " ",
      name: " Work ",
      color: "teal",
    }, factory)).toMatchObject({
      vaultId: "vault-1",
      parentId: null,
      name: "Work",
      color: "teal",
    });
    expect(() => createGroup({
      vaultId: "vault-1",
      name: "Work",
      color: "red",
    }, factory)).toThrowError(expect.objectContaining({
      code: "INVENTORY_VALIDATION_FAILED",
    }));
  });

  it("normalizes all host extensions without losing deterministic order", () => {
    expect(createHost({
      vaultId: " vault-1 ",
      groupId: " group-1 ",
      name: " Production ",
      address: " host.internal ",
      username: " deploy ",
      tags: [" Linux ", "linux", "", "Prod"],
      notes: " note ",
      authKind: "privateKey",
      startupCommands: [" uptime ", ""],
      protocol: "ssh",
      port: 2222,
      baudRate: 115200,
      identity: " key-1 ",
      env: { " TERM ": "xterm", " ": "ignored" },
      startupSnippets: [" snippet-1 "],
      status: "online",
      label: " primary ",
      lastConnected: " yesterday ",
    }, factory)).toMatchObject({
      vaultId: "vault-1",
      groupId: "group-1",
      name: "Production",
      address: "host.internal",
      username: "deploy",
      tags: ["Linux", "Prod"],
      notes: "note",
      authKind: "privateKey",
      startupCommands: ["uptime"],
      protocol: "ssh",
      port: 2222,
      baudRate: 115200,
      identity: "key-1",
      env: { TERM: "xterm" },
      startupSnippets: ["snippet-1"],
      status: "online",
      label: "primary",
      lastConnected: "yesterday",
    });
  });

  it("rejects invalid host enum and numeric fields", () => {
    const base = { vaultId: "vault-1", name: "Host", address: "example.com" };
    for (const input of [
      { ...base, protocol: "ftp" },
      { ...base, authKind: "token" },
      { ...base, status: "unknown" },
      { ...base, port: 0 },
      { ...base, baudRate: 1.5 },
    ]) {
      expect(() => createHost(input, factory)).toThrowError(
        expect.objectContaining({ code: "INVENTORY_VALIDATION_FAILED" }),
      );
    }
    expect(createHost({ ...base, protocol: "serial", port: 22 }, factory))
      .not.toHaveProperty("port");
  });

  it("normalizes identity metadata without exposing secret material", () => {
    expect(createIdentity({
      vaultId: " vault-1 ",
      name: " Deploy key ",
      username: " deploy ",
      type: " ssh ",
      algorithm: " ed25519 ",
      passphrase: true,
      expires: " 2027-01-01 ",
    }, factory)).toMatchObject({
      vaultId: "vault-1",
      name: "Deploy key",
      username: "deploy",
      type: "ssh",
      algorithm: "ed25519",
      passphrase: true,
      expires: "2027-01-01",
    });
  });
});
