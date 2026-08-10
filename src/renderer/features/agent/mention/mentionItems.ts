import type { Group, Host } from "@/shared/types";

export type MentionItem = {
  id: string;
  type: "group" | "host";
  label: string;
  description: string;
  iconKey: "Folder" | "Server";
};

export function searchMentionItems(hosts: Host[], groups: Group[], query: string): MentionItem[] {
  const q = query.trim().toLocaleLowerCase();
  const matches = (...values: string[]) =>
    !q || values.some((v) => v.toLocaleLowerCase().includes(q));

  const groupItems: MentionItem[] = groups
    .filter((g) => matches(g.name, g.id))
    .map((g) => ({
      id: g.id, type: "group", label: g.name, iconKey: "Folder",
      description: `${hosts.filter((h) => h.groupId === g.id).length} hosts · expands to group`,
    }));
  const hostItems: MentionItem[] = hosts
    .filter((h) => matches(h.name, h.address, h.id))
    .map((h) => ({ id: h.id, type: "host", label: h.name, description: h.address, iconKey: "Server" }));
  return [...groupItems, ...hostItems];
}

export function mentionCategories(items: MentionItem[]) {
  return [
    { id: "group" as const, label: "Groups" as const, items: items.filter((i) => i.type === "group") },
    { id: "host" as const, label: "Servers" as const, items: items.filter((i) => i.type === "host") },
  ];
}
