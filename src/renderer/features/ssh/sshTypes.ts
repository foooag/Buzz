import type { OpenedTerminal, TerminalEvent, TerminalSize } from "../shell/terminalTypes";

export type SshAuthKind = "password" | "privateKey";
export type SshCredentialInput =
  | { type: "password"; password: string }
  | { type: "privateKey"; privateKey: number[]; passphrase: string | null };
export type CreateSshProfile = {
  hostId: string;
  hostname: string;
  port: number | null;
  username: string;
  authKind: SshAuthKind;
  credentialRef: string;
  identityId: string | null;
  keepaliveInterval?: number | null;
};
export type HostKeyPrompt = {
  sessionId: string;
  host: string;
  port: number;
  algorithm: string;
  fingerprint: string;
};
export type SshOpenedTerminal = OpenedTerminal;
export type SshEvent = TerminalEvent;
export type { TerminalSize };
