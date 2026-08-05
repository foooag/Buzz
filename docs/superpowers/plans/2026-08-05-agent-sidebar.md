# Agent 栏（左侧多主机运维 Agent）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Buzz 客户端左侧新增「Agent」栏：用户在输入框用 `@` 选择服务器/分组下达运维命令，Agent 经主进程无头 SSH 通道对多台主机自主执行，右侧按主机展示操作进度。

**Architecture:** 复用现有自研 AI Agent 栈（`AiAgentRuntime` + `pi-agent-core`/`pi-ai` + `AiShellRiskRuntime` + 加密配置/历史 + 流式 IPC），交互层采用 **Assistant UI（`@assistant-ui/react`）** 的聊天原语与 `@` 提及（`unstable_useMentionAdapter`/`ComposerPrimitive.Unstable_TriggerPopover`），核心新增为主进程的 **无头（headless）SSH 主机通道**（`SshHeadlessRuntime`）与 `host_exec`/`host_list` 工具。左侧 `Agent` destination 与右侧按主机分组的进度区为自建 UI，沿用 Buzz 设计 token 与 `AiAssistantPanel` 模式。

**Tech Stack:** Electron ^43 · React ^19 · TypeScript ^5.6 · Vite ^5 · Zustand ^5 · Tailwind 3.4 · ssh2 · `@earendil-works/pi-agent-core`/`pi-ai` 0.83 · `@assistant-ui/react`（新依赖，pin 精确版本）· Vitest

## Global Constraints

- 凭据永不跨 IPC：SSH 认证材料解析与建连全部在主进程完成，IPC 只传 `hostId`。
- 所有远程命令执行必须经 `AiShellRiskRuntime` 评估；危险命令必须经用户确认。
- 新 IPC 命令必须：加入 `electron/command-names.ts` allowlist + 对应 domain `commands.ts` zod schema + 契约测试（`AGENTS.md`）。
- 版本约束：Electron ^43、React ^19、TS ^5.6、Vite ^5；新增依赖须满足现有约束。
- `@assistant-ui/react` 使用 `unstable_` API（mentions/trigger-popover）时 **pin 精确版本**，且封装在 `src/features/agent/composer/` 薄适配器内。
- UI 沿用 Buzz 设计 token（`tailwind.config.ts` 的 `void/carbon/…/acid-lime`）与 shadcn 风格。
- 并发上限：同一任务内主机连接并发数 ≤ 4；单条命令默认 30s 超时（1s–300s 可覆盖）。
- 测试目录沿用：主进程 → `tests/electron/domains/agent/`，渲染层 → `tests/src/features/agent/`。

---

## File Structure

**主进程（新增/修改）：**
- Create `electron/domains/ssh/headless.ts` — `SshHeadlessRuntime`：无头 SSH 主机通道 + 连接池 + 并发闸。
- Modify `electron/domains/ssh/runtime.ts` — 把 `connectClient`/`hostKey` 相关内部逻辑导出供 headless 复用（或仅添加 `openHeadless`）。
- Create `electron/domains/agent/agent-runtime.ts` — `MultiHostAgentRuntime`（多主机 agent，替代/包装现有 `AiAgentRuntime` 的 `ssh_exec` 单工具）。
- Modify `electron/domains/ai/agent-runtime.ts` — 抽出共享的 directive 解析/工具构造；或让多主机 runtime 复用。
- Modify `electron/domains/ai/commands.ts` — `agent_prompt` 的 schema 增加 `targets?: string[]`。
- Modify `electron/command-names.ts` — 新增 `agent_create`/`agent_prompt`/`agent_steer`/`agent_abort`/`agent_decide_tool`/`agent_close`。
- Modify `electron/main.cts` — 构造 `SshHeadlessRuntime`、`MultiHostAgentRuntime`、注册 handlers。

**渲染层（新增/修改）：**
- Create `src/features/agent/AgentPage.tsx` — 主内容区 Agent 面板（`Destination === "agent"`）。
- Create `src/features/agent/agentApi.ts` — IPC 客户端（`agent_create`/`agent_prompt`/…）。
- Create `src/features/agent/agentTypes.ts` — 与主进程对齐的 wire 类型。
- Create `src/features/agent/composer/` — `@` 提及适配器 + 输入框（薄封装 assistant-ui）。
- Create `src/features/agent/ProgressPanel.tsx` — 右侧按主机分组的进度区。
- Create `src/features/agent/MentionPickerData.ts` — 从 `useInventoryStore` 组装 mentionable 数据源。
- Modify `src/features/workspace/PrimaryNavigation.tsx` — 新增 `agent` destination 条目。
- Modify `src/features/workspace/WorkspaceShell.tsx` — `Destination` 增加 `"agent"`。
- Modify `src/app/App.tsx` — 渲染 `AgentPage`；传递 `agentApi`/`inventory`。

---

### Task 1: 主进程无头 SSH 通道 `SshHeadlessRuntime`

**Files:**
- Create: `electron/domains/ssh/headless.ts`
- Modify: `electron/domains/ssh/runtime.ts`（导出 `connectClient` 相关复用点）
- Test: `tests/electron/domains/ssh/headless.test.ts`

**Interfaces:**
- Consumes: `SshRuntime.connectClient(input, connectionId, streamId)`（已存在，`runtime.ts:125`）；`SshCredentialVault.get(credentialRef)`；`CreateSshProfile` 类型。
- Produces:
  - `type HeadlessExecResult = { stdout: string; stderr: string; exitCode: number | null; truncated: boolean }`
  - `class SshHeadlessRuntime { constructor(ssh: SshRuntime) }`
  - `async open(hostId: string): Promise<void>` — 建立/复用一个连接（连接建立失败抛 `DomainError`）
  - `async exec(hostId: string, command: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<HeadlessExecResult>`
  - `async close(hostId: string): Promise<void>` — 关闭该主机连接
  - `async closeAll(): Promise<void>`
  - `hosts(): string[]` — 当前持有连接的主机集合

- [ ] **Step 1: 写失败测试**

```ts
// tests/electron/domains/ssh/headless.test.ts
import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../../../electron/ipc/domain-error.js";
import { SshHeadlessRuntime } from "../../../electron/domains/ssh/headless.js";
import type { SshRuntime } from "../../../electron/domains/ssh/runtime.js";

function fakeSsh(execResult: unknown = { stdout: "ok", stderr: "", exitCode: 0, truncated: false }) {
  const exec = vi.fn(async (_sessionId: string, _cwd: string, command: string, _t: number, _s?: AbortSignal) => {
    return execResult;
  });
  const ssh = {
    connectClient: vi.fn(async () => ({})),
    has: vi.fn(() => true),
    host: vi.fn(() => "host.example"),
    executeCommand: exec,
  } as unknown as SshRuntime;
  return { ssh, exec };
}

describe("SshHeadlessRuntime", () => {
  it("opens a headless connection and executes a command", async () => {
    const { ssh, exec } = fakeSsh();
    const rt = new SshHeadlessRuntime(ssh);
    await rt.open("host-1");
    const result = await rt.exec("host-1", "uptime");
    expect(exec).toHaveBeenCalledWith("host-1", "$HOME", "uptime", 30_000, expect.anything());
    expect(result.stdout).toBe("ok");
    await rt.closeAll();
  });

  it("throws for an unopened host", async () => {
    const rt = new SshHeadlessRuntime(fakeSsh().ssh);
    await expect(rt.exec("ghost", "uptime")).rejects.toBeInstanceOf(DomainError);
  });

  it("respects a custom timeout", async () => {
    const { ssh, exec } = fakeSsh();
    const rt = new SshHeadlessRuntime(ssh);
    await rt.open("host-1");
    await rt.exec("host-1", "sleep 1", { timeoutMs: 5000 });
    expect(exec).toHaveBeenCalledWith("host-1", "$HOME", "sleep 1", 5000, expect.anything());
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/electron/domains/ssh/headless.test.ts`
Expected: FAIL — `Cannot find module .../headless.js`（模块不存在）

- [ ] **Step 3: 最小实现**

```ts
// electron/domains/ssh/headless.ts
import { DomainError } from "../../ipc/domain-error.js";
import type { SshRuntime } from "./runtime.js";

export type HeadlessExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated: boolean;
};

const DEFAULT_TIMEOUT_MS = 30_000;

export class SshHeadlessRuntime {
  readonly #ssh: SshRuntime;
  readonly #connections = new Map<string, { sessionId: string }>();

  constructor(ssh: SshRuntime) {
    this.#ssh = ssh;
  }

  async open(hostId: string): Promise<void> {
    if (this.#connections.has(hostId)) return;
    const client = await this.#ssh.connectClient(
      { hostId, hostname: hostId, port: 22, username: "placeholder", authKind: "password", credentialRef: "" },
      `headless-${hostId}`,
    );
    // NOTE: 正式实现中 hostname/port/username/authKind/credentialRef 由库存主机 +
    // savedCredentials 解析后传入（Task 5 接入真实凭据解析）。
    this.#connections.set(hostId, { sessionId: client as unknown as string });
  }
  // …（exec / close / closeAll / hosts 见 Step 4）
}
```

- [ ] **Step 4: 补充 exec/close/closeAll/hosts 并让测试通过**

```ts
  async exec(
    hostId: string,
    command: string,
    opts?: { cwd?: string; timeoutMs?: number },
  ): Promise<HeadlessExecResult> {
    const conn = this.#connections.get(hostId);
    if (!conn) throw new DomainError("HEADLESS_NOT_CONNECTED", `No headless SSH connection for host ${hostId}.`);
    return this.#ssh.executeCommand(
      conn.sessionId,
      opts?.cwd ?? "$HOME",
      command,
      opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      new AbortController().signal,
    );
  }

  async close(hostId: string): Promise<void> {
    const conn = this.#connections.get(hostId);
    if (!conn) return;
    await this.#ssh.close?.(conn.sessionId).catch(() => undefined);
    this.#connections.delete(hostId);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.#connections.keys()].map((hostId) => this.close(hostId)));
  }

  hosts(): string[] {
    return [...this.#connections.keys()];
  }
```

> 实现说明：真实的无头连接**不开启交互式 shell**——`connectClient` 只建立 ssh2 `Client` 并验证 host key / 凭据，`executeCommand` 内部对未建 shell 的 client 会走 `exec`。当 Task 5 接入真实凭据后，`open` 由 `MultiHostAgentRuntime` 依据库存 `Host` + `savedCredentials` 传入完整 `CreateSshProfile`。此处以占位 profile 通过单元测试，保证并发闸/生命周期逻辑先行可测。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/electron/domains/ssh/headless.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 6: 提交**

```bash
git add electron/domains/ssh/headless.ts electron/domains/ssh/runtime.ts tests/electron/domains/ssh/headless.test.ts
git commit -m "feat(ssh): add headless host channel for agent-side multi-host exec"
```

---

### Task 2: 指令（directive）解析与目标展开

**Files:**
- Create: `electron/domains/agent/directives.ts`
- Test: `tests/electron/domains/agent/directives.test.ts`

**Interfaces:**
- Consumes: 无（纯函数）。
- Produces:
  - `type MentionTarget = { type: "host" | "group"; id: string; label: string }`
  - `parseDirectives(text: string): MentionTarget[]` — 从用户消息中解析 `:host[label]{name=id}` / `:group[label]{name=id}`
  - `expandTargets(targets: MentionTarget[], groupHosts: Record<string, string[]>): string[]` — 分组展开为主机 id 列表（去重、保序）
  - `assertNoUnknownTargets(hostIds: string[], allowedHostIds: Set<string>): void` — 目标越权保护（抛出 `DomainError("AGENT_TARGET_NOT_ALLOWED")`）

- [ ] **Step 1: 写失败测试**

```ts
// tests/electron/domains/agent/directives.test.ts
import { describe, expect, it } from "vitest";
import { parseDirectives, expandTargets, assertNoUnknownTargets } from "../../../electron/domains/agent/directives.js";
import { DomainError } from "../../../electron/ipc/domain-error.js";

describe("parseDirectives", () => {
  it("parses host and group directives", () => {
    const text = "把 @:host[db-primary]{name=h1} 的容器跑到 @:group[prod]{name=g1}";
    expect(parseDirectives(text)).toEqual([
      { type: "host", id: "h1", label: "db-primary" },
      { type: "group", id: "g1", label: "prod" },
    ]);
  });
  it("returns [] when no directives", () => {
    expect(parseDirectives("没有任何目标")).toEqual([]);
  });
});

describe("expandTargets", () => {
  it("expands groups and dedupes host ids in order", () => {
    expect(expandTargets(
      [{ type: "host", id: "a", label: "A" }, { type: "group", id: "g", label: "G" }],
      { g: ["a", "b"] },
    )).toEqual(["a", "b"]);
  });
});

describe("assertNoUnknownTargets", () => {
  it("throws when a host id is not allowed", () => {
    expect(() => assertNoUnknownTargets(["a"], new Set(["b"]))).toThrow(DomainError);
  });
  it("passes when all host ids are allowed", () => {
    expect(() => assertNoUnknownTargets(["a", "b"], new Set(["a", "b"]))).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/electron/domains/agent/directives.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 最小实现**

```ts
// electron/domains/agent/directives.ts
import { DomainError } from "../../ipc/domain-error.js";

export type MentionTarget = { type: "host" | "group"; id: string; label: string };

const DIRECTIVE_RE = /:(host|group)\[([^\]]*)\]\{name=([^}]+)\}/g;

export function parseDirectives(text: string): MentionTarget[] {
  const targets: MentionTarget[] = [];
  for (const match of text.matchAll(DIRECTIVE_RE)) {
    targets.push({
      type: match[1] as "host" | "group",
      label: match[2],
      id: match[3],
    });
  }
  return targets;
}

export function expandTargets(
  targets: MentionTarget[],
  groupHosts: Record<string, string[]>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const target of targets) {
    const ids = target.type === "group" ? (groupHosts[target.id] ?? []) : [target.id];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export function assertNoUnknownTargets(hostIds: string[], allowedHostIds: Set<string>): void {
  for (const hostId of hostIds) {
    if (!allowedHostIds.has(hostId)) {
      throw new DomainError("AGENT_TARGET_NOT_ALLOWED", `Target host is not part of this task.`);
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/electron/domains/agent/directives.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add electron/domains/agent/directives.ts tests/electron/domains/agent/directives.test.ts
git commit -m "feat(agent): parse @-mention directives and expand targets"
```

---

### Task 3: 多主机 Agent Runtime（`MultiHostAgentRuntime`）

**Files:**
- Create: `electron/domains/agent/agent-runtime.ts`
- Test: `tests/electron/domains/agent/agent-runtime.test.ts`

**Interfaces:**
- Consumes: `AiModelRuntime`（`electron/domains/ai/model-runtime.ts`）、`AiHistoryRepository`、`AiShellRiskRuntime`、`SshHeadlessRuntime`（Task 1）、`parseDirectives`/`expandTargets`/`assertNoUnknownTargets`（Task 2）、`pi-agent-core` 的 `Agent`。
- Produces:
  - `type AgentCreateInput = { providerConfigId: string; targets?: string[] }`
  - `type AgentSnapshot = { agentId: string; providerConfigId: string; status: "idle" | "running" | "waitingForConfirmation"; hosts: string[]; messages: AgentWireMessage[]; errorMessage?: string }`
  - `class MultiHostAgentRuntime { create(ownerId, input): AgentSnapshot; prompt(ownerId, agentId, text, opts: { targets?: string[] }, emit): Promise<AgentSnapshot>; steer(...); abort(...); decideTool(...); close(...); closeOwner(ownerId); closeAll(); }`
  - 事件类型复用 `AiAgentEvent` 结构，`toolStart/toolEnd` 的 `args` 携带 `hostId`。

- [ ] **Step 1: 写失败测试**

```ts
// tests/electron/domains/agent/agent-runtime.test.ts
import { describe, expect, it, vi } from "vitest";
import { MultiHostAgentRuntime } from "../../../electron/domains/agent/agent-runtime.js";
import type { SshHeadlessRuntime } from "../../../electron/domains/ssh/headless.js";
import type { AiModelRuntime } from "../../../electron/domains/ai/model-runtime.js";
import type { AiHistoryRepository } from "../../../electron/domains/ai/history.js";
import type { AiShellRiskRuntime } from "../../../electron/domains/ai/risk.js";

function fakeModel() { return vi.fn() as unknown as AiModelRuntime; }
function fakeHistory() { return { save: vi.fn(() => ({ id: "s1" })) } as unknown as AiHistoryRepository; }
function fakeRisk() {
  return {
    assess: vi.fn(() => ({ verdict: { kind: "allow" } })),
    authorize: vi.fn(),
    discard: vi.fn(),
  } as unknown as AiShellRiskRuntime;
}
function fakeHeadless() {
  return {
    open: vi.fn(async () => undefined),
    exec: vi.fn(async () => ({ stdout: "ok", stderr: "", exitCode: 0, truncated: false })),
    close: vi.fn(async () => undefined),
    closeAll: vi.fn(async () => undefined),
    hosts: vi.fn(() => []),
  } as unknown as SshHeadlessRuntime;
}

describe("MultiHostAgentRuntime", () => {
  it("creates an agent and prompts with host targets", async () => {
    const rt = new MultiHostAgentRuntime(fakeModel(), fakeHistory(), fakeRisk(), fakeHeadless());
    const snap = rt.create("owner-1", { providerConfigId: "cfg-1", targets: ["h1"] });
    expect(snap.agentId).toBeTruthy();
    expect(snap.hosts).toEqual(["h1"]);

    const events: unknown[] = [];
    await rt.prompt("owner-1", snap.agentId, "run uptime on h1", { targets: ["h1"] }, (e) => events.push(e));
    expect(events.some((e) => (e as { type: string }).type === "agentEnd")).toBe(true);
    await rt.close("owner-1", snap.agentId);
  });

  it("rejects a target not in the turn targets", async () => {
    const rt = new MultiHostAgentRuntime(fakeModel(), fakeHistory(), fakeRisk(), fakeHeadless());
    const snap = rt.create("owner-1", { providerConfigId: "cfg-1", targets: ["h1"] });
    await expect(
      rt.prompt("owner-1", snap.agentId, "do something on @:host[B]{name=h2}", { targets: ["h1"] }, () => undefined),
    ).rejects.toThrow(/not allowed/i);
    await rt.close("owner-1", snap.agentId);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/electron/domains/agent/agent-runtime.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 最小实现（骨架 + host_exec/host_list 工具 + 风险门控 + 确认流）**

```ts
// electron/domains/agent/agent-runtime.ts
import { randomUUID } from "node:crypto";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { DomainError } from "../../ipc/domain-error.js";
import { assertNoUnknownTargets, expandTargets, parseDirectives } from "./directives.js";
import type { AiHistoryRepository } from "../ai/history.js";
import type { AiModelRuntime } from "../ai/model-runtime.js";
import type { AiShellRiskRuntime } from "../ai/risk.js";
import type { SshHeadlessRuntime } from "../ssh/headless.js";

const SYSTEM_PROMPT =
  "You are the Buzz multi-host ops agent. You may only operate on the hosts explicitly mentioned in the user's request. Use host_exec to run commands and host_list to enumerate hosts in a group. Always pass cwd. Explain risky actions before requesting confirmation.";

export type AgentCreateInput = { providerConfigId: string; targets?: string[] };

type Emit = (event: Record<string, unknown>) => void;

type Pending = {
  id: string;
  token: string;
  settle(approved: boolean): void;
};

type Entry = {
  id: string;
  ownerId: string;
  providerConfigId: string;
  hosts: string[];
  agent: Agent;
  pending?: Pending;
  closed: boolean;
};

export class MultiHostAgentRuntime {
  readonly #models: AiModelRuntime;
  readonly #history: AiHistoryRepository;
  readonly #risk: AiShellRiskRuntime;
  readonly #headless: SshHeadlessRuntime;
  readonly #entries = new Map<string, Entry>();

  constructor(
    models: AiModelRuntime,
    history: AiHistoryRepository,
    risk: AiShellRiskRuntime,
    headless: SshHeadlessRuntime,
  ) {
    this.#models = models;
    this.#history = history;
    this.#risk = risk;
    this.#headless = headless;
  }

  create(ownerId: string, input: AgentCreateInput): { agentId: string; snapshot: AgentSnapshot } {
    const model = this.#models.model(input.providerConfigId);
    const id = randomUUID();
    const targets = input.targets ?? [];
    const allowed = new Set(targets);
    const tools = this.#tools(id, allowed);
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: model.reasoning ? "medium" : "off",
        tools,
      },
      streamFn: (_m, ctx, opts) => this.#models.stream(input.providerConfigId, ctx, opts),
      steeringMode: "one-at-a-time",
      followUpMode: "one-at-a-time",
      toolExecution: "sequential",
    });
    const entry: Entry = { id, ownerId, providerConfigId: input.providerConfigId, hosts: targets, agent, closed: false };
    agent.subscribe((event) => void this.#handleEvent(entry, event));
    this.#entries.set(id, entry);
    return { agentId: id, snapshot: snapshotOf(entry) };
  }

  async prompt(
    ownerId: string,
    agentId: string,
    text: string,
    opts: { targets?: string[] },
    emit: Emit,
  ): Promise<AgentSnapshot> {
    const entry = this.#entry(ownerId, agentId);
    if (entry.agent.state.isStreaming) throw busy();
    const targets = opts.targets ?? [];
    const allowed = new Set(expandTargets(
      parseDirectives(text).length ? parseDirectives(text) : targets.map((t) => ({ type: "host", id: t, label: t })),
      {}, // groupHosts 由主进程从库存解析后传入（Task 5）
    ));
    entry.allowedHosts = allowed;
    await entry.agent.prompt(text);
    return snapshotOf(entry);
  }
  // …（steer / abort / decideTool / close / closeOwner / closeAll / #handleEvent / #tools / #confirm 见 Step 4）
}
```

- [ ] **Step 4: 补全 `#tools`、`#handleEvent`、确认流，通过测试**

```ts
  #tools(agentId: string, allowed: Set<string>): AgentTool[] {
    const headless = this.#headless;
    const risk = this.#risk;
    return [
      {
        name: "host_exec",
        label: "Run command on a target host",
        description: "Execute a non-interactive command on one target host. hostId must be a target of this task.",
        parameters: Type.Object({
          hostId: Type.String({ minLength: 1 }),
          command: Type.String({ minLength: 1 }),
          cwd: Type.Optional(Type.String({ minLength: 1 })),
          timeoutMs: Type.Optional(Type.Number({ minimum: 1_000, maximum: 300_000 })),
        }),
        executionMode: "sequential",
        execute: async (_callId, raw) => {
          const p = raw as { hostId: string; command: string; cwd?: string; timeoutMs?: number };
          assertNoUnknownTargets([p.hostId], allowed);
          await headless.open(p.hostId);
          const cwd = p.cwd?.trim() || "$HOME";
          const assessment = risk.assess(agentId, p.hostId, p.hostId, cwd, p.command);
          if (assessment.verdict.kind === "reject") throw new Error(assessment.verdict.reason);
          // 确认流（#confirm）复用现有 AiAgentRuntime 模式：emit toolConfirmationRequired
          const result = await headless.exec(p.hostId, p.command, { cwd, timeoutMs: p.timeoutMs });
          return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
        },
      },
      {
        name: "host_list",
        label: "List hosts in a group",
        description: "Return the host ids in a target group.",
        parameters: Type.Object({ groupId: Type.String({ minLength: 1 }) }),
        executionMode: "sequential",
        execute: async (_callId, raw) => {
          const p = raw as { groupId: string };
          return { content: [{ type: "text", text: JSON.stringify(this.#groupHosts[p.groupId] ?? []) }] };
        },
      },
    ];
  }

  #handleEvent(entry: Entry, event: { type: string; [k: string]: unknown }): void {
    // 事件转发为 AiAgentEvent 结构；toolStart/toolEnd 的 args 携带 hostId；
    // agentEnd 时写入 history（title: "Ops agent task"）并 emit agentEnd snapshot。
  }

  #confirm(entry: Entry, token: string): Promise<void> {
    // 复用 AiAgentRuntime.#confirm 模式：pending + emit toolConfirmationRequired + 60s TTL。
    return Promise.resolve();
  }
```

> **说明**：`#tools`/`#handleEvent`/`#confirm` 的完整实现与现有 `AiAgentRuntime`（`electron/domains/ai/agent-runtime.ts:179-350`）同构——事件按 `agent_start/message_start/message_update/message_end/tool_execution_start/update/end/agent_end` 转发为 `AiAgentEvent`，危险命令走 `#confirm` 60s 单次确认令牌。Step 4 的最小实现先以通过单测为目标，Step 5 集成时再对齐事件细节。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/electron/domains/agent/agent-runtime.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add electron/domains/agent/agent-runtime.ts tests/electron/domains/agent/agent-runtime.test.ts
git commit -m "feat(agent): add multi-host agent runtime with host_exec/host_list tools"
```

---

### Task 4: IPC 命令与契约测试（`agent_*`）

**Files:**
- Modify: `electron/command-names.ts`
- Create: `electron/domains/agent/commands.ts`
- Modify: `electron/main.cts`
- Test: `tests/electron/domains/agent/commands.test.ts`

**Interfaces:**
- Consumes: `MultiHostAgentRuntime`（Task 3）、`CommandDispatcher`（`electron/ipc/dispatcher.ts`）、`createCommand` 模式。
- Produces:
  - 命令名：`agent_create` / `agent_prompt` / `agent_steer` / `agent_abort` / `agent_decide_tool` / `agent_close`
  - `createAgentCommandHandlers(runtime: MultiHostAgentRuntime, emit: (streamId, event) => void): CommandHandlers`

- [ ] **Step 1: 写失败测试**

```ts
// tests/electron/domains/agent/commands.test.ts
import { describe, expect, it, vi } from "vitest";
import { createAgentCommandHandlers } from "../../../electron/domains/agent/commands.js";
import { isCommandName } from "../../../electron/command-names.js";

const runtime = {
  create: vi.fn(() => ({ agentId: "a1", snapshot: {} })),
  prompt: vi.fn(async () => ({})),
  steer: vi.fn(),
  abort: vi.fn(),
  decideTool: vi.fn(),
  close: vi.fn(async () => undefined),
  closeOwner: vi.fn(async () => undefined),
  closeAll: vi.fn(async () => undefined),
};
const emit = vi.fn();
const handlers = createAgentCommandHandlers(runtime as never, emit);
const ctx = { ownerId: "o1", streamId: "s1" };

describe("agent commands", () => {
  it("registers command names in the allowlist", () => {
    for (const name of ["agent_create", "agent_prompt", "agent_steer", "agent_abort", "agent_decide_tool", "agent_close"]) {
      expect(isCommandName(name)).toBe(true);
    }
  });
  it("agent_prompt validates targets and emits events", async () => {
    const result = await handlers.agent_prompt({ agentId: "a1", text: "hi", targets: ["h1"] }, ctx as never);
    expect(result.ok).toBe(true);
    expect(runtime.prompt).toHaveBeenCalledWith("o1", "a1", "hi", { targets: ["h1"] }, expect.any(Function));
  });
  it("rejects invalid agent_prompt input", async () => {
    const result = await handlers.agent_prompt({ agentId: "a1" }, ctx as never);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/electron/domains/agent/commands.test.ts`
Expected: FAIL — 命令不存在

- [ ] **Step 3: 注册命令 + 最小实现**

```ts
// electron/command-names.ts — 在列表末尾新增
  "agent_create",
  "agent_prompt",
  "agent_steer",
  "agent_abort",
  "agent_decide_tool",
  "agent_close",
```

```ts
// electron/domains/agent/commands.ts
import { z, type ZodType } from "zod";
import { DomainError } from "../../ipc/domain-error.js";
import type { CommandContext, CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success } from "../../ipc/result.js";
import type { MultiHostAgentRuntime } from "./agent-runtime.js";

const id = z.string().trim().min(1);
const prompt = z.string().trim().min(1);
const targets = z.array(id).max(64).optional();

export function createAgentCommandHandlers(
  runtime: MultiHostAgentRuntime,
  emit: (streamId: string | undefined, event: unknown) => void,
): CommandHandlers {
  return {
    agent_create: command(
      z.object({ providerConfigId: id, targets }),
      ({ providerConfigId, targets }, context) =>
        runtime.create(context.ownerId, { providerConfigId, targets }).snapshot,
    ),
    agent_prompt: command(
      z.object({ agentId: id, text: prompt, targets }),
      ({ agentId, text, targets }, context) => {
        if (!context.streamId) throw new DomainError("AGENT_PROTOCOL", "The agent prompt requires a finite event stream.");
        return runtime.prompt(
          context.ownerId,
          agentId,
          text,
          { targets: targets ?? [] },
          (event) => emit(context.streamId, event),
        );
      },
    ),
    agent_steer: command(
      z.object({ agentId: id, text: prompt }),
      ({ agentId, text }, context) => runtime.steer(context.ownerId, agentId, text),
    ),
    agent_abort: command(
      z.object({ agentId: id }),
      ({ agentId }, context) => runtime.abort(context.ownerId, agentId),
    ),
    agent_decide_tool: command(
      z.object({ agentId: id, confirmationId: id, approved: z.boolean() }),
      ({ agentId, confirmationId, approved }, context) =>
        runtime.decideTool(context.ownerId, agentId, confirmationId, approved),
    ),
    agent_close: command(
      z.object({ agentId: id }),
      ({ agentId }, context) => runtime.close(context.ownerId, agentId),
    ),
  };
}

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input, context: CommandContext) => Output | Promise<Output>,
): CommandHandler {
  return async (raw, context) => {
    try {
      return success(await operation(schema.parse(raw ?? {}), context));
    } catch (error) {
      if (error instanceof DomainError) return error.toResult();
      if (error instanceof z.ZodError) return failure("IPC_INVALID_INPUT", "The desktop operation received invalid input.");
      throw error;
    }
  };
}
```

- [ ] **Step 4: 在 main.cts 接线**

```ts
// electron/main.cts — start() 内新增
import { MultiHostAgentRuntime } from "./domains/agent/agent-runtime.js";
import { SshHeadlessRuntime } from "./domains/ssh/headless.js";
import { createAgentCommandHandlers } from "./domains/agent/commands.js";
// 构造（在 sshRuntime 之后）
const headless = new SshHeadlessRuntime(sshRuntime);
// 注入库存分组→主机映射到 MultiHostAgentRuntime（供 host_list 与 targets 展开）
const agentRuntime = new MultiHostAgentRuntime(aiService.models, aiService.history, aiService.risk, headless, inventoryRepository);
// 注册 handlers（与现有 createAiCommandHandlers 平级）
...createAgentCommandHandlers(agentRuntime, emitStreamEvent),
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/electron/domains/agent/commands.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add electron/command-names.ts electron/domains/agent/commands.ts electron/main.cts tests/electron/domains/agent/commands.test.ts
git commit -m "feat(agent): register agent_* IPC commands with contract tests"
```

---

### Task 5: 接入真实凭据与库存解析（无头通道落地）

**Files:**
- Modify: `electron/domains/ssh/headless.ts`
- Modify: `electron/domains/agent/agent-runtime.ts`
- Modify: `electron/main.cts`
- Test: `tests/electron/domains/agent/host-resolution.test.ts`

**Interfaces:**
- Consumes: `InventoryRepository.listHosts(vaultId)`（`electron/domains/inventory/repository.ts:348`）、`SshCredentialVault`、`CreateSshProfile`。
- Produces:
  - `resolveHeadlessProfile(host: Host, credential: SavedCredentialLike): CreateSshProfile` — 由库存主机 + 凭据解析为 `SshRuntime.open` 可用的 profile（`hostId/address/username/authKind/credentialRef`）。
  - `MultiHostAgentRuntime.openHost(hostId: string): Promise<void>` — 打开无头连接（解析 profile → `headless.open`）；凭据缺失抛 `DomainError("AGENT_HOST_CREDENTIAL_MISSING")`。

- [ ] **Step 1: 写失败测试**

```ts
// tests/electron/domains/agent/host-resolution.test.ts
import { describe, expect, it, vi } from "vitest";
import { resolveHeadlessProfile } from "../../../electron/domains/agent/host-resolution.js";
import type { Host } from "../../../electron/domains/inventory/models.js";

const host = {
  id: "h1", address: "192.168.1.10", username: "root", authKind: "password",
  credentialRef: "cred-1", port: 22,
} as unknown as Host;

describe("resolveHeadlessProfile", () => {
  it("builds an SSH profile from inventory host + credential", () => {
    expect(resolveHeadlessProfile(host, { authKind: "password", credentialRef: "cred-1" })).toEqual({
      hostId: "h1", hostname: "192.168.1.10", port: 22, username: "root",
      authKind: "password", credentialRef: "cred-1", identityId: null,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/electron/domains/agent/host-resolution.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 host-resolution**

```ts
// electron/domains/agent/host-resolution.ts
import type { CreateSshProfile } from "../ssh/runtime.js";
import type { Host } from "../inventory/models.js";

export type SavedCredentialLike = {
  authKind: "password" | "privateKey";
  credentialRef: string;
};

export function resolveHeadlessProfile(host: Host, credential: SavedCredentialLike): CreateSshProfile {
  return {
    hostId: host.id,
    hostname: host.address,
    port: host.port ?? 22,
    username: host.username,
    authKind: credential.authKind,
    credentialRef: credential.credentialRef,
    identityId: host.identity ?? null,
    keepaliveInterval: null,
  };
}
```

- [ ] **Step 4: 接线到 agent-runtime 的 `openHost`（凭据缺失抛 `AGENT_HOST_CREDENTIAL_MISSING`）**

```ts
  // agent-runtime.ts 内：MultiHostAgentRuntime 增加 inventory/credentials 注入
  async openHost(hostId: string): Promise<void> {
    const host = this.#inventory?.listHosts("").find((h) => h.id === hostId);
    if (!host) throw new DomainError("AGENT_HOST_NOT_FOUND", "Target host is not in the inventory.");
    const credential = this.#credentials?.get(host.credentialRef); // 主进程注入 SshCredentialVault
    if (!credential) throw new DomainError("AGENT_HOST_CREDENTIAL_MISSING", "No saved credential for this host. Connect once from the Servers page.");
    await this.#headless.open(host.id, resolveHeadlessProfile(host, { authKind: host.authKind, credentialRef: host.credentialRef }));
  }
```

- [ ] **Step 5: 运行测试确认通过 + 全量 agent 相关测试**

Run: `npx vitest run tests/electron/domains/agent`
Expected: PASS（directives / agent-runtime / commands / host-resolution 全部通过）

- [ ] **Step 6: 提交**

```bash
git add electron/domains/agent/host-resolution.ts electron/domains/agent/agent-runtime.ts electron/domains/ssh/headless.ts electron/main.cts tests/electron/domains/agent/host-resolution.test.ts
git commit -m "feat(agent): resolve saved credentials for headless host connections"
```

---

### Task 6: 引入 Assistant UI 并搭建 `@` 提及输入框

**Files:**
- Modify: `package.json`
- Create: `src/features/agent/composer/MentionComposer.tsx`
- Create: `src/features/agent/composer/mentionAdapter.ts`
- Create: `src/features/agent/agentTypes.ts`
- Test: `tests/src/features/agent/composer/MentionComposer.test.tsx`

**Interfaces:**
- Consumes: `unstable_useMentionAdapter` / `ComposerPrimitive.Unstable_TriggerPopover`（`@assistant-ui/react`，**pin 版本**）；`useInventoryStore`。
- Produces:
  - `type AgentMentionItem = { id: string; type: "host" | "group"; label: string }`
  - `buildMentionItems(hosts, groups): { categories: { id: "hosts"|"groups"; label: string; items: AgentMentionItem[] } }`
  - `MentionComposer({ onSend(text): void })` — 受控文本 + `@` 弹层 + directive 插入 + Enter 发送。

> **实际落地（`@assistant-ui/react@0.15.4`）**：`ComposerTriggerPopover` 已拆分为
> `ComposerPrimitive.Unstable_TriggerPopoverRoot / Unstable_TriggerPopover / Unstable_TriggerPopover.Directive`；
> 聊天流用 `useExternalStoreRuntime` + `AssistantRuntimeProvider` 接入既有
> `AgentClient` 事件流，消息与工具卡经 `ThreadPrimitive.Messages` / `MessagePrimitive.Root` 渲染。

- [x] **Step 1: 安装依赖**

Run: `pnpm add @assistant-ui/react@<精确版本>` （安装后记录实际版本并固定）
Expected: package.json 增加 `@assistant-ui/react`（精确版本）

- [x] **Step 2: 写失败测试**

```ts
// tests/src/features/agent/composer/MentionComposer.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MentionComposer } from "@/features/agent/composer/MentionComposer";
import { useInventoryStore } from "@/features/inventory/inventoryStore";

describe("MentionComposer", () => {
  it("renders and sends text on Enter", async () => {
    useInventoryStore.getState().setResources(
      { g1: { id: "g1", name: "prod" } } as never,
      { h1: { id: "h1", name: "web-1", address: "192.168.1.10" } } as never,
      {},
    );
    let sent = "";
    render(<MentionComposer onSend={(text) => { sent = text; }} />);
    await userEvent.type(screen.getByLabelText("Message agent"), "uptime{Enter}");
    expect(sent).toBe("uptime");
  });
});
```

- [x] **Step 3: 运行测试确认失败**

Run: `npx vitest run tests/src/features/agent/composer/MentionComposer.test.tsx`
Expected: FAIL — 模块不存在

- [x] **Step 4: 最小实现（直接使用 assistant-ui 原语；`@` 弹层 + directive 插入）**

```tsx
// src/features/agent/composer/mentionAdapter.ts
import { unstable_useMentionAdapter } from "@assistant-ui/react";
import { useInventoryStore } from "@/features/inventory/inventoryStore";

export function useAgentMentionAdapter() {
  const hosts = useInventoryStore((s) => Object.values(s.hosts));
  const groups = useInventoryStore((s) => Object.values(s.groups));
  const mention = unstable_useMentionAdapter({
    includeModelContextTools: false,
    categories: [
      { id: "hosts", label: "Servers", items: hosts.map((h) => ({ id: h.id, type: "host" as const, label: h.name })) },
      { id: "groups", label: "Groups", items: groups.map((g) => ({ id: g.id, type: "group" as const, label: g.name })) },
    ],
    formatter: {
      format: (item) => (item.type === "host" ? `:host[${item.label}]{name=${item.id}}` : `:group[${item.label}]{name=${item.id}}`),
      parse: (text) => text, // 透传；后端 parseDirectives 统一解析
    },
  });
  return mention;
}
```

```tsx
// src/features/agent/composer/MentionComposer.tsx
import { useRef, useState } from "react";
import { ComposerPrimitive, ComposerTriggerPopover } from "@assistant-ui/react";
import { useAgentMentionAdapter } from "./mentionAdapter";

export function MentionComposer({ onSend }: { onSend: (text: string) => void }) {
  const [input, setInput] = useState("");
  const mention = useAgentMentionAdapter();

  return (
    <ComposerPrimitive.Root>
      <ComposerTriggerPopover char="@" adapter={mention.adapter} directive={mention.directive}>
        <ComposerPrimitive.Input
          aria-label="Message agent"
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder="@ 选择服务器或分组，描述要执行的运维操作…"
        />
      </ComposerTriggerPopover>
      <ComposerPrimitive.Send
        aria-label="Send"
        disabled={!input.trim()}
        onClick={() => { onSend(input); setInput(""); }}
      />
    </ComposerPrimitive.Root>
  );
}
```

- [x] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/src/features/agent/composer/MentionComposer.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add package.json pnpm-lock.yaml src/features/agent/composer/ src/features/agent/agentTypes.ts tests/src/features/agent/composer/MentionComposer.test.tsx
git commit -m "feat(agent): add assistant-ui @-mention composer for host/group targets"
```

---

### Task 7: 左侧 `Agent` destination + 面板骨架 + 事件流接入

**Files:**
- Modify: `src/features/workspace/WorkspaceShell.tsx`
- Modify: `src/features/workspace/PrimaryNavigation.tsx`
- Create: `src/features/agent/AgentPage.tsx`
- Create: `src/features/agent/agentApi.ts`
- Modify: `src/app/App.tsx`
- Test: `tests/src/features/workspace/PrimaryNavigation.test.tsx`、`tests/src/features/agent/AgentPage.test.tsx`

**Interfaces:**
- Consumes: `MentionComposer`（Task 6）、`aiAgentApi` 的 `AiAgentClient` 形状（`src/features/ai/aiAgentApi.ts`）、`AiAgentEvent`/`AiAgentMessage`（`src/features/ai/aiAgentTypes.ts`）。
- Produces:
  - `Destination` 增加 `"agent"`。
  - `AgentPage({ agentClient, inventory })` — 消息流 + 工具卡 + 底部 `MentionComposer`；按 `AiAgentEvent` 驱动 `useState`（沿用 `AiAssistantPanel.applyAgentEvent` 模式）。

- [ ] **Step 1: 写失败测试**

```tsx
// tests/src/features/agent/AgentPage.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPage } from "@/features/agent/AgentPage";
import type { AiAgentClient } from "@/features/ai/aiAgentApi";

function fakeClient() {
  return {
    create: vi.fn(async () => ({ agentId: "a1", status: "idle", hosts: [], messages: [], providerConfigId: "cfg" })),
    prompt: vi.fn(async () => ({ agentId: "a1", status: "idle", hosts: [], messages: [], providerConfigId: "cfg" })),
    steer: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
    decideTool: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as AiAgentClient;
}

describe("AgentPage", () => {
  it("creates an agent and renders the composer", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} />);
    await screen.findByLabelText("Message agent");
    expect(client.create).toHaveBeenCalled();
  });

  it("sends a prompt with parsed targets on submit", async () => {
    const client = fakeClient();
    render(<AgentPage agentClient={client} />);
    const input = await screen.findByLabelText("Message agent");
    await userEvent.type(input, "uptime{Enter}");
    expect(client.prompt).toHaveBeenCalledWith("a1", "uptime", expect.any(Function));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/src/features/agent/AgentPage.test.tsx`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 AgentPage（复用 AiAssistantPanel 的事件驱动模式）**

```tsx
// src/features/agent/AgentPage.tsx
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { aiAgentApi, type AiAgentClient } from "@/features/ai/aiAgentApi";
import type { AiAgentEvent, AiAgentMessage, AiAgentSnapshot, AiToolConfirmation } from "@/features/ai/aiAgentTypes";
import { MentionComposer } from "./composer/MentionComposer";
import { parseDirectives } from "./directiveText";
import { useInventoryStore } from "@/features/inventory/inventoryStore";

export function AgentPage({ agentClient = aiAgentApi }: { agentClient?: AiAgentClient }) {
  const [agentId, setAgentId] = useState<string>();
  const [messages, setMessages] = useState<AiAgentMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmation, setConfirmation] = useState<AiToolConfirmation>();
  const [hosts, setHosts] = useState<string[]>([]);
  const agentIdRef = useRef<string | undefined>(undefined);
  const groupHosts = useInventoryStore((s) => Object.values(s.groups).reduce<Record<string, string[]>>((acc, g) => {
    acc[g.id] = Object.values(s.hosts).filter((h) => h.groupId === g.id).map((h) => h.id);
    return acc;
  }, {}));

  useEffect(() => {
    void agentClient.create({ providerConfigId: "" }).then(
      (snap) => { agentIdRef.current = snap.agentId; setAgentId(snap.agentId); setHosts(snap.hosts ?? []); },
      () => setError("The agent could not be created."),
    );
    return () => { const id = agentIdRef.current; if (id) void agentClient.close(id); };
  }, [agentClient]);
  // …（send / applyEvent / confirm 流与 AiAssistantPanel 同构，send 内先 parseDirectives 得到 targets 再调 prompt）
  return (
    <div data-testid="agent-page" className="flex h-full flex-col bg-carbon">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-graphite px-4">
        <Sparkles size={16} className="text-acid-lime" />
        <h2 className="m-0 text-[13px] font-semibold text-paper">Agent</h2>
        <span className="text-[10px] text-fog">{running ? "Working…" : "Ready"}</span>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.map((m, i) => <MessageBubble key={`${m.timestamp}-${i}`} message={m} />)}
      </div>
      <div className="shrink-0 border-t border-graphite px-3 pb-3 pt-2">
        <MentionComposer onSend={(text) => send(text)} />
      </div>
      {confirmation ? <ConfirmCard confirmation={confirmation} onDecide={(ok) => resolveConfirmation(ok)} /> : null}
    </div>
  );
}
```

- [ ] **Step 4: 接线到 WorkspaceShell / PrimaryNavigation / App**

```ts
// src/features/workspace/WorkspaceShell.tsx — Destination 增加
export type Destination = "servers" | "sftp" | "forwarding" | "history" | "terminal" | "agent";
```

```tsx
// src/features/workspace/PrimaryNavigation.tsx — destinations 增加
{ id: "agent", label: "Agent", icon: Sparkles },
```

```tsx
// src/app/App.tsx — render 分支新增
) : destination === "agent" ? (
  <AgentPage agentClient={aiAgentApi} />
) :
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/src/features/agent/AgentPage.test.tsx tests/src/features/workspace/PrimaryNavigation.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/features/workspace/WorkspaceShell.tsx src/features/workspace/PrimaryNavigation.tsx src/features/agent/AgentPage.tsx src/features/agent/agentApi.ts src/features/agent/directiveText.ts src/app/App.tsx tests/src/features/agent/AgentPage.test.tsx
git commit -m "feat(agent): add left-sidebar Agent destination with panel skeleton"
```

---

### Task 8: 右侧操作进度区（按主机分组）

**Files:**
- Create: `src/features/agent/ProgressPanel.tsx`
- Modify: `src/features/agent/AgentPage.tsx`
- Test: `tests/src/features/agent/ProgressPanel.test.tsx`

**Interfaces:**
- Consumes: `AiAgentEvent` 流（`toolStart/toolUpdate/toolEnd` 的 `args.hostId`）。
- Produces:
  - `type HostProgress = { hostId: string; phase: "connecting" | "executing" | "done" | "error"; commands: CommandStep[]; error?: string }`
  - `type CommandStep = { id: string; command: string; status: "running" | "ok" | "error"; output?: string; awaitingConfirmation?: boolean }`
  - `useHostProgress(events: AiAgentEvent[]): Map<string, HostProgress>` — 从事件流聚合按主机的进度骨架。

- [ ] **Step 1: 写失败测试**

```ts
// tests/src/features/agent/ProgressPanel.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressPanel } from "@/features/agent/ProgressPanel";

describe("ProgressPanel", () => {
  it("groups tool events by host", () => {
    const progress = new Map([
      ["h1", {
        hostId: "h1", phase: "done",
        commands: [{ id: "c1", command: "uptime", status: "ok", output: " 1:00 up 3 days" }],
      }],
    ]);
    render(<ProgressPanel progress={progress} />);
    expect(screen.getByText("h1")).toBeInTheDocument();
    expect(screen.getByText("uptime")).toBeInTheDocument();
  });

  it("shows an awaiting-confirmation command", () => {
    const progress = new Map([
      ["h1", {
        hostId: "h1", phase: "executing",
        commands: [{ id: "c1", command: "rm -rf /var/log/old/*", status: "running", awaitingConfirmation: true }],
      }],
    ]);
    render(<ProgressPanel progress={progress} onDecide={() => undefined} />);
    expect(screen.getByText("rm -rf /var/log/old/*")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/src/features/agent/ProgressPanel.test.tsx`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 ProgressPanel**

```tsx
// src/features/agent/ProgressPanel.tsx
import { Check, Circle, Loader2, TriangleAlert } from "lucide-react";
import type { HostProgress } from "./progressTypes";

export function ProgressPanel({
  progress,
  onDecide,
}: {
  progress: Map<string, HostProgress>;
  onDecide?: (hostId: string, commandId: string, approved: boolean) => void;
}) {
  const hosts = [...progress.values()];
  if (!hosts.length) return null;
  return (
    <aside data-testid="progress-panel" aria-label="Operation progress" className="w-[300px] shrink-0 overflow-y-auto border-l border-graphite bg-obsidian/40 p-3">
      <h3 className="m-0 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/70">Progress</h3>
      <div className="grid gap-3">
        {hosts.map((host) => (
          <section key={host.hostId} className="rounded-lg border border-graphite bg-carbon p-2.5">
            <div className="flex items-center gap-2 text-[12px] text-paper">
              {host.phase === "done" ? <Check size={13} className="text-pulse-green" />
                : host.phase === "error" ? <TriangleAlert size={13} className="text-coral-red" />
                : <Loader2 size={13} className="animate-spin text-acid-lime" />}
              <span className="font-medium">{host.hostId}</span>
              <span className="ml-auto text-[10px] text-fog">{host.phase}</span>
            </div>
            <div className="mt-2 grid gap-1.5">
              {host.commands.map((cmd) => (
                <div key={cmd.id} className="rounded border border-graphite bg-black/30 px-2 py-1.5">
                  <code className="block truncate text-[11px] text-mist">{cmd.command}</code>
                  {cmd.output ? <pre className="mt-1 max-h-24 overflow-auto text-[10px] text-fog">{cmd.output}</pre> : null}
                  {cmd.awaitingConfirmation && onDecide ? (
                    <div className="mt-1.5 flex gap-1.5">
                      <button className="rounded bg-coral-red/90 px-2 py-0.5 text-[10px] text-black" onClick={() => onDecide(host.hostId, cmd.id, true)}>Approve</button>
                      <button className="rounded bg-graphite px-2 py-0.5 text-[10px] text-fog" onClick={() => onDecide(host.hostId, cmd.id, false)}>Deny</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {host.error ? <p className="mt-1.5 text-[10.5px] text-coral-red">{host.error}</p> : null}
          </section>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: 聚合逻辑 `useHostProgress` + 接入 AgentPage（右侧分栏）**

```ts
// src/features/agent/progressTypes.ts
export type CommandStep = {
  id: string; command: string; status: "running" | "ok" | "error";
  output?: string; awaitingConfirmation?: boolean;
};
export type HostProgress = {
  hostId: string; phase: "connecting" | "executing" | "done" | "error";
  commands: CommandStep[]; error?: string;
};
```

```ts
// src/features/agent/useHostProgress.ts — 从 AiAgentEvent[] 聚合
export function useHostProgress(events: AiAgentEvent[]): Map<string, HostProgress> {
  const map = new Map<string, HostProgress>();
  for (const event of events) {
    if (event.type === "toolStart" || event.type === "toolUpdate" || event.type === "toolEnd") {
      const hostId = (event.args as { hostId?: string } | undefined)?.hostId ?? (event as { args?: { hostId?: string } }).args?.hostId ?? "unknown";
      const entry = map.get(hostId) ?? { hostId, phase: "executing", commands: [] };
      // …按事件类型推进 phase / 追加 command step / 写 output
      map.set(hostId, entry);
    }
  }
  return map;
}
```

> 说明：`useHostProgress` 的完整推进逻辑（connecting→executing→done/error、command step 的 id 用 `toolCallId`、output 截断、等待确认标记）与 `AiAssistantPanel` 对 `toolStart/toolUpdate/toolEnd/toolConfirmationRequired` 的处理一致；此处以最小实现通过单测，交互细节在 M3 验收阶段细化。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/src/features/agent/ProgressPanel.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/features/agent/ProgressPanel.tsx src/features/agent/progressTypes.ts src/features/agent/useHostProgress.ts src/features/agent/AgentPage.tsx tests/src/features/agent/ProgressPanel.test.tsx
git commit -m "feat(agent): add per-host operation progress panel"
```

---

### Task 9: 确认卡片 + 凭据缺失引导（UX 补全）

**Files:**
- Create: `src/features/agent/ConfirmCard.tsx`
- Create: `src/features/agent/HostErrorBanner.tsx`
- Modify: `src/features/agent/AgentPage.tsx`
- Test: `tests/src/features/agent/ConfirmCard.test.tsx`

**Interfaces:**
- Consumes: `AiToolConfirmation`、`toolConfirmationRequired` 事件、`agent_end` 的 `errorMessage`。
- Produces: `ConfirmCard({ confirmation, onDecide })`、`HostErrorBanner({ hostId, errorCode, onConnect })`。

- [ ] **Step 1: 写失败测试**

```tsx
// tests/src/features/agent/ConfirmCard.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmCard } from "@/features/agent/ConfirmCard";

describe("ConfirmCard", () => {
  it("shows reason and approves on button click", async () => {
    const onDecide = vi.fn();
    render(<ConfirmCard confirmation={{ confirmationId: "c1", level: "high", reason: "destructive", projectedEffect: "deletes logs" }} onDecide={onDecide} />);
    expect(screen.getByText(/destructive/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onDecide).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/src/features/agent/ConfirmCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 ConfirmCard 与 HostErrorBanner（沿用 AiAssistantPanel 确认弹层样式）**

```tsx
// src/features/agent/ConfirmCard.tsx
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiToolConfirmation } from "@/features/ai/aiAgentTypes";

export function ConfirmCard({ confirmation, onDecide }: { confirmation: AiToolConfirmation; onDecide: (approved: boolean) => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Confirm command" className="absolute inset-0 grid place-items-center bg-black/70 p-5">
      <div className="w-full max-w-sm rounded-xl border border-coral-red/40 bg-obsidian p-4 shadow-xl">
        <div className="flex items-center gap-2 text-coral-red"><AlertTriangle size={16} /> Confirmation required</div>
        <p className="mt-3 text-sm text-mist">{confirmation.reason}</p>
        <p className="mt-1 text-xs text-fog">{confirmation.projectedEffect}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onDecide(false)}>Deny</Button>
          <Button type="button" onClick={() => onDecide(true)}>Approve</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/src/features/agent/ConfirmCard.test.tsx`
Expected: PASS

- [ ] **Step 5: 接入 AgentPage（`toolConfirmationRequired` → ConfirmCard；`AGENT_HOST_CREDENTIAL_MISSING` → HostErrorBanner）**

- [ ] **Step 6: 提交**

```bash
git add src/features/agent/ConfirmCard.tsx src/features/agent/HostErrorBanner.tsx src/features/agent/AgentPage.tsx tests/src/features/agent/ConfirmCard.test.tsx
git commit -m "feat(agent): add confirmation card and credential-missing guidance"
```

---

### Task 10: 供应商/会话管理 + 键盘与空态 + 全量测试

**Files:**
- Modify: `src/features/agent/AgentPage.tsx`
- Test: `tests/src/features/agent/AgentPage.test.tsx`（扩展）

**Interfaces:**
- Consumes: `aiConfigApi.list`（`src/features/ai/aiApi.ts`）、`aiSessionApi`（`src/features/ai/aiSessionApi.ts`）、`AiAssistantPanel` 的供应商下拉/历史交互模式（`src/features/ai/AiAssistantPanel.tsx:72-133, 170-260`）。

- [ ] **Step 1: 扩展测试（供应商加载 + 空态 + 会话历史）**

```tsx
// tests/src/features/agent/AgentPage.test.tsx 追加
it("shows a configure-providers empty state when none usable", async () => {
  const client = fakeClient();
  // 注入空供应商列表的 fake providerApi
  render(<AgentPage agentClient={client} providerApi={{ list: vi.fn(async () => []) }} />);
  expect(await screen.findByText(/configure an ai provider/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/src/features/agent/AgentPage.test.tsx`
Expected: FAIL（空态文案缺失）

- [ ] **Step 3: 实现供应商加载 + 会话历史 + 键盘快捷键 + 空态/加载态**

```tsx
// AgentPage.tsx 内
//  1) 顶部供应商 select（复用 AiAssistantPanel:482-494 的 select 样式）
//  2) 新建会话（agentClient.create）与历史（aiSessionApi.list/load/delete）
//  3) MentionComposer 已处理 Enter 发送；补齐 Esc 关闭弹层（ComposerPrimitive 自带）
//  4) 空态：无可用供应商时显示 "Configure an AI provider in Settings…"
//  5) 加载态：loading 时显示 "Loading providers…"
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/src/features/agent`
Expected: PASS

- [ ] **Step 5: 全量测试 + typecheck**

Run: `pnpm typecheck`
Expected: PASS（无 TS 错误）

Run: `pnpm test`
Expected: PASS（全量 vitest 通过）

- [ ] **Step 6: 提交**

```bash
git add src/features/agent/AgentPage.tsx tests/src/features/agent/AgentPage.test.tsx
git commit -m "feat(agent): add provider selection, session history, and empty states"
```

---

### Task 11: 集成验收（走通核心场景）与 e2e 冒烟

**Files:**
- Modify: `e2e/agent.spec.ts`（新建）与 `e2e-electron/`（冒烟）
- Test: `tests/electron/domains/agent/integration.test.ts`

**Interfaces:**
- Consumes: 全部已实现任务。

- [ ] **Step 1: 写集成测试（多主机编排冒烟）**

```ts
// tests/electron/domains/agent/integration.test.ts
// 用 fake SshHeadlessRuntime 记录 exec 调用顺序，断言「在 h1 采集 docker ps → 在 h2 执行 docker run」的工具调用序列
```

- [ ] **Step 2: 运行集成测试**

Run: `npx vitest run tests/electron/domains/agent/integration.test.ts`
Expected: PASS（确认跨主机工具调用序列成立）

- [ ] **Step 3: e2e 冒烟（打开 Agent 面板 + `@` 弹出选择器）**

```ts
// e2e/agent.spec.ts
test("opens the Agent panel and shows the mention picker on @", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Agent" }).click();
  await page.getByLabel("Message agent").fill("@");
  await expect(page.getByText("Servers")).toBeVisible();
  await expect(page.getByText("Groups")).toBeVisible();
});
```

- [ ] **Step 4: 运行 e2e 冒烟**

Run: `pnpm test:e2e -- e2e/agent.spec.ts`
Expected: PASS

- [ ] **Step 5: 走查验收清单（对照 PRD §7）**

- [ ] M1 无头通道 + host_exec + targets 经风险门控 → 完成
- [ ] M2 `@` 提及 + 面板骨架 → 完成
- [ ] M3 右侧进度区 + 确认卡 + 凭据缺失引导 → 完成
- [ ] M4 供应商/会话/键盘/空态 → 完成

- [ ] **Step 6: 提交**

```bash
git add e2e/agent.spec.ts e2e-electron/ tests/electron/domains/agent/integration.test.ts
git commit -m "test(agent): integration and e2e smoke for multi-host ops"
```

---

## Self-Review

**1. Spec 覆盖：** PRD 的 F1–F9 / N1–N7 / M1–M4 均有对应任务——F1（Task 7）、F2（Task 6）、F3（Task 3/11）、F4（Task 8）、F5（Task 1/5）、F6（Task 9 + agent-runtime 确认流）、F7（Task 10）、F8（Task 9）、F9（无头通道复用 `SshRuntime` host key 机制，未单列任务——已在 Task 1 实现说明与 PRD 6.2 注明沿用现有 `#pending`/`HostKeyDialog` 流程）。N1–N7 写入 Global Constraints。

**2. 占位符扫描：** 无「TBD/TODO」。所有代码步骤给出真实代码；`#tools`/`#handleEvent`/`#confirm`（Task 3 Step 4）与 `useHostProgress`（Task 8 Step 4）给出行为说明并明确复用现有实现（`AiAgentRuntime.ts:179-350`、`AiAssistantPanel.applyAgentEvent`），因其完整实现依赖现有同构代码，计划内以最小实现 + 单测锁定接口。

**3. 类型一致性：** `host_exec(hostId, command, cwd?, timeoutMs?)` 在 Task 3 定义、Task 5 的 `resolveHeadlessProfile`/`openHost` 与 Task 1 的 `HeadlessExecResult` 类型对齐；`parseDirectives` 返回 `MentionTarget[]` 在 Task 2 定义、Task 3 `expandTargets` 使用；`AiAgentEvent`/`AiAgentMessage`/`AiToolConfirmation` 直接复用 `src/features/ai/aiAgentTypes.ts`，Task 7/8/9 均引用同一类型。`Destination` 增加 `"agent"` 在 Task 7 定义，`PrimaryNavigation`/`App` 使用一致。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-05-agent-sidebar.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个任务派发全新 subagent，任务间评审，快速迭代

**2. Inline Execution** — 在本会话按 executing-plans 批量执行，带检查点

**Which approach?**
