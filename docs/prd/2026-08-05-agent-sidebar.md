# 产品需求文档（PRD）：客户端左侧「Agent」栏

- **文档版本**：v1.0
- **日期**：2026-08-05
- **状态**：评审中
- **关联技术方案**：见 [Implementation Plan](../superpowers/plans/2026-08-05-agent-sidebar.md)

---

## 1. 背景与目标

### 1.1 背景

Buzz 是一款安全优先的远程会话桌面客户端（Electron + React 19 + TypeScript）。其定位核心是**运维人员在客户端内完成对多台服务器的连接、管理与操作**。

Buzz 已具备完整的自研 AI Agent 能力：

- `src/main/domains/ai/agent-runtime.ts` 中 `AiAgentRuntime`（基于 `@earendil-works/pi-agent-core` 的 agent 循环）；
- 多模型供应商支持（Anthropic / OpenAI 兼容 / GLM / Kimi / DeepSeek / 自定义 / Ollama），密钥经 AES-256-GCM 加密存储（`repository.ts`）；
- 命令风险门控 `AiShellRiskRuntime`（拦截交互命令、对危险命令要求 60s 单次确认令牌）；
- 会话历史加密落库（`history.ts`，512MB 淘汰）；
- 右侧 AI 侧栏 `AiAssistantPanel`（与已打开的 SSH 终端会话 1:1 绑定）。

**现状局限**：

1. 现有 AI 面板**只能绑定一个已经打开的 SSH 终端会话**，无法直接对库存（Inventory）中的任意服务器/分组操作；
2. 无 `@` 提及选择器，用户无法在输入中显式选择目标主机/分组；
3. 无独立的「多主机操作 + 操作进度」展示面；
4. 交互层为手写状态机（`useState` + 事件流），未采用社区 Agentic UI 组件库。

### 1.2 目标

在客户端**左侧**新增 **Agent 栏**，让用户用自然语言直接向服务器下达运维命令：

- 输入框内通过 **`@` 符号**从库存中选择**服务器**或**分组**作为操作目标；
- Agent 可对一个或多个目标服务器**自主执行**运维操作（如「把 `@192.168.1.10` 上的 Docker 容器同样运行在 `@192.168.1.11` 上」）；
- **右侧**展示该任务的多主机**操作进度**（哪台主机、正在执行什么命令、结果如何、是否有等待确认的危险操作）。

### 1.3 非目标（本期不做）

- 不做带视觉反馈的富文本 AI 生成 UI（Generative UI）渲染层——本期仅展示命令/结果/进度的工具卡片；
- 不改变现有右侧 `AiAssistantPanel` 与终端 AI 模式的行为；
- 不做 Agent 的定时/后台常驻调度；
- 不做跨设备 Agent 编排。

---

## 2. 用户与场景

### 2.1 目标用户

有 Linux/服务器运维经验、日常通过 SSH 管理多台主机的工程/运维人员。已配置好 Buzz 的 AI 供应商（或使用本地 Ollama）。

### 2.2 核心场景

**场景 A（单主机操作）**：`@db-primary 查看 nginx 的错误日志`。Agent 连接 `db-primary`，执行 `tail -f`/`journalctl` 类查询并回显结果。

**场景 B（跨主机编排）**：`把 @192.168.1.10 上的 docker 容器同样运行在 @192.168.1.11 上`。Agent 需在 A 上 `docker ps` 与 `docker inspect` 采集配置，再到 B 上比对/拉取镜像并启动，中间涉及跨主机信息拼接，**是本期能力上限验证场景**。

**场景 C（分组批量）**：`@Production 逐台执行 uptime 并汇总`。Agent 依次对分组内每台主机执行命令并汇总输出。

**场景 D（危险操作）**：`@staging 执行 rm -rf /var/log/old/*`（命中风险门控）。Agent 暂停，弹出确认卡片，用户批准/拒绝后继续。

**场景 E（凭据缺失）**：`@some-host 查看磁盘`，但该主机从未连接过、无已保存凭据。Agent 在卡片中提示「需要凭据，请在服务器页手动连接一次」，并将该主机标记为待处理，继续处理其他目标。

---

## 3. 需求详细描述

### 3.1 功能需求

| 编号 | 需求 | 优先级 | 说明 |
|---|---|---|---|
| F1 | 左侧新增「Agent」导航项与面板 | P0 | 在 `WorkspaceShell` 左侧 `PrimaryNavigation` 新增 `agent` Destination；面板整体结构：输入框 + 消息/进度列表 + 顶部供应商/会话控制 |
| F2 | `@` 提及选择服务器或分组 | P0 | 输入 `@` 弹出选择器，列出库存中的服务器与分组；选中后插入可识别的指令文本；后端可解析目标 |
| F3 | Agent 多主机自主执行 | P0 | Agent 可对多个目标（单主机/分组展开为多主机）依次执行命令，跨主机拼接信息 |
| F4 | 右侧操作进度面板 | P0 | 将任务进度按主机分组展示：连接状态、命令、输出摘要、结果、等待确认 |
| F5 | 复用已保存凭据，无头连接 | P0 | 主进程按 hostId 从库存/凭据库解析认证材料，建立无 PTY 的 SSH 通道执行命令；凭据永不跨 IPC |
| F6 | 危险命令确认流 | P0 | 复用 `AiShellRiskRuntime`；确认请求在主进度区展示，可批准/拒绝 |
| F7 | 供应商选择与会话管理 | P1 | 顶部可切换 AI 供应商；支持新建会话与查看历史（复用 `aiSessionApi`） |
| F8 | 凭据缺失提示 | P1 | 连接失败时在对应主机卡片内提示，引导去服务器页手动连接 |
| F9 | 主机钥匙验证 | P1 | 未知/变更的 host key 走现有确认对话框流程（`HostKeyDialog`） |

### 3.2 非功能需求

| 编号 | 需求 | 约束 |
|---|---|---|
| N1 | 安全：凭据不落 IPC | 凭据解析与 SSH 建连全部在主进程完成，IPC 只传 `hostId`，与 `AGENTS.md` 安全要求一致 |
| N2 | 安全：风险门控 | 所有远程命令执行必须经 `AiShellRiskRuntime` 评估；危险命令必须经用户确认 |
| N3 | 兼容性：版本约束 | Electron ^43、React ^19、TypeScript ^5.6、Vite ^5；Tailwind 升至 ^4（全渲染层）；新依赖需满足现有约束 |
| N4 | 一致性：设计系统 | 新增 UI 沿用 Buzz 设计 token（`tailwind.config.ts` 的 `void/carbon/…/acid-lime` 等）与 shadcn 风格 |
| N5 | 可测试性 | 主进程命令与领域逻辑需命令契约测试（`AGENTS.md`）；渲染层沿用 `tests/src` 注入 fake 的模式 |
| N6 | 并发上限 | 同一 Agent 单任务内主机连接并发数上限 4（防资源耗尽） |
| N7 | 超时 | 单条命令默认 30s 超时（与现有 `ssh_exec` 一致），可被 Agent 显式覆盖（1s–300s） |

---

## 4. Agentic UI 库调研与选型

> 调研对象：**AI SDK UI**（Vercel）、**Assistant UI**、**OpenUI**、**CopilotKit**。调研时间：2026-08。

### 4.1 候选对比

| 维度 | **AI SDK UI**（`@ai-sdk/react`） | **Assistant UI**（`@assistant-ui/react`） | **CopilotKit** | **OpenUI** |
|---|---|---|---|---|
| 定位 | AI SDK 的 React hooks + 流协议 | Headless 聊天组件库（自选后端） | 端到端 AI Copilot 框架 | **AI 生成 UI 组件的工具**（非聊天库） |
| 流式协议 | 自带 Data Stream Protocol（SSE） | 自带 runtime，可对接任意后端 | 自带后端 runtime | — |
| 后端耦合 | 绑定 AI SDK `useChat` 输入模型 | 仅需要适配一个 `AssistantRuntime` 接口，可对接自有 agent | 需要把 agent 塞进其后端约定 | — |
| `@` 提及/弹层 | **无**（需自建） | **一等支持**：`unstable_useMentionAdapter` + `ComposerPrimitive.Unstable_TriggerPopover`，默认格式 `:host[label]{name=id}` | 有 mentions（需用其 composer + 框架约束） | — |
| 工具调用展示 | 需自建（按 `message.parts` 分派渲染） | `ToolFallback` / `ToolGroup` / 按工具名注册 UI | **开箱即用**（工具调用可视化） | — |
| 多步进度/推理展示 | 需自建 | `ReasoningGroup`、自定内容 part 渲染 | 进度组件内置 | — |
| 与现有 pi-agent 引擎适配成本 | 中：需把事件流适配为 `useChat` 输入 + 自建 UI | **低**：`AiAgentEvent` 流 → `AssistantRuntime`；UI 组件按 Buzz 风格定制 | 高：需接入其后端 agent 约定 | 不适用 |
| 自带 UI 与 Buzz 设计系统贴合度 | 无 UI（完全自建） | 可定制，shadcn 风格 | 自带 UI，覆盖成本高 | — |
| 稳定性 | 稳定 | **注意：mentions 相关 API 带 `unstable_` 前缀** | 稳定 | — |
| 额外依赖体积 | 小（仅 hooks） | 中（react + 可选 react-lexical） | 大（完整框架） | — |

### 4.2 调研结论（重要）

1. **OpenUI 不适用**：它是用文本描述生成 UI 代码/组件的工具，不是聊天/Agent UI 库——与本需求无关，直接排除。
2. **CopilotKit 最「开箱即用」，但绑定最重**：其工具调用可视化和进度组件非常成熟，但要求把 agent 逻辑接入其后端约定；Buzz 已有 `AiAgentRuntime` + `pi-agent-core` 的完整循环、风险门控与加密历史，再叠一套框架会产生两套 agent 栈并存的复杂度，且其自带 UI 与 Buzz 设计系统差异大、覆盖工作多。
3. **AI SDK UI 协议优秀但 `@` 提及为零**：`useChat` 的流式消息与 tool part 渲染模式很适合，但本需求的两大痛点（`@` 提及、多主机进度）它都不提供 UI，等于把现有手写 UI 再写一遍。
4. **Assistant UI 是唯一把「`@` 提及」作为一等功能的库**，且是 **headless + 自选后端**：只需把 `AiAgentEvent` 流适配成一个 `AssistantRuntime`，即可用其 `Thread`/`Composer`/`ToolFallback`/`ReasoningGroup` 原语组装 UI，同时**保留** Buzz 的 pi-agent 引擎、风险门控与加密历史。`unstable_useMentionAdapter` 默认 directive 格式 `:host[label]{name=id}` 可直接承载「服务器/分组」目标。

### 4.3 选型建议

**采用 Assistant UI（`@assistant-ui/react`），并仅引入 `ComposerPrimitive` / mentions 原语 + 自定消息 part 渲染；其余（供应商选择、会话历史、确认卡片、右侧进度）按 Buzz 设计系统自建。**

理由优先级：**需求覆盖（`@` 提及）→ 适配成本 → 设计系统一致性**。

> **使用前提（写入 Global Constraints）**：mentions/trigger-popover 相关 API 目前带 `unstable_` 前缀，接入时**必须**将库固定版本（pin 精确版本号）并封装在 `src/renderer/features/agent/composer/` 内一层薄适配器，后续库升级只动适配器。
>
> 备选方案：若 `unstable_` API 在试用期不可接受，退化为**方案 B**：仅用 Assistant UI 的 `Thread`/`MessageList`/`ToolFallback` 消息渲染原语，`@` 提及自建（textarea + 弹出层）——仍优于纯手写（`@` 之外的消息流/工具卡/推理展示可复用）。

---

## 5. 交互与界面设计

### 5.1 信息架构

```
+--------------------------------------------------------------+
| 左侧 266px（WorkspaceShell）  |           主内容区              |
|  顶部: 设置 / 品牌            |  +--------------------------+ |
|  PrimaryNavigation           |  |    （当前 Destination）    | |
|    [Servers]                 |  |    Agent 面板展开为右侧     | |
|    [SFTP]                    |  |    操作进度面板（F4）       | |
|    [Forwarding]              |  |                           | |
|    [History]                 |  +--------------------------+ |
|  [Agent] ← 新增              |                              |
|  最近连接...                 |                              |
|  Local vault                |                              |
+--------------------------------------------------------------+
```

- 选择 `Agent` destination 后，主内容区显示 **Agent 面板**（会话列表 / 对话与工具卡 / 底部输入框）。
- 面板**内部**右侧另开一个**操作进度区**（分栏），仅当当前 Agent 任务存在多主机进度时显示。也可收敛为「进度以工具卡内嵌在消息流中」的轻量形态（见 5.3 方案取舍）。

### 5.2 输入框与 `@` 提及

- 底部输入框 placeholder：`@ 选择服务器或分组，描述要执行的运维操作…`。
- 输入 `@` 弹出选择器，分组为 **服务器** / **分组** 两个分类：
  - 服务器条目：`主机名(address)`，可选显示分组色点；
  - 分组条目：`分组名`（展开即该组全部主机）。
- 选中后插入 directive（默认格式 `:host[name]{name=hostId}`），文本态可读、可继续编辑。
- 发送后，输入框内容（含 directive）作为单条用户消息进入 agent；主进程侧解析 directive 得到目标 `hostId[]`。

### 5.3 操作进度展示（右侧）

进度区按**主机**分组展示当前任务：

```
任务: 把容器同样运行在另一台服务器上
├─ @192.168.1.10  [连接中…]→[采集中]→[✓ 完成]
│    docker ps --format …       → 输出摘要（可展开）
│    docker inspect <id>        → 输出摘要（可展开）
├─ @192.168.1.11  [连接中]→[待执行]
│    docker pull <img>          → 待执行
│    docker run -d …            → ⚠ 等待确认（危险命令）
└─ [汇总] 完成/失败原因
```

卡片交互：每个命令卡片可展开完整 stdout/stderr；危险命令卡片显示确认/拒绝按钮；失败卡片显示原因与「在服务器页手动连接」引导（凭据缺失时）。

> **方案取舍**：P0 先做「进度区与消息流并用」——消息流承载对话文本与工具卡，右侧进度区承载跨主机进度骨架。若迭代中发现信息重复，可收敛为仅在消息流中以按主机分组的工具卡呈现，右侧进度区关闭。

---

## 6. 后端能力与架构设计

### 6.1 现状关键点（依据代码）

- `AiAgentRuntime.create(ownerId, providerConfigId, sshSessionId)` **1:1 绑定一个已打开的交互式 SSH 会话**；agent 内仅注册单工具 `ssh_exec`（`agent-runtime.ts:266-305`），该工具调用 `SshRuntime.executeCommand` 在同一会话上执行。
- `SshRuntime`（`src/main/domains/ssh/runtime.ts`）持有一个 `Client`（ssh2）列表，`open()` 建立交互式 shell（PTY）；凭据来自 `SshCredentialVault`（`#credentials.get(credentialRef)`），host key 校验/确认走 `#pending` + `#knownHosts`。
- 库存侧 `InventoryRepository` 提供 `listHosts(vaultId)` 等；渲染层 `useInventoryStore` 持有 hosts/groups；`getHostCredential(host)`（`src/renderer/features/ssh/savedCredentials.ts`）可把 `credentialRef` 解析为认证材料。
- 所有 IPC 命令在 `src/shared/ipc/command-names.ts` allowlist + 各 domain `commands.ts` zod 校验；新命令必须注册 + 契约测试（`AGENTS.md`）。
- 现有 IPC 流式机制 `emitStreamEvent(streamId, event)` / 有限流（`ai_agent_prompt`）仍用于右侧 `AiAssistantPanel`；**Agent 栏的流式 prompt 改走专用 `agent:stream` `MessagePort` 通道**（见 §6.4，参考官方 Electron 指南），与既有 dispatcher 互不干扰。

### 6.2 新增能力：无头（headless）SSH 主机通道

为支持「Agent 自主连接任意库存主机」，在 SSH 领域新增 **`SshHeadlessRuntime`**（或扩展 `SshRuntime`）：

- 输入：`{ hostId, hostname, port, username, authKind, credentialRef, identityId }`（等价 `CreateSshProfile`，来自库存主机 + `savedCredentials` 解析）。
- 建连：复用 `SshRuntime.connectClient`（含 host key 校验/确认、凭据获取、keepalive），但**不开启交互式 shell**——仅保留一条 `Client`，按需 `client.exec(command)` 执行非交互命令。
- 生命周期：由 `AiAgentRuntime` 的 agent 任务生命周期管理（`open` → 任务结束 `close`），复用现有 owner 清理（`closeOwner`）。
- 并发：同一任务内并发上限 4（N6），排队执行。
- 结果：`{ stdout, stderr, exitCode, truncated }`（与 `executeCommand` 一致）。

### 6.3 新增工具与指令解析

- 新工具（注册到 agent）：
  - `host_exec(hostId, command, cwd?, timeoutMs?)` — 在指定主机执行命令（经风险门控）。
  - `host_list(groupId?)` — 列出某分组下主机（供 Agent 展开分组）。
  - `host_read(hostId, path)` / `host_write(hostId, path, content)` — 读/写远端文件（P1，可选）。
- 输入解析：发送前解析 `@` directive（`:host[...]{name=id}`）→ 目标 `hostId[]`；将目标列表注入该 turn 的上下文（system/tool hint），并限定 agent 只能用这些目标（越权用未提及主机视为错误）。
- **风险门控**：`host_exec` 沿用 `AiShellRiskRuntime`；危险命令 → `toolConfirmationRequired` → UI 确认 → 继续/终止。

### 6.4 Electron ↔ assistant-ui 通信（参考[官方 Electron 指南](https://www.assistant-ui.com/docs/guides/electron) Pattern 2「local main process」）

通信遵循官方指南：**`MessagePort` 预加载桥 + data-only 协议 + `useLocalRuntime`/`ChatModelAdapter`**，主进程校验 sender + payload，`BrowserWindow` 保持 `contextIsolation:true`/`sandbox:true`/`nodeIntegration:false`，**不通过 IPC 传 callback/`AbortSignal`/`File`**；Stop = port-close → 主进程 abort。Buzz 用自研 `pi-agent-core`/`pi-ai` 替代指南示例里的 `ai`/`@ai-sdk/openai`（**不引入 ai-sdk**）。

| 通道 | 形态 | 说明 |
|---|---|---|
| `agent:stream`（**流式 prompt**） | 专用 `MessagePort` 通道 | 渲染层 `window.terminus.streamAgent({agentId, text, targets, vaultId?}, onEvent)` 建 `MessageChannel`、`postMessage(channel, req, [port2])`；主进程 `registerAgentStreamIpc` 在 `agent:stream` 上接收 port，校验 `event.sender === mainWindow.webContents && senderFrame === mainFrame` + zod payload，跑 `MultiHostAgentRuntime.prompt(...)` 以 `port.postMessage` 为 emit，`port.once("close") → abort`，结束 `port.close()`。 |
| `agent_create` / `agent_steer` / `agent_abort` / `agent_decide_tool` / `agent_close`（**生命周期**） | 既有 dispatcher `terminus:invoke` | 简单请求/响应，zod schema + 契约测试。`agent_create` 不再要 `sshSessionId`，改传 `targets?` 与 `vaultId?`。**注意：无 `agent_prompt` 命令**——流式 prompt 走上面的 `MessagePort`。 |
| `inventory_*` | 复用 | 渲染层 `@` 选择器直接读 `useInventoryStore` 已加载数据，**无需新增 IPC**。 |

**data-only 协议**（`src/shared/agent-stream.ts`，三 bundle 共享）：`AgentStreamRequest = {agentId, text, targets, vaultId?}`；`AgentStreamEvent = AgentEvent`（`agentStart`/`messageStart|Update|End`/`toolStart|Update|End`/`toolConfirmationRequired`/`agentEnd`/`historySaveFailed`）。指南说「tools/reasoning 需显式扩展协议」——`AgentEvent` 的 tool/confirmation 事件即此扩展。

**渲染层适配（指南 step 4）：** `useLocalRuntime(ipcAgentModel)`，`ChatModelAdapter.run` 取最新 user message + `resolveTargets`（parse directives + group 展开）→ `streamAgent` → 消费 `AgentEvent` 流并 **yield 累积 `ThreadMessageLike` 快照**（text + tool-call parts，工具卡经 `useAssistantToolUI({toolName:"host_exec"})`）；同时把 `toolConfirmationRequired`/hosts 进度事件 **tee** 给 AgentPage 侧状态（ProgressPanel + ConfirmCard）。转录状态由 assistant-ui runtime 拥有，侧状态由事件派生（单一权威副本）。

> 设计要点：转录（消息/工具卡）走 assistant-ui runtime；执行（进度/确认）走侧 tee。确认回执 `agentClient.decideTool`（invoke）→ 主进程 `decideTool` → agent 继续 → 流恢复。

### 6.5 事件流（复用现有 `AiAgentEvent`）

- `toolStart`/`toolUpdate`/`toolEnd`（携带 `hostId` 于 args）→ 渲染层据此驱动**右侧进度区**按主机聚合。
- `toolConfirmationRequired` → 确认卡片。
- `agentEnd` → 进度区收尾。

---

## 7. 里程碑与验收标准

### M1：后端多主机能力（P0）
- [x] 无头主机通道可对库存主机执行命令（复用凭据、host key 校验）。
- [x] `host_exec`/`host_list` 工具注册，经风险门控。
- [x] `agent_prompt` 接受 `targets`。
- [x] 主进程命令契约测试通过（`tests/main/domains/agent/`）。

### M2：`@` 提及 + 面板骨架（P0）
- [x] 左侧 `Agent` destination + 面板骨架。
- [x] `@` 选择服务器/分组并插入 directive；发送后后端正确解析。
- [x] 消息流 + 工具卡渲染（基于 assistant-ui）。

### M3：右侧进度区 + 确认流（P0）
- [x] 按主机分组的进度骨架与命令卡片。
- [x] 危险命令确认卡片（批准/拒绝）。
- [x] 凭据缺失/连接失败的引导提示。

### M4：会话与体验（P1）
- [x] 供应商切换、新建会话、历史加载（复用 aiSessionApi）。
- [x] 键盘快捷方式（Enter 发送 / Shift+Enter 换行 / Esc 关闭弹层）。
- [x] 空态、加载态、错误态、中止（abort）。

**验收场景**：在原型/真实数据下走通场景 B（跨主机 docker 编排）、场景 C（分组批量）、场景 D（危险命令确认）、场景 E（凭据缺失）。

---

## 8. 测试策略

- **主进程**（`tests/main/`）：`SshHeadlessRuntime` 建连/执行/超时/凭据错误；`host_exec` 工具风险门控与确认；`agent_prompt` targets 解析与上下文注入；命令契约测试覆盖新增 IPC schema。
- **渲染层**（`tests/renderer/features/agent/`）：`@` 选择器（键入 `@` → 弹出 → 选中 → directive 文本）；消息/工具卡渲染；进度区按主机聚合；确认卡片交互；空态/错误态。沿用 `tests/src` 注入 fake 的模式。
- **e2e**：Playwright 冒烟（打开 Agent 面板、输入 `@` 弹出选择器）。

---

## 9. 依赖清单（增量）

| 包 | 用途 | 备注 |
|---|---|---|
| `@assistant-ui/react` | 聊天原语 + `@` 提及 + `useLocalRuntime`/`ChatModelAdapter`（Electron 指南 Pattern 2 的运行时桥） | **pin 精确版本**；`unstable_` API 封装于 `src/renderer/features/agent/composer/` 与 `src/renderer/components/assistant-ui/` |
| `@assistant-ui/react-lexical` | 富文本 directive chip 输入（`LexicalComposerInput`） | 文本态 directive 体验；pin 精确版本 |
| `@tailwindcss/postcss`（+ `tailwindcss` ^4，去 `autoprefixer`，`tailwindcss-animate`→`tw-animate-css`） | 升级 Tailwind v3.4 → v4 | 全渲染层；见实现计划 Task 1 |

> **通信依赖**：`MessagePort` 预加载桥 + `useLocalRuntime`/`ChatModelAdapter` 均来自 `@assistant-ui/react` + Electron 内置，**无额外通信库**。
>
> 不引入：`ai`/`@ai-sdk/*`（Buzz 用 `pi-agent-core`/`pi-ai` 作后端，不装 ai-sdk；指南示例的 `streamText` 由 `MultiHostAgentRuntime.prompt` 替代）、`@assistant-ui/react-ai-sdk`（不用 HTTP `AssistantChatTransport`）、`@base-ui/react`（与现有 Radix 重复）、`@copilotkit/*`（框架绑定过重）、`@assistant-ui/react-markdown`（本期不做富文本 markdown）、OpenUI（不适用）。

---

## 10. 风险与开放问题

| 风险 | 说明 | 缓解 |
|---|---|---|
| R1 `unstable_` API 变更 | mentions/trigger-popover 为不稳定 API | pin 版本 + 薄适配器封装；备选方案 B（仅用 Thread/ToolFallback，`@` 自建） |
| R2 无头通道的 host key/认证失败面 | 主机从未连接过时交互与现有对话框耦合 | 复用 `HostKeyDialog`/`#pending` 机制；失败在卡片内引导 |
| R3 多主机并发与资源 | 并发连接可能耗尽资源 | 并发上限 4（N6）+ 任务级 close 清理 |
| R4 与右侧 AI 面板能力重复 | 两套面板并存可能让用户困惑 | 本期明确职责边界：右侧=单终端会话助手；左侧=多主机任务 Agent；后续再评估统一 |
| R5 跨主机信息拼接的可靠性 | Agent 在主机间传递大段输出可能超出上下文 | 依赖现有上下文压缩（`createActiveContextCompactor`），工具返回做摘要（如 `truncated`） |

---

## 11. 附：术语表

| 术语 | 说明 |
|---|---|
| Headless（无头）SSH 通道 | 仅建立 ssh2 `Client`、按需 `exec` 非交互命令、不开启交互式 shell/PTY 的连接 |
| directive | `@` 选择后插入的机器可读文本，如 `:host[db-primary]{name=<hostId>}` |
| 风险门控 | `AiShellRiskRuntime`：拦截交互命令、标记危险命令并要求确认 |
| 操作进度区 | 右侧按主机分组的任务进度展示面 |
