import type { MentionItem } from "./mentionItems";
export type { MentionItem };

const DIRECTIVE_RE = /:(host|group)\[([^\]]*)\]\{name=([^}]+)\}/g;

export type DirectiveChip =
  | { kind: "text"; text: string }
  | { kind: "directive"; type: "host" | "group"; id: string; label: string };

export function serializeDirective(item: MentionItem): string {
  return `:${item.type}[${item.label}]{name=${item.id}} `;
}

export function parseDirectiveChips(text: string): DirectiveChip[] {
  const chips: DirectiveChip[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(DIRECTIVE_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) chips.push({ kind: "text", text: text.slice(lastIndex, index) });
    chips.push({ kind: "directive", type: match[1] as "host" | "group", id: match[3]!, label: match[2]! });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) chips.push({ kind: "text", text: text.slice(lastIndex) });
  return chips.length === 0 ? [{ kind: "text", text }] : chips;
}
