import type { SshAuthKind } from "./sshTypes";
import type { Host } from "../../shared/types";

const STORAGE_KEY = "terminus.ssh.saved-credentials";

export type SavedSshCredential = {
  credentialRef: string;
  authKind: SshAuthKind;
};

function read(): Record<string, SavedSshCredential> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(stored).flatMap(([hostId, value]) => {
        if (typeof value === "string") {
          return [[hostId, { credentialRef: value, authKind: "password" as const }]];
        }
        if (
          value &&
          typeof value === "object" &&
          "credentialRef" in value &&
          typeof value.credentialRef === "string" &&
          "authKind" in value &&
          (value.authKind === "password" || value.authKind === "privateKey")
        ) {
          return [[hostId, {
            credentialRef: value.credentialRef,
            authKind: value.authKind,
          }]];
        }
        return [];
      }),
    );
  } catch {
    return {};
  }
}

export function getSavedCredential(hostId: string): SavedSshCredential | null {
  return read()[hostId] ?? null;
}

export function getHostCredential(
  host: Pick<Host, "id" | "authKind" | "credentialRef">,
): SavedSshCredential | null {
  if (host.credentialRef && host.authKind) {
    return {
      credentialRef: host.credentialRef,
      authKind: host.authKind,
    };
  }
  return getSavedCredential(host.id);
}

export function setSavedCredential(hostId: string, credential: SavedSshCredential | null): void {
  const refs = read();
  if (credential) refs[hostId] = credential;
  else delete refs[hostId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(refs));
}
