// Pure extraction + aggregation of ssh_exec commands from AI session messages
// (PRD F2). No I/O — fully unit-testable. Message input is structurally typed
// so both live pi-agent-core messages and deserialized history rows work.

export type ExecutedCommand = {
  command: string;
  cwd: string | null;
  ok: boolean;
};

export type CommandAggregate = {
  command: string;
  usageCount: number;
  successCount: number;
  cwds: string[];
};

export function extractExecutedCommands(messages: readonly unknown[]): ExecutedCommand[] {
  const resultOk = new Map<string, boolean>();
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as {
      role?: unknown;
      toolCallId?: unknown;
      isError?: unknown;
      content?: unknown;
    };
    if (record.role !== "toolResult" || typeof record.toolCallId !== "string") continue;
    let ok = record.isError !== true;
    if (ok && Array.isArray(record.content)) {
      const textPart = record.content.find(
        (part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text",
      ) as { text?: unknown } | undefined;
      if (typeof textPart?.text === "string") {
        try {
          const parsed = JSON.parse(textPart.text) as { exitCode?: unknown };
          if (typeof parsed.exitCode === "number" && parsed.exitCode !== 0) ok = false;
        } catch {
          /* non-JSON tool output keeps isError verdict */
        }
      }
    }
    resultOk.set(record.toolCallId, ok);
  }

  const executed: ExecutedCommand[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as { role?: unknown; content?: unknown };
    if (record.role !== "assistant" || !Array.isArray(record.content)) continue;
    for (const part of record.content) {
      if (!part || typeof part !== "object") continue;
      const candidate = part as { type?: unknown; id?: unknown; name?: unknown; arguments?: unknown };
      if (candidate.type !== "toolCall" || candidate.name !== "ssh_exec") continue;
      const args = candidate.arguments as { command?: unknown; cwd?: unknown } | null;
      if (!args || typeof args.command !== "string" || args.command.trim().length === 0) continue;
      executed.push({
        command: args.command,
        cwd: typeof args.cwd === "string" && args.cwd.trim() ? args.cwd : null,
        ok: typeof candidate.id === "string" ? resultOk.get(candidate.id) === true : false,
      });
    }
  }
  return executed;
}

function collapseUnquotedWhitespace(line: string): string {
  let out = "";
  let pending = false;
  let quote: '"' | "'" | null = null;
  for (const ch of line) {
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      if (pending && out.length > 0) out += " ";
      pending = false;
      out += ch;
      continue;
    }
    if (ch === " " || ch === "\t") {
      pending = true;
      continue;
    }
    if (pending && out.length > 0) out += " ";
    pending = false;
    out += ch;
  }
  return out;
}

/** Merge runs of spaces/tabs outside quotes; collapse blank lines; trim edges (PRD F2). */
export function normalizeForMatch(command: string): string {
  const lines = command
    .split("\n")
    .map((line) => collapseUnquotedWhitespace(line).trim())
    .filter((line) => line.length > 0);
  return lines.join("\n");
}

/** Split a command into chain segments on && || | ; and newlines, quote-aware. */
function splitChainSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    const pair = command.slice(i, i + 2);
    if (pair === "&&" || pair === "||") {
      segments.push(current);
      current = "";
      i += 1;
      continue;
    }
    if (ch === "|" || ch === ";" || ch === "\n") {
      segments.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

/** Command-name sequence of chain segments, e.g. "cd>docker" (PRD F2 skeleton). */
export function skeletonKey(command: string): string {
  const names = splitChainSegments(command).map((segment) => {
    const tokens = segment.split(/\s+/).filter((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
    return tokens[0] ?? "";
  });
  return names.filter(Boolean).join(">");
}

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /[A-Za-z0-9+/_-]{40,}/,
];

export function containsSecret(command: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(command));
}

type Bucket = {
  command: string;
  repUsage: number;
  usage: number;
  success: number;
  cwds: Set<string>;
};

export function aggregateCommands(
  executed: readonly ExecutedCommand[],
): { items: CommandAggregate[]; droppedCount: number } {
  const byText = new Map<string, Bucket>();
  let droppedCount = 0;
  for (const item of executed) {
    const key = normalizeForMatch(item.command);
    if (!key) continue;
    if (containsSecret(key)) {
      droppedCount += 1;
      continue;
    }
    const bucket = byText.get(key) ?? { command: key, repUsage: 0, usage: 0, success: 0, cwds: new Set<string>() };
    bucket.usage += 1;
    bucket.repUsage = bucket.usage;
    if (item.ok) bucket.success += 1;
    if (item.cwd) bucket.cwds.add(item.cwd);
    byText.set(key, bucket);
  }

  // Second pass: merge command variants under the same skeleton; the
  // highest-frequency verbatim text becomes the representative.
  const merged = new Map<string, Bucket>();
  for (const bucket of byText.values()) {
    const skeleton = skeletonKey(bucket.command);
    const target = merged.get(skeleton);
    if (!target) {
      merged.set(skeleton, { ...bucket, cwds: new Set(bucket.cwds) });
      continue;
    }
    target.usage += bucket.usage;
    target.success += bucket.success;
    for (const cwd of bucket.cwds) target.cwds.add(cwd);
    if (bucket.usage > target.repUsage) {
      target.command = bucket.command;
      target.repUsage = bucket.usage;
    }
  }

  const items = [...merged.values()]
    .map((bucket) => ({
      command: bucket.command,
      usageCount: bucket.usage,
      successCount: bucket.success,
      cwds: [...bucket.cwds],
    }))
    .sort(
      (a, b) =>
        b.usageCount - a.usageCount ||
        b.successCount / Math.max(1, b.usageCount) - a.successCount / Math.max(1, a.usageCount),
    );
  return { items, droppedCount };
}
