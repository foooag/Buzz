import { callCommand, callStreamingCommand } from "../../app/ipc";
import { isTerminalEvent, type OpenedTerminal, type TerminalEvent, type TerminalSize } from "../shell/terminalTypes";
import type { CreateSshProfile, SshCredentialInput } from "./sshTypes";

export type KnownHostRecord = {
  hostname: string;
  port: number;
  algorithm: string;
  fingerprint: string;
  firstConfirmedAt: string;
  updatedAt: string;
};

export type SshApi = {
  storeCredential(credential: SshCredentialInput): Promise<string>;
  open(profile: CreateSshProfile, size: TerminalSize, onEvent: (event: TerminalEvent) => void): Promise<OpenedTerminal>;
  decideHostKey(sessionId: string, trust: boolean): Promise<void>;
  reconnect(sessionId: string): Promise<OpenedTerminal>;
  listKnownHosts(): Promise<KnownHostRecord[]>;
  deleteKnownHost(hostname: string, port: number): Promise<void>;
};

export const sshApi: SshApi = {
  storeCredential: (credential) => callCommand("ssh_store_credential", { credential }),
  open: (profile, size, onEvent) =>
    callStreamingCommand("ssh_open", { profile, size }, (event) => {
      if (isTerminalEvent(event)) onEvent(event);
    }),
  decideHostKey: (sessionId, trust) => callCommand("ssh_decide_host_key", { sessionId, trust }),
  reconnect: (sessionId) => callCommand("ssh_reconnect", { sessionId }),
  listKnownHosts: () => callCommand("ssh_list_known_hosts", {}),
  deleteKnownHost: (hostname, port) =>
    callCommand("ssh_delete_known_host", { hostname, port }),
};
