import { describe, expect, it } from "vitest";
import {
  assertNoUnknownTargets,
  expandTargets,
  parseDirectives,
} from "../../../../src/main/domains/agent/directives.js";
import { DomainError } from "../../../../src/main/ipc/domain-error.js";

describe("parseDirectives", () => {
  it("parses host and group directives", () => {
    expect(parseDirectives("把 :host[db-primary]{name=h1} 的容器跑到 :group[prod]{name=g1}"))
      .toEqual([
        { type: "host", id: "h1", label: "db-primary" },
        { type: "group", id: "g1", label: "prod" },
      ]);
  });

  it("returns an empty list when no directives are present", () => {
    expect(parseDirectives("没有任何目标")).toEqual([]);
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

  it("parses linked mentions carrying an internal id", () => {
    expect(parseDirectives(
      "检查 [web-prod-01](host-uuid) 的容器",
      (label) => label === "web-prod-01"
        ? { type: "host", id: "host-uuid" }
        : undefined,
    )).toEqual([
      { type: "host", id: "host-uuid", label: "web-prod-01" },
    ]);
  });
});

describe("expandTargets", () => {
  it("expands groups and dedupes host ids in order", () => {
    expect(expandTargets(
      [
        { type: "host", id: "a", label: "A" },
        { type: "group", id: "g", label: "G" },
        { type: "group", id: "missing", label: "M" },
      ],
      { g: ["a", "b"] },
    )).toEqual(["a", "b"]);
  });
});

describe("assertNoUnknownTargets", () => {
  it("throws when a host id is not allowed", () => {
    expect(() => assertNoUnknownTargets(["a"], new Set(["b"]))).toThrow(DomainError);
  });

  it("passes when all host ids are allowed", () => {
    expect(() => assertNoUnknownTargets(["a", "b"], new Set(["a", "b"]))).not.toThrow();
  });
});
