import { describe, expect, it } from "vitest";
import {
  conflictKindSchema,
  conflictResolutionSchema,
  resolveConflictInputSchema,
} from "./sftpTypes";

describe("sftp conflict schemas", () => {
  it("parses applyToAll overwrite resolution", () => {
    const parsed = resolveConflictInputSchema.parse({
      transferId: "t1",
      itemId: "i1",
      resolution: { resolution: "applyToAll", applyToAll: "overwrite" },
    });
    expect(parsed.resolution.resolution).toBe("applyToAll");
    if (parsed.resolution.resolution === "applyToAll") {
      expect(parsed.resolution.applyToAll).toBe("overwrite");
    }
  });

  it("parses a targetExists conflict kind", () => {
    const parsed = conflictKindSchema.parse({
      kind: "targetExists",
      targetName: "report.csv",
    });
    expect(parsed.kind).toBe("targetExists");
    if (parsed.kind === "targetExists") {
      expect(parsed.targetName).toBe("report.csv");
    }
  });

  it("parses a rename resolution with a new name", () => {
    const parsed = conflictResolutionSchema.parse({
      resolution: "rename",
      newName: "report (1).csv",
    });
    expect(parsed.resolution).toBe("rename");
  });

  it("rejects an unknown conflict kind discriminant", () => {
    expect(() =>
      conflictKindSchema.parse({ kind: "unknown", targetName: "x" }),
    ).toThrow();
  });

  it("rejects a resolution missing the applyToAll policy", () => {
    expect(() =>
      conflictResolutionSchema.parse({ resolution: "applyToAll" }),
    ).toThrow();
  });
});
