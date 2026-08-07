import { DomainError } from "../../ipc/domain-error.js";

export type MentionTarget = {
  type: "host" | "group";
  id: string;
  label: string;
};

export type MentionResolver = (
  label: string,
) => { type: "host" | "group"; id: string } | undefined;

const DIRECTIVE_RE = /:(host|group)\[([^\]]*)\]\{name=([^}]+)\}/g;
const LINKED_MENTION_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const FRIENDLY_MENTION_RE = /@([^\s@]+)/g;

export function parseDirectives(
  text: string,
  resolveMention?: MentionResolver,
): MentionTarget[] {
  const matches: Array<{ index: number; target: MentionTarget }> = [];
  for (const match of text.matchAll(DIRECTIVE_RE)) {
    matches.push({
      index: match.index ?? 0,
      target: {
        type: match[1] as "host" | "group",
        label: match[2],
        id: match[3],
      },
    });
  }
  for (const match of text.matchAll(LINKED_MENTION_RE)) {
    const resolved = resolveMention?.(match[1]);
    matches.push({
      index: match.index ?? 0,
      target: {
        type: resolved?.type ?? "host",
        label: match[1],
        id: match[2],
      },
    });
  }
  if (resolveMention) {
    for (const match of text.matchAll(FRIENDLY_MENTION_RE)) {
      const resolved = resolveMention(match[1]);
      if (!resolved) continue;
      matches.push({
        index: match.index ?? 0,
        target: {
          type: resolved.type,
          label: match[1],
          id: resolved.id,
        },
      });
    }
  }
  return matches
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.target);
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
