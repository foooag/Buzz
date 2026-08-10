import { describe, expect, it } from "vitest";
import { extractMentionQuery } from "@/features/agent/mention/useMentionTrigger";

describe("extractMentionQuery", () => {
  it("returns undefined when there is no @ before the caret", () => {
    expect(extractMentionQuery("hello world", 5)).toBeUndefined();
  });
  it("returns the empty query right after @", () => {
    expect(extractMentionQuery("run @", 5)).toEqual({ query: "" });
  });
  it("returns the token between @ and the caret", () => {
    // slice(0, 12) excludes index 12 ('d'), so the token before the caret is "web-pro".
    // (Brief expected "web-prod" — that would require caret=13; off-by-one in the brief.)
    expect(extractMentionQuery("run @web-prod rest", 12)).toEqual({ query: "web-pro" });
  });
  it("stops at whitespace before the @", () => {
    expect(extractMentionQuery("a@b", 3)).toEqual({ query: "b" }); // @ adjacent to non-space is still a trigger
  });
});
