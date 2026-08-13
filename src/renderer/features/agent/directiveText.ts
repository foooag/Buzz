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
  const seen = new Set<string>();
  const result: string[] = [];
  for (const target of targets) {
    for (const hostId of target.type === "host"
      ? [target.id]
      : groupHosts[target.id] ?? []) {
      if (seen.has(hostId)) continue;
      seen.add(hostId);
      result.push(hostId);
    }
  }
  return result;
}

export function resolveTargets(
  text: string,
  groupHosts: Readonly<Record<string, readonly string[]>>,
): string[] {
  return expandTargets(parseDirectives(text), groupHosts);
}
