import { describe, expect, it } from "vitest";
import {
  aggregateCommands,
  containsSecret,
  extractExecutedCommands,
  normalizeForMatch,
  skeletonKey,
} from "../../../../src/main/domains/quickscripts/extractor";

const assistantWithSshExec = (id: string, command: string, cwd?: string) => ({
  role: "assistant",
  content: [{ type: "toolCall", id, name: "ssh_exec", arguments: { command, explanation: "run", ...(cwd ? { cwd } : {}) } }],
  stopReason: "toolUse",
  timestamp: 1,
});

const toolResult = (id: string, exitCode = 0, isError = false) => ({
  role: "toolResult",
  toolCallId: id,
  toolName: "ssh_exec",
  content: [{ type: "text", text: JSON.stringify({ stdout: "", stderr: "", exitCode, truncated: false }) }],
  isError,
  timestamp: 2,
});

describe("extractExecutedCommands", () => {
  it("extracts ssh_exec commands with success from matching tool results", () => {
    const messages = [
      { role: "user", content: "fix nginx", timestamp: 0 },
      assistantWithSshExec("t1", "tail -n 30 /var/log/nginx/error.log", "/var/log"),
      toolResult("t1", 0),
      assistantWithSshExec("t2", "systemctl restart nginx"),
      toolResult("t2", 1),
      assistantWithSshExec("t3", "curl http://127.0.0.1:8000/health"),
      { role: "toolResult", toolCallId: "t3", toolName: "ssh_exec", content: [], isError: true, timestamp: 3 },
    ];
    expect(extractExecutedCommands(messages)).toEqual([
      { command: "tail -n 30 /var/log/nginx/error.log", cwd: "/var/log", ok: true },
      { command: "systemctl restart nginx", cwd: null, ok: false },
      { command: "curl http://127.0.0.1:8000/health", cwd: null, ok: false },
    ]);
  });

  it("ignores other tools and skips commands without results", () => {
    const messages = [
      { role: "assistant", content: [{ type: "toolCall", id: "x", name: "host_list", arguments: {} }], timestamp: 1 },
      assistantWithSshExec("t9", "ls"),
    ];
    expect(extractExecutedCommands(messages)).toEqual([{ command: "ls", cwd: null, ok: false }]);
  });
});

describe("normalizeForMatch", () => {
  it("collapses whitespace outside quotes but keeps it inside, and keeps newlines", () => {
    expect(normalizeForMatch("tail   -n\t30   error.log")).toBe("tail -n 30 error.log");
    expect(normalizeForMatch("echo \"a   b\"   c")).toBe('echo "a   b" c');
    expect(normalizeForMatch("systemctl restart nginx\n\ncurl localhost")).toBe("systemctl restart nginx\ncurl localhost");
    expect(normalizeForMatch("  \n  ls  \n")).toBe("ls");
  });
});

describe("skeletonKey", () => {
  it("joins command names per chain segment", () => {
    expect(skeletonKey("cd /app && docker compose logs api")).toBe("cd>docker");
    expect(skeletonKey("journalctl -u nginx | grep error")).toBe("journalctl>grep");
    expect(skeletonKey("df -h")).toBe("df");
  });
  it("does not split operators inside quotes", () => {
    expect(skeletonKey("echo 'a && b'")).toBe("echo");
  });
});

describe("aggregateCommands", () => {
  it("counts exact commands and merges chain variants by skeleton", () => {
    const executed = [
      { command: "docker ps", cwd: null, ok: true },
      { command: "docker ps", cwd: null, ok: true },
      { command: "docker ps --format json", cwd: null, ok: false },
      { command: "df -h", cwd: null, ok: true },
    ];
    const { items, droppedCount } = aggregateCommands(executed);
    expect(droppedCount).toBe(0);
    const docker = items.find((item) => item.command.startsWith("docker"));
    expect(docker?.usageCount).toBe(3);
    expect(docker?.successCount).toBe(2);
    expect(docker?.command).toBe("docker ps");
    expect(items.find((item) => item.command === "df -h")?.usageCount).toBe(1);
  });

  it("drops secret-like commands and counts them", () => {
    const { items, droppedCount } = aggregateCommands([
      { command: "export TOKEN=AKIAIOSFODNN7EXAMPLE", cwd: null, ok: true },
      { command: "ls", cwd: null, ok: true },
    ]);
    expect(droppedCount).toBe(1);
    expect(items.map((item) => item.command)).toEqual(["ls"]);
  });

  it("sorts by usage then success rate", () => {
    const { items } = aggregateCommands([
      { command: "a", cwd: null, ok: true },
      { command: "a", cwd: null, ok: false },
      { command: "b", cwd: null, ok: true },
      { command: "b", cwd: null, ok: true },
    ]);
    expect(items.map((item) => item.command)).toEqual(["b", "a"]);
  });
});

describe("containsSecret", () => {
  it("flags AWS keys, PEM headers, and long tokens", () => {
    expect(containsSecret("aws AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(containsSecret("cat -----BEGIN OPENSSH PRIVATE KEY-----")).toBe(true);
    expect(containsSecret("ghp_0123456789abcdefghijklmnopqrstuvwxyz0123456789")).toBe(true);
    expect(containsSecret("journalctl -u nginx -n 50")).toBe(false);
  });
});
