export type MentionTarget = {
  type: "host" | "group";
  id: string;
  label: string;
};

export type MentionResolver = (
  label: string,
) => { type: "host" | "group"; id: string } | undefined;

type ReferencedHost = {
  id: string;
  name: string;
  address: string;
};

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

export function findReferencedHostIds(
  text: string,
  hosts: ReferencedHost[],
): string[] {
  const aliases = new Map<string, ReferencedHost[]>();
  for (const host of hosts) {
    for (const alias of new Set([host.id, host.name, host.address])) {
      const normalized = alias.trim().toLocaleLowerCase();
      if (!normalized) continue;
      const matches = aliases.get(normalized) ?? [];
      if (!matches.some((match) => match.id === host.id)) matches.push(host);
      aliases.set(normalized, matches);
    }
  }

  const normalizedText = text.toLocaleLowerCase();
  return [...aliases.entries()]
    .flatMap(([alias, matches]) => {
      // An ambiguous name/address must still be selected explicitly with @.
      if (matches.length !== 1) return [];
      const index = findWholeReference(normalizedText, alias);
      return index < 0 ? [] : [{ index, hostId: matches[0].id }];
    })
    .sort((a, b) => a.index - b.index)
    .reduce<string[]>((hostIds, match) => {
      if (!hostIds.includes(match.hostId)) hostIds.push(match.hostId);
      return hostIds;
    }, []);
}

function findWholeReference(text: string, reference: string): number {
  let fromIndex = 0;
  while (fromIndex <= text.length - reference.length) {
    const index = text.indexOf(reference, fromIndex);
    if (index < 0) return -1;
    const before = index === 0 ? "" : text[index - 1];
    const afterIndex = index + reference.length;
    const after = afterIndex === text.length ? "" : text[afterIndex];
    if (!isReferenceCharacter(before) && !isReferenceCharacter(after)) {
      return index;
    }
    fromIndex = index + 1;
  }
  return -1;
}

function isReferenceCharacter(character: string): boolean {
  return character !== "" && /[\p{L}\p{N}_.:-]/u.test(character);
}
