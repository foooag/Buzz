export type ConflictKind =
  | { kind: "targetExists"; targetName: string }
  | { kind: "remoteChanged"; remoteName: string };

export type ConflictPolicy = "ask" | "overwrite" | "skip" | "rename";

export type ConflictResolution =
  | { resolution: "overwrite" }
  | { resolution: "skip" }
  | { resolution: "rename"; newName: string }
  | { resolution: "applyToAll"; policy: ConflictPolicy };
