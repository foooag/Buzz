export type QuickScriptStatus = "suggested" | "pinned" | "dismissed";

export type QuickScriptMode = "llm" | "rules";

export type QuickScript = {
  id: string;
  hostId: string;
  sessionId: string;
  title: string;
  script: string;
  description: string | null;
  sourceUsageCount: number;
  sourceSuccessCount: number;
  executedCount: number;
  confidence: number;
  riskHint: string | null;
  status: QuickScriptStatus;
  isNew: boolean;
  mode: QuickScriptMode;
  createdAt: string;
  updatedAt: string;
};

export type QuickScriptPatch = {
  title?: string;
  script?: string;
  status?: QuickScriptStatus;
  executedCount?: number;
};

export type QuickScriptGenerationResult = {
  hostId: string;
  createdCount: number;
  mode: QuickScriptMode | "empty";
  durationMs: number;
  droppedCount: number;
};

export type QuickScriptGeneratedEvent = {
  hostId: string;
  sshSessionId: string;
  createdCount: number;
  mode: QuickScriptMode | "empty";
};
