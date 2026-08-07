import { randomUUID } from "node:crypto";
import {
  createReadStream,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { DomainError } from "../../ipc/domain-error.js";

export type LocalEntry = {
  name: string;
  isDir: boolean;
  size: number;
  modified?: string;
  permissions?: number;
};

export interface ByteSink {
  write(chunk: Buffer): void | Promise<void>;
  flush?(): void | Promise<void>;
}

export function listLocal(directory: string, showHidden: boolean): LocalEntry[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    throw new DomainError(
      "SFTP_LOCAL_FS_DENIED",
      "The local directory could not be read.",
    );
  }

  const entries = names.flatMap((name): LocalEntry[] => {
    if (!showHidden && name.startsWith(".")) return [];
    try {
      const metadata = statSync(path.join(directory, name));
      return [{
        name,
        isDir: metadata.isDirectory(),
        size: metadata.size,
        ...(Number.isFinite(metadata.mtimeMs)
          ? { modified: new Date(metadata.mtimeMs).toISOString() }
          : {}),
        ...(process.platform === "win32" ? {} : { permissions: metadata.mode }),
      }];
    } catch {
      throw new DomainError(
        "SFTP_LOCAL_FS_DENIED",
        "A local entry could not be read.",
      );
    }
  });
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

export async function streamLocalTo(filePath: string, sink: ByteSink): Promise<number> {
  let copied = 0;
  try {
    for await (const chunk of createReadStream(filePath, { highWaterMark: 8 * 1024 })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      await sink.write(bytes);
      copied += bytes.byteLength;
    }
  } catch {
    throw new DomainError(
      "SFTP_LOCAL_FS_DENIED",
      copied === 0
        ? "The local file could not be opened."
        : "The local file could not be read.",
    );
  }
  try {
    await sink.flush?.();
  } catch {
    throw new DomainError(
      "SFTP_LOCAL_FS_DENIED",
      "The local stream could not be flushed.",
    );
  }
  return copied;
}

export function stagingPathFor(target: string): string {
  const directory = path.dirname(target);
  const name = path.basename(target);
  if (!directory || directory === target || !name || name === ".") {
    throw new DomainError("SFTP_PATH_INVALID", "The staging target is invalid.");
  }
  return path.join(
    directory,
    `${name}.terminus-tmp.${randomUUID().replaceAll("-", "")}`,
  );
}

export function commitStaging(staging: string, target: string): void {
  try {
    renameSync(staging, target);
    return;
  } catch {
    try {
      unlinkSync(target);
    } catch {
      // The target may not exist; the second rename decides the result.
    }
  }
  try {
    renameSync(staging, target);
  } catch {
    throw new DomainError(
      "SFTP_LOCAL_FS_DENIED",
      "The downloaded file could not be committed.",
    );
  }
}
