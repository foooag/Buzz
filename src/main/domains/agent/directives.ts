import { DomainError } from "../../ipc/domain-error.js";

export type MentionTarget = {
  type: "host" | "group";
  id: string;
  label: string;
};

const directivePattern = /:(host|group)\[([^\]]*)\]\{name=([^}]+)\}/g;

export function parseDirectives(text: string): MentionTarget[] {
  return [...text.matchAll(directivePattern)].map((match) => ({
    type: match[1] as MentionTarget["type"],
    label: match[2],
    id: match[3],
  }));
}

export function expandTargets(
  targets: readonly MentionTarget[],
  groupHosts: Readonly<Record<string, readonly string[]>>,
): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    const hostIds = target.type === "host" ? [target.id] : groupHosts[target.id] ?? [];
    for (const hostId of hostIds) {
      if (seen.has(hostId)) continue;
      seen.add(hostId);
      expanded.push(hostId);
    }
  }
  return expanded;
}

export function assertAllowedTargets(
  hostIds: readonly string[],
  allowed: ReadonlySet<string>,
): void {
  const denied = hostIds.find((hostId) => !allowed.has(hostId));
  if (denied) {
    throw new DomainError(
      "AGENT_TARGET_NOT_ALLOWED",
      "The Agent target is outside the approved host list.",
      { hostId: denied },
    );
  }
}
