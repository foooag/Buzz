import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../../ipc/domain-error.js";
import type { KeyProtector } from "./master-key.js";

const KEY_FILE_NAME = "app-encryption.key";
const KEY_FILE_VERSION = 1;
const ENVELOPE_VERSION = 1;
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AAD = Buffer.from("Terminus app-local encryption v1", "utf8");

export class AppEncryptionProtector implements KeyProtector {
  readonly #key: Buffer;
  #disposed = false;

  private constructor(key: Buffer) {
    this.#key = Buffer.from(key);
  }

  static async open(
    dataDirectory: string,
    protectedDataExists: boolean,
  ): Promise<AppEncryptionProtector> {
    const keyPath = path.join(dataDirectory, KEY_FILE_NAME);
    const stored = await readOptionalFile(keyPath);
    if (stored) return new AppEncryptionProtector(decodeKeyFile(stored));
    if (protectedDataExists) throw unavailable();

    const key = randomBytes(KEY_LENGTH);
    try {
      await persistKeyFile(keyPath, key);
      return new AppEncryptionProtector(key);
    } finally {
      key.fill(0);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !this.#disposed;
  }

  async encrypt(value: string): Promise<Buffer> {
    this.#assertAvailable();
    try {
      const nonce = randomBytes(NONCE_LENGTH);
      const cipher = createCipheriv("aes-256-gcm", this.#key, nonce, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      cipher.setAAD(AAD);
      const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([
        Buffer.from([ENVELOPE_VERSION]),
        nonce,
        ciphertext,
        cipher.getAuthTag(),
      ]);
    } catch {
      throw unavailable();
    }
  }

  async decrypt(value: Buffer): Promise<string> {
    this.#assertAvailable();
    if (value.byteLength < 1 + NONCE_LENGTH + AUTH_TAG_LENGTH) throw unavailable();
    if (value[0] !== ENVELOPE_VERSION) throw unavailable();
    try {
      const nonceEnd = 1 + NONCE_LENGTH;
      const tagStart = value.byteLength - AUTH_TAG_LENGTH;
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#key,
        value.subarray(1, nonceEnd),
        { authTagLength: AUTH_TAG_LENGTH },
      );
      decipher.setAAD(AAD);
      decipher.setAuthTag(value.subarray(tagStart));
      return Buffer.concat([
        decipher.update(value.subarray(nonceEnd, tagStart)),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw unavailable();
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#key.fill(0);
    this.#disposed = true;
  }

  #assertAvailable(): void {
    if (this.#disposed) throw unavailable();
  }
}

async function persistKeyFile(keyPath: string, key: Buffer): Promise<void> {
  const temporaryPath = `${keyPath}.tmp`;
  try {
    await mkdir(path.dirname(keyPath), { recursive: true });
    await writeFile(
      temporaryPath,
      Buffer.concat([Buffer.from([KEY_FILE_VERSION]), key]),
      { mode: 0o600 },
    );
    await rename(temporaryPath, keyPath);
  } catch {
    throw unavailable();
  }
}

function decodeKeyFile(stored: Buffer): Buffer {
  if (stored.byteLength !== 1 + KEY_LENGTH || stored[0] !== KEY_FILE_VERSION) {
    throw unavailable();
  }
  return Buffer.from(stored.subarray(1));
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
