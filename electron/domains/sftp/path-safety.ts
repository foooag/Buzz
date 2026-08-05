import { realpathSync } from "node:fs";
import path from "node:path";
import { DomainError } from "../../ipc/domain-error.js";

export function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) throw invalidPath();
  return trimmed;
}

export function safeRelativePathComponents(relative: string): string[] {
  return relative.split("/").map(sanitizeFilename);
}

export function confineUnder(root: string, relative: string): string {
  if (relative.startsWith("/") || relative.startsWith("\\") || path.isAbsolute(relative)) {
    throw invalidPath();
  }
  const components = safeRelativePathComponents(relative);
  const canonicalRoot = canonicalizeOrResolve(root);
  const unresolved = path.join(root, ...components);
  const parent = path.dirname(unresolved);
  const canonicalParent = canonicalizeOrResolve(parent);
  const confined = path.join(canonicalParent, sanitizeFilename(path.basename(unresolved)));
  const fromRoot = path.relative(canonicalRoot, confined);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) throw invalidPath();
  return confined;
}

function canonicalizeOrResolve(value: string): string {
  try {
    return realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function invalidPath(): DomainError {
  return new DomainError("SFTP_PATH_INVALID", "The requested path is not allowed.");
}
