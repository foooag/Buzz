import type { CommandAggregate } from "./extractor.js";
import { normalizeForMatch } from "./extractor.js";
import type { GeneratedScript } from "./repository.js";

export const GENERATION_SYSTEM_PROMPT = [
  "You distill repeated shell operations from an AI-assisted SSH session into quick scripts.",
  "Return ONLY a JSON array of 1-5 objects with fields:",
  '{"title": string, "script": string, "description": string, "riskHint": string | null, "confidence": number}.',
  'Every line of "script" must be copied VERBATIM from a "command" value in the input list — never rewrite, shorten, parameterize, or invent commands. A script may stack several commands, one per line.',
  '"title" is a short imperative label; "description" is one sentence; "riskHint" explains destructive impact (restarts, deletions) or is null; "confidence" is between 0 and 1.',
].join("\n");

export function buildGenerationPrompt(input: { sessionTitle: string; aggregates: readonly CommandAggregate[] }): string {
  return [
    `Session title: ${JSON.stringify(input.sessionTitle)}`,
    "Commands executed in this session (JSON):",
    JSON.stringify(
      input.aggregates.map((aggregate) => ({
        command: aggregate.command,
        usageCount: aggregate.usageCount,
        successCount: aggregate.successCount,
        workingDirectories: aggregate.cwds,
      })),
      null,
      2,
    ),
    "",
    "Distill these into quick scripts following the system rules. Respond with the JSON array only.",
  ].join("\n");
}

function extractJsonArray(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  return start >= 0 && end > start ? body.slice(start, end + 1) : "[]";
}

/**
 * Parse + validate LLM output. A script survives only when every line is a
 * verbatim session command (PRD R1). Invalid items are dropped; an empty
 * result means the caller falls back to rules mode.
 */
export function parseGeneratedScripts(raw: string, allowedLines: ReadonlySet<string>): GeneratedScript[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const items: GeneratedScript[] = [];
  for (const entry of parsed.slice(0, 5)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const script = typeof record.script === "string" ? record.script.replace(/\r/g, "") : "";
    if (!title || !script.trim()) continue;
    const lines = script.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    if (!lines.every((line) => allowedLines.has(normalizeForMatch(line)))) continue;
    const confidence = Number(record.confidence);
    items.push({
      title: title.slice(0, 60),
      script: lines.join("\n"),
      description: typeof record.description === "string" && record.description.trim() ? record.description.trim() : null,
      riskHint: typeof record.riskHint === "string" && record.riskHint.trim() ? record.riskHint.trim() : null,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    });
  }
  return items;
}

/** Offline fallback (PRD F4): verbatim top commands, titled by first line. */
export function buildRulesScripts(aggregates: readonly CommandAggregate[], totalExecutions: number): GeneratedScript[] {
  return aggregates.slice(0, 5).map((aggregate) => {
    const first = aggregate.command.split("\n")[0];
    return {
      title: first.length > 30 ? `${first.slice(0, 30)}…` : first,
      script: aggregate.command,
      description: null,
      riskHint: null,
      confidence: Math.min(0.95, 0.4 + 0.55 * (aggregate.usageCount / Math.max(1, totalExecutions))),
      sourceUsageCount: aggregate.usageCount,
      sourceSuccessCount: aggregate.successCount,
    };
  });
}
