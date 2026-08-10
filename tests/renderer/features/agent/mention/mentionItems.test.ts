import { describe, expect, it } from "vitest";
import { mentionCategories, searchMentionItems } from "@/features/agent/mention/mentionItems";
import type { Group, Host } from "@/shared/types";

const ts = "2026-08-05T00:00:00.000Z";
const groups: Group[] = [{ id: "g1", vaultId: "v1", parentId: null, name: "Production", color: "coral", count: 1, createdAt: ts, updatedAt: ts }];
const hosts: Host[] = [{ id: "h1", vaultId: "v1", groupId: "g1", name: "web-prod-01", address: "10.0.0.10", username: "ubuntu", tags: [], notes: "", status: "online", createdAt: ts, updatedAt: ts }];

describe("searchMentionItems", () => {
  it("returns groups then hosts, matching name/address/id", () => {
    expect(searchMentionItems(hosts, groups, "").map((i) => i.type)).toEqual(["group", "host"]);
    expect(searchMentionItems(hosts, groups, "10.0.0.10")[0]).toMatchObject({ id: "h1", type: "host", label: "web-prod-01" });
    expect(searchMentionItems(hosts, groups, "h1")[0]).toMatchObject({ id: "h1", type: "host" });
    expect(searchMentionItems(hosts, groups, "g1")[0]).toMatchObject({ id: "g1", type: "group" });
  });
});

describe("mentionCategories", () => {
  it("groups items into Groups/Servers categories", () => {
    const cats = mentionCategories(searchMentionItems(hosts, groups, ""));
    expect(cats.map((c) => c.label)).toEqual(["Groups", "Servers"]);
    expect(cats[0]!.items[0]).toMatchObject({ id: "g1" });
    expect(cats[1]!.items[0]).toMatchObject({ id: "h1" });
  });
});
