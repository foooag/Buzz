import { COMMANDS } from "@shared/ipc/command-names";
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
  storeCredential: (credential) => callCommand(COMMANDS.sshStoreCredential, { credential }),
  open: (profile, size, onEvent) =>
    callStreamingCommand(COMMANDS.sshOpen, { profile, size }, (event) => {
      if (isTerminalEvent(event)) onEvent(event);
    }),
  decideHostKey: (sessionId, trust) => callCommand(COMMANDS.sshDecideHostKey, { sessionId, trust }),
  reconnect: (sessionId) => callCommand(COMMANDS.sshReconnect, { sessionId }),
  listKnownHosts: () => callCommand(COMMANDS.sshListKnownHosts, {}),
  deleteKnownHost: (hostname, port) =>
    callCommand(COMMANDS.sshDeleteKnownHost, { hostname, port }),
};
