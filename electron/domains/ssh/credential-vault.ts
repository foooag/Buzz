import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../../ipc/domain-error.js";
import type { KeyProtector } from "../inventory/master-key.js";

const VERSION = 1;
const PASSWORD_KIND = 1;
const PRIVATE_KEY_KIND = 2;
const NO_PASSPHRASE = 0xffff_ffff;
const REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SshCredential =
  | { type: "password"; password: string }
  | { type: "privateKey"; privateKey: Buffer; passphrase: string | null };

export interface SshCredentialVault {
  put(credential: SshCredential): Promise<string>;
  get(reference: string): Promise<SshCredential>;
  delete(reference: string): Promise<void>;
}

export class ProtectedFileCredentialVault implements SshCredentialVault {
  readonly #directory: string;
  readonly #protector: KeyProtector;

  constructor(directory: string, protector: KeyProtector) {
    this.#directory = directory;
    this.#protector = protector;
  }

  async put(credential: SshCredential): Promise<string> {
    const reference = randomUUID();
    const envelope = encodeCredential(credential);
    try {
      await this.#persist(reference, envelope);
      return reference;
    } finally {
      envelope.fill(0);
    }
  }

  async get(reference: string): Promise<SshCredential> {
    const filePath = this.#path(reference);
    let protectedValue: Buffer | null;
    try {
      protectedValue = await readFile(filePath);
    } catch (error) {
      if (!isMissing(error)) throw unavailable();
      protectedValue = null;
    }

    if (protectedValue) {
      try {
        const encoded = await this.#protector.decrypt(protectedValue);
        const envelope = Buffer.from(encoded, "base64");
        try {
          return decodeCredential(envelope);
        } finally {
          envelope.fill(0);
        }
      } catch {
        throw unavailable();
      } finally {
        protectedValue.fill(0);
      }
    }

    throw unavailable();
  }

  async delete(reference: string): Promise<void> {
    const filePath = this.#path(reference);
    try {
      await unlink(filePath);
      return;
    } catch (error) {
      if (!isMissing(error)) throw unavailable();
    }
    throw unavailable();
  }

  async #persist(reference: string, envelope: Buffer): Promise<void> {
    if (!(await this.#protector.isAvailable())) throw unavailable();
    const filePath = this.#path(reference);
    const temporaryPath = `${filePath}.tmp`;
    let protectedValue: Buffer | undefined;
    try {
      protectedValue = await this.#protector.encrypt(envelope.toString("base64"));
      await mkdir(this.#directory, { recursive: true });
      await writeFile(temporaryPath, protectedValue, { mode: 0o600 });
      await rename(temporaryPath, filePath);
    } catch {
      throw unavailable();
    } finally {
      protectedValue?.fill(0);
    }
  }

  #path(reference: string): string {
    if (!REFERENCE.test(reference)) throw unavailable();
    return path.join(this.#directory, `${reference}.credential`);
  }
}

export class MemorySshCredentialVault implements SshCredentialVault {
  readonly #entries = new Map<string, Buffer>();

  async put(credential: SshCredential): Promise<string> {
    const reference = randomUUID();
    this.#entries.set(reference, encodeCredential(credential));
    return reference;
  }

  async get(reference: string): Promise<SshCredential> {
    const envelope = this.#entries.get(reference);
    if (!envelope) throw unavailable();
    return decodeCredential(envelope);
  }

  async delete(reference: string): Promise<void> {
    const envelope = this.#entries.get(reference);
    if (!envelope) throw unavailable();
    envelope.fill(0);
    this.#entries.delete(reference);
  }

  dispose(): void {
    for (const envelope of this.#entries.values()) envelope.fill(0);
    this.#entries.clear();
  }
}

export function encodeCredential(credential: SshCredential): Buffer {
  if (credential.type === "password") {
    const password = Buffer.from(credential.password, "utf8");
    if (password.byteLength === 0) throw unavailable();
    return Buffer.concat([Buffer.from([VERSION, PASSWORD_KIND]), password]);
  }

  if (credential.privateKey.byteLength === 0 || credential.privateKey.byteLength > 0xffff_fffe) {
    throw unavailable();
  }
  const passphrase = credential.passphrase === null
    ? null
    : Buffer.from(credential.passphrase, "utf8");
  const envelope = Buffer.allocUnsafe(
    2 + 4 + credential.privateKey.byteLength + 4 + (passphrase?.byteLength ?? 0),
  );
  envelope[0] = VERSION;
  envelope[1] = PRIVATE_KEY_KIND;
  envelope.writeUInt32BE(credential.privateKey.byteLength, 2);
  credential.privateKey.copy(envelope, 6);
  const passphraseOffset = 6 + credential.privateKey.byteLength;
  envelope.writeUInt32BE(passphrase?.byteLength ?? NO_PASSPHRASE, passphraseOffset);
  passphrase?.copy(envelope, passphraseOffset + 4);
  passphrase?.fill(0);
  return envelope;
}

export function decodeCredential(envelope: Buffer): SshCredential {
  if (envelope.byteLength < 3 || envelope[0] !== VERSION) throw unavailable();
  if (envelope[1] === PASSWORD_KIND) {
    const password = envelope.subarray(2).toString("utf8");
    if (!password || !Buffer.from(password, "utf8").equals(envelope.subarray(2))) {
      throw unavailable();
    }
    return { type: "password", password };
  }
  if (envelope[1] !== PRIVATE_KEY_KIND || envelope.byteLength < 10) throw unavailable();
  const keyLength = envelope.readUInt32BE(2);
  const keyStart = 6;
  const keyEnd = keyStart + keyLength;
  if (keyLength === 0 || keyEnd + 4 > envelope.byteLength) throw unavailable();
  const passphraseLength = envelope.readUInt32BE(keyEnd);
  const passphraseStart = keyEnd + 4;
  let passphrase: string | null;
  if (passphraseLength === NO_PASSPHRASE) {
    if (passphraseStart !== envelope.byteLength) throw unavailable();
    passphrase = null;
  } else {
    const passphraseEnd = passphraseStart + passphraseLength;
    if (passphraseEnd !== envelope.byteLength) throw unavailable();
    const bytes = envelope.subarray(passphraseStart, passphraseEnd);
    passphrase = bytes.toString("utf8");
    if (!Buffer.from(passphrase, "utf8").equals(bytes)) throw unavailable();
  }
  return {
    type: "privateKey",
    privateKey: Buffer.from(envelope.subarray(keyStart, keyEnd)),
    passphrase,
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function unavailable(): DomainError {
  return new DomainError("SSH_CREDENTIAL_UNAVAILABLE", "The SSH credential is unavailable.");
}
