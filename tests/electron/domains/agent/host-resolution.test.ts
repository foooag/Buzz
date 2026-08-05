import { describe, expect, it, vi } from "vitest";
import {
  createAgentHostResolver,
  resolveHeadlessProfile,
} from "../../../../electron/domains/agent/host-resolution.js";
import type { Host } from "../../../../electron/domains/inventory/models.js";
import type { InventoryRepository } from "../../../../electron/domains/inventory/repository.js";
import type { SshCredentialVault } from "../../../../electron/domains/ssh/credential-vault.js";

const host = {
  id: "h1",
  vaultId: "vault-1",
  groupId: "g1",
  name: "web-prod-01",
  address: "192.168.1.10",
  username: "root",
  authKind: "password",
  credentialRef: "cred-1",
  port: 22,
} as unknown as Host;

describe("resolveHeadlessProfile", () => {
  it("builds an SSH profile from inventory host and credential", () => {
    expect(resolveHeadlessProfile(host, {
      authKind: "password",
      credentialRef: "cred-1",
    })).toEqual({
      hostId: "h1",
      hostname: "192.168.1.10",
      port: 22,
      username: "root",
      authKind: "password",
      credentialRef: "cred-1",
      identityId: null,
      keepaliveInterval: null,
    });
  });
});

describe("createAgentHostResolver", () => {
  it("resolves a profile and group host map from the inventory", async () => {
    const inventory = {
      listVaults: vi.fn(() => [{ id: "vault-1", name: "Local vault" }]),
      listHosts: vi.fn(() => [host]),
    } as unknown as InventoryRepository;
    const credentials = {
      get: vi.fn(async () => ({ type: "password", password: "secret" })),
    } as unknown as SshCredentialVault;
    const resolver = createAgentHostResolver(inventory, credentials);

    await expect(resolver.resolveProfile("h1")).resolves.toMatchObject({
      hostId: "h1",
      hostname: "192.168.1.10",
    });
    expect(resolver.groupHosts()).toEqual({ g1: ["h1"] });
  });

  it("reports a missing credential for an inventory host", async () => {
    const inventory = {
      listVaults: vi.fn(() => [{ id: "vault-1", name: "Local vault" }]),
      listHosts: vi.fn(() => [{ ...host, credentialRef: undefined }]),
    } as unknown as InventoryRepository;
    const resolver = createAgentHostResolver(
      inventory,
      { get: vi.fn() } as unknown as SshCredentialVault,
    );
    await expect(resolver.resolveProfile("h1")).rejects.toMatchObject({
      code: "AGENT_HOST_CREDENTIAL_MISSING",
    });
  });

  it("reports a host that is not in the inventory", async () => {
    const inventory = {
      listVaults: vi.fn(() => [{ id: "vault-1", name: "Local vault" }]),
      listHosts: vi.fn(() => []),
    } as unknown as InventoryRepository;
    const resolver = createAgentHostResolver(
      inventory,
      { get: vi.fn() } as unknown as SshCredentialVault,
    );
    await expect(resolver.resolveProfile("ghost")).rejects.toMatchObject({
      code: "AGENT_HOST_NOT_FOUND",
    });
  });
});
