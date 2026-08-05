import { DomainError } from "../../ipc/domain-error.js";
import type { Host } from "../inventory/models.js";
import type { InventoryRepository } from "../inventory/repository.js";
import type { SshCredentialVault } from "../ssh/credential-vault.js";
import type { CreateSshProfile } from "../ssh/runtime.js";

export type SavedCredentialLike = {
  authKind: "password" | "privateKey";
  credentialRef: string;
};

export type AgentMentionRef = {
  type: "host" | "group";
  id: string;
};

export type AgentHostResolver = {
  resolveProfile(hostId: string): Promise<CreateSshProfile>;
  groupHosts(): Record<string, string[]>;
  resolveMentionLabel(label: string): AgentMentionRef | undefined;
};

export function resolveHeadlessProfile(
  host: Host,
  credential: SavedCredentialLike,
): CreateSshProfile {
  return {
    hostId: host.id,
    hostname: host.address,
    port: host.port ?? 22,
    username: host.username,
    authKind: credential.authKind,
    credentialRef: credential.credentialRef,
    identityId: host.identity ?? null,
    keepaliveInterval: null,
  };
}

export function createAgentHostResolver(
  inventory: InventoryRepository,
  credentials: SshCredentialVault,
): AgentHostResolver {
  return {
    async resolveProfile(hostId) {
      for (const vault of inventory.listVaults()) {
        const host = inventory.listHosts(vault.id).find((candidate) => candidate.id === hostId);
        if (!host) continue;
        if (!host.credentialRef) throw missingCredential(host.name);
        let saved;
        try {
          saved = await credentials.get(host.credentialRef);
        } catch {
          throw missingCredential(host.name);
        }
        if (saved.type === "privateKey") saved.privateKey.fill(0);
        return resolveHeadlessProfile(host, {
          authKind: saved.type === "password" ? "password" : "privateKey",
          credentialRef: host.credentialRef,
        });
      }
      throw new DomainError(
        "AGENT_HOST_NOT_FOUND",
        `Target host ${hostId} is not in the inventory.`,
      );
    },
    groupHosts() {
      const result: Record<string, string[]> = {};
      for (const vault of inventory.listVaults()) {
        for (const host of inventory.listHosts(vault.id)) {
          if (!host.groupId) continue;
          (result[host.groupId] ??= []).push(host.id);
        }
      }
      return result;
    },
    resolveMentionLabel(label) {
      for (const vault of inventory.listVaults()) {
        const host = inventory
          .listHosts(vault.id)
          .find((candidate) => candidate.name === label);
        if (host) return { type: "host", id: host.id };
        const group = inventory
          .listGroups(vault.id)
          .find((candidate) => candidate.name === label);
        if (group) return { type: "group", id: group.id };
      }
      return undefined;
    },
  };
}

function missingCredential(hostName: string): DomainError {
  return new DomainError(
    "AGENT_HOST_CREDENTIAL_MISSING",
    `No saved credential for ${hostName}. Connect once from the Servers page to save credentials.`,
  );
}
