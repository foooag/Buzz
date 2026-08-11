import { describe, expect, it } from "vitest";
import {
  parseDirectives,
  resolveTargets,
} from "../../../../src/renderer/features/agent/directiveText";

describe("renderer Agent directives", () => {
  it("parses and expands host/group directives", () => {
    const text = ":host[db]{name=h1} :group[prod]{name=g1}";
    expect(parseDirectives(text)).toHaveLength(2);
    expect(resolveTargets(text, { g1: ["h1", "h2"] })).toEqual(["h1", "h2"]);
  });
});
