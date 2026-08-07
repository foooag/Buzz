import type { SshApi } from "./sshApi";

export function createDeterministicSshApi(): SshApi {
  let nextCredential = 1;
  let nextSession = 1;
  const pending = new Map<string, {
    resolve: (opened: { sessionId: string; title: string }) => void;
    title: string;
    onEvent: Parameters<SshApi["open"]>[2];
  }>();

  return {
    async storeCredential() {
      return `deterministic-credential-${nextCredential++}`;
    },

    open(profile, _size, onEvent) {
      const sessionId = `deterministic-ssh-${nextSession++}`;
      return new Promise((resolve) => {
        pending.set(sessionId, { resolve, title: profile.hostname, onEvent });
        onEvent({
          type: "hostKeyVerificationRequired",
          sessionId,
          host: profile.hostname,
          port: profile.port ?? 22,
          algorithm: "ssh-ed25519",
          fingerprint: "SHA256:synthetic",
        });
      });
    },

    async decideHostKey(sessionId, trust) {
      const connection = pending.get(sessionId);
      if (!connection) return;
      pending.delete(sessionId);
      if (!trust) throw new Error("synthetic rejection");
      connection.onEvent({ type: "connectionStateChanged", sessionId, state: "connected" });
      connection.onEvent({
        type: "output",
        sessionId,
        data: Array.from(new TextEncoder().encode("__SYNTHETIC_SSH_READY__\r\n")),
      });
      connection.resolve({ sessionId, title: connection.title });
      setTimeout(() => {
        connection.onEvent({ type: "connectionStateChanged", sessionId, state: "disconnected" });
        connection.onEvent({ type: "reconnectAvailable", sessionId });
      }, 250);
    },

    async reconnect() {
      return {
        sessionId: `deterministic-ssh-${nextSession++}`,
        title: "ssh.example.test",
      };
    },

    async listKnownHosts() {
      return [];
    },

    async deleteKnownHost() {
      return undefined;
    },
  };
}
