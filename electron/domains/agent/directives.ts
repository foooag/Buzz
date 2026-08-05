import { DomainError } from "../../ipc/domain-error.js";

export type MentionTarget = {
  type: "host" | "group";
  id: string;
  label: string;
};

const DIRECTIVE_RE = /:(host|group)\[([^\]]*)\]\{name=([^}]+)\}/g;

export function parseDirectives(text: string): MentionTarget[] {
  const targets: MentionTarget[] = [];
  for (const match of text.matchAll(DIRECTIVE_RE)) {
    targets.push({
      type: match[1] as "host" | "group",
      label: match[2],
      id: match[3],
    });
  }
  return targets;
}

export function expandTargets(
  targets: MentionTarget[],
  groupHosts: Record<string, string[]>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const target of targets) {
    const ids = target.type === "group" ? (groupHosts[target.id] ?? []) : [target.id];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export function assertNoUnknownTargets(hostIds: string[], allowedHostIds: Set<string>): void {
  for (const hostId of hostIds) {
    if (!allowedHostIds.has(hostId)) {
      throw new DomainError(
        "AGENT_TARGET_NOT_ALLOWED",
        `Target host ${hostId} is not part of this task.`,
      );
    }
  }
}
