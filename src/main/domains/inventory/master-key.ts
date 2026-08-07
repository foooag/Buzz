import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../../ipc/domain-error.js";

const KEY_LENGTH = 32;
const KEY_FILE_VERSION = 1;

export interface KeyProtector {
  isAvailable(): Promise<boolean>;
  encrypt(value: string): Promise<Buffer>;
  decrypt(value: Buffer): Promise<string>;
  dispose?(): void;
}

export type MasterKeyOptions = {
  keyPath: string;
  databaseExists: boolean;
  protector: KeyProtector;
  generateKey?: () => Buffer;
};

export async function loadOrCreateMasterKey(options: MasterKeyOptions): Promise<Buffer> {
  if (!(await options.protector.isAvailable())) throw unavailable();

  const stored = await readOptionalFile(options.keyPath);
  if (stored) return decryptStoredKey(stored, options.protector);

  if (options.databaseExists) throw unavailable();
  const key = options.generateKey?.() ?? randomBytes(KEY_LENGTH);
  if (key.byteLength !== KEY_LENGTH) throw unavailable();

  await persistKey(options.keyPath, key, options.protector);
  return Buffer.from(key);
}

async function decryptStoredKey(stored: Buffer, protector: KeyProtector): Promise<Buffer> {
  if (stored.byteLength < 2 || stored[0] !== KEY_FILE_VERSION) throw unavailable();
  try {
    const encoded = await protector.decrypt(stored.subarray(1));
    const key = Buffer.from(encoded, "base64");
    if (key.byteLength !== KEY_LENGTH || key.toString("base64") !== encoded) {
      throw new Error("Invalid master key.");
    }
    return key;
  } catch {
    throw unavailable();
  }
}

async function persistKey(
  keyPath: string,
  key: Buffer,
  protector: KeyProtector,
): Promise<void> {
  const temporaryPath = `${keyPath}.tmp`;
  try {
    const encrypted = await protector.encrypt(key.toString("base64"));
    await mkdir(path.dirname(keyPath), { recursive: true });
    await writeFile(
      temporaryPath,
      Buffer.concat([Buffer.from([KEY_FILE_VERSION]), encrypted]),
      { mode: 0o600 },
    );
    await rename(temporaryPath, keyPath);
  } catch {
    throw unavailable();
  }
}

async function readOptionalFile(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw unavailable();
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function unavailable(): DomainError {
  return new DomainError(
    "VAULT_KEY_UNAVAILABLE",
    "The app-local encryption key is unavailable.",
  );
}
