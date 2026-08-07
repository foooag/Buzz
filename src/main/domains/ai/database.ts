import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as Database } from "node:sqlite";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export function openAiDatabase(filePath: string): Database {
  if (filePath !== ":memory:") mkdirSync(path.dirname(filePath), { recursive: true });
  return new DatabaseSync(filePath);
}
