import { describe, expect, it } from "vitest";
import { parseDirectiveChips, serializeDirective, type MentionItem } from "@/features/agent/mention/directiveFormat";

const host: MentionItem = { id: "h1", type: "host", label: "web-prod-01", description: "", iconKey: "Server" };
const group: MentionItem = { id: "g1", type: "group", label: "Production", description: "", iconKey: "Folder" };

describe("serializeDirective", () => {
  it("serializes host and group directives with a trailing space", () => {
    expect(serializeDirective(host)).toBe(":host[web-prod-01]{name=h1} ");
    expect(serializeDirective(group)).toBe(":group[Production]{name=g1} ");
  });
});

describe("parseDirectiveChips", () => {
  it("splits text into text + directive chips", () => {
    const chips = parseDirectiveChips("run :host[web-prod-01]{name=h1} now");
    expect(chips).toEqual([
      { kind: "text", text: "run " },
      { kind: "directive", type: "host", id: "h1", label: "web-prod-01" },
      { kind: "text", text: " now" },
    ]);
  });
  it("returns a single text chip when no directives present", () => {
    expect(parseDirectiveChips("plain text")).toEqual([{ kind: "text", text: "plain text" }]);
  });
});
