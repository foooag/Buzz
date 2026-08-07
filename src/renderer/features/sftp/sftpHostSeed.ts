/**
 * Seed data for the SFTP connect surface. Mirrors the design prototype's
 * (designs/terminal-ai-mode) host list + recent connections so the panel has a
 * believable quick-connect dropdown and Recent SFTP rail when the live
 * inventory store is empty (browser demo / first run). When the inventory
 * store has SSH hosts, those win and this seed is only a fallback.
 */

export type SftpHostStatus = "online" | "offline" | "connecting" | "failed";

import type { HostAuthKind } from "../../shared/types";

export type SftpHost = {
  id: string;
  name: string;
  address: string;
  username: string;
  port: number | null;
  identity: string | null;
  authKind?: HostAuthKind;
  credentialRef?: string | null;
  status?: SftpHostStatus;
};

export const SFTP_HOST_SEED: SftpHost[] = [
  { id: "h-web-prod-01", name: "web-prod-01", address: "10.0.0.10", username: "ubuntu", port: 22, identity: "deploy-ed25519", status: "online" },
  { id: "h-web-prod-02", name: "web-prod-02", address: "10.0.0.11", username: "ubuntu", port: 22, identity: "deploy-ed25519", status: "online" },
  { id: "h-api-prod-01", name: "api-prod-01", address: "10.0.0.20", username: "deploy", port: 22, identity: "deploy-ed25519", status: "offline" },
  { id: "h-bastion-jump", name: "bastion-jump", address: "203.0.113.10", username: "bridge", port: 2200, identity: "bridge-ed25519", status: "online" },
  { id: "h-db-primary", name: "db-primary", address: "10.0.2.5", username: "postgres", port: 22, identity: "db-rsa", status: "online" },
  { id: "h-db-replica-02", name: "db-replica-02", address: "10.0.2.6", username: "postgres", port: 22, identity: "db-rsa", status: "online" },
  { id: "h-redis-cache-01", name: "redis-cache-01", address: "10.0.2.20", username: "redis", port: 22, identity: "deploy-ed25519", status: "offline" },
  { id: "h-stage-app-01", name: "stage-app-01", address: "10.0.4.10", username: "ubuntu", port: 22, identity: "deploy-ed25519", status: "online" },
];

export type SftpRecent = {
  id: string;
  host: string;
  path: string;
  when: string;
};

export const SFTP_RECENT: SftpRecent[] = [
  { id: "r-1", host: "web-prod-01", path: "/var/www/shop", when: "2 min ago" },
  { id: "r-2", host: "db-primary", path: "/etc/postgresql/15/main", when: "1 h ago" },
  { id: "r-3", host: "stage-app-01", path: "/srv/stage-app/current", when: "yesterday" },
  { id: "r-4", host: "bastion-jump", path: "/home/bridge/uploads", when: "2 d ago" },
];
