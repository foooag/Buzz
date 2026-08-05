import { beforeEach, describe, expect, it } from "vitest";
import {
  getHostCredential,
  getSavedCredential,
  setSavedCredential,
} from "./savedCredentials";

const STORAGE_KEY = "terminus.ssh.saved-credentials";

describe("saved SSH credential metadata", () => {
  beforeEach(() => localStorage.clear());

  it("reads legacy password references without breaking existing hosts", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ "host-1": "credential-1" }));

    expect(getSavedCredential("host-1")).toEqual({
      credentialRef: "credential-1",
      authKind: "password",
    });
  });

  it("stores only an opaque credential reference and private-key auth type", () => {
    setSavedCredential("host-1", {
      credentialRef: "credential-private-key-1",
      authKind: "privateKey",
    });

    expect(getSavedCredential("host-1")).toEqual({
      credentialRef: "credential-private-key-1",
      authKind: "privateKey",
    });
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("BEGIN OPENSSH PRIVATE KEY");
  });

  it("prefers the durable credential reference stored with the host", () => {
    setSavedCredential("host-1", {
      credentialRef: "legacy-reference",
      authKind: "password",
    });

    expect(getHostCredential({
      id: "host-1",
      authKind: "privateKey",
      credentialRef: "durable-reference",
    })).toEqual({
      credentialRef: "durable-reference",
      authKind: "privateKey",
    });
  });
});
