import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionHistoryCsv,
  finishConnectionSession,
  formatHistoryDuration,
  listConnectionHistory,
  markConnectionConnected,
  markConnectionFailed,
  recordConnectionAttempt,
} from "@/features/workspace/connectionHistory";

describe("real connection history", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("records successful SSH lifecycle data without credentials", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T07:00:00.000Z"));
    const id = recordConnectionAttempt({
      hostId: "host-1",
      host: "127.0.0.1",
      port: 22221,
      username: "tester",
    });
    markConnectionConnected(id, "session-1");
    vi.setSystemTime(new Date("2026-07-30T07:01:05.000Z"));
    finishConnectionSession("session-1");

    const [entry] = listConnectionHistory();
    expect(entry).toMatchObject({
      id,
      sessionId: "session-1",
      host: "127.0.0.1",
      port: 22221,
      username: "tester",
      status: "success",
    });
    expect(formatHistoryDuration(entry!)).toBe("1:05");
    expect(localStorage.getItem("terminus.connectionHistory")).not.toContain("password");
  });

  it("records failures and escapes CSV fields", () => {
    const id = recordConnectionAttempt({
      hostId: "host-2",
      host: "host,with-comma",
      port: 22,
      username: "deploy",
    });
    markConnectionFailed(id, "Connection failed");
    const entries = listConnectionHistory();

    expect(entries[0]?.status).toBe("failed");
    expect(connectionHistoryCsv(entries)).toContain("\"host,with-comma\"");
    expect(connectionHistoryCsv(entries)).toContain("Connection failed");
  });
});
