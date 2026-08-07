import { describe, expect, it } from "vitest";
import { createSftpStore } from "@/features/sftp/sftpStore";
import { createDeterministicSftpApi } from "@/features/sftp/deterministicSftpApi";
import type { CreateSshProfile } from "@/features/ssh/sshTypes";
import type { SftpSessionEvent } from "@/features/sftp/sftpTypes";

const profile: CreateSshProfile = {
  hostId: "h",
  hostname: "127.0.0.1",
  port: 22,
  username: "tester",
  authKind: "password",
  credentialRef: "c",
  identityId: null,
};

/**
 * The deterministic `open` emits `hostKeyVerificationRequired` and only
 * resolves after `decideHostKey(true)` is called — mirroring the real backend
 * flow. This helper drives both halves concurrently so store tests can `await`
 * a connected sessionId.
 */
async function openConnected(
  api: ReturnType<typeof createDeterministicSftpApi>,
  store: ReturnType<typeof createSftpStore>,
): Promise<string> {
  const openPromise = store.getState().open(profile, (event) => {
    if (event.type === "hostKeyVerificationRequired") {
      void api.decideHostKey(event.sessionId, true);
    }
  });
  return openPromise;
}

describe("sftp store", () => {
  it("opens a session and loads the seeded remote listing", async () => {
    const api = createDeterministicSftpApi();
    api.seedRemote("/home", [
      { name: "readme.md", isDir: false, size: 10, modified: null, permissions: null },
    ]);
    const store = createSftpStore(api);

    const sessionId = await openConnected(api, store);
    await store.getState().refreshRemote(sessionId, "/home");

    const state = store.getState();
    expect(state.sessions[sessionId].connected).toBe(true);
    expect(state.remoteEntriesBySession[sessionId].map((entry) => entry.name)).toContain("readme.md");
  });

  it("folds a sftpTransferCompleted event into the transfer summary", async () => {
    const api = createDeterministicSftpApi();
    const store = createSftpStore(api);
    const sessionId = await openConnected(api, store);

    const transferId = await store.getState().enqueueUpload(sessionId, ["local/a.txt"], "/remote");

    // The deterministic api emits sftpTransferQueued synchronously inside
    // enqueueUpload, then sftpTransferCompleted on a setTimeout tick. Both
    // flow through the store's onEvent -> ingest. Wait for the summary.
    await waitFor(() => {
      const transfer = store.getState().transfers.find((t) => t.transferId === transferId);
      return Boolean(transfer?.summary);
    });

    const transfer = store.getState().transfers.find((t) => t.transferId === transferId);
    expect(transfer?.summary).toEqual({ succeeded: 1, failed: 0, skipped: 0 });
  });

  it("records a sftpTransferConflict as the active conflict", () => {
    const api = createDeterministicSftpApi();
    const store = createSftpStore(api);

    // First seed a queued transfer so ingest has a transfer to update.
    const event: SftpSessionEvent = {
      type: "sftpTransferQueued",
      sessionId: "s1",
      transferId: "t1",
      direction: "upload",
      itemCount: 1,
    };
    store.getState().ingest(event);
    store.getState().ingest({
      type: "sftpTransferConflict",
      sessionId: "s1",
      transferId: "t1",
      itemId: "i1",
      kind: { kind: "targetExists", targetName: "report.csv" },
    });

    expect(store.getState().activeConflict).toEqual({
      sessionId: "s1",
      transferId: "t1",
      itemId: "i1",
      kind: { kind: "targetExists", targetName: "report.csv" },
    });
  });

  it("clears the active conflict after resolveConflict", async () => {
    const api = createDeterministicSftpApi();
    const store = createSftpStore(api);

    store.getState().ingest({
      type: "sftpTransferQueued",
      sessionId: "s1",
      transferId: "t1",
      direction: "upload",
      itemCount: 1,
    });
    store.getState().ingest({
      type: "sftpTransferConflict",
      sessionId: "s1",
      transferId: "t1",
      itemId: "i1",
      kind: { kind: "targetExists", targetName: "report.csv" },
    });

    await store.getState().resolveConflict({ resolution: "overwrite" });

    expect(store.getState().activeConflict).toBeNull();
  });

  it("folds sftpOpenWith events into the watchers slice", () => {
    const api = createDeterministicSftpApi();
    const store = createSftpStore(api);

    store.getState().ingest({
      type: "sftpOpenWithLaunched",
      sessionId: "s1",
      watcherId: "w1",
      remoteName: "notes.txt",
      needsAssociationPrompt: true,
    });
    expect(store.getState().watchers["w1"]).toEqual({
      watcherId: "w1",
      remoteName: "notes.txt",
      status: "launched",
      needsAssociationPrompt: true,
    });

    store.getState().ingest({
      type: "sftpOpenWithSaved",
      sessionId: "s1",
      watcherId: "w1",
      remoteName: "notes.txt",
    });
    expect(store.getState().watchers["w1"]?.status).toBe("saved");

    store.getState().ingest({
      type: "sftpOpenWithConflict",
      sessionId: "s1",
      watcherId: "w1",
      kind: { kind: "remoteChanged", remoteName: "notes.txt" },
    });
    expect(store.getState().watchers["w1"]?.status).toBe("conflict");
    expect(store.getState().activeOpenWithConflict).toEqual({
      watcherId: "w1",
      remoteName: "notes.txt",
      kind: { kind: "remoteChanged", remoteName: "notes.txt" },
    });

    store.getState().ingest({
      type: "sftpOpenWithClosed",
      sessionId: "s1",
      watcherId: "w1",
    });
    expect(store.getState().watchers["w1"]?.status).toBe("closed");
  });

  it("clears the active open-with conflict after resolveOpenWithConflict", async () => {
    const api = createDeterministicSftpApi();
    const store = createSftpStore(api);

    store.getState().ingest({
      type: "sftpOpenWithLaunched",
      sessionId: "s1",
      watcherId: "w1",
      remoteName: "notes.txt",
      needsAssociationPrompt: false,
    });
    store.getState().ingest({
      type: "sftpOpenWithConflict",
      sessionId: "s1",
      watcherId: "w1",
      kind: { kind: "remoteChanged", remoteName: "notes.txt" },
    });

    await store.getState().resolveOpenWithConflict({ resolution: "overwrite" });

    expect(store.getState().activeOpenWithConflict).toBeNull();
  });
});

function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 10);
    };
    tick();
  });
}
