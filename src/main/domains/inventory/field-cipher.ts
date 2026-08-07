import {
  createCipheriv,
  createDecipheriv,
  randomBytes as secureRandomBytes,
} from "node:crypto";
import { DomainError } from "../../ipc/domain-error.js";

const ENVELOPE_VERSION = 1;
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENVELOPE_HEADER_LENGTH = 1 + NONCE_LENGTH;

export type FieldContext = {
  recordType: string;
  recordId: string;
  vaultId: string;
  fieldName: string;
};

type RandomBytes = (size: number) => Buffer;

export class AesGcmFieldCipher {
  readonly #key: Buffer;
  readonly #randomBytes: RandomBytes;

  constructor(key: Uint8Array, randomBytes: RandomBytes = secureRandomBytes) {
    if (key.byteLength !== KEY_LENGTH) {
      throw new DomainError(
        "VAULT_KEY_UNAVAILABLE",
        "The app-local encryption key is unavailable.",
      );
    }
    this.#key = Buffer.from(key);
    this.#randomBytes = randomBytes;
  }

  encrypt(context: FieldContext, plaintext: Uint8Array): Buffer {
    try {
      const nonce = this.#randomBytes(NONCE_LENGTH);
      if (nonce.byteLength !== NONCE_LENGTH) throw new Error("Invalid nonce length.");
      const cipher = createCipheriv("aes-256-gcm", this.#key, nonce, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      cipher.setAAD(authenticatedData(context));
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      return Buffer.concat([
        Buffer.from([ENVELOPE_VERSION]),
        nonce,
        ciphertext,
        cipher.getAuthTag(),
      ]);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "INVENTORY_STORAGE_FAILED",
        "The inventory value could not be protected.",
      );
    }
  }

  decrypt(context: FieldContext, envelope: Uint8Array): Buffer {
    if (
      envelope.byteLength < ENVELOPE_HEADER_LENGTH + AUTH_TAG_LENGTH ||
      envelope[0] !== ENVELOPE_VERSION
    ) {
      throw decryptionError();
    }

    try {
      const bytes = Buffer.from(envelope);
      const nonce = bytes.subarray(1, ENVELOPE_HEADER_LENGTH);
      const authTag = bytes.subarray(bytes.length - AUTH_TAG_LENGTH);
      const ciphertext = bytes.subarray(
        ENVELOPE_HEADER_LENGTH,
        bytes.length - AUTH_TAG_LENGTH,
      );
      const decipher = createDecipheriv("aes-256-gcm", this.#key, nonce, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAAD(authenticatedData(context));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw decryptionError();
    }
  }

  dispose(): void {
    this.#key.fill(0);
  }
}

export function authenticatedData(context: FieldContext): Buffer {
  const components = [
    context.recordType,
    context.recordId,
    context.vaultId,
    context.fieldName,
  ];
  const buffers: Buffer[] = [];
  for (const component of components) {
    const value = Buffer.from(component, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(value.length);
    buffers.push(length, value);
  }
  return Buffer.concat(buffers);
}

function decryptionError(): DomainError {
  return new DomainError(
    "VAULT_DECRYPTION_FAILED",
    "The encrypted inventory could not be unlocked.",
  );
}
