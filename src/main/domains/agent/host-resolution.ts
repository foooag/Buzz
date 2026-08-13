import type { Host } from "../inventory/models.js";
import type { CreateSshProfile } from "../ssh/runtime.js";

export function resolveHeadlessProfile(host: Host): CreateSshProfile {
  return {
    hostId: host.id,
    hostname: host.address,
    port: host.port ?? 22,
    username: host.username,
    authKind: host.authKind ?? "password",
    credentialRef: host.credentialRef ?? "",
    identityId: host.identity ?? null,
    keepaliveInterval: null,
  };
}
