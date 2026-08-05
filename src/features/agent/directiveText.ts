export type MentionTarget = {
  type: "host" | "group";
  id: string;
  label: string;
};

export type MentionResolver = (
  label: string,
) => { type: "host" | "group"; id: string } | undefined;

const DIRECTIVE_RE = /:(host|group)\[([^\]]*)\]\{name=([^}]+)\}/g;
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
