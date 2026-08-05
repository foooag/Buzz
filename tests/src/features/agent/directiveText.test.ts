import { describe, expect, it } from "vitest";
import {
  expandTargets,
  parseDirectives,
} from "@/features/agent/directiveText";

describe("renderer directive text", () => {
  it("parses host and group directives", () => {
    expect(parseDirectives(
      "把 @:host[db-primary]{name=h1} 的容器跑到 @:group[prod]{name=g1}",
    )).toEqual([
      { type: "host", id: "h1", label: "db-primary" },
      { type: "group", id: "g1", label: "prod" },
    ]);
  });

  it("resolves friendly @ mentions through the inventory resolver", () => {
    const resolveMention = (label: string) =>
      label === "db-primary"
        ? { type: "host" as const, id: "h1" }
        : label === "prod"
          ? { type: "group" as const, id: "g1" }
          : undefined;
    expect(parseDirectives(
      "把 @db-primary 的容器跑到 @prod",
      resolveMention,
    )).toEqual([
      { type: "host", id: "h1", label: "db-primary" },
      { type: "group", id: "g1", label: "prod" },
    ]);
  });

  it("expands groups and preserves order", () => {
    expect(expandTargets(
      [
        { type: "host", id: "a", label: "A" },
        { type: "group", id: "g", label: "G" },
      ],
      { g: ["a", "b"] },
    )).toEqual(["a", "b"]);
  });
});
