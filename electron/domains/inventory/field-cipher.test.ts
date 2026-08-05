import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DomainError } from "../../ipc/domain-error";
import {
  AesGcmFieldCipher,
  authenticatedData,
  type FieldContext,
} from "./field-cipher";

const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const nonce = Buffer.from("000102030405060708090a0b", "hex");
const context: FieldContext = {
  recordType: "host",
  recordId: "host-1",
  vaultId: "vault-1",
  fieldName: "address",
};

describe("Electron AES-GCM field cipher", () => {
  it("matches the Rust envelope layout and WebCrypto AES-GCM output", async () => {
    const plaintext = Buffer.from("server.internal", "utf8");
    const cipher = new AesGcmFieldCipher(key, () => Buffer.from(nonce));
    const envelope = cipher.encrypt(context, plaintext);

    const webKey = await webcrypto.subtle.importKey(
      "raw",
      key,
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const encrypted = await webcrypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: authenticatedData(context),
        tagLength: 128,
      },
      webKey,
      plaintext,
    );

    expect(envelope).toEqual(
      Buffer.concat([Buffer.from([1]), nonce, Buffer.from(encrypted)]),
    );
    expect(cipher.decrypt(context, envelope)).toEqual(plaintext);
  });

  it("binds ciphertext to record, vault, and field context", () => {
    const cipher = new AesGcmFieldCipher(key, () => Buffer.from(nonce));
    const envelope = cipher.encrypt(context, Buffer.from("secret"));

    expect(() => cipher.decrypt({ ...context, fieldName: "username" }, envelope))
      .toThrowError(expect.objectContaining({ code: "VAULT_DECRYPTION_FAILED" }));
  });

  it("fails closed for malformed, versioned, and tampered envelopes", () => {
    const cipher = new AesGcmFieldCipher(key, () => Buffer.from(nonce));
    const envelope = cipher.encrypt(context, Buffer.from("secret"));
    envelope[envelope.length - 1] ^= 0xff;

    for (const invalid of [Buffer.alloc(0), Buffer.from([2]), envelope]) {
      try {
        cipher.decrypt(context, invalid);
        throw new Error("Expected decryption to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error).toMatchObject({ code: "VAULT_DECRYPTION_FAILED" });
      }
    }
  });
});
