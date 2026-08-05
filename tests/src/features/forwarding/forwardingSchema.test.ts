import { describe, expect, it } from "vitest";
import {
  activeForwardIdListSchema,
  portForwardRuleListSchema,
  portForwardRuleSchema,
} from "@/features/forwarding/forwardingSchema";

const base = {
  id: "r-1",
  hostId: "h-1",
  kind: "local",
  bindHost: "127.0.0.1",
  bindPort: 8080,
  targetHost: "db.internal",
  targetPort: 5432,
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

describe("portForwardRuleSchema", () => {
  it("accepts a fully populated local rule", () => {
    expect(portForwardRuleSchema.parse(base).bindPort).toBe(8080);
  });

  it("accepts a dynamic rule with null targets", () => {
    const dynamic = {
      ...base,
      kind: "dynamic",
      targetHost: null,
      targetPort: null,
    };
    expect(portForwardRuleSchema.parse(dynamic).targetPort).toBeNull();
  });

  it("rejects a zero bind port", () => {
    expect(() =>
      portForwardRuleSchema.parse({ ...base, bindPort: 0 }),
    ).toThrow();
  });

  it("rejects a non-local/remote/dynamic kind", () => {
    expect(() =>
      portForwardRuleSchema.parse({ ...base, kind: "bogus" }),
    ).toThrow();
  });

  it("rejects a local rule missing target host", () => {
    expect(() =>
      portForwardRuleSchema.parse({
        ...base,
        kind: "local",
        targetHost: null,
      }),
    ).toThrow();
  });

  it("parses a list", () => {
    expect(portForwardRuleListSchema.parse([base, base])).toHaveLength(2);
  });

  it("parses an active id list", () => {
    expect(activeForwardIdListSchema.parse(["r-1", "r-2"])).toEqual([
      "r-1",
      "r-2",
    ]);
  });
});
