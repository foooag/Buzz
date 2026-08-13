import { describe, expect, it } from "vitest";
import { resolveHeadlessProfile } from "../../../../src/main/domains/agent/host-resolution";
import type { Host } from "../../../../src/main/domains/inventory/models";

describe("resolveHeadlessProfile", () => {
  it("maps an inventory host to an SSH profile", () => {
    expect(resolveHeadlessProfile(host({
      address: "db.example.test",
      port: 2202,
      authKind: "privateKey",
      credentialRef: "credential-1",
      identity: "identity-1",
    }))).toEqual({
      hostId: "h1",
      hostname: "db.example.test",
      port: 2202,
      username: "deploy",
      authKind: "privateKey",
      credentialRef: "credential-1",
      identityId: "identity-1",
      keepaliveInterval: null,
    });
  });

  it("uses SSH defaults without resolving credentials", () => {
    expect(resolveHeadlessProfile(host())).toMatchObject({
      port: 22,
      authKind: "password",
      credentialRef: "",
      identityId: null,
    });
  });
});

function host(overrides: Partial<Host> = {}): Host {
  return {
    id: "h1",
    vaultId: "v1",
    groupId: null,
    name: "Database",
    address: "127.0.0.1",
    username: "deploy",
    tags: [],
    notes: "",
    startupCommands: [],
    env: {},
    startupSnippets: [],
    label: "",
    lastConnected: "",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}
