import { describe, expect, it } from "vitest";
import {
  assertAllowedTargets,
  expandTargets,
  parseDirectives,
} from "../../../../src/main/domains/agent/directives";

describe("Agent directives", () => {
  it("parses host and group mentions", () => {
    expect(parseDirectives(
      "check :host[db one]{name=h1} then :group[prod]{name=g1}",
    )).toEqual([
      { type: "host", id: "h1", label: "db one" },
      { type: "group", id: "g1", label: "prod" },
    ]);
  });

  it("expands groups with stable de-duplication", () => {
    expect(expandTargets([
      { type: "host", id: "h2", label: "two" },
      { type: "group", id: "g1", label: "prod" },
      { type: "host", id: "h1", label: "one" },
    ], { g1: ["h1", "h2", "h3"] })).toEqual(["h2", "h1", "h3"]);
  });

  it("rejects targets outside the allow-list", () => {
    expect(() => assertAllowedTargets(["h1", "h2"], new Set(["h1"])))
      .toThrowError(expect.objectContaining({ code: "AGENT_TARGET_NOT_ALLOWED" }));
  });

  it("returns an empty target list for plain text", () => {
    expect(parseDirectives("uptime")).toEqual([]);
  });
});
