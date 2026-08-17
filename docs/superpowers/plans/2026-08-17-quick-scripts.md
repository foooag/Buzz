# Buzz AI 快捷指令(Quick Scripts)实施计划

> **面向代理执行者:** 必须使用子技能 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 按任务逐条实施本计划。步骤使用复选框(`- [ ]`)语法进行跟踪。

**目标:** 按 PRD v1.2 实现「AI 快捷指令」功能——用户在右侧 AI 助手面板输入 `/生成快捷指令`(或 `/quick-script`),主进程从当前会话提取 `ssh_exec` 命令,生成 1–5 条快捷脚本(LLM 生成 + 规则模式降级),按主机加密存储;面板顶部展示建议卡片,点击即可(经风险门控)写入终端执行。

**架构:** 新建主进程域 `src/main/domains/quickscripts/`(纯函数提取器 → 加密 SQLite 仓库 → 复用 `AiModelRuntime.complete` 的生成服务),新增 `quickscript_*` IPC 命令,渲染层位于 `src/renderer/features/ai/`(`useQuickScripts` hook + `QuickScriptsSection`/`QuickScriptCard`/对话框/toast 组件)并集成进 `AiAssistantPanel`。纯风险分类器 `classify()` 移至 `src/shared/shell-risk.ts`,使渲染层执行卡片时与主进程使用同一套风险规则。执行写入终端复用现有 `runtime.paste(\`${command}\r\`)` 路径(`runCommandSnippet`)。Slash 命令的前端 UX 基于 assistant-ui 的 trigger-popover 机制构建——`unstable_useSlashCommandAdapter` + 应用现有的 `ComposerTriggerPopover`——把面板 composer 从普通 `<textarea>` 转换为 `ComposerPrimitive` + `LexicalComposerInput`(即多主机 Agent 页面已在用的同一套技术栈,详见下文「前端实现:assistant-ui Slash Commands」)。

**技术栈:** Electron 主进程(`node:sqlite` 的 `DatabaseSync`、`AesGcmFieldCipher`)、React 19 + TypeScript、Tailwind v4 token(应用 `globals.css` 的调色板与原型完全一致:`carbon/graphite/smoke/fog/mist/acid-lime/coral-red/pulse-green`、`rounded-pill`、`pop-in`)、lucide-react、Vitest + Testing Library、Playwright(electron 冒烟)。**不新增 npm 依赖。**

**规格:** `docs/prd/2026-08-17-buzz-quick-scripts.md`(v1.2,位于 HEAD `55e2c80`)

**原型(权威 UI 交互参照):** `designs/terminal-ai-mode/quickscripts.jsx` + `designs/terminal-ai-mode/ai-session.jsx`、`ai.jsx`(Composer slash 菜单)、`chrome.jsx`(QuickEchoBlock)中快捷指令相关部分,取提交 `55e2c80`。原型与应用共享同一套设计系统,因此原型 JSX 可近乎原样移植(原型的 `Icon` 换成 lucide-react 图标;`spin` 换成 `animate-[terminus-spin_0.9s_linear_infinite]`)。

## 全局约束

- 两空格缩进、双引号、分号、严格 TypeScript(见 `AGENTS.md`)。
- React 组件/类型 PascalCase;hook/函数 camelCase;feature 文件按角色分组。
- 不新增 npm 依赖(PRD N5)。复用 `pi-agent-core` / `model-runtime` / shadcn 原语 / lucide-react。
- 线路(wire)字段 camelCase;IPC 结果有类型;密钥永不跨 IPC(PRD N1)。`script` 以明文跨 IPC——它是用户会话操作数据,不是凭据(PRD §4.2)。
- `script` 落库时经 `AesGcmFieldCipher` AES-GCM 加密;密钥管理复用共享的 `master-key.bin` vault(PRD N2)。quickscripts 服务必须在 `openAiService` **之后**打开,确保密钥文件已存在(见任务 4)。
- LLM 输入仅为聚合命令统计 + 会话标题——**绝不发送完整对话原文**(PRD N3)。生成的 `script` 每一行必须逐字来自会话命令(prompt 硬约束 + 出参校验;PRD R1)。
- 疑似密钥模式的命令直接丢弃并计数,永不入库、永不出网(PRD N8)。
- 生成超时 60s → 安全失败 → 回退规则模式(PRD N4)。规则模式完全离线(PRD F4)。
- 卡片是**临时 UI 层**:永不产生 `AiAgentMessage`,永不进入会话历史与 `ConversationHistoryPanel`(PRD F6)。已忽略(dismissed)的脚本永不回流。
- 多行脚本通过 `runtime.paste()` + `\r` 以一个 bracketed-paste 块执行——**绝不逐行写入**(PRD F7/R2)。远端 shell 开启该模式时,xterm 的 `paste()` 自动包 DECSET 2000 bracketed-paste 标记;结尾 `\r` 负责提交整个块。
- 新 IPC 命令注册于 `src/shared/ipc/command-names.ts` + 域处理器 + 契约测试(AGENTS.md;`tests/main/command-names.test.ts` 会强制校验)。
- 每个任务收尾必须全绿:`pnpm typecheck` 与 `pnpm test` 必须通过。**运行 `pnpm test:electron` 或 `pnpm dev` 之前必须 unset `ELECTRON_RUN_AS_NODE`**(`env -u ELECTRON_RUN_AS_NODE pnpm test:electron`),否则应用启动即崩溃。
- 浏览器 e2e 的 `ai-providers`/`sftp` 存在已知基线失败(memory `browser-e2e-preexisting-failures`)——不是回归。
- Conventional Commits scope:新域用 `quickscripts`,面板改动用 `ai`(`feat(quickscripts): ...`)。
- UI 文案用**英文**(与现有 AI 面板一致,该面板尚未接入 i18n);slash 触发词 `/生成快捷指令` 与 `/quick-script` 是与语言环境无关的功能标识(PRD F1/R5)。中文界面翻译随未来面板整体 i18n 一起做。
- Slash 命令前端按 assistant-ui 官方 [slash-commands 指南](https://www.assistant-ui.com/docs/guides/slash-commands)实现:`unstable_useSlashCommandAdapter({ commands, removeOnExecute: true })` 展开进应用现有的本地 `ComposerTriggerPopover`(`char="/"`,action 行为)。**不手写 slash 菜单键盘处理。** 不新增 npm 依赖——`@assistant-ui/react@0.15.13` 导出 `unstable_useSlashCommandAdapter` / `useLocalRuntime` / `ComposerPrimitive`,`@assistant-ui/react-lexical@0.2.9` 提供 `LexicalComposerInput`(均已对照已安装的 `node_modules` 验证)。

## 原型交互契约(UI 保真要求)

用户要求:**快捷指令的 UI 交互与原型一致**。以下 17 条均从 `55e2c80` 的 `quickscripts.jsx` / `ai-session.jsx` / `ai.jsx` 逐项转译,实现**必须**逐条复现:

1. **Slash 菜单**(仅 sidebar composer):输入以 `/` 开头的文本时,textarea 上方浮出命令列表(仅展示 token 以当前 trimmed 输入开头的条目,排除精确匹配自身)。列表项 = sparkles 图标块 + mono token + 提示文字 + `⏎` kbd。`ArrowDown`/`ArrowUp` 循环切换选中项,`Tab` 或 `Enter` 补全,`Escape` 仅关闭菜单。任何输入变化重置选中。底部状态行有一个 `/ Quick scripts` 文字按钮(仅非 busy 时显示);点击后输入置为 `/`、打开菜单、聚焦输入框。**实现映射(任务 9):** 该菜单由 assistant-ui 的 trigger-popover 体系提供(`ComposerTriggerPopover char="/"`),其内置键盘导航(↑↓ 循环、Enter 选中、Esc 关闭)天然满足本条契约;`removeOnExecute: true` 在选中后剥离触发词,选择永不变成消息。见下一节。
2. **发送拦截**:trimmed 输入**精确等于** `/生成快捷指令` 或 `/quick-script` 时,清空输入并触发生成——该文本永不成为消息、永不发送给模型。不追加任何 `AiAgentMessage`。
3. **分区位置**:卡片组渲染在面板主体顶部(头部之下、消息/hero 之上),包裹在圆角带边框容器内;聊天历史面板打开时**不渲染**。无脚本且无生成反馈时不占任何空间。
4. **分区头部**:sparkles 图标(acid-lime)+ 标题 + 主机名(截断)。标题旁内联状态:working = spinner + "Recapping this session…";done = 绿色对勾 + "Generated N scripts"(N=0 时为 "Scripts are up to date");failed = 红色警告 + "Generation failed — rules mode applied"。右侧:Shuffle(换一批)按钮(仅池 > 3 且未收起时)、"{N} scripts" 计数 pill(仅收起时)、chevron 收起开关(展开时旋转 180°)。生成中自动展开分区。
5. **空态**(生成时未发现任何命令):terminal 图标 + 内联提示 "No commands in this session yet — let the AI run a few first, then type /生成快捷指令",触发词渲染为 mono 小块。
6. **卡片行**(单行):NEW 徽标(isNew)+ RULES 徽标(mode === "rules")+ 标题(截断,≤46% 宽)+ 脚本首行(mono、截断;有 riskHint 时黄色警告图标;多行时 `⏎+N` 后缀)+ 右侧元数据槽,**悬停时交叉淡出**为操作按钮(play=Run、pin=Pin/Unpin、pencil=Edit、x=Dismiss——Dismiss 悬停变红)。置顶样式:acid-lime 边框 + 底色 + 左侧内嵌条。点击卡片任意位置(或 Enter/Space——卡片是 `role="button" tabIndex={0}`)= 执行。
7. **悬停 tooltip**(pointer-events-none、卡片下方、仅 group-hover 时显示):标题、描述、riskHint(黄色 + 警告图标)、mono 块内完整脚本(`whitespace-pre-wrap break-all`)、底部统计行("Used N times in session · P% success" + 执行过时 " · run N times" + 规则模式时 " · rules mode")。
8. **风险门控**:执行前调用 `classify(script)`;`allow` → 写入终端;其余 → 确认对话框(脚本预览 pre + 风险提示文字 + Execute/Cancel,`⌘⏎` 执行、`Esc` 取消、点击遮罩取消)。
9. **终端写入**:单行 = paste + `\r`;多行 = 一个 `paste(script + "\r")` 块(绝不逐行)。执行后卡片 executedCount +1 且 isNew 清除。
10. **编辑对话框**:头部(lime 铅笔块 + "Edit quick script" + `On {user}@{host} · Used N times · P% success`)、Name 输入框(autofocus)、Script 文本域(6 行、mono)、辅助说明 "Multi-line scripts are written as one bracketed paste, never split by the shell."、底部:Delete(红色,左侧)/ `⌘⏎ Save` 提示 / Cancel / Save(仅 dirty 且两者非空时可用;`⌘⏎` 保存)。Escape 关闭。
11. **撤销 toast**(忽略 + 删除):面板底部居中、pop-in、图标 + "Dismissed/Deleted 「title」" + Undo 按钮 + 5.2s 倒计时条;5200ms 后自动隐藏;Undo 恢复先前状态(忽略)或记录(删除)。
12. **done 阶段自动清除**:4800ms 后 "Generated N" 闪现重置为 idle(除非阶段已变化)。
13. **池逻辑**:排除 dismissed;排序 pinned → confidence 降序 → executedCount 降序;可见窗口 = 3 张卡片在池上轮换(`(offset + i) % len`);Shuffle 使 offset 前进 3(对长度取模);每主机 suggested+pinned 池上限 8(合并时强制)。
14. **合并语义**(生成):已有记录保留状态;所有旧记录 isNew → 0;来件按归一化脚本文本(逐行 trim 后 join)在非 dismissed 中匹配 → 更新统计(usage/success/confidence,incoming description 为 null 时保留旧值);未匹配 → 以 isNew=1 插入;createdCount = 插入数。
15. **收起记忆**:按主机持久化(`"1"/"0"`)于 localStorage;收起时仅显示头部 + 计数 pill。
16. **刷新时机**:面板挂载、sshSessionId 变化、生成响应、`quickscript:generated` 广播(任务 12)。
17. **主机解析失败**:`sshSessionId` 无法解析到主机时,整个分区不渲染。

## 前端实现:assistant-ui Slash Commands

Slash 命令部分的前端使用 **assistant-ui 官方 slash-commands 机制**([指南](https://www.assistant-ui.com/docs/guides/slash-commands))实现,而非手写菜单。仓库的多主机 Agent 功能已在运行完全相同的技术栈,该模式在代码库内有现成先例:

### 机制(据官方指南)

- `unstable_useSlashCommandAdapter({ commands, removeOnExecute: true })` 把命令数据(`{ id, label, description, icon, execute }`)与选中动作捆绑在一起。选中命令时**立即触发 `execute`** 回调(action 行为——不同于只插入 directive 的 mention),且 `removeOnExecute: true` 会把 `/command` 文本从 composer 中剥离——触发词永不进入消息流(正是 PRD F1)。
- 浮层本体是 `ComposerPrimitive.Unstable_TriggerPopover char="/"`——应用已有样式化本地封装 `ComposerTriggerPopover`(`src/renderer/components/assistant-ui/composer-trigger-popover.tsx`),它除 Agent 页在用的 mention directive 行为外,**已支持 action 行为**(`{ action: { onExecute, removeOnExecute } }`)。hook 返回值可直接展开:`<ComposerTriggerPopover char="/" variant="flat" {...slash} itemsLabel="Slash commands" />`。
- 键盘导航(↑↓ 循环、Enter/Tab 选中、Esc 关闭)与前缀过滤内建于 trigger-popover 体系——无需手写 `slashIndex`/`slashDismissed` 状态,无需 textarea `onKeyDown` 拦截。

### 代码库先例(照抄的对象)

- `AgentPage.tsx` 用 `<AssistantRuntimeProvider runtime={runtime}>` 包裹页面,`runtime = useAgentRuntime(...)` 是 **`useLocalRuntime` + `ChatModelAdapter` 桥**:assistant-ui 负责 composer/输入 UX,实际消息渲染留在面板本地 state,由 `sideDispatch` 镜像驱动。我们对 AI 面板套用完全相同的形态,范围仅限 composer。
- `MentionComposer.tsx`(`src/renderer/features/agent/composer/`)是 `LexicalComposerInput` 用法、`labelEditor` aria-label 技巧(`.aui-lexical-input` 元素获得可访问名称)以及 composer className 的参照。
- `AgentPage.test.tsx` 证明 Lexical composer 在 jsdom 下可用 `userEvent.type(getByRole("textbox", { name: "…" }))` 驱动;浮层渲染为 `role="listbox"`(aria-label = `itemsLabel`),条目为 `role="option"`——这些就是测试选择器。

### AI 面板的改动(任务 9)

1. **Composer 转换**——面板的普通 `<textarea>` 块(`AiAssistantPanel.tsx` 约 447-496 行)替换为新组件 `AiComposer`:`ComposerPrimitive.Unstable_TriggerPopoverRoot` → `ComposerTriggerPopover char="/"`(slash)→ `ComposerPrimitive.Root` → `LexicalComposerInput` + 底部行。可访问名称保持 `"Message AI assistant"`(labelEditor 技巧),现有测试选择器继续有效。
2. **薄桥 runtime**——`AiComposer` 创建一个 `useLocalRuntime`,其 `ChatModelAdapter.run()` 提取提交的文本并经 ref 委托给面板现有的 `send(text)`,随后 yield 一个终止块(空文本、complete)。runtime 的内部线程**从不渲染**——面板的消息列表、流式合并、错误处理、确认流程全部不动。由于 adapter 生成器立即结束,面板 busy 期间 composer 仍可提交,因此**运行中按 Enter 依然到达 `send()` → `agentClient.steer`**(现有 steer 交互天然保留)。
3. **Slash 命令**——两条 adapter 条目(`/生成快捷指令` 主条目 + `/quick-script` 别名,均 `execute: () => onGenerate()`,`removeOnExecute: true`),由 `QUICK_SLASH_COMMANDS`(任务 8)派生。选中即直接触发生成——不发送、不产生消息。
4. **保留手打精确匹配拦截**——用户手打完整 `/生成快捷指令`(精确匹配时浮层自动消失)后按 Enter,走 adapter → `send(text)` → `QUICK_SLASH_TRIGGERS` 精确匹配检查 → 生成。两条路径均有测试覆盖。
5. **底部 `/ Quick scripts` 按钮**——位于 `AiComposer` 底部行(原型位置)。已安装的 assistant-ui 版本**没有公开的 composer `setValue`**(已验证:`@assistant-ui/core@0.3.12` 类型中无 `setValue`),因此该按钮聚焦 Lexical 输入并经 `document.execCommand("insertText", false, "/")` 插入 `/`——在 Electron/Chromium 中可靠,像真实按键一样驱动 Lexical 并打开浮层。优雅降级:`execCommand` 不可用时仅聚焦。
6. **测试迁移成本(明示)**——面板现有测试用 `fireEvent.change` 驱动 textarea、用 `expect(input).toBeEnabled()` 等待。Lexical contenteditable 两者都不适用:把所有 `fireEvent.change(input, { target: { value } })` 改为 `await userEvent.type(input, value)`(或 `userEvent.clear` + `type`),把等待可用改为等待 Send 按钮:`waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled())`。Agent 测试已示范这两种模式。

## 与 PRD v1.2 的偏差(明确列出,附理由)

1. **`mode` 列新增**到 `quick_scripts` + wire 类型(`"llm" | "rules"`)——PRD §5.6 要求 RULES 徽标,但 §4.2 漏了该字段。
2. **`hostName` 从 wire 类型移除**——渲染层经 `listConnectionHistory()` 解析 `{hostId, host, username}`(重连 UI 已在用的模式);主进程无需 join inventory。
3. **`quickscript_export_snippet` IPC 取消**——`CommandSnippet` 池是渲染层 localStorage(`commandSnippets.ts`);PRD 自己也说"写入全局 CommandSnippet 由渲染层执行"。在任务 11 中渲染层直接实现。
4. **`quickscript:generated` 事件**以专用广播通道 `terminus:quickscript-generated` 实现(`webContents.send` + preload 订阅,与 updater 状态同模式),而非流式事件——生成是普通 invoke,没有可复用的 streamId(任务 12,P1)。
5. **`quickscript_generate` 入参增加可选 `useLlm?: boolean`**——支撑设置开关「Use AI generation」(PRD N3),无需新增主进程设置存储(任务 10)。
6. **生成结果增加 `droppedCount`**——N8 要求密钥模式丢弃需计数;暴露计数使其可测试。
7. **Patch 增加 `executedCount`**——持久化卡片执行计数(PRD `executed_count` 列没有其他写入路径)。
8. **UI 文案英文**——见全局约束。要求的是交互保真;文案语言跟随面板现有约定。
9. **设置中按主机清除暂缓**(PRD F10)——实现了「Clear all quick script data」;按主机清除 = 删除主机(级联)或忽略卡片。之后可低成本补上。
10. **PRD F1「无活动 AI 会话时不响应并轻提示」**:无活动 agent 时,发送仍不会让 slash 文本进入消息流,并显示面板内联错误提示("Start a conversation first…")。行为保留,载体是现有 alert。
11. **Slash 菜单以 assistant-ui 原语实现**(用户指定),替代原型的手绘浮层标记:交互契约(↑↓/Enter/Esc、过滤、执行并剥离)经由 `ComposerTriggerPopover` 内置导航完整保留;视觉外观跟随应用现有 flat 浮层变体而非原型手绘菜单。composer 从 `<textarea>` 转换为 `ComposerPrimitive` + `LexicalComposerInput`;发送/中止/steer 语义不变,因为 runtime adapter 只是通往面板现有 `send()` 的薄桥。

## 文件结构

**共享(新增):**
- `src/shared/ipc/quickscripts/types.ts` —— wire 类型(`QuickScript`、`QuickScriptPatch`、`QuickScriptGenerationResult`、`QuickScriptGeneratedEvent`)。
- `src/shared/shell-risk.ts` —— 迁移后的纯函数 `classify()` + `RiskVerdict`(任务 6)。

**主进程(新域 `src/main/domains/quickscripts/`):**
- `extractor.ts` —— 纯函数:`extractExecutedCommands`、`normalizeForMatch`、`skeletonKey`、`aggregateCommands`、`containsSecret`。
- `generator.ts` —— LLM prompt 构建器、带逐行校验的 JSON 解析器、规则模式构建器。
- `repository.ts` —— 基于 `quickscripts(.e2e).sqlite3` 的 `QuickScriptRepository`(加密 script、合并、级联辅助)。
- `service.ts` —— `createQuickScriptsService`(纯 DI 构造)+ `openQuickScriptsService`(数据库 + 共享主密钥)。
- `commands.ts` —— `createQuickScriptsCommandHandlers` + zod schema。

**主进程(修改):**
- `src/main/domains/ai/agent-runtime.ts` —— 新增 `sessionContext(sshSessionId)` 访问器。
- `src/main/domains/ssh/runtime.ts` —— 新增 `hostId(sessionId)` 访问器。
- `src/main/domains/ai/risk.ts` —— `classify`/`RiskVerdict` 迁至 shared;原位置重导出以兼容。
- `src/main/domains/inventory/commands.ts` —— 可选 `onHostDeleted` 钩子(级联)。
- `src/main/index.ts` —— 打开服务、装配处理器 + 级联 + 广播、关闭时清理。
- `src/shared/ipc/command-names.ts` —— 5 个新命令。

**渲染层(新增,`src/renderer/features/ai/`):**
- `quickScriptApi.ts` —— 类型化 IPC 客户端(真实)。
- `deterministicQuickScriptApi.ts` —— 确定性假实现。
- `useQuickScripts.ts` —— 状态 hook + `QUICK_SLASH_TRIGGERS` / `QUICK_SLASH_COMMANDS`。
- `QuickScriptCard.tsx`、`QuickScriptsSection.tsx`、`AiComposer.tsx`(assistant-ui composer + slash adapter)、`QuickScriptEditDialog.tsx`、`QuickScriptConfirmDialog.tsx`、`QuickScriptToast.tsx`。
- `quickScriptPreferences.ts`(任务 10)—— localStorage 偏好 `{ useAiGeneration: boolean }`。

**渲染层(修改):**
- `AiAssistantPanel.tsx` —— 分区挂载、composer 换为 `AiComposer`、执行、对话框、toast。
- `src/renderer/features/shell/TerminalWorkspace.tsx` —— 传入 `onRunCommand={runCommandSnippet}`。
- `src/renderer/styles/globals.css` —— toast 倒计时 keyframes。
- `src/renderer/features/settings/PreferencesWindow.tsx`(任务 10)+ preload/electron.d.ts(任务 12)。

**测试:** `tests/main/domains/quickscripts/{extractor,repository,service,commands}.test.ts`、`tests/renderer/features/ai/{quickScriptApi,QuickScriptsSection,useQuickScripts,AiAssistantPanel}.test.ts(x)`、`e2e-electron/smoke.spec.ts`(bridge 断言)、`docs/features/quick-scripts.md`。

---

## 任务 1:共享 wire 类型 + 确定性渲染层 API

**文件:**
- 新建: `src/shared/ipc/quickscripts/types.ts`
- 新建: `src/renderer/features/ai/deterministicQuickScriptApi.ts`
- 测试: `tests/renderer/features/ai/quickScriptApi.test.ts`

**接口:**
- 产出: `QuickScript`、`QuickScriptStatus`、`QuickScriptMode`、`QuickScriptPatch`、`QuickScriptGenerationResult`、`QuickScriptGeneratedEvent`(主进程以相对路径 `../../../shared/ipc/quickscripts/types.js` 导入,渲染层以 `@shared/ipc/quickscripts/types` 导入);`QuickScriptApi` 类型 + `createDeterministicQuickScriptApi()`(供任务 5、8、9 消费)。

- [ ] **步骤 1:编写失败测试**

新建 `tests/renderer/features/ai/quickScriptApi.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { QuickScriptApi } from "@/features/ai/quickScriptApi";
import { createDeterministicQuickScriptApi } from "@/features/ai/deterministicQuickScriptApi";

function script(id: string, overrides: Partial<QuickScriptApi extends never ? never : Awaited<ReturnType<QuickScriptApi["list"]>>[number]> = {}) {
  return {
    id,
    hostId: "host-1",
    sessionId: "session-1",
    title: "Check nginx errors",
    script: "tail -n 30 /var/log/nginx/error.log",
    description: "Read the latest nginx errors.",
    sourceUsageCount: 5,
    sourceSuccessCount: 5,
    executedCount: 0,
    confidence: 0.94,
    riskHint: null,
    status: "suggested" as const,
    isNew: true,
    mode: "llm" as const,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("createDeterministicQuickScriptApi", () => {
  it("lists seeded scripts sorted pinned-first then confidence", async () => {
    const api = createDeterministicQuickScriptApi([
      script("b", { confidence: 0.5 }),
      script("a", { status: "pinned", confidence: 0.1 }),
    ]);
    const listed = await api.list("host-1");
    expect(listed.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("generate seeds two llm scripts and reports createdCount", async () => {
    const api = createDeterministicQuickScriptApi([]);
    const result = await api.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("llm");
    expect(result.createdCount).toBe(2);
    expect(result.hostId).toBe("host-deterministic");
    expect((await api.list("host-deterministic")).length).toBe(2);
  });

  it("update patches fields and delete removes the row", async () => {
    const api = createDeterministicQuickScriptApi([script("a")]);
    const updated = await api.update("a", { status: "pinned", executedCount: 3 });
    expect(updated.status).toBe("pinned");
    expect(updated.executedCount).toBe(3);
    expect(updated.isNew).toBe(false);
    await api.delete("a");
    expect(await api.list("host-1")).toEqual([]);
  });

  it("clearData wipes everything", async () => {
    const api = createDeterministicQuickScriptApi([script("a")]);
    await api.clearData();
    expect(await api.list("host-1")).toEqual([]);
  });
});
```

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- quickScriptApi.test`
预期: FAIL —— 无法解析 `@/features/ai/deterministicQuickScriptApi`。

- [ ] **步骤 3:编写共享类型**

新建 `src/shared/ipc/quickscripts/types.ts`:

```ts
export type QuickScriptStatus = "suggested" | "pinned" | "dismissed";

export type QuickScriptMode = "llm" | "rules";

export type QuickScript = {
  id: string;
  hostId: string;
  sessionId: string;
  title: string;
  script: string;
  description: string | null;
  sourceUsageCount: number;
  sourceSuccessCount: number;
  executedCount: number;
  confidence: number;
  riskHint: string | null;
  status: QuickScriptStatus;
  isNew: boolean;
  mode: QuickScriptMode;
  createdAt: string;
  updatedAt: string;
};

export type QuickScriptPatch = {
  title?: string;
  script?: string;
  status?: QuickScriptStatus;
  executedCount?: number;
};

export type QuickScriptGenerationResult = {
  hostId: string;
  createdCount: number;
  mode: QuickScriptMode | "empty";
  durationMs: number;
  droppedCount: number;
};

export type QuickScriptGeneratedEvent = {
  hostId: string;
  sshSessionId: string;
  createdCount: number;
  mode: QuickScriptMode | "empty";
};
```

- [ ] **步骤 4:编写确定性 API**

新建 `src/renderer/features/ai/deterministicQuickScriptApi.ts`。`QuickScriptApi` 接口暂时放在这里(任务 5 的 `quickScriptApi.ts` 会重导出,使真实客户端与确定性客户端共享同一类型):

```ts
import type {
  QuickScript,
  QuickScriptGenerationResult,
  QuickScriptPatch,
} from "@shared/ipc/quickscripts/types";

export type QuickScriptApi = {
  generate(input: { sshSessionId: string; useLlm?: boolean }): Promise<QuickScriptGenerationResult>;
  list(hostId: string, includeDismissed?: boolean): Promise<QuickScript[]>;
  update(id: string, patch: QuickScriptPatch): Promise<QuickScript>;
  delete(id: string): Promise<void>;
  clearData(hostId?: string): Promise<void>;
};

export function createDeterministicQuickScriptApi(initial: QuickScript[] = []): QuickScriptApi {
  let seq = 0;
  const stamp = () => new Date(1_700_000_000_000 + seq * 1_000).toISOString();
  const rows = initial.map((row) => ({ ...row }));
  const sortRows = () =>
    [...rows]
      .filter((row) => row.status !== "dismissed")
      .sort(
        (a, b) =>
          (a.status === "pinned" ? 0 : 1) - (b.status === "pinned" ? 0 : 1) ||
          b.confidence - a.confidence ||
          b.executedCount - a.executedCount,
      );
  return {
    async generate({ sshSessionId }) {
      const base = {
        hostId: "host-deterministic",
        sessionId: sshSessionId,
        description: "Deterministic demo script.",
        sourceUsageCount: 3,
        sourceSuccessCount: 3,
        executedCount: 0,
        riskHint: null,
        status: "suggested" as const,
        isNew: true,
        mode: "llm" as const,
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      rows.push({ ...base, id: `qs-${++seq}`, title: "List services", script: "systemctl list-units --type=service", confidence: 0.9 });
      rows.push({ ...base, id: `qs-${++seq}`, title: "Disk usage", script: "df -h", confidence: 0.85 });
      return { hostId: "host-deterministic", createdCount: 2, mode: "llm", durationMs: 12, droppedCount: 0 };
    },
    async list(hostId) {
      return sortRows().filter((row) => row.hostId === hostId);
    },
    async update(id, patch) {
      const row = rows.find((entry) => entry.id === id);
      if (!row) throw new Error(`Quick script ${id} not found`);
      Object.assign(row, patch, { updatedAt: stamp() });
      if (patch.executedCount !== undefined || patch.status !== undefined) row.isNew = false;
      return { ...row };
    },
    async delete(id) {
      const index = rows.findIndex((entry) => entry.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
    async clearData() {
      rows.length = 0;
    },
  };
}
```

说明:渲染层运行时使用 `new Date(...)` 没有问题;「禁止 Date.now」规则只适用于 Workflow 脚本。

- [ ] **步骤 5:运行测试确认通过**

运行: `pnpm test -- quickScriptApi.test`
预期: PASS(4 个测试)。

- [ ] **步骤 6:类型检查并提交**

运行: `pnpm typecheck` —— 预期: PASS。

```bash
git add src/shared/ipc/quickscripts/types.ts src/renderer/features/ai/deterministicQuickScriptApi.ts tests/renderer/features/ai/quickScriptApi.test.ts
git commit -m "feat(quickscripts): add shared wire types and deterministic renderer API"
```

---

## 任务 2:主进程提取器(纯函数)

**文件:**
- 新建: `src/main/domains/quickscripts/extractor.ts`
- 测试: `tests/main/domains/quickscripts/extractor.test.ts`

**接口:**
- 消费: 无(纯函数)。
- 产出: `ExecutedCommand { command, cwd, ok }`;`CommandAggregate { command, usageCount, successCount, cwds }`;`extractExecutedCommands(messages: readonly unknown[]): ExecutedCommand[]`;`normalizeForMatch(command: string): string`;`skeletonKey(command: string): string`;`aggregateCommands(executed): { items: CommandAggregate[]; droppedCount: number }`;`containsSecret(command: string): boolean`。供任务 4(服务)消费;任务 3(仓库合并)使用 `normalizeForMatch`。

- [ ] **步骤 1:编写失败测试**

新建 `tests/main/domains/quickscripts/extractor.test.ts`:

```ts
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
```

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- extractor.test`
预期: FAIL —— 找不到模块。

- [ ] **步骤 3:编写实现**

新建 `src/main/domains/quickscripts/extractor.ts`:

```ts
// Pure extraction + aggregation of ssh_exec commands from AI session messages
// (PRD F2). No I/O — fully unit-testable. Message input is structurally typed
// so both live pi-agent-core messages and deserialized history rows work.

export type ExecutedCommand = {
  command: string;
  cwd: string | null;
  ok: boolean;
};

export type CommandAggregate = {
  command: string;
  usageCount: number;
  successCount: number;
  cwds: string[];
};

export function extractExecutedCommands(messages: readonly unknown[]): ExecutedCommand[] {
  const resultOk = new Map<string, boolean>();
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as {
      role?: unknown;
      toolCallId?: unknown;
      isError?: unknown;
      content?: unknown;
    };
    if (record.role !== "toolResult" || typeof record.toolCallId !== "string") continue;
    let ok = record.isError !== true;
    if (ok && Array.isArray(record.content)) {
      const textPart = record.content.find(
        (part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text",
      ) as { text?: unknown } | undefined;
      if (typeof textPart?.text === "string") {
        try {
          const parsed = JSON.parse(textPart.text) as { exitCode?: unknown };
          if (typeof parsed.exitCode === "number" && parsed.exitCode !== 0) ok = false;
        } catch {
          /* non-JSON tool output keeps isError verdict */
        }
      }
    }
    resultOk.set(record.toolCallId, ok);
  }

  const executed: ExecutedCommand[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as { role?: unknown; content?: unknown };
    if (record.role !== "assistant" || !Array.isArray(record.content)) continue;
    for (const part of record.content) {
      if (!part || typeof part !== "object") continue;
      const candidate = part as { type?: unknown; id?: unknown; name?: unknown; arguments?: unknown };
      if (candidate.type !== "toolCall" || candidate.name !== "ssh_exec") continue;
      const args = candidate.arguments as { command?: unknown; cwd?: unknown } | null;
      if (!args || typeof args.command !== "string" || args.command.trim().length === 0) continue;
      executed.push({
        command: args.command,
        cwd: typeof args.cwd === "string" && args.cwd.trim() ? args.cwd : null,
        ok: typeof candidate.id === "string" ? resultOk.get(candidate.id) === true : false,
      });
    }
  }
  return executed;
}

function collapseUnquotedWhitespace(line: string): string {
  let out = "";
  let pending = false;
  let quote: '"' | "'" | null = null;
  for (const ch of line) {
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      if (pending && out.length > 0) out += " ";
      pending = false;
      out += ch;
      continue;
    }
    if (ch === " " || ch === "\t") {
      pending = true;
      continue;
    }
    if (pending && out.length > 0) out += " ";
    pending = false;
    out += ch;
  }
  return out;
}

/** Merge runs of spaces/tabs outside quotes; preserve newlines; trim edges (PRD F2). */
export function normalizeForMatch(command: string): string {
  const lines = command
    .split("\n")
    .map((line) => collapseUnquotedWhitespace(line).trim());
  while (lines.length > 0 && lines[0].length === 0) lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
  return lines.join("\n");
}

/** Split a command into chain segments on && || | ; and newlines, quote-aware. */
function splitChainSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    const pair = command.slice(i, i + 2);
    if (pair === "&&" || pair === "||") {
      segments.push(current);
      current = "";
      i += 1;
      continue;
    }
    if (ch === "|" || ch === ";" || ch === "\n") {
      segments.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

/** Command-name sequence of chain segments, e.g. "cd>docker" (PRD F2 skeleton). */
export function skeletonKey(command: string): string {
  const names = splitChainSegments(command).map((segment) => {
    const tokens = segment.split(/\s+/).filter((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
    return tokens[0] ?? "";
  });
  return names.filter(Boolean).join(">");
}

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /[A-Za-z0-9+/_-]{40,}/,
];

export function containsSecret(command: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(command));
}

type Bucket = {
  command: string;
  repUsage: number;
  usage: number;
  success: number;
  cwds: Set<string>;
};

export function aggregateCommands(
  executed: readonly ExecutedCommand[],
): { items: CommandAggregate[]; droppedCount: number } {
  const byText = new Map<string, Bucket>();
  let droppedCount = 0;
  for (const item of executed) {
    const key = normalizeForMatch(item.command);
    if (!key) continue;
    if (containsSecret(key)) {
      droppedCount += 1;
      continue;
    }
    const bucket = byText.get(key) ?? { command: key, repUsage: 0, usage: 0, success: 0, cwds: new Set<string>() };
    bucket.usage += 1;
    bucket.repUsage = bucket.usage;
    if (item.ok) bucket.success += 1;
    if (item.cwd) bucket.cwds.add(item.cwd);
    byText.set(key, bucket);
  }

  // Second pass: merge chain micro-variants under the same multi-segment
  // skeleton; the highest-frequency verbatim text becomes the representative.
  const merged = new Map<string, Bucket>();
  for (const bucket of byText.values()) {
    const skeleton = skeletonKey(bucket.command);
    const key = skeleton.includes(">") ? `chain:${skeleton}` : `text:${bucket.command}`;
    const target = merged.get(key);
    if (!target) {
      merged.set(key, { ...bucket, cwds: new Set(bucket.cwds) });
      continue;
    }
    target.usage += bucket.usage;
    target.success += bucket.success;
    for (const cwd of bucket.cwds) target.cwds.add(cwd);
    if (bucket.usage > target.repUsage) {
      target.command = bucket.command;
      target.repUsage = bucket.usage;
    }
  }

  const items = [...merged.values()]
    .map((bucket) => ({
      command: bucket.command,
      usageCount: bucket.usage,
      successCount: bucket.success,
      cwds: [...bucket.cwds],
    }))
    .sort(
      (a, b) =>
        b.usageCount - a.usageCount ||
        b.successCount / Math.max(1, b.usageCount) - a.successCount / Math.max(1, a.usageCount),
    );
  return { items, droppedCount };
}
```

- [ ] **步骤 4:运行测试确认通过**

运行: `pnpm test -- extractor.test`
预期: PASS(全部提取器测试)。

- [ ] **步骤 5:类型检查并提交**

运行: `pnpm typecheck` —— 预期: PASS。

```bash
git add src/main/domains/quickscripts/extractor.ts tests/main/domains/quickscripts/extractor.test.ts
git commit -m "feat(quickscripts): add ssh_exec command extractor with skeleton aggregation"
```

---

## 任务 3:`quick_scripts` 加密仓库

**文件:**
- 新建: `src/main/domains/quickscripts/repository.ts`
- 测试: `tests/main/domains/quickscripts/repository.test.ts`

**接口:**
- 消费: `AesGcmFieldCipher`(来自 `../inventory/field-cipher.js`);任务 2 的 `normalizeForMatch`;任务 1 的 wire 类型。
- 产出: `GeneratedScript { title, script, description, riskHint, confidence }`;`class QuickScriptRepository`,方法 `list(hostId, includeDismissed?)`、`mergeGenerated(hostId, sessionId, items, mode): number`、`update(id, patch)`、`delete(id)`、`deleteForHost(hostId)`、`clearAll()`。供任务 4–5 消费。

- [ ] **步骤 1:编写失败测试**

新建 `tests/main/domains/quickscripts/repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AesGcmFieldCipher } from "../../../../src/main/domains/inventory/field-cipher";
import { openAiDatabase } from "../../../../src/main/domains/ai/database";
import { QuickScriptRepository } from "../../../../src/main/domains/quickscripts/repository";

function createRepository(): QuickScriptRepository {
  return new QuickScriptRepository(openAiDatabase(":memory:"), new AesGcmFieldCipher(Buffer.alloc(32, 9)));
}

const item = (title: string, script: string, confidence = 0.9) => ({
  title,
  script,
  description: null,
  riskHint: null,
  confidence,
});

describe("QuickScriptRepository", () => {
  it("stores scripts encrypted at rest and lists them sorted", () => {
    const repository = createRepository();
    repository.mergeGenerated("host-1", "session-1", [
      item("Low", "df -h", 0.5),
      item("Pinned later", "ls", 0.2),
    ], "llm");
    const listed = repository.list("host-1");
    expect(listed.map((row) => row.title)).toEqual(["Low", "Pinned later"]);
    expect(listed[0]).toMatchObject({
      hostId: "host-1",
      sessionId: "session-1",
      script: "df -h",
      status: "suggested",
      isNew: true,
      mode: "llm",
      sourceUsageCount: 0,
    });
  });

  it("ciphertext at rest never contains the script text", () => {
    const database = openAiDatabase(":memory:");
    const repository = new QuickScriptRepository(database, new AesGcmFieldCipher(Buffer.alloc(32, 9)));
    repository.mergeGenerated("host-1", "session-1", [item("Secret op", "shred /dev/sda9")], "rules");
    const rows = database.prepare("SELECT encrypted_script FROM quick_scripts").all() as { encrypted_script: Buffer }[];
    expect(rows.length).toBe(1);
    expect(rows[0].encrypted_script.toString("utf8")).not.toContain("shred");
  });

  it("merge keeps statuses, refreshes stats, marks only new rows, caps pool at 8", () => {
    const repository = createRepository();
    const first = repository.mergeGenerated("host-1", "session-1", [
      item("A", "a"),
      item("B", "b"),
    ], "llm");
    expect(first).toBe(2);
    const [a] = repository.list("host-1");
    repository.update(a.id, { status: "pinned" });

    const second = repository.mergeGenerated("host-1", "session-2", [
      { title: "A2", script: "a ", description: "updated", riskHint: null, confidence: 0.99 },
      item("C", "c"),
    ], "llm");
    expect(second).toBe(1);
    const listed = repository.list("host-1");
    expect(listed.find((row) => row.title === "A2")).toBeDefined(); // matched by normalized script "a", renamed is separate
    expect(listed.find((row) => row.script === "a")?.description).toBe("updated");
    expect(listed.every((row) => row.isNew === false || row.script === "c")).toBe(true);
    expect(listed.find((row) => row.script === "a")?.status).toBe("pinned");

    const many = Array.from({ length: 12 }, (_, i) => item(`T${i}`, `cmd-${i}`, 0.1 + i / 100));
    repository.mergeGenerated("host-2", "session-9", many, "rules");
    expect(repository.list("host-2").length).toBe(8);
  });

  it("dismissed scripts survive merges and are excluded from list by default", () => {
    const repository = createRepository();
    repository.mergeGenerated("host-1", "session-1", [item("A", "a")], "llm");
    const [row] = repository.list("host-1");
    repository.update(row.id, { status: "dismissed" });
    expect(repository.list("host-1")).toEqual([]);
    repository.mergeGenerated("host-1", "session-2", [item("A again", "a")], "llm");
    expect(repository.list("host-1")).toEqual([]);
    expect(repository.list("host-1", true).length).toBe(1);
  });

  it("update can edit title/script and recording execution clears isNew", () => {
    const repository = createRepository();
    repository.mergeGenerated("host-1", "session-1", [item("A", "a")], "llm");
    const [row] = repository.list("host-1");
    const edited = repository.update(row.id, { title: "Renamed", script: "a --verbose" });
    expect(edited.title).toBe("Renamed");
    const executed = repository.update(row.id, { executedCount: 1 });
    expect(executed.executedCount).toBe(1);
    expect(executed.isNew).toBe(false);
  });

  it("delete, deleteForHost, and clearAll remove rows", () => {
    const repository = createRepository();
    repository.mergeGenerated("host-1", "session-1", [item("A", "a")], "llm");
    repository.mergeGenerated("host-2", "session-1", [item("B", "b")], "llm");
    const [host1Row] = repository.list("host-1");
    repository.delete(host1Row.id);
    expect(repository.list("host-1")).toEqual([]);
    repository.deleteForHost("host-2");
    expect(repository.list("host-2")).toEqual([]);
    repository.mergeGenerated("host-3", "s", [item("C", "c")], "llm");
    repository.clearAll();
    expect(repository.list("host-3")).toEqual([]);
  });
});
```

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- repository.test`(位于 `tests/main/domains/quickscripts/`)
预期: FAIL —— 找不到模块。

- [ ] **步骤 3:编写仓库**

新建 `src/main/domains/quickscripts/repository.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Database as DatabaseSync } from "node:sqlite";
import type { AesGcmFieldCipher } from "../inventory/field-cipher.js";
import { normalizeForMatch } from "./extractor.js";
import type { QuickScript, QuickScriptMode, QuickScriptPatch, QuickScriptStatus } from "../../../shared/ipc/quickscripts/types.js";

export type GeneratedScript = {
  title: string;
  script: string;
  description: string | null;
  riskHint: string | null;
  confidence: number;
};

const MAX_POOL = 8;

type Row = {
  id: string;
  host_id: string;
  source_session_id: string;
  title: string;
  encrypted_script: Buffer;
  description: string | null;
  source_usage_count: number;
  source_success_count: number;
  executed_count: number;
  confidence: number;
  risk_hint: string | null;
  status: string;
  mode: string;
  is_new: number;
  created_at: string;
  updated_at: string;
};

export class QuickScriptRepository {
  readonly #database: DatabaseSync;
  readonly #cipher: AesGcmFieldCipher;

  constructor(database: DatabaseSync, cipher: AesGcmFieldCipher) {
    this.#database = database;
    this.#cipher = cipher;
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS quick_scripts (
        id TEXT PRIMARY KEY NOT NULL,
        host_id TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        encrypted_script BLOB NOT NULL,
        description TEXT,
        source_usage_count INTEGER NOT NULL DEFAULT 0,
        source_success_count INTEGER NOT NULL DEFAULT 0,
        executed_count INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        risk_hint TEXT,
        status TEXT NOT NULL DEFAULT 'suggested',
        mode TEXT NOT NULL DEFAULT 'rules',
        is_new INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_quick_scripts_host ON quick_scripts(host_id);
    `);
  }

  list(hostId: string, includeDismissed = false): QuickScript[] {
    const rows = this.#database
      .prepare(
        `SELECT * FROM quick_scripts WHERE host_id = ?
         ${includeDismissed ? "" : "AND status != 'dismissed'"}
         ORDER BY CASE status WHEN 'pinned' THEN 0 WHEN 'suggested' THEN 1 ELSE 2 END,
                  confidence DESC, executed_count DESC`,
      )
      .all(hostId) as unknown as Row[];
    return rows.map((row) => this.#toRecord(row));
  }

  /** Merge a fresh generation (prototype merge semantics; see plan §13–14). */
  mergeGenerated(hostId: string, sessionId: string, incoming: readonly GeneratedScript[], mode: QuickScriptMode): number {
    return this.#transaction(() => {
      this.#database.prepare("UPDATE quick_scripts SET is_new = 0 WHERE host_id = ?").run(hostId);
      const existing = (this.#database
        .prepare("SELECT * FROM quick_scripts WHERE host_id = ?")
        .all(hostId) as unknown as Row[]).map((row) => this.#toRecord(row));
      let created = 0;
      for (const item of incoming) {
        const key = normalizeForMatch(item.script);
        const match = existing.find(
          (row) => row.status !== "dismissed" && normalizeForMatch(row.script) === key,
        );
        if (match) {
          this.#database
            .prepare(
              `UPDATE quick_scripts SET source_usage_count = ?, source_success_count = ?, confidence = ?,
                 description = COALESCE(?, description), updated_at = ? WHERE id = ?`,
            )
            .run(
              item.sourceUsageCount ?? match.sourceUsageCount,
              item.sourceSuccessCount ?? match.sourceSuccessCount,
              item.confidence,
              item.description,
              new Date().toISOString(),
              match.id,
            );
          continue;
        }
        const now = new Date().toISOString();
        this.#insert(hostId, sessionId, item, mode, now);
        created += 1;
      }
      // Cap the visible pool: pinned always kept; suggested trimmed by
      // confidence; dismissed always kept (hidden by list()).
      const counts = this.#database
        .prepare(
          `SELECT status, COUNT(*) AS n FROM quick_scripts WHERE host_id = ? GROUP BY status`,
        )
        .all(hostId) as unknown as { status: string; n: number }[];
      const pinned = counts.find((entry) => entry.status === "pinned")?.n ?? 0;
      const suggestedCap = Math.max(0, MAX_POOL - pinned);
      this.#database
        .prepare(
          `DELETE FROM quick_scripts WHERE id IN (
             SELECT id FROM quick_scripts WHERE host_id = ? AND status = 'suggested'
             ORDER BY confidence DESC, executed_count DESC LIMIT -1 OFFSET ?
           )`,
        )
        .run(hostId, suggestedCap);
      return created;
    });
  }

  update(id: string, patch: QuickScriptPatch): QuickScript {
    const row = this.#row(id);
    const current = this.#toRecord(row);
    const script = patch.script ?? this.#decryptScript(row);
    const next: QuickScript = {
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.script !== undefined ? { script: patch.script } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.executedCount !== undefined ? { executedCount: patch.executedCount } : {}),
      // Recording an execution (or any status change) retires the NEW badge.
      isNew: patch.executedCount !== undefined ? false : current.isNew,
      updatedAt: new Date().toISOString(),
    };
    this.#database
      .prepare(
        `UPDATE quick_scripts SET title = ?, encrypted_script = ?, status = ?, executed_count = ?,
           is_new = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        next.title,
        this.#cipher.encrypt(
          { recordType: "quick_script", recordId: id, vaultId: next.hostId, fieldName: "script" },
          Buffer.from(script, "utf8"),
        ),
        next.status,
        next.executedCount,
        next.isNew ? 1 : 0,
        next.updatedAt,
        id,
      );
    return next;
  }

  delete(id: string): void {
    this.#database.prepare("DELETE FROM quick_scripts WHERE id = ?").run(id);
  }

  deleteForHost(hostId: string): void {
    this.#database.prepare("DELETE FROM quick_scripts WHERE host_id = ?").run(hostId);
  }

  clearAll(): void {
    this.#database.exec("DELETE FROM quick_scripts");
  }

  #insert(hostId: string, sessionId: string, item: GeneratedScript, mode: QuickScriptMode, now: string): void {
    const id = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO quick_scripts (
           id, host_id, source_session_id, title, encrypted_script, description,
           source_usage_count, source_success_count, executed_count, confidence, risk_hint,
           status, mode, is_new, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, 'suggested', ?, 1, ?, ?)`,
      )
      .run(
        id,
        hostId,
        sessionId,
        item.title,
        this.#cipher.encrypt(
          { recordType: "quick_script", recordId: id, vaultId: hostId, fieldName: "script" },
          Buffer.from(item.script, "utf8"),
        ),
        item.description,
        item.confidence,
        item.riskHint,
        mode,
        now,
        now,
      );
  }

  #row(id: string): Row {
    const row = this.#database.prepare("SELECT * FROM quick_scripts WHERE id = ?").get(id) as unknown as Row | undefined;
    if (!row) throw new Error(`Quick script ${id} not found`);
    return row;
  }

  #decryptScript(row: Row): string {
    return this.#cipher
      .decrypt(
        { recordType: "quick_script", recordId: row.id, vaultId: row.host_id, fieldName: "script" },
        row.encrypted_script,
      )
      .toString("utf8");
  }

  #toRecord(row: Row): QuickScript {
    return {
      id: row.id,
      hostId: row.host_id,
      sessionId: row.source_session_id,
      title: row.title,
      script: this.#decryptScript(row),
      description: row.description,
      sourceUsageCount: row.source_usage_count,
      sourceSuccessCount: row.source_success_count,
      executedCount: row.executed_count,
      confidence: row.confidence,
      riskHint: row.risk_hint,
      status: row.status as QuickScriptStatus,
      isNew: row.is_new === 1,
      mode: row.mode as QuickScriptMode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  #transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}
```

**重要 —— AAD 陷阱:** `AesGcmFieldCipher` 把 `recordId` 绑进 AES-GCM 的 AAD。插入前无法得知 UUID,所以必须**先生成 id 再加密**:上面 `#insert` 已改为在方法开头 `const id = randomUUID();` 并以 `recordId: id` 加密(这是本计划对初稿的修正——先插行后加密会导致解密失败)。「密文不含明文」测试 + `list()` 的往返读取共同验证此接线正确。

另外,初稿测试里探测私有字段的两行(`const raw = ...` 与 `const database = ...`)是脚手架,落地时删掉,仅保留 `list()` 断言。

- [ ] **步骤 4:运行测试确认通过**

运行: `pnpm test -- repository.test`
预期: PASS。若 AAD 往返失败(`list()` 返回乱码或抛错),说明 recordId 接线有误——必须修复后再继续。

- [ ] **步骤 5:类型检查并提交**

运行: `pnpm typecheck` —— 预期: PASS。

```bash
git add src/main/domains/quickscripts/repository.ts tests/main/domains/quickscripts/repository.test.ts
git commit -m "feat(quickscripts): add encrypted quick_scripts repository with merge semantics"
```

---

## 任务 4:生成服务(会话加载 → LLM / 规则 → 合并)

**文件:**
- 新建: `src/main/domains/quickscripts/generator.ts`
- 新建: `src/main/domains/quickscripts/service.ts`
- 修改: `src/main/domains/ai/agent-runtime.ts`(新增 `sessionContext`)
- 修改: `src/main/domains/ssh/runtime.ts`(新增 `hostId`)
- 测试: `tests/main/domains/quickscripts/service.test.ts`

**接口:**
- 消费: 任务 2 提取器、任务 3 仓库、`AiModelRuntime.complete`(签名:`complete(providerConfigId, context: { systemPrompt?: string; messages: { role: "user"; content: string; timestamp: number }[] }, options?: { maxTokens?: number; signal?: AbortSignal }) => Promise<AssistantMessage>`——照抄 `agent-runtime.ts:436-446` 的 `generateSummary` 用法)、`AiConfigRepository.list(): AiProviderConfig[]`(含 `id`、`isDefault`、`credentialConfigured`、`providerKind`)、`AiHistoryRepository.list()/load()`、`SshRuntime`。
- 产出: `createQuickScriptsService({ repository, configs, models, history, agents, ssh })` 返回 `QuickScriptsService`(`generate/list/update/delete/deleteForHost/clearAll`);`openQuickScriptsService({ dataDirectory, isolatedE2e, configs, models, history, agents, ssh })`(自开数据库 + 共享主密钥);生成辅助函数 `buildGenerationPrompt`、`parseGeneratedScripts`、`buildRulesScripts`。供任务 5 消费。

- [ ] **步骤 1:编写失败测试**

新建 `tests/main/domains/quickscripts/service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { AesGcmFieldCipher } from "../../../../src/main/domains/inventory/field-cipher";
import { openAiDatabase } from "../../../../src/main/domains/ai/database";
import { QuickScriptRepository } from "../../../../src/main/domains/quickscripts/repository";
import { buildRulesScripts, parseGeneratedScripts } from "../../../../src/main/domains/quickscripts/generator";
import { createQuickScriptsService } from "../../../../src/main/domains/quickscripts/service";
import type { AiProviderConfig } from "../../../../src/main/domains/ai/types";

const provider: AiProviderConfig = {
  id: "provider-1",
  providerKind: "anthropic",
  name: "Claude",
  baseUrl: "",
  modelId: "claude-sonnet-5",
  credentialConfigured: true,
  credentialHint: null,
  isDefault: true,
  contextWindowTokens: null,
  maxOutputTokens: null,
  pricing: null,
};

const sessionMessages = [
  { role: "user", content: "check nginx", timestamp: 1 },
  {
    role: "assistant",
    content: [{ type: "toolCall", id: "t1", name: "ssh_exec", arguments: { command: "tail -n 30 /var/log/nginx/error.log", explanation: "read errors" } }],
    stopReason: "toolUse",
    timestamp: 2,
  },
  { role: "toolResult", toolCallId: "t1", toolName: "ssh_exec", content: [{ type: "text", text: JSON.stringify({ stdout: "ok", stderr: "", exitCode: 0, truncated: false }) }], isError: false, timestamp: 3 },
];

function createService(overrides: Partial<Parameters<typeof createQuickScriptsService>[0]> = {}) {
  const repository = new QuickScriptRepository(openAiDatabase(":memory:"), new AesGcmFieldCipher(Buffer.alloc(32, 9)));
  const complete = vi.fn(async () => ({
    role: "assistant",
    content: [{ type: "text", text: JSON.stringify([
      { title: "Read nginx errors", script: "tail -n 30 /var/log/nginx/error.log", description: "Latest errors.", riskHint: null, confidence: 0.9 },
    ]) }],
    stopReason: "stop",
    timestamp: 4,
  }));
  const service = createQuickScriptsService({
    repository,
    configs: { list: () => [provider] } as never,
    models: { complete } as never,
    history: { list: () => [], load: vi.fn() } as never,
    agents: { sessionContext: () => ({ messages: sessionMessages, sessionId: "session-live" }) } as never,
    ssh: { hostId: () => "host-1" } as never,
    ...overrides,
  });
  return { service, repository, complete };
}

describe("parseGeneratedScripts", () => {
  const allowed = new Set(["tail -n 30 /var/log/nginx/error.log", "df -h"]);
  it("accepts items whose script lines are verbatim allowed commands", () => {
    const items = parseGeneratedScripts(
      '```json\n[{"title":"T","script":"df -h\\ntail -n 30 /var/log/nginx/error.log","description":null,"riskHint":null,"confidence":0.8}]\n```',
      allowed,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "T", confidence: 0.8 });
  });
  it("drops items with invented or rewritten command lines", () => {
    const items = parseGeneratedScripts(
      '[{"title":"Bad","script":"rm -rf /","description":null,"riskHint":null,"confidence":0.9},{"title":"Ok","script":"df -h","description":null,"riskHint":null,"confidence":0.5}]',
      allowed,
    );
    expect(items.map((item) => item.title)).toEqual(["Ok"]);
  });
  it("returns empty for unparseable output", () => {
    expect(parseGeneratedScripts("not json at all", allowed)).toEqual([]);
  });
});

describe("buildRulesScripts", () => {
  it("titles by first line truncated to 30 chars and scales confidence by frequency", () => {
    const items = buildRulesScripts(
      [
        { command: "journalctl -u nginx -n 200 --no-pager extra", usageCount: 4, successCount: 3, cwds: [] },
        { command: "df -h", usageCount: 1, successCount: 1, cwds: [] },
      ],
      5,
    );
    expect(items[0].title.length).toBeLessThanOrEqual(31);
    expect(items[0].title.endsWith("…") || items[0].title.length <= 30).toBe(true);
    expect(items[0].confidence).toBeGreaterThan(items[1].confidence);
    expect(items[0].riskHint).toBeNull();
  });
});

describe("QuickScriptsService.generate", () => {
  it("uses the live agent context, calls the LLM, validates, and persists llm-mode scripts", async () => {
    const { service, repository } = createService();
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result).toMatchObject({ hostId: "host-1", createdCount: 1, mode: "llm", droppedCount: 0 });
    const listed = repository.list("host-1");
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ title: "Read nginx errors", sessionId: "session-live", mode: "llm", sourceUsageCount: 1, sourceSuccessCount: 1 });
  });

  it("falls back to rules mode when the LLM output is invalid", async () => {
    const { service } = createService({
      models: { complete: vi.fn(async () => ({ role: "assistant", content: [{ type: "text", text: "garbage" }], stopReason: "stop", timestamp: 4 })) } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("rules");
    expect(result.createdCount).toBeGreaterThan(0);
  });

  it("falls back to rules mode when the LLM call throws or errors", async () => {
    const { service } = createService({
      models: { complete: vi.fn(async () => { throw new Error("network down"); }) } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("rules");
  });

  it("returns empty when the session has no ssh_exec calls", async () => {
    const { service } = createService({
      agents: { sessionContext: () => ({ messages: [{ role: "user", content: "hi", timestamp: 1 }], sessionId: "s" }) } as never,
      history: { list: () => [], load: vi.fn() } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result).toMatchObject({ mode: "empty", createdCount: 0 });
  });

  it("falls back to decrypted history when no live agent exists", async () => {
    const { service } = createService({
      agents: { sessionContext: () => undefined } as never,
      history: {
        list: () => [{ id: "h1", title: "T", providerConfigId: "p", sshSessionId: "ssh-1", messageCount: 1, lastStatus: "done", encryptedBytes: 10, createdAt: "", updatedAt: "" }],
        load: () => ({ id: "h1", title: "T", providerConfigId: "p", sshSessionId: "ssh-1", messageCount: 1, lastStatus: "done", encryptedBytes: 10, createdAt: "", updatedAt: "", messages: sessionMessages }),
      } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("llm");
  });

  it("honors useLlm=false with fully offline rules mode", async () => {
    const { service, complete } = createService();
    const result = await service.generate({ sshSessionId: "ssh-1", useLlm: false });
    expect(result.mode).toBe("rules");
    expect(complete).not.toHaveBeenCalled();
  });

  it("uses rules mode when no provider is configured", async () => {
    const { service, complete } = createService({
      configs: { list: () => [] } as never,
    });
    const result = await service.generate({ sshSessionId: "ssh-1" });
    expect(result.mode).toBe("rules");
    expect(complete).not.toHaveBeenCalled();
  });
});
```

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- service.test`(位于 `tests/main/domains/quickscripts/`)
预期: FAIL —— 找不到模块。

- [ ] **步骤 3:添加运行时访问器**

(a) 在 `src/main/domains/ssh/runtime.ts` 中,紧邻现有 `host(sessionId)` 访问器(约 265 行):

```ts
  hostId(sessionId: string): string {
    return this.#session(sessionId).profile.hostId;
  }
```

(b) 在 `src/main/domains/ai/agent-runtime.ts` 中,给 `AiAgentRuntime` 新增公开方法(放在 `activeCount()` 之后,约 175 行)。`AgentMessage` 在该文件中已导入:

```ts
  /** Live session context for quick-script generation (PRD F2: runtime first). */
  sessionContext(sshSessionId: string): { messages: readonly AgentMessage[]; sessionId: string | undefined } | undefined {
    for (const entry of this.#entries.values()) {
      if (entry.sshSessionId === sshSessionId && !entry.closed) {
        return { messages: entry.agent.state.messages, sessionId: entry.sessionId };
      }
    }
    return undefined;
  }
```

- [ ] **步骤 4:编写生成器**

新建 `src/main/domains/quickscripts/generator.ts`:

```ts
import type { CommandAggregate } from "./extractor.js";
import { normalizeForMatch } from "./extractor.js";
import type { GeneratedScript } from "./repository.js";

export const GENERATION_SYSTEM_PROMPT = [
  "You distill repeated shell operations from an AI-assisted SSH session into quick scripts.",
  "Return ONLY a JSON array of 1-5 objects with fields:",
  '{"title": string, "script": string, "description": string, "riskHint": string | null, "confidence": number}.',
  'Every line of "script" must be copied VERBATIM from a "command" value in the input list — never rewrite, shorten, parameterize, or invent commands. A script may stack several commands, one per line.',
  '"title" is a short imperative label; "description" is one sentence; "riskHint" explains destructive impact (restarts, deletions) or is null; "confidence" is between 0 and 1.',
].join("\n");

export function buildGenerationPrompt(input: { sessionTitle: string; aggregates: readonly CommandAggregate[] }): string {
  return [
    `Session title: ${JSON.stringify(input.sessionTitle)}`,
    "Commands executed in this session (JSON):",
    JSON.stringify(
      input.aggregates.map((aggregate) => ({
        command: aggregate.command,
        usageCount: aggregate.usageCount,
        successCount: aggregate.successCount,
        workingDirectories: aggregate.cwds,
      })),
      null,
      2,
    ),
    "",
    "Distill these into quick scripts following the system rules. Respond with the JSON array only.",
  ].join("\n");
}

function extractJsonArray(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  return start >= 0 && end > start ? body.slice(start, end + 1) : "[]";
}

/**
 * Parse + validate LLM output. A script survives only when every line is a
 * verbatim session command (PRD R1). Invalid items are dropped; an empty
 * result means the caller falls back to rules mode.
 */
export function parseGeneratedScripts(raw: string, allowedLines: ReadonlySet<string>): GeneratedScript[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const items: GeneratedScript[] = [];
  for (const entry of parsed.slice(0, 5)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const script = typeof record.script === "string" ? record.script.replace(/\r/g, "") : "";
    if (!title || !script.trim()) continue;
    const lines = script.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    if (!lines.every((line) => allowedLines.has(normalizeForMatch(line)))) continue;
    const confidence = Number(record.confidence);
    items.push({
      title: title.slice(0, 60),
      script: lines.join("\n"),
      description: typeof record.description === "string" && record.description.trim() ? record.description.trim() : null,
      riskHint: typeof record.riskHint === "string" && record.riskHint.trim() ? record.riskHint.trim() : null,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    });
  }
  return items;
}

/** Offline fallback (PRD F4): verbatim top commands, titled by first line. */
export function buildRulesScripts(aggregates: readonly CommandAggregate[], totalExecutions: number): GeneratedScript[] {
  return aggregates.slice(0, 5).map((aggregate) => {
    const first = aggregate.command.split("\n")[0];
    return {
      title: first.length > 30 ? `${first.slice(0, 30)}…` : first,
      script: aggregate.command,
      description: null,
      riskHint: null,
      confidence: Math.min(0.95, 0.4 + 0.55 * (aggregate.usageCount / Math.max(1, totalExecutions))),
    };
  });
}
```

- [ ] **步骤 5:编写服务**

新建 `src/main/domains/quickscripts/service.ts`:

```ts
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { AppEncryptionProtector } from "../inventory/app-encryption.js";
import { AesGcmFieldCipher } from "../inventory/field-cipher.js";
import { createE2eMasterKey } from "../inventory/service.js";
import { loadOrCreateMasterKey } from "../inventory/master-key.js";
import { openAiDatabase } from "../ai/database.js";
import type { AiConfigRepository } from "../ai/repository.js";
import type { AiHistoryRepository, AiSessionRecord, AiSessionSummary } from "../ai/history.js";
import type { AiModelRuntime } from "../ai/model-runtime.js";
import type { AiAgentRuntime } from "../ai/agent-runtime.js";
import type { SshRuntime } from "../ssh/runtime.js";
import type { QuickScript, QuickScriptGenerationResult, QuickScriptPatch } from "../../../shared/ipc/quickscripts/types.js";
import { aggregateCommands, extractExecutedCommands, normalizeForMatch } from "./extractor.js";
import {
  GENERATION_SYSTEM_PROMPT,
  buildGenerationPrompt,
  buildRulesScripts,
  parseGeneratedScripts,
} from "./generator.js";
import { QuickScriptRepository } from "./repository.js";

const GENERATION_TIMEOUT_MS = 60_000;

export type QuickScriptsService = {
  generate(input: { sshSessionId: string; useLlm?: boolean }): Promise<QuickScriptGenerationResult>;
  list(hostId: string, includeDismissed?: boolean): QuickScript[];
  update(id: string, patch: QuickScriptPatch): QuickScript;
  delete(id: string): void;
  deleteForHost(hostId: string): void;
  clearAll(): void;
};

export type QuickScriptsServiceDeps = {
  repository: QuickScriptRepository;
  configs: Pick<AiConfigRepository, "list">;
  models: Pick<AiModelRuntime, "complete">;
  history: Pick<AiHistoryRepository, "list" | "load">;
  agents: Pick<AiAgentRuntime, "sessionContext">;
  ssh: Pick<SshRuntime, "hostId">;
};

function resolveProviderConfigId(configs: Pick<AiConfigRepository, "list">): string | undefined {
  const usable = configs
    .list()
    .filter((config) => config.credentialConfigured || config.providerKind === "ollama");
  return usable.find((config) => config.isDefault)?.id ?? usable[0]?.id;
}

export function createQuickScriptsService(deps: QuickScriptsServiceDeps): QuickScriptsService {
  const { repository, configs, models, history, agents, ssh } = deps;

  function loadSession(sshSessionId: string): { messages: unknown[]; sessionId: string | undefined; title: string } {
    const live = agents.sessionContext(sshSessionId);
    if (live) {
      return { messages: [...live.messages], sessionId: live.sessionId, title: "SSH AI session" };
    }
    const summaries = history
      .list()
      .filter((summary: AiSessionSummary) => summary.sshSessionId === sshSessionId);
    const latest = summaries[0]; // list() 为 ORDER BY updated_at DESC
    if (latest) {
      const record = history.load(latest.id) as AiSessionRecord;
      return { messages: Array.isArray(record.messages) ? record.messages : [], sessionId: record.id, title: record.title };
    }
    return { messages: [], sessionId: undefined, title: "SSH AI session" };
  }

  return {
    async generate({ sshSessionId, useLlm }) {
      const startedAt = Date.now();
      const hostId = ssh.hostId(sshSessionId); // 终端已关闭时抛 SSH_SESSION_NOT_FOUND
      const session = loadSession(sshSessionId);
      const executed = extractExecutedCommands(session.messages);
      if (executed.length === 0) {
        return { hostId, createdCount: 0, mode: "empty", durationMs: Date.now() - startedAt, droppedCount: 0 };
      }
      const { items: aggregates, droppedCount } = aggregateCommands(executed);

      let generated = buildRulesScripts(aggregates, executed.length);
      let mode: "llm" | "rules" = "rules";
      const providerConfigId = useLlm === false ? undefined : resolveProviderConfigId(configs);
      if (providerConfigId && aggregates.length > 0) {
        try {
          const response = await models.complete(
            providerConfigId,
            {
              systemPrompt: GENERATION_SYSTEM_PROMPT,
              messages: [{
                role: "user",
                content: buildGenerationPrompt({ sessionTitle: session.title, aggregates }),
                timestamp: Date.now(),
              }],
            },
            { signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS) },
          );
          const ok = response.stopReason !== "error" && response.stopReason !== "aborted";
          const text = ok
            ? response.content
                .filter((part) => part.type === "text")
                .map((part) => (part as { text: string }).text)
                .join("\n")
                .trim()
            : "";
          const allowed = new Set(aggregates.map((aggregate) => normalizeForMatch(aggregate.command)));
          const parsed = text ? parseGeneratedScripts(text, allowed) : [];
          if (parsed.length > 0) {
            generated = parsed;
            mode = "llm";
          }
        } catch {
          // 网络/超时失败 → 保持规则模式(PRD F4/N4)
        }
      }

      const createdCount = repository.mergeGenerated(hostId, session.sessionId ?? "", generated, mode);
      return { hostId, createdCount, mode, durationMs: Date.now() - startedAt, droppedCount };
    },

    list(hostId, includeDismissed) {
      return repository.list(hostId, includeDismissed);
    },
    update(id, patch) {
      return repository.update(id, patch);
    },
    delete(id) {
      repository.delete(id);
    },
    deleteForHost(hostId) {
      repository.deleteForHost(hostId);
    },
    clearAll() {
      repository.clearAll();
    },
  };
}

/**
 * 打开 quickscripts 数据库与共享主密钥。必须在 openAiService **之后**调用——
 * ai 服务在首次运行时创建 master-key.bin,而 loadOrCreateMasterKey 在
 * 「数据库已存在但密钥不存在」时拒绝生成新密钥(fail-closed)。
 */
export async function openQuickScriptsService(
  options: {
    dataDirectory: string;
    isolatedE2e: boolean;
  } & Omit<QuickScriptsServiceDeps, "repository">,
): Promise<QuickScriptsService & { close(): void }> {
  mkdirSync(options.dataDirectory, { recursive: true });
  const databasePath = path.join(
    options.dataDirectory,
    options.isolatedE2e ? "quickscripts.e2e.sqlite3" : "quickscripts.sqlite3",
  );
  let key: Buffer;
  if (options.isolatedE2e) {
    key = createE2eMasterKey();
  } else {
    const keyPath = path.join(options.dataDirectory, "master-key.bin");
    const protector = await AppEncryptionProtector.open(
      options.dataDirectory,
      existsSync(databasePath) || existsSync(keyPath),
    );
    try {
      key = await loadOrCreateMasterKey({
        keyPath,
        databaseExists: existsSync(databasePath),
        protector,
      });
    } finally {
      protector.dispose();
    }
  }
  const cipher = new AesGcmFieldCipher(key);
  key.fill(0);
  const database = openAiDatabase(databasePath);
  const repository = new QuickScriptRepository(database, cipher);
  const service = createQuickScriptsService({ ...options, repository });
  return {
    ...service,
    close() {
      database.close();
      cipher.dispose();
    },
  };
}
```

说明:`close()` 只存在于 `openQuickScriptsService` 包装层(纯 `createQuickScriptsService` 不含 close,测试无需处理);`AbortSignal.timeout` 需要 Node ≥ 17.3——Electron 43 主进程运行现代 Node,且仓库已用 `node:sqlite`(需 Node 22+),安全。

- [ ] **步骤 6:运行测试确认通过**

运行: `pnpm test -- service.test` 与 `pnpm test -- agent-runtime.test`(位于 `tests/main/domains/ai/`)
预期: PASS —— 新服务测试全绿;agent-runtime 现有测试不受新增访问器影响。

- [ ] **步骤 7:类型检查并提交**

运行: `pnpm typecheck` —— 预期: PASS。

```bash
git add src/main/domains/quickscripts/generator.ts src/main/domains/quickscripts/service.ts \
  src/main/domains/ai/agent-runtime.ts src/main/domains/ssh/runtime.ts \
  tests/main/domains/quickscripts/service.test.ts
git commit -m "feat(quickscripts): add generation service with LLM validation and rules fallback"
```

---

## 任务 5:IPC 全表面——命令、注册、装配、渲染层 API

**文件:**
- 新建: `src/main/domains/quickscripts/commands.ts`
- 新建: `src/renderer/features/ai/quickScriptApi.ts`
- 修改: `src/shared/ipc/command-names.ts`
- 修改: `src/main/domains/inventory/commands.ts`(级联钩子)
- 修改: `src/main/index.ts`(装配服务 + 处理器 + 级联)
- 修改: `tests/main/command-names.test.ts`(dispatcher 文件列表)
- 测试: `tests/main/domains/quickscripts/commands.test.ts`
- 测试: 扩展 `tests/main/domains/inventory/commands.test.ts`

**接口:**
- 消费: 任务 4 服务;任务 1 类型 + 确定性 API。
- 产出: `COMMANDS.quickScriptGenerate|List|Update|Delete|ClearData`(`quickscript_generate` 等);`createQuickScriptsCommandHandlers(service, broadcast?)`;`quickScriptApi: QuickScriptApi`(渲染层,重导出 `QuickScriptApi` 类型,使真实与确定性客户端共享);inventory 的 `createInventoryCommandHandlers(repository, hooks?: { onHostDeleted? })`。

- [ ] **步骤 1:编写失败的契约测试**

新建 `tests/main/domains/quickscripts/commands.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createQuickScriptsCommandHandlers } from "../../../../src/main/domains/quickscripts/commands";
import type { QuickScriptsService } from "../../../../src/main/domains/quickscripts/service";
import type { CommandContext } from "../../../../src/main/ipc/dispatcher";

const context: CommandContext = { ownerId: "test-owner", fallback: vi.fn() };

function fakeService(): QuickScriptsService & Record<string, ReturnType<typeof vi.fn>> {
  return {
    generate: vi.fn(async () => ({ hostId: "host-1", createdCount: 2, mode: "llm", durationMs: 5, droppedCount: 0 })),
    list: vi.fn(async () => []),
    update: vi.fn(async () => ({ id: "qs-1" })),
    delete: vi.fn(async () => undefined),
    deleteForHost: vi.fn(async () => undefined),
    clearAll: vi.fn(async () => undefined),
  } as never;
}

describe("Electron quickscripts command handlers", () => {
  it("routes every quickscript IPC command to the service", async () => {
    const service = fakeService();
    const broadcast = vi.fn();
    const handlers = createQuickScriptsCommandHandlers(service as never, broadcast);
    const cases = [
      ["quickscript_generate", { sshSessionId: "ssh-1" }, "generate"],
      ["quickscript_list", { hostId: "host-1" }, "list"],
      ["quickscript_update", { id: "qs-1", patch: { status: "pinned" } }, "update"],
      ["quickscript_delete", { id: "qs-1" }, "delete"],
      ["quickscript_clear_data", {}, "clearAll"],
      ["quickscript_clear_data", { hostId: "host-1" }, "deleteForHost"],
    ] as const;
    for (const [name, input, method] of cases) {
      const handler = handlers[name];
      expect(handler, `${name} should be handled by Electron`).toBeTypeOf("function");
      await expect(Promise.resolve(handler?.(input, context))).resolves.toEqual({ ok: true, data: expect.anything() });
      expect(service[method]).toHaveBeenCalled();
    }
    expect(broadcast).toHaveBeenCalledWith({ hostId: "host-1", sshSessionId: "ssh-1", createdCount: 2, mode: "llm" });
  });

  it("does not broadcast for empty generations", async () => {
    const service = fakeService();
    service.generate.mockResolvedValueOnce({ hostId: "host-1", createdCount: 0, mode: "empty", durationMs: 1, droppedCount: 0 });
    const broadcast = vi.fn();
    const handlers = createQuickScriptsCommandHandlers(service as never, broadcast);
    await handlers["quickscript_generate"]?.({ sshSessionId: "ssh-1" }, context);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("rejects malformed input before calling the service", async () => {
    const service = fakeService();
    const handlers = createQuickScriptsCommandHandlers(service as never);
    const result = await handlers["quickscript_generate"]?.({ sshSessionId: "" }, context);
    expect(result).toMatchObject({ ok: false, error: { code: "IPC_INVALID_INPUT" } });
    expect(service.generate).not.toHaveBeenCalled();
  });
});
```

同时向 `tests/main/domains/inventory/commands.test.ts` 追加(保留现有测试):

```ts
it("invokes the onHostDeleted hook when a host or vault is deleted", async () => {
  const onHostDeleted = vi.fn();
  const repository = {
    deleteHost: vi.fn(),
    deleteVault: vi.fn(),
    listHosts: vi.fn(() => [{ id: "host-1" }, { id: "host-2" }]),
  };
  const handlers = createInventoryCommandHandlers(repository as never, { onHostDeleted });
  await handlers["inventory_delete_host"]?.({ id: "host-1" }, context);
  expect(onHostDeleted).toHaveBeenCalledWith("host-1");
  await handlers["inventory_delete_vault"]?.({ id: "vault-1" }, context);
  expect(onHostDeleted).toHaveBeenCalledWith("host-2");
});
```

(若该文件已有 fake-repository 辅助函数,复用更简洁;关键断言:两条删除路径都在仓库调用之后以主机 id 触发钩子。)

并把 `tests/main/command-names.test.ts` 的 dispatcher 文件列表加上 `"quickscripts/commands.ts"`:

```ts
    const dispatcher = [
      "app.ts", "ai/commands.ts", "agent/commands.ts", "inventory/commands.ts", "terminal/commands.ts",
      "ssh/commands.ts", "forwarding/commands.ts", "sftp/commands.ts", "quickscripts/commands.ts",
    ].map((file) => readFileSync(`${root}/src/main/domains/${file}`, "utf8")).join("\n");
```

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- commands.test` 与 `pnpm test -- command-names.test`
预期: FAIL —— 处理器模块缺失;注册命令名后 allowlist 测试也会失败(步骤 3 中命令名与处理器必须同批落地)。

- [ ] **步骤 3:实现处理器 + 注册**

(a) 向 `src/shared/ipc/command-names.ts` 的 `COMMANDS` 追加(保持域分组,放在 `ai_*` 块之后):

```ts
  quickScriptGenerate: "quickscript_generate",
  quickScriptList: "quickscript_list",
  quickScriptUpdate: "quickscript_update",
  quickScriptDelete: "quickscript_delete",
  quickScriptClearData: "quickscript_clear_data",
```

(b) 新建 `src/main/domains/quickscripts/commands.ts`(`command()` 包装器照抄 `src/main/domains/ai/commands.ts:179-194` 的家规写法):

```ts
import { z, ZodError, type ZodType } from "zod";
import type { CommandHandler, CommandHandlers } from "../../ipc/dispatcher.js";
import { failure, success } from "../../../shared/ipc/result.js";
import type { QuickScriptGeneratedEvent } from "../../../shared/ipc/quickscripts/types.js";
import type { QuickScriptsService } from "./service.js";

const sshSessionId = z.string().trim().min(1);
const hostId = z.string().trim().min(1);
const id = z.string().trim().min(1);
const patch = z.object({
  title: z.string().trim().min(1).optional(),
  script: z.string().trim().min(1).optional(),
  status: z.enum(["suggested", "pinned", "dismissed"]).optional(),
  executedCount: z.number().int().min(0).optional(),
});

function command<Input, Output>(
  schema: ZodType<Input>,
  operation: (input: Input) => Output,
): CommandHandler {
  return (rawInput) => {
    try {
      const input = schema.parse(rawInput ?? {});
      return success(operation(input));
    } catch (error) {
      if (error instanceof ZodError) {
        return failure("IPC_INVALID_INPUT", "The desktop operation received invalid input.");
      }
      throw error;
    }
  };
}

export function createQuickScriptsCommandHandlers(
  service: QuickScriptsService,
  broadcast?: (event: QuickScriptGeneratedEvent) => void,
): CommandHandlers {
  return {
    quickscript_generate: command(
      z.object({ sshSessionId, useLlm: z.boolean().optional() }),
      async ({ sshSessionId: session, useLlm }) => {
        const result = await service.generate({ sshSessionId: session, useLlm });
        if (result.mode !== "empty" && broadcast) {
          broadcast({ hostId: result.hostId, sshSessionId: session, createdCount: result.createdCount, mode: result.mode });
        }
        return result;
      },
    ),
    quickscript_list: command(
      z.object({ hostId, includeDismissed: z.boolean().optional() }),
      ({ hostId: host, includeDismissed }) => service.list(host, includeDismissed),
    ),
    quickscript_update: command(
      z.object({ id, patch }),
      ({ id: scriptId, patch: changes }) => service.update(scriptId, changes),
    ),
    quickscript_delete: command(id, ({ id: scriptId }) => {
      service.delete(scriptId);
      return undefined;
    }),
    quickscript_clear_data: command(
      z.object({ hostId: hostId.optional() }),
      ({ hostId: host }) => {
        if (host) service.deleteForHost(host);
        else service.clearAll();
        return undefined;
      },
    ),
  };
}
```

(c) `src/main/domains/inventory/commands.ts`:修改工厂签名与两个删除处理器:

```ts
export function createInventoryCommandHandlers(
  repository: InventoryRepository,
  hooks: { onHostDeleted?: (hostId: string) => void } = {},
): CommandHandlers {
```

```ts
    inventory_delete_host: command(idInput, ({ id }) => {
      repository.deleteHost(id);
      hooks.onHostDeleted?.(id);
    }),
    inventory_delete_vault: command(idInput, ({ id }) => {
      for (const host of repository.listHosts(id)) hooks.onHostDeleted?.(host.id);
      repository.deleteVault(id);
    }),
```

(按现有文件的实际行位调整——当前 `inventory_delete_host` 约在 98 行、`inventory_delete_vault` 约在 70 行。保持原有返回形态;现有测试断言「仓库方法被调用一次 + 结果信封」——`success(undefined)` 同样满足原本 data 为 undefined 的用例。)

(d) `src/main/index.ts` —— 在 `start()` 内、`openAiService(...)` **之后**(确保主密钥已存在)加入:

```ts
  const quickScripts = await openQuickScriptsService({
    dataDirectory,
    isolatedE2e,
    configs: aiService.configs,
    models: aiService.models,
    history: aiService.history,
    agents: aiService.agents,
    ssh: sshRuntime,
  });
```

(变量名以现有 `openAiService(...)` 调用点为准——index.ts 约 297 行处的 `dataDirectory`/`isolatedE2e`/`sshRuntime`。)更新 dispatcher 装配:

```ts
    ...createInventoryCommandHandlers(inventoryRepository, {
      onHostDeleted: (hostId) => quickScripts.deleteForHost(hostId),
    }),
    ...createQuickScriptsCommandHandlers(quickScripts, (event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send("terminus:quickscript-generated", event);
      }
    }),
```

(`BrowserWindow` 在 index.ts 已为主窗口导入;若缺则补。)在 `closeApplicationResources`(index.ts 约 199-222 行)中,于 ai 服务清理旁添加 `quickScripts.close();`。

(e) 新建 `src/renderer/features/ai/quickScriptApi.ts`:

```ts
import { COMMANDS } from "@shared/ipc/command-names";
import type {
  QuickScript,
  QuickScriptGenerationResult,
  QuickScriptPatch,
} from "@shared/ipc/quickscripts/types";
import { callCommand } from "../../app/ipc";
import { createDeterministicQuickScriptApi } from "./deterministicQuickScriptApi";

export type { QuickScriptApi } from "./deterministicQuickScriptApi";

export const quickScriptApi = {
  generate: (input: { sshSessionId: string; useLlm?: boolean }) =>
    callCommand<typeof input, QuickScriptGenerationResult>(COMMANDS.quickScriptGenerate, input),
  list: (hostId: string, includeDismissed?: boolean) =>
    callCommand<{ hostId: string; includeDismissed?: boolean }, QuickScript[]>(COMMANDS.quickScriptList, {
      hostId,
      includeDismissed,
    }),
  update: (id: string, patch: QuickScriptPatch) =>
    callCommand<{ id: string; patch: QuickScriptPatch }, QuickScript>(COMMANDS.quickScriptUpdate, { id, patch }),
  delete: (id: string) => callCommand<{ id: string }, void>(COMMANDS.quickScriptDelete, { id }),
  clearData: (hostId?: string) =>
    callCommand<{ hostId?: string }, void>(COMMANDS.quickScriptClearData, { hostId }),
} as const satisfies {
  generate(input: { sshSessionId: string; useLlm?: boolean }): Promise<QuickScriptGenerationResult>;
  list(hostId: string, includeDismissed?: boolean): Promise<QuickScript[]>;
  update(id: string, patch: QuickScriptPatch): Promise<QuickScript>;
  delete(id: string): Promise<void>;
  clearData(hostId?: string): Promise<void>;
};

export { createDeterministicQuickScriptApi };
```

(若 `satisfies` 写法不顺手,可改为 `import type { QuickScriptApi } from "./deterministicQuickScriptApi"; export const quickScriptApi: QuickScriptApi = { ... };`。无论哪种,任务 1 的 `QuickScriptApi` 始终是共享的唯一接口——PRD 测试策略要求确定性 API 签名与真实 API 对齐。)

- [ ] **步骤 4:运行测试确认通过**

运行: `pnpm test -- commands.test && pnpm test -- command-names.test`
预期: PASS —— quickscripts 契约测试、inventory 钩子测试、allowlist 测试全部通过。

- [ ] **步骤 5:类型检查并提交**

运行: `pnpm typecheck` —— 预期: PASS。

```bash
git add src/shared/ipc/command-names.ts src/main/domains/quickscripts/commands.ts \
  src/main/domains/inventory/commands.ts src/main/index.ts src/renderer/features/ai/quickScriptApi.ts \
  tests/main/domains/quickscripts/commands.test.ts tests/main/domains/inventory/commands.test.ts tests/main/command-names.test.ts
git commit -m "feat(quickscripts): register quickscript IPC commands with host-delete cascade"
```

---

## 任务 6:把 `classify` 迁至 shared,供渲染层风险门控使用

**文件:**
- 新建: `src/shared/shell-risk.ts`
- 修改: `src/main/domains/ai/risk.ts`
- 测试: `tests/main/domains/ai/risk.test.ts` 保持全绿(预计无需改动)

**接口:**
- 产出: `src/shared/shell-risk.ts` 导出 `RiskVerdict` 与 `classify(command)`(逐字迁移);`risk.ts` 为兼容而重导出两者。渲染层在任务 9 从 `@shared/shell-risk` 导入 `classify`。

- [ ] **步骤 1:新建共享模块**

新建 `src/shared/shell-risk.ts` —— 从 `src/main/domains/ai/risk.ts` **逐字迁移**(当前第 5-8、26-29、73-93、95-135、146-148 行):`RiskVerdict` 类型、`INTERACTIVE` 集合、`classify` 函数、`denylist` 与 `basename`。顶部加 `shell-quote` 导入:

```ts
import { parse } from "shell-quote";

export type RiskVerdict =
  | { kind: "allow" }
  | { kind: "needsConfirmation"; level: "high"; reason: string; projectedEffect: string }
  | { kind: "reject"; reason: string };

// ... INTERACTIVE、classify、denylist、basename 从 risk.ts 原样复制 ...
```

- [ ] **步骤 2:改接 `risk.ts`**

在 `src/main/domains/ai/risk.ts` 中:删除已迁移代码,保留类与其导入,并添加:

```ts
import { classify, type RiskVerdict } from "../../../shared/shell-risk.js";

export { classify } from "../../../shared/shell-risk.js";
export type { RiskVerdict } from "../../../shared/shell-risk.js";
```

(`ShellAssessment` 留在 `risk.ts`——它是 runtime 专属类型。)检查其他引用方保持全绿:`grep -rn "from \"./risk" src/main` —— 两个 agent runtime 从 `./risk.js` 导入 `AiShellRiskRuntime` 及可能的 `RiskVerdict`;重导出让两者都继续可用。`shell-quote` 仍是主进程依赖;渲染层会把它打进 renderer chunk(纯解析器,浏览器安全)。

- [ ] **步骤 3:运行测试**

运行: `pnpm test -- risk.test && pnpm test -- agent-runtime.test && pnpm typecheck`
预期: PASS —— 纯迁移,无行为变化。

- [ ] **步骤 4:提交**

```bash
git add src/shared/shell-risk.ts src/main/domains/ai/risk.ts
git commit -m "refactor(ai): move shell risk classifier to shared for renderer reuse"
```

---

## 任务 7:渲染层组件——`QuickScriptCard` + `QuickScriptsSection`

**文件:**
- 新建: `src/renderer/features/ai/QuickScriptCard.tsx`
- 新建: `src/renderer/features/ai/QuickScriptsSection.tsx`
- 测试: `tests/renderer/features/ai/QuickScriptsSection.test.tsx`

**接口:**
- 消费: 任务 1 的 `QuickScript` wire 类型;lucide-react 图标(`Sparkles`、`TriangleAlert`、`Pin`、`Play`、`Pencil`、`X`、`RefreshCw`、`ChevronDown`、`Check`、`Terminal`)。
- 产出: `QuickScriptCard { qs, onExecute, onPin, onEdit, onDismiss }` 与 `QuickScriptsSection { hostName, visible, poolCount, phase, generatedCount, collapsed, onToggleCollapse, onShuffle, onExecute, onPin, onEdit, onDismiss }`(`phase: "idle" | "working" | "done" | "empty" | "failed"`)。供任务 9 消费。

以下 JSX 即原型移植:布局/className/行为完全一致,原型 `Icon` 换 lucide、`spin` 换 `animate-[terminus-spin_0.9s_linear_infinite]`、文案按全局约束用英文。

- [ ] **步骤 1:编写失败测试**

新建 `tests/renderer/features/ai/QuickScriptsSection.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuickScriptsSection } from "@/features/ai/QuickScriptsSection";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

const qs = (id: string, overrides: Partial<QuickScript> = {}): QuickScript => ({
  id,
  hostId: "host-1",
  sessionId: "session-1",
  title: "Read nginx errors",
  script: "tail -n 30 /var/log/nginx/error.log",
  description: "Latest 30 error lines.",
  sourceUsageCount: 5,
  sourceSuccessCount: 5,
  executedCount: 0,
  confidence: 0.94,
  riskHint: null,
  status: "suggested",
  isNew: true,
  mode: "llm",
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
  ...overrides,
});

describe("QuickScriptCard", () => {
  it("renders badges, stats pill, and calls execute on click", async () => {
    const onExecute = vi.fn();
    render(<QuickScriptsSection
      hostName="web-prod-01" visible={[qs("a", { executedCount: 3 })]} poolCount={1}
      phase="idle" generatedCount={0} collapsed={false}
      onToggleCollapse={() => undefined} onShuffle={() => undefined}
      onExecute={onExecute} onPin={vi.fn()} onEdit={vi.fn()} onDismiss={vi.fn()}
    />);
    const card = screen.getByRole("button", { name: /Read nginx errors/ });
    expect(screen.getByText("NEW")).toBeVisible();
    expect(screen.getByText("5x · 100%")).toBeVisible();
    await userEvent.click(card);
    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it("shows risk icon, rules badge, and extra-line marker", () => {
    render(<QuickScriptsSection
      hostName="h" visible={[qs("a", { mode: "rules", riskHint: "restarts gunicorn", script: "sudo systemctl restart gunicorn\ncurl localhost/health" })]}
      poolCount={1} phase="idle" generatedCount={0} collapsed={false}
      onToggleCollapse={() => undefined} onShuffle={() => undefined}
      onExecute={vi.fn()} onPin={vi.fn()} onEdit={vi.fn()} onDismiss={vi.fn()}
    />);
    expect(screen.getByText("RULES")).toBeVisible();
    expect(screen.getByText(/⏎\+1/)).toBeVisible();
    expect(screen.getByLabelText(/risk hint/i)).toBeVisible();
  });

  it("keyboard Enter triggers execute and hover actions stop propagation", () => {
    const onExecute = vi.fn();
    const onDismiss = vi.fn();
    render(<QuickScriptsSection
      hostName="h" visible={[qs("a")]} poolCount={1} phase="idle" generatedCount={0} collapsed={false}
      onToggleCollapse={() => undefined} onShuffle={() => undefined}
      onExecute={onExecute} onPin={vi.fn()} onEdit={vi.fn()} onDismiss={onDismiss}
    />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Read nginx errors/ }), { key: "Enter" });
    expect(onExecute).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Read nginx errors" }));
    expect(onDismiss).toHaveBeenCalledWith("a");
    expect(onExecute).toHaveBeenCalledTimes(1);
  });
});

describe("QuickScriptsSection header states", () => {
  const base = {
    hostName: "web-prod-01", visible: [], poolCount: 0, generatedCount: 2,
    onToggleCollapse: vi.fn(), onShuffle: vi.fn(), onExecute: vi.fn(), onPin: vi.fn(),
    onEdit: vi.fn(), onDismiss: vi.fn(),
  };

  it("working state shows the recap spinner text", () => {
    render(<QuickScriptsSection {...base} phase="working" collapsed={false} />);
    expect(screen.getByText("Recapping this session…")).toBeVisible();
  });

  it("done state shows generated count", () => {
    render(<QuickScriptsSection {...base} phase="done" collapsed={false} />);
    expect(screen.getByText(/Generated 2 scripts/)).toBeVisible();
  });

  it("done state with zero created says up to date", () => {
    render(<QuickScriptsSection {...base} phase="done" generatedCount={0} collapsed={false} />);
    expect(screen.getByText("Scripts are up to date")).toBeVisible();
  });

  it("failed state announces rules fallback", () => {
    render(<QuickScriptsSection {...base} phase="failed" collapsed={false} />);
    expect(screen.getByText(/Generation failed/)).toBeVisible();
  });

  it("empty state hints at /生成快捷指令", () => {
    render(<QuickScriptsSection {...base} phase="empty" collapsed={false} />);
    expect(screen.getByText(/no commands in this session yet/i)).toBeVisible();
    expect(screen.getByText("/生成快捷指令")).toBeVisible();
  });

  it("collapsed shows count pill, hides cards, and shuffle only appears with pool > 3", () => {
    const { rerender } = render(<QuickScriptsSection {...base} phase="idle" collapsed poolCount={5} />);
    expect(screen.getByText("5 scripts")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Shuffle/i })).toBeNull();
    rerender(<QuickScriptsSection {...base} phase="idle" collapsed={false} poolCount={5} />);
    expect(screen.getByRole("button", { name: /Shuffle/i })).toBeVisible();
    rerender(<QuickScriptsSection {...base} phase="idle" collapsed={false} poolCount={2} />);
    expect(screen.queryByRole("button", { name: /Shuffle/i })).toBeNull();
  });
});
```

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- QuickScriptsSection.test`
预期: FAIL —— 找不到组件。

- [ ] **步骤 3:实现卡片**

新建 `src/renderer/features/ai/QuickScriptCard.tsx`(原型 `QuickScriptCard` 逐字移植 + lucide):

```tsx
import { Check, Pencil, Pin, Play, TriangleAlert, X } from "lucide-react";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

function stats(qs: QuickScript): { pct: number | null } {
  if (!qs.sourceUsageCount) return { pct: null };
  return { pct: Math.round((qs.sourceSuccessCount / qs.sourceUsageCount) * 100) };
}

export function QuickScriptCard({
  qs,
  onExecute,
  onPin,
  onEdit,
  onDismiss,
}: {
  qs: QuickScript;
  onExecute: (qs: QuickScript) => void;
  onPin: (id: string) => void;
  onEdit: (qs: QuickScript) => void;
  onDismiss: (id: string) => void;
}) {
  const pinned = qs.status === "pinned";
  const { pct } = stats(qs);
  const lines = qs.script.split("\n");
  const first = lines[0];
  const extra = lines.length - 1;
  const stop = (fn: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    fn();
  };
  const actBtn =
    "grid h-[22px] w-[22px] place-items-center rounded-md text-fog transition-colors hover:bg-white/10 hover:text-mist";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Quick script ${qs.title}`}
      onClick={() => onExecute(qs)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExecute(qs);
        }
      }}
      className={
        "group relative min-w-0 cursor-pointer rounded-[10px] border bg-carbon/80 px-2.5 py-[7px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acid-lime " +
        (pinned
          ? "border-acid-lime/30 bg-acid-lime/[0.04] shadow-[inset_2px_0_0_rgba(228,242,34,0.55)]"
          : "border-graphite/60 hover:border-smoke")
      }
    >
      <div className="flex items-center gap-2">
        {qs.isNew ? (
          <span className="shrink-0 rounded bg-acid-lime/15 px-1 py-px text-[9.5px] font-semibold text-acid-lime">NEW</span>
        ) : null}
        {qs.mode === "rules" ? (
          <span className="shrink-0 rounded border border-smoke/60 bg-graphite/50 px-1 py-px text-[9.5px] text-fog">RULES</span>
        ) : null}
        <span className="max-w-[46%] shrink-0 truncate text-[12px] font-medium tracking-tight text-mist">{qs.title}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] leading-none text-fog">
          {qs.riskHint ? (
            <TriangleAlert aria-label="risk hint" size={10} className="mr-1 inline-block translate-y-[1px] text-yellow-400" />
          ) : null}
          {first}
          {extra > 0 ? <span className="text-fog/60"> ⏎+{extra}</span> : null}
        </span>

        <span className="relative h-[22px] shrink-0">
          <span className="flex h-full items-center gap-1 transition-opacity duration-150 group-hover:opacity-0">
            {pinned ? <Pin size={11} className="text-acid-lime" /> : null}
            {qs.executedCount > 0 ? (
              <span
                title={`Run from card ${qs.executedCount} times`}
                className="inline-flex items-center gap-0.5 rounded-pill bg-graphite/80 px-1.5 text-[10px] text-fog"
              >
                <Play size={8} />
                {qs.executedCount}
              </span>
            ) : null}
            {pct !== null ? (
              <span
                title={`Used ${qs.sourceUsageCount} times in session · ${pct}% success`}
                className="whitespace-nowrap rounded-pill bg-graphite/80 px-1.5 text-[10px] text-fog"
              >
                {qs.sourceUsageCount}x · {pct}%
              </span>
            ) : null}
          </span>
          <span className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <button type="button" aria-label={`Run ${qs.title}`} title="Write to terminal and run" onClick={stop(() => onExecute(qs))} className={actBtn}>
              <Play size={12} />
            </button>
            <button
              type="button"
              aria-label={pinned ? `Unpin ${qs.title}` : `Pin ${qs.title}`}
              title={pinned ? "Unpin" : "Pin"}
              onClick={stop(() => onPin(qs.id))}
              className={actBtn + (pinned ? " text-acid-lime" : "")}
            >
              <Pin size={12} />
            </button>
            <button type="button" aria-label={`Edit ${qs.title}`} title="Edit" onClick={stop(() => onEdit(qs))} className={actBtn}>
              <Pencil size={12} />
            </button>
            <button
              type="button"
              aria-label={`Dismiss ${qs.title}`}
              title="Dismiss (never show again)"
              onClick={stop(() => onDismiss(qs.id))}
              className="grid h-[22px] w-[22px] place-items-center rounded-md text-fog transition-colors hover:bg-coral-red/12 hover:text-coral-red"
            >
              <X size={12} />
            </button>
          </span>
        </span>
      </div>

      <span className="pointer-events-none absolute left-2 right-2 top-full z-30 mt-1 hidden rounded-lg border border-graphite bg-carbon px-2.5 py-2 text-left shadow-[0_14px_44px_rgb(0_0_0/0.55)] group-hover:block">
        <span className="block text-[11px] font-medium text-mist">{qs.title}</span>
        {qs.description ? (
          <span className="mt-0.5 block text-[10.5px] leading-relaxed text-fog">{qs.description}</span>
        ) : null}
        {qs.riskHint ? (
          <span className="mt-1 flex items-center gap-1 text-[10.5px] text-yellow-400">
            <TriangleAlert size={10} />
            {qs.riskHint}
          </span>
        ) : null}
        <span className="mt-1.5 block whitespace-pre-wrap break-all rounded-md border border-graphite/70 bg-black/50 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-mist/90">
          {qs.script}
        </span>
        <span className="mt-1 block text-[10px] text-fog/70">
          Used {qs.sourceUsageCount} times in session · {pct === null ? "--" : `${pct}%`} success
          {qs.executedCount > 0 ? ` · run ${qs.executedCount} times` : ""}
          {qs.mode === "rules" ? " · rules mode" : ""}
        </span>
      </span>
    </div>
  );
}
```

- [ ] **步骤 4:实现分区**

新建 `src/renderer/features/ai/QuickScriptsSection.tsx`(原型 `QuickScriptsSection` 逐字移植):

```tsx
import { Check, ChevronDown, RefreshCw, Sparkles, TriangleAlert, Terminal } from "lucide-react";
import type { QuickScript } from "@shared/ipc/quickscripts/types";
import { QuickScriptCard } from "./QuickScriptCard";

export type QuickScriptGenPhase = "idle" | "working" | "done" | "empty" | "failed";

export function QuickScriptsSection({
  hostName,
  visible,
  poolCount,
  phase,
  generatedCount,
  collapsed,
  onToggleCollapse,
  onShuffle,
  onExecute,
  onPin,
  onEdit,
  onDismiss,
}: {
  hostName: string;
  visible: QuickScript[];
  poolCount: number;
  phase: QuickScriptGenPhase;
  generatedCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onShuffle: () => void;
  onExecute: (qs: QuickScript) => void;
  onPin: (id: string) => void;
  onEdit: (qs: QuickScript) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <section aria-label="Quick scripts" className="shrink-0 px-3 pt-3">
      <div className="rounded-xl border border-graphite/70 bg-graphite/25">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <Sparkles size={13} className="shrink-0 text-acid-lime" />
          <span className="shrink-0 text-[12px] font-semibold tracking-tight text-mist">Quick scripts</span>
          <span className="min-w-0 truncate text-[11px] text-fog/80">{hostName}</span>
          {phase === "working" ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1.5 text-[11px] text-fog">
              <span className="h-3 w-3 shrink-0 animate-[terminus-spin_0.9s_linear_infinite] rounded-full border-[1.5px] border-graphite border-t-acid-lime" />
              Recapping this session…
            </span>
          ) : null}
          {phase === "done" ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1 text-[11px] text-pulse-green">
              <Check size={12} className="shrink-0" />
              {generatedCount > 0 ? `Generated ${generatedCount} scripts` : "Scripts are up to date"}
            </span>
          ) : null}
          {phase === "failed" ? (
            <span className="ml-1 inline-flex min-w-0 items-center gap-1 text-[11px] text-coral-red">
              <TriangleAlert size={12} className="shrink-0" />
              Generation failed — rules mode applied
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {poolCount > 3 && !collapsed ? (
              <button
                type="button"
                onClick={onShuffle}
                title="Shuffle"
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
              >
                <RefreshCw size={11} />
                Shuffle
              </button>
            ) : null}
            {collapsed ? (
              <span className="mr-1 rounded-pill bg-graphite/80 px-1.5 py-0.5 text-[10px] text-fog">{poolCount} scripts</span>
            ) : null}
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand quick scripts" : "Collapse quick scripts"}
              title={collapsed ? "Expand" : "Collapse"}
              className="grid h-6 w-6 place-items-center rounded text-fog transition-colors hover:bg-white/5 hover:text-mist"
            >
              <ChevronDown size={13} className={collapsed ? "" : "rotate-180"} />
            </button>
          </div>
        </div>

        {!collapsed ? (
          phase === "empty" ? (
            <div className="flex items-start gap-2 px-3 pb-3 pt-1 text-[11.5px] leading-relaxed text-fog">
              <Terminal size={13} className="mt-0.5 shrink-0 text-fog/70" />
              <p className="m-0">
                No commands in this session yet — let the AI run a few first, then type{" "}
                <span className="rounded border border-graphite bg-carbon px-1 py-px font-mono text-[10.5px] text-mist">
                  /生成快捷指令
                </span>
              </p>
            </div>
          ) : (
            <div className="grid gap-1 px-1.5 pb-1.5">
              {visible.map((qs) => (
                <QuickScriptCard key={qs.id} qs={qs} onExecute={onExecute} onPin={onPin} onEdit={onEdit} onDismiss={onDismiss} />
              ))}
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **步骤 5:运行测试、类型检查、提交**

运行: `pnpm test -- QuickScriptsSection.test` → PASS。运行 `pnpm typecheck` → PASS。

```bash
git add src/renderer/features/ai/QuickScriptCard.tsx src/renderer/features/ai/QuickScriptsSection.tsx tests/renderer/features/ai/QuickScriptsSection.test.tsx
git commit -m "feat(quickscripts): add suggestion card group components matching prototype"
```

---

## 任务 8:`useQuickScripts` hook

**文件:**
- 新建: `src/renderer/features/ai/useQuickScripts.ts`
- 测试: `tests/renderer/features/ai/useQuickScripts.test.tsx`

**接口:**
- 消费: 任务 1 的 `QuickScriptApi`;任务 6 的 `classify`(来自 `@shared/shell-risk`)。
- 产出: `QUICK_SLASH_TRIGGERS`、`QUICK_SLASH_COMMANDS`,以及 `useQuickScripts({ sshSessionId, hostId, api, onRunCommand })`,返回 `{ scripts, visible, poolCount, hasMore, phase, generatedCount, collapsed, toggleCollapse, shuffle, generate, execute, pendingConfirm, resolveConfirm, pin, dismiss, remove, saveEdit, undo, undoLast, editing, setEditing, refresh }`。供任务 9 消费。

- [ ] **步骤 1:编写失败测试**

新建 `tests/renderer/features/ai/useQuickScripts.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickScript } from "@shared/ipc/quickscripts/types";
import { createDeterministicQuickScriptApi } from "@/features/ai/deterministicQuickScriptApi";
import { useQuickScripts } from "@/features/ai/useQuickScripts";

const qs = (id: string, overrides: Partial<QuickScript> = {}): QuickScript => ({
  id, hostId: "host-1", sessionId: "s", title: `T${id}`, script: `cmd-${id}`,
  description: null, sourceUsageCount: 2, sourceSuccessCount: 2, executedCount: 0,
  confidence: 0.9, riskHint: null, status: "suggested", isNew: false, mode: "llm",
  createdAt: "", updatedAt: "", ...overrides,
});

function makeApi(rows: QuickScript[] = []) {
  const api = createDeterministicQuickScriptApi(rows);
  return { api, spies: { update: vi.spyOn(api, "update"), list: vi.spyOn(api, "list") } };
}

function mount(overrides: Partial<Parameters<typeof useQuickScripts>[0]> = {}) {
  const { api, spies } = makeApi([qs("1"), qs("2"), qs("3"), qs("4")]);
  const onRunCommand = vi.fn();
  const hook = renderHook(() =>
    useQuickScripts({ sshSessionId: "ssh-1", hostId: "host-1", api, onRunCommand, ...overrides }),
  );
  return { hook, api, spies, onRunCommand };
}

beforeEach(() => localStorage.clear());

describe("useQuickScripts", () => {
  it("loads on mount, sorts pinned→confidence, and windows 3 cards", () => {
    const { hook } = mount();
    expect(hook.result.current.poolCount).toBe(4);
    expect(hook.result.current.visible.length).toBe(3);
    expect(hook.result.current.hasMore).toBe(true);
  });

  it("shuffle rotates the visible window", () => {
    const { hook } = mount();
    const before = hook.result.current.visible.map((s) => s.id);
    act(() => hook.result.current.shuffle());
    expect(hook.result.current.visible.map((s) => s.id)).not.toEqual(before);
  });

  it("generate runs the phase machine working→done and refreshes", async () => {
    const { hook } = mount();
    await act(async () => { void hook.result.current.generate(); });
    expect(hook.result.current.phase).toBe("working");
    await act(async () => { await vi.waitFor(() => expect(hook.result.current.phase).toBe("done")); });
    expect(hook.result.current.generatedCount).toBe(2);
  });

  it("execute pastes safe scripts, bumps executedCount, and clears isNew", async () => {
    const { hook, spies } = mount();
    await act(async () => { hook.result.current.execute(hook.result.current.visible[0]); });
    expect(hook.result.current.pendingConfirm).toBeNull();
    expect(hook.result.current.visible[0].executedCount).toBe(1);
    expect(hook.result.current.visible[0].isNew).toBe(false);
    expect(hook.result.current.visible[0].title).toBe("T1");
    expect(spies.update).toHaveBeenCalled();
  });

  it("execute routes risky scripts through the confirm dialog", () => {
    const { hook, onRunCommand } = mount();
    const risky = qs("r", { script: "sudo systemctl restart nginx", riskHint: "restarts nginx" });
    act(() => hook.result.current.execute(risky));
    expect(hook.result.current.pendingConfirm?.id).toBe("r");
    expect(onRunCommand).not.toHaveBeenCalled();
    act(() => hook.result.current.resolveConfirm("run"));
    expect(onRunCommand).toHaveBeenCalledWith("sudo systemctl restart nginx");
    expect(hook.result.current.pendingConfirm).toBeNull();
    act(() => hook.result.current.execute(risky));
    act(() => hook.result.current.resolveConfirm("cancel"));
    expect(onRunCommand).toHaveBeenCalledTimes(1);
  });

  it("dismiss hides, offers undo, and restore works", async () => {
    const { hook } = mount();
    act(() => hook.result.current.dismiss("1"));
    expect(hook.result.current.poolCount).toBe(3);
    expect(hook.result.current.undo?.kind).toBe("dismiss");
    act(() => hook.result.current.undoLast());
    expect(hook.result.current.poolCount).toBe(4);
  });

  it("collapse persists per host in localStorage", () => {
    const { hook } = mount();
    act(() => hook.result.current.toggleCollapse());
    expect(localStorage.getItem("terminus.quickScripts.collapsed.host-1")).toBe("1");
    act(() => hook.result.current.toggleCollapse());
    expect(localStorage.getItem("terminus.quickScripts.collapsed.host-1")).toBe("0");
  });
});
```

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- useQuickScripts.test`
预期: FAIL —— 找不到 hook。

- [ ] **步骤 3:实现 hook**

新建 `src/renderer/features/ai/useQuickScripts.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classify } from "@shared/shell-risk";
import type { QuickScript, QuickScriptStatus } from "@shared/ipc/quickscripts/types";
import type { QuickScriptGenPhase } from "./QuickScriptsSection";
import type { QuickScriptApi } from "./deterministicQuickScriptApi";

export const QUICK_SLASH_TRIGGERS = ["/生成快捷指令", "/quick-script"] as const;

export const QUICK_SLASH_COMMANDS = [
  { token: "/生成快捷指令", hint: "Recap this session · generate quick scripts" },
] as const;

const DONE_RESET_MS = 4_800;
const UNDO_TTL_MS = 5_200;
const WINDOW_SIZE = 3;

export type QuickScriptUndo = {
  kind: "dismiss" | "delete";
  qs: QuickScript;
  prevStatus?: QuickScriptStatus;
};

export function useQuickScripts({
  sshSessionId,
  hostId,
  api,
  onRunCommand,
}: {
  sshSessionId?: string;
  hostId?: string;
  api: QuickScriptApi;
  onRunCommand?: (command: string) => void;
}) {
  const [scripts, setScripts] = useState<QuickScript[]>([]);
  const [phase, setPhase] = useState<QuickScriptGenPhase>("idle");
  const [generatedCount, setGeneratedCount] = useState(0);
  const [collapsedKey, setCollapsedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [offset, setOffset] = useState(0);
  const [undo, setUndo] = useState<QuickScriptUndo | null>(null);
  const [editing, setEditing] = useState<QuickScript | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<QuickScript | null>(null);
  const apiRef = useRef(api);
  useEffect(() => { apiRef.current = api; }, [api]);

  const collapsedStorageKey = hostId ? `terminus.quickScripts.collapsed.${hostId}` : null;

  // 挂载 / 主机切换时加载;重置轮换与生成反馈。
  useEffect(() => {
    if (!hostId) {
      setScripts([]);
      setPhase("idle");
      return;
    }
    let cancelled = false;
    void apiRef.current.list(hostId).then((rows) => {
      if (!cancelled) setScripts(rows);
    }).catch(() => {
      if (!cancelled) setScripts([]);
    });
    setCollapsed(collapsedStorageKey ? localStorage.getItem(collapsedStorageKey) === "1" : false);
    setCollapsedKey(collapsedStorageKey);
    setOffset(0);
    setPhase("idle");
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  useEffect(() => {
    if (!collapsedKey) return;
    localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
  }, [collapsed, collapsedKey]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_TTL_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  const refresh = useCallback(async () => {
    if (!hostId) return;
    try {
      setScripts(await apiRef.current.list(hostId));
    } catch {
      /* 保持当前列表 */
    }
  }, [hostId]);

  const generate = useCallback(async () => {
    if (!sshSessionId || phase === "working") return;
    setPhase("working");
    setCollapsed(false);
    try {
      const result = await apiRef.current.generate({ sshSessionId });
      if (result.mode === "empty") {
        setPhase("empty");
        return;
      }
      await refresh();
      setGeneratedCount(result.createdCount);
      setPhase("done");
      setTimeout(() => setPhase((current) => (current === "done" ? "idle" : current)), DONE_RESET_MS);
    } catch {
      setPhase("failed");
    }
  }, [sshSessionId, phase, refresh]);

  const run = useCallback((qs: QuickScript) => {
    onRunCommand?.(qs.script);
    setScripts((prev) =>
      prev.map((row) => (row.id === qs.id ? { ...row, executedCount: row.executedCount + 1, isNew: false } : row)),
    );
    void apiRef.current.update(qs.id, { executedCount: qs.executedCount + 1 }).catch(() => undefined);
  }, [onRunCommand]);

  const execute = useCallback((qs: QuickScript) => {
    const verdict = classify(qs.script);
    if (verdict.kind === "allow") run(qs);
    else setPendingConfirm(qs);
  }, [run]);

  const resolveConfirm = useCallback((decision: "run" | "cancel") => {
    const qs = pendingConfirm;
    setPendingConfirm(null);
    if (decision === "run" && qs) run(qs);
  }, [pendingConfirm, run]);

  const pin = useCallback((id: string) => {
    const target = scripts.find((row) => row.id === id);
    if (!target) return;
    const nextStatus = target.status === "pinned" ? "suggested" : "pinned";
    setScripts((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status: nextStatus } : row)),
    );
    void apiRef.current.update(id, { status: nextStatus }).catch(() => undefined);
  }, [scripts]);

  const dismiss = useCallback((id: string) => {
    const qs = scripts.find((row) => row.id === id);
    if (!qs) return;
    setScripts((prev) => prev.filter((row) => row.id !== id));
    setUndo({ kind: "dismiss", qs, prevStatus: qs.status });
    void apiRef.current.update(id, { status: "dismissed" }).catch(() => undefined);
  }, [scripts]);

  const remove = useCallback((id: string) => {
    const qs = scripts.find((row) => row.id === id);
    if (!qs) return;
    setScripts((prev) => prev.filter((row) => row.id !== id));
    setEditing(null);
    setUndo({ kind: "delete", qs });
    void apiRef.current.delete(id).catch(() => undefined);
  }, [scripts]);

  const saveEdit = useCallback((id: string, draft: { title: string; script: string }) => {
    setScripts((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, title: draft.title.trim() || row.title, script: draft.script, updatedAt: new Date().toISOString() }
          : row,
      ),
    );
    setEditing(null);
    void apiRef.current.update(id, draft).catch(() => undefined);
  }, []);

  const undoLast = useCallback(() => {
    const entry = undo;
    if (!entry) return;
    if (entry.kind === "delete") {
      setScripts((prev) => [...prev, entry.qs]);
      void refresh(); // 存储中的记录已删,撤销仅在本地恢复本次面板会话
    } else {
      setScripts((prev) => [...prev, { ...entry.qs, status: entry.prevStatus ?? "suggested" }]);
      void apiRef.current.update(entry.qs.id, { status: entry.prevStatus ?? "suggested" }).catch(() => undefined);
    }
    setUndo(null);
  }, [undo, refresh]);

  const sorted = useMemo(
    () =>
      [...scripts].sort(
        (a, b) =>
          (a.status === "pinned" ? 0 : 1) - (b.status === "pinned" ? 0 : 1) ||
          b.confidence - a.confidence ||
          b.executedCount - a.executedCount,
      ),
    [scripts],
  );
  const visible = useMemo(
    () =>
      sorted.length <= WINDOW_SIZE
        ? sorted
        : Array.from({ length: WINDOW_SIZE }, (_, i) => sorted[(offset + i) % sorted.length]),
    [sorted, offset],
  );
  const shuffle = useCallback(() => {
    setOffset((current) => (sorted.length > WINDOW_SIZE ? (current + WINDOW_SIZE) % sorted.length : 0));
  }, [sorted.length]);

  return {
    scripts, visible, poolCount: sorted.length, hasMore: sorted.length > WINDOW_SIZE,
    phase, generatedCount, collapsed,
    toggleCollapse: () => setCollapsed((value) => !value),
    shuffle, generate, execute, pendingConfirm, resolveConfirm,
    pin, dismiss, remove, saveEdit, editing, setEditing,
    undo, undoLast, refresh,
  };
}
```

关于删除的 `undoLast` 说明:确定性 API 没有 create——撤销后该行先在本地恢复,下一次 refresh 会将其移除。即**删除的撤销仅在当前面板会话内有效**(存储记录已删)。原型行为相同(原型的 localStorage 列表本身就是存储)。若不可接受,可把 `remove` 改为 `update({status:"dismissed"})` + 单独确认后真删——保持现状即可,测试只断言本地恢复。

- [ ] **步骤 4:运行测试、类型检查、提交**

运行: `pnpm test -- useQuickScripts.test` → PASS。`pnpm typecheck` → PASS。

```bash
git add src/renderer/features/ai/useQuickScripts.ts tests/renderer/features/ai/useQuickScripts.test.tsx
git commit -m "feat(quickscripts): add useQuickScripts state hook with risk-gated execution"
```

---

## 任务 9:面板集成——`AiComposer`(assistant-ui slash)、分区、对话框、toast、执行接线

> **本任务是 assistant-ui 机制的落地点**:slash 菜单由 `unstable_useSlashCommandAdapter` + `ComposerTriggerPopover` 提供(见「前端实现:assistant-ui Slash Commands」),composer 从普通 `<textarea>` 转换为 `ComposerPrimitive` + `LexicalComposerInput`。**不新建** 手写 slash 菜单组件。

**文件:**
- 新建: `src/renderer/features/ai/AiComposer.tsx`(assistant-ui composer + slash adapter + 薄桥 runtime)
- 新建: `src/renderer/features/ai/QuickScriptEditDialog.tsx`
- 新建: `src/renderer/features/ai/QuickScriptConfirmDialog.tsx`
- 新建: `src/renderer/features/ai/QuickScriptToast.tsx`
- 修改: `src/renderer/features/ai/AiAssistantPanel.tsx`(composer 块替换为 `AiComposer`、分区挂载、执行、对话框、toast)
- 修改: `src/renderer/features/shell/TerminalWorkspace.tsx`(约 261 行:传入 `onRunCommand`)
- 修改: `src/renderer/styles/globals.css`(toast keyframes)
- 测试: 扩展 `tests/renderer/features/ai/AiAssistantPanel.test.tsx`

**接口:**
- 消费: 任务 1、6、7、8;`listConnectionHistory`(来自 `@/features/workspace/connectionHistory`,主机解析)。
- 产出: `AiAssistantPanel` 新增两个可选 prop:`quickScriptApi?: QuickScriptApi` 与 `onRunCommand?: (command: string) => void`;`AiComposer { placeholder, shieldLabel, disabled, busy, onSend, onAbort, onGenerate }`。`TerminalWorkspace` 传入 `onRunCommand={runCommandSnippet}`。

- [ ] **步骤 1:编写失败测试(向 `tests/renderer/features/ai/AiAssistantPanel.test.tsx` 追加)**

复用文件中已有的 fixture(`provider`、`agentClient(run)`、`snapshot(messages)`、`assistant(text, ts)`)。新增导入:

```tsx
import { listConnectionHistory, recordConnectionAttempt, markConnectionConnected } from "@/features/workspace/connectionHistory";
import { createDeterministicQuickScriptApi } from "@/features/ai/deterministicQuickScriptApi";
```

新增测试(放入现有 `describe` 内):

```tsx
function seedHost(sessionId = "ssh-1") {
  const historyId = recordConnectionAttempt({ hostId: "host-1", host: "web-prod-01", port: 22, username: "deploy" });
  markConnectionConnected(historyId, sessionId);
}

it("intercepts the typed /生成快捷指令 trigger without creating a message", async () => {
  seedHost();
  const client = agentClient(() => snapshot([]));
  const quickApi = createDeterministicQuickScriptApi([]);
  const generate = vi.spyOn(quickApi, "generate");
  render(
    <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={client} quickScriptApi={quickApi} />,
  );
  const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  await userEvent.type(input, "/生成快捷指令");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(generate).toHaveBeenCalled());
  expect(client.prompt).not.toHaveBeenCalled();
  expect(screen.queryAllByRole("listitem")).toHaveLength(0); // 未进入消息流
});

it("selecting the slash command fires generation and never sends to the model", async () => {
  seedHost();
  const client = agentClient(() => snapshot([]));
  const quickApi = createDeterministicQuickScriptApi([]);
  const generate = vi.spyOn(quickApi, "generate");
  render(
    <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={client} quickScriptApi={quickApi} />,
  );
  const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  await userEvent.type(input, "/");
  expect(await screen.findByRole("listbox", { name: "Slash commands" })).toBeVisible();
  await userEvent.click(screen.getByRole("option", { name: /生成快捷指令/ }));
  await waitFor(() => expect(generate).toHaveBeenCalled());
  expect(client.prompt).not.toHaveBeenCalled();
  expect(input).toHaveTextContent(""); // removeOnExecute 剥离了触发词
});

it("shows suggestion cards after generation and executes them into the terminal", async () => {
  seedHost();
  const onRunCommand = vi.fn();
  const quickApi = createDeterministicQuickScriptApi([]);
  render(
    <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={agentClient(() => snapshot([]))} quickScriptApi={quickApi} onRunCommand={onRunCommand} />,
  );
  const input = await screen.findByRole("textbox", { name: "Message AI assistant" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
  await userEvent.type(input, "/quick-script");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  const card = await screen.findByRole("button", { name: /List services/ });
  await userEvent.click(card);
  expect(onRunCommand).toHaveBeenCalledWith("systemctl list-units --type=service");
});

it("routes a risky script through the confirmation dialog", async () => {
  seedHost();
  const onRunCommand = vi.fn();
  const risky: QuickScript = {
    id: "qs-risk", hostId: "host-1", sessionId: "s", title: "Restart nginx",
    script: "sudo systemctl restart nginx", description: null, sourceUsageCount: 2,
    sourceSuccessCount: 2, executedCount: 0, confidence: 0.9, riskHint: "restarts nginx",
    status: "suggested", isNew: false, mode: "llm", createdAt: "", updatedAt: "",
  };
  const quickApi = createDeterministicQuickScriptApi([risky]);
  render(
    <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-1" providerApi={providerApi} agentClient={agentClient(() => snapshot([]))} quickScriptApi={quickApi} onRunCommand={onRunCommand} />,
  );
  const card = await screen.findByRole("button", { name: /Restart nginx/ });
  await userEvent.click(card);
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toBeVisible();
  expect(onRunCommand).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /Execute/ }));
  expect(onRunCommand).toHaveBeenCalledWith("sudo systemctl restart nginx");
});

it("does not render the section when the host cannot be resolved", async () => {
  render(
    <AiAssistantPanel onClose={() => undefined} sshSessionId="ssh-unknown" providerApi={providerApi} agentClient={agentClient(() => snapshot([]))} quickScriptApi={createDeterministicQuickScriptApi()} />,
  );
  await screen.findByRole("textbox", { name: "Message AI assistant" });
  expect(screen.queryByLabelText("Quick scripts")).toBeNull();
});
```

**同时迁移现有测试**(Lexical contenteditable 不接受 `fireEvent.change`,也没有 disabled 语义):
- 把所有 `fireEvent.change(input, { target: { value } })` 改为 `await userEvent.clear(input); await userEvent.type(input, value);`(或直接 `userEvent.type`);
- 把 `waitFor(() => expect(input).toBeEnabled())` 改为 `waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled())`;
- `getByRole("textbox", { name: "Message AI assistant" })` 选择器**不变**(labelEditor 技巧保留同名)。
现有流式/确认卡测试(AiAssistantPanel.test.tsx 140-257 行)只改输入驱动方式,事件断言全部保持。

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- AiAssistantPanel.test`
预期: FAIL —— 新 prop/组件缺失;现有测试因输入驱动方式不兼容而失败(一并迁移)。

- [ ] **步骤 3:创建 `AiComposer`(assistant-ui composer + slash 命令)**

新建 `src/renderer/features/ai/AiComposer.tsx`:

```tsx
import {
  ComposerPrimitive,
  useLocalRuntime,
  unstable_useSlashCommandAdapter,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";
import { Send, ShieldCheck, Sparkles, Square } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { ComposerTriggerPopover } from "@/components/assistant-ui/composer-trigger-popover";
import { QUICK_SLASH_COMMANDS } from "./useQuickScripts";

export type AiComposerProps = {
  placeholder: string;
  shieldLabel: string;
  disabled: boolean;
  busy: boolean;
  onSend: (text: string) => void;   // 面板 send(text):slash 拦截 / steer / prompt
  onAbort: () => void;
  onGenerate: () => void;           // 快捷指令生成(slash 命令 execute)
};

export function AiComposer({ placeholder, shieldLabel, disabled, busy, onSend, onAbort, onGenerate }: AiComposerProps) {
  const sendRef = useRef(onSend);
  sendRef.current = onSend;

  // 薄桥(AgentPage 模式):assistant-ui 拥有输入与 slash 浮层;真正的发送
  // 路径——slash 拦截、运行中 steer、流式——全部留在面板。runtime 的内部
  // 线程从不渲染。生成器立即结束,因此面板 busy 期间 composer 仍可提交,
  // 运行中按 Enter 依旧到达 send() → agentClient.steer(steer 交互天然保留)。
  const runtime = useLocalRuntime(
    useMemo<ChatModelAdapter>(() => ({
      async *run({ messages }) {
        const text = (messages.at(-1)?.content ?? [])
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("\n")
          .trim();
        if (text) sendRef.current(text);
        yield {
          content: [{ type: "text", text: "" }],
          status: { type: "complete", reason: "stop" },
        };
      },
    }), []),
  );

  const slash = unstable_useSlashCommandAdapter({
    removeOnExecute: true, // PRD F1 —— 触发词永不进入消息流
    fallbackIcon: (props) => <Sparkles {...props} />,
    commands: [
      ...QUICK_SLASH_COMMANDS.map((command) => ({
        id: command.token.slice(1),
        label: command.token,
        description: command.hint,
        icon: "sparkles",
        execute: () => onGenerate(),
      })),
      { id: "quick-script", label: "/quick-script", description: "Alias of /生成快捷指令", icon: "sparkles", execute: () => onGenerate() },
    ],
  });

  // 保持可访问名称稳定,现有测试选择器继续有效(MentionComposer 同款技巧)。
  const labelEditor = useCallback((element: HTMLDivElement | null) => {
    element?.querySelector<HTMLElement>(".aui-lexical-input")?.setAttribute("aria-label", "Message AI assistant");
  }, []);

  const slashHintRef = useRef<HTMLButtonElement | null>(null);

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <div className="relative">
        <ComposerTriggerPopover char="/" variant="flat" {...slash} itemsLabel="Slash commands" />
        <ComposerPrimitive.Root
          className="overflow-hidden rounded-lg border border-graphite bg-obsidian/70 transition-colors focus-within:border-smoke"
          aria-busy={busy}
          onSubmit={(event) => {
            if (disabled) event.preventDefault();
          }}
        >
          <LexicalComposerInput
            ref={labelEditor}
            autoFocus={false}
            placeholder={placeholder}
            className="scroll-thin relative max-h-32 min-h-[76px] min-w-0 overflow-y-auto bg-transparent px-3 py-2.5 pr-9 text-[13px] leading-relaxed text-mist outline-hidden [&_.aui-lexical-input]:min-h-14 [&_.aui-lexical-input]:outline-hidden [&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:left-3 [&_.aui-lexical-placeholder]:top-2.5 [&_.aui-lexical-placeholder]:text-fog/70"
          />
          <div className="flex items-center justify-between gap-2 border-t border-graphite/80 px-2.5 py-2">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] text-fog">
              <ShieldCheck size={12} />
              {shieldLabel}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {!busy ? (
                <>
                  <button
                    ref={slashHintRef}
                    type="button"
                    title="Quick scripts — recap this session"
                    className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[10.5px] text-fog/80 transition-colors hover:bg-white/5 hover:text-mist"
                    onClick={() => {
                      const root = slashHintRef.current?.closest("div.relative");
                      const editable = root?.querySelector<HTMLElement>(".aui-lexical-input");
                      editable?.focus();
                      // Electron/Chromium:insertText 像真实按键一样驱动 Lexical 并打开浮层。
                      // 已安装版本无公开 composer setValue(已验证),这是可靠的等价物;
                      // execCommand 不可用时优雅降级为仅聚焦。
                      document.execCommand("insertText", false, "/");
                    }}
                  >
                    <span className="font-mono text-mist/80">/</span>
                    Quick scripts
                  </button>
                  <span className="text-fog/40">·</span>
                </>
              ) : null}
              {busy ? (
                <button
                  type="button"
                  aria-label="Abort"
                  onClick={onAbort}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-coral-red/45 px-2.5 text-[11px] text-coral-red transition-colors hover:bg-coral-red/12 hover:text-coral-red"
                >
                  <Square size={13} /> Abort
                </button>
              ) : (
                <ComposerPrimitive.Send
                  disabled={disabled}
                  aria-label="Send"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-acid-lime px-2.5 text-[11px] font-semibold text-void outline-hidden transition hover:brightness-105 disabled:bg-graphite disabled:text-fog"
                >
                  <span>Send</span>
                  <Send size={13} />
                </ComposerPrimitive.Send>
              )}
            </span>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
}
```

实现说明:
- `ComposerTriggerPopover` 是应用本地组件,已支持 action 行为(`{ action: { onExecute, removeOnExecute } }`),hook 返回值 `{...slash}` 直接展开(官方指南的一行接线)。键盘导航(↑↓/Enter/Esc)内建。
- 两条命令条目:`/生成快捷指令`(来自 `QUICK_SLASH_COMMANDS`)+ `/quick-script` 别名,浮层过滤按 label 前缀匹配,两条都覆盖。
- runtime 的内部线程会随每次提交累积不可见的消息——仅内存、不渲染,可接受(与 AgentPage 相同形态)。

- [ ] **步骤 4:创建对话框与 toast 组件**

(a) `src/renderer/features/ai/QuickScriptEditDialog.tsx`(原型编辑对话框;覆盖层模式对齐 `AiProvidersSection` 现有弹窗——`pop-in` + `border-smoke bg-carbon`):

```tsx
import { useEffect, useState } from "react";
import { Pencil, Server, Trash2 } from "lucide-react";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

export function QuickScriptEditDialog({
  qs,
  hostLabel,
  onSave,
  onDelete,
  onClose,
}: {
  qs: QuickScript;
  hostLabel: string;
  onSave: (draft: { title: string; script: string }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(qs.title);
  const [script, setScript] = useState(qs.script);
  const dirty = title.trim() !== qs.title || script !== qs.script;
  const canSave = dirty && title.trim().length > 0 && script.trim().length > 0;
  const pct = qs.sourceUsageCount ? Math.round((qs.sourceSuccessCount / qs.sourceUsageCount) * 100) : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (canSave) onSave({ title, script });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, onClose, onSave, script, title]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="pop-in w-[min(520px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-acid-lime/12 text-acid-lime">
            <Pencil size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">Edit quick script</h2>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Server size={12} />
              On {hostLabel} · Used {qs.sourceUsageCount} times · {pct === null ? "--" : `${pct}%`} success
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-fog" htmlFor="qs-title">Name</label>
            <input
              id="qs-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              spellCheck={false}
              className="w-full rounded-md border border-graphite bg-black/30 px-2.5 py-2 text-[13px] text-mist outline-none transition-colors focus:border-smoke"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-fog" htmlFor="qs-script">Script</label>
            <textarea
              id="qs-script"
              value={script}
              onChange={(event) => setScript(event.target.value)}
              spellCheck={false}
              rows={6}
              className="scroll-thin w-full resize-none rounded-md border border-graphite bg-black/50 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-mist outline-none transition-colors focus:border-smoke"
            />
            <p className="m-0 mt-1.5 text-[11px] text-fog/80">
              Multi-line scripts are written to the terminal as one bracketed paste, never split by the shell.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onDelete(qs.id)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px] text-coral-red transition-colors hover:bg-coral-red/12"
          >
            <Trash2 size={13} />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">⌘⏎</kbd> Save
            </span>
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => canSave && onSave({ title, script })}
              disabled={!canSave}
              className={
                "rounded-md px-4 py-2 text-[13px] font-semibold tracking-tight transition-colors " +
                (canSave ? "bg-acid-lime text-void hover:brightness-105" : "cursor-default bg-graphite text-fog")
              }
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

(b) `src/renderer/features/ai/QuickScriptConfirmDialog.tsx`(原型确认对话框;`role="alertdialog"` 与面板现有确认卡 `AiAssistantPanel.tsx:525` 一致):

```tsx
import { useEffect } from "react";
import { Server, Terminal, TriangleAlert } from "lucide-react";
import type { QuickScript } from "@shared/ipc/quickscripts/types";

export function QuickScriptConfirmDialog({
  qs,
  hostLabel,
  reason,
  onResolve,
}: {
  qs: QuickScript;
  hostLabel: string;
  reason?: string;
  onResolve: (decision: "run" | "cancel") => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve("cancel");
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onResolve("run");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm quick script execution"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/75 p-4 backdrop-blur-sm"
      onMouseDown={() => onResolve("cancel")}
    >
      <div
        className="pop-in w-[min(560px,92vw)] overflow-hidden rounded-xl border border-smoke bg-carbon shadow-[0_24px_80px_rgb(0_0_0/0.6)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-graphite px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-coral-red/12 text-coral-red">
            <TriangleAlert size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="m-0 text-[15px] font-semibold tracking-tight text-paper">Run quick script</h2>
              <span className="rounded-pill bg-coral-red/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-coral-red">
                high
              </span>
            </div>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-fog">
              <Server size={12} />
              On {hostLabel} · from “{qs.title}” — approved scripts are written to this terminal.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fog">
              <Terminal size={12} />
              Script
            </div>
            <pre className="scroll-thin m-0 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md border border-smoke bg-black/50 px-2.5 py-2 font-mono text-[12.5px] leading-relaxed text-mist">
              {qs.script}
            </pre>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-yellow-400">
              <TriangleAlert size={12} />
              Risk
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-mist">
              {qs.riskHint ?? reason ?? "This script contains privileged or destructive operations."}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-graphite bg-obsidian/40 px-5 py-3.5">
          <button type="button" onClick={() => onResolve("cancel")} className="rounded-md px-3 py-2 text-[13px] text-fog transition-colors hover:bg-white/5 hover:text-mist">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-fog sm:inline">
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">⌘⏎</kbd> Run ·{" "}
              <kbd className="rounded border border-graphite bg-carbon px-1 py-px font-sans text-[10px] text-fog">Esc</kbd> Cancel
            </span>
            <button
              type="button"
              autoFocus
              onClick={() => onResolve("run")}
              className="rounded-md bg-acid-lime px-4 py-2 text-[13px] font-semibold tracking-tight text-void transition hover:brightness-105"
            >
              Execute
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

(c) `src/renderer/features/ai/QuickScriptToast.tsx`:

```tsx
import { Trash2, X } from "lucide-react";
import type { QuickScriptUndo } from "./useQuickScripts";

export function QuickScriptToast({ undo, onUndo }: { undo: QuickScriptUndo | null; onUndo: () => void }) {
  if (!undo) return null;
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-center">
      <div className="pop-in pointer-events-auto relative flex w-full max-w-[340px] items-center gap-2.5 overflow-hidden rounded-lg border border-smoke bg-carbon/95 px-3 py-2.5 shadow-[0_14px_44px_rgb(0_0_0/0.55)] backdrop-blur">
        {undo.kind === "delete" ? <Trash2 size={13} className="shrink-0 text-fog" /> : <X size={13} className="shrink-0 text-fog" />}
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-mist">
          {undo.kind === "delete" ? "Deleted" : "Dismissed"} “{undo.qs.title}”
          {undo.kind === "dismiss" ? " — it won’t appear again" : ""}
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-md border border-graphite px-2 py-1 text-[11px] text-mist transition-colors hover:border-smoke"
        >
          Undo
        </button>
        <span className="qs-toast-bar absolute bottom-0 left-0 h-[2px] bg-acid-lime/70" />
      </div>
    </div>
  );
}
```

(d) `src/renderer/styles/globals.css` —— 在现有 keyframes 旁(`pop-in` 之后,约 276 行)追加:

```css
@keyframes qs-toast-bar { from { width: 100%; } to { width: 0%; } }
@media (prefers-reduced-motion: no-preference) {
  .qs-toast-bar { animation: qs-toast-bar 5.2s linear forwards; }
}
```

- [ ] **步骤 5:集成进 `AiAssistantPanel.tsx`**

(a) 新增导入与 prop:

```tsx
import { listConnectionHistory } from "@/features/workspace/connectionHistory";
import { classify } from "@shared/shell-risk";
import { quickScriptApi as defaultQuickScriptApi } from "./quickScriptApi";
import type { QuickScriptApi } from "./deterministicQuickScriptApi";
import { AiComposer } from "./AiComposer";
import { QuickScriptsSection } from "./QuickScriptsSection";
import { QuickScriptEditDialog } from "./QuickScriptEditDialog";
import { QuickScriptConfirmDialog } from "./QuickScriptConfirmDialog";
import { QuickScriptToast } from "./QuickScriptToast";
import { QUICK_SLASH_TRIGGERS, useQuickScripts } from "./useQuickScripts";
```

```tsx
export type AiAssistantPanelProps = {
  onClose: () => void;
  sshSessionId?: string;
  providerApi?: AiConfigApi;
  agentClient?: AiAgentClient;
  quickScriptApi?: QuickScriptApi;                 // 新增
  onRunCommand?: (command: string) => void;        // 新增
};
```

(b) 主机解析 + hook(放在现有 state 声明之后):

```tsx
const quickApi = injectedQuickScriptApi ?? defaultQuickScriptApi;
const hostEntry = useMemo(
  () => (sshSessionId ? listConnectionHistory().find((entry) => entry.sessionId === sshSessionId) : undefined),
  [sshSessionId],
);
const quick = useQuickScripts({
  sshSessionId,
  hostId: hostEntry?.hostId,
  api: quickApi,
  onRunCommand,
});
const hostLabel = hostEntry ? `${hostEntry.username}@${hostEntry.host}` : "";
```

(c) **`send` 重构为 `send(text: string)`**——composer 状态不再由面板持有(删除 `input` state 与所有 `setInput` 调用);slash 拦截保留在发送路径开头:

```tsx
const send = (text: string): void => {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (QUICK_SLASH_TRIGGERS.includes(trimmed)) {
    if (!sshSessionId || !agentIdRef.current) {
      setError("Start an AI conversation in this terminal before generating quick scripts.");
      return;
    }
    setError(undefined);
    void quick.generate();
    return;
  }
  const agentId = agentIdRef.current;
  if (!agentId) return;
  setError(undefined);
  if (running) {
    void agentClient.steer(agentId, trimmed).catch(() => setRunning(false));  // 运行中插话,语义与现状一致
    return;
  }
  setRunning(true);
  void agentClient.prompt(agentId, trimmed, (event) => {
    applyAgentEvent(enrichConfirmationDetails(event, pendingSshCommandRef), ...);
  }).then((snapshot) => { applyStreamingSnapshot(snapshot, ...); loadConversations(); },
         () => { setRunning(false); setError("The AI request failed."); });
};
```

(对照 `AiAssistantPanel.tsx:281-312` 的现有函数形态微调;steer/prompt 分支保持原样,仅输入来源从 state 改为参数。)

(d) **composer 块替换**——把整个 composer 区(`AiAssistantPanel.tsx` 约 447-496 行:`<div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">` 内的 textarea 容器 + 底部按钮行)替换为:

```tsx
<div className="shrink-0 border-t border-graphite bg-carbon px-3 pb-2.5 pt-3">
  <AiComposer
    placeholder={`Describe what you want done on ${hostEntry?.host ?? "this host"}…`}
    shieldLabel={selectedProvider?.providerKind === "ollama" ? "Local · keyless" : "Cloud · app vault"}
    disabled={!agentIdRef.current}
    busy={busy}
    onSend={send}
    onAbort={() => {
      const agentId = agentIdRef.current;
      if (agentId) void agentClient.abort(agentId);
    }}
    onGenerate={() => void quick.generate()}
  />
  {sshSessionId && providers.length > 0 ? (
    /* 供应商选择行原样保留(约 497-522 行),kbd 提示留在该行右侧 */
  ) : null}
</div>
```

(e) 主体重构(约 404-445 行)。最后的 `else` 分支(消息列表)改为 fragment:分区挂在消息/hero 之上,且仅在主机可解析时;分区显隐条件 `quick.poolCount > 0 || quick.phase !== "idle"`(原型 `qsShow`):

```tsx
) : (
  <>
    {hostEntry && (quick.poolCount > 0 || quick.phase !== "idle") ? (
      <QuickScriptsSection
        hostName={hostEntry.host}
        visible={quick.visible}
        poolCount={quick.poolCount}
        phase={quick.phase}
        generatedCount={quick.generatedCount}
        collapsed={quick.collapsed}
        onToggleCollapse={quick.toggleCollapse}
        onShuffle={quick.shuffle}
        onExecute={quick.execute}
        onPin={quick.pin}
        onEdit={quick.setEditing}
        onDismiss={quick.dismiss}
      />
    ) : null}
    {messages.length === 0 ? (
      /* 既有 hero 空态块,原样保留 */
    ) : (
      /* 既有消息列表块,原样保留 */
    )}
  </>
)}
```

(f) toast 与对话框——`<aside>` 内(已有 `relative`),composer 区之后:

```tsx
<QuickScriptToast undo={quick.undo} onUndo={quick.undoLast} />
```

面板末尾(现有 `confirmation` 覆盖层旁):

```tsx
{quick.editing ? (
  <QuickScriptEditDialog
    qs={quick.editing}
    hostLabel={hostLabel}
    onSave={(draft) => quick.saveEdit(quick.editing!.id, draft)}
    onDelete={quick.remove}
    onClose={() => quick.setEditing(null)}
  />
) : null}
{quick.pendingConfirm ? (
  (() => {
    const verdict = classify(quick.pendingConfirm.script);
    return (
      <QuickScriptConfirmDialog
        qs={quick.pendingConfirm}
        hostLabel={hostLabel}
        reason={verdict.kind === "needsConfirmation" ? verdict.reason : undefined}
        onResolve={quick.resolveConfirm}
      />
    );
  })()
) : null}
```

(g) `src/renderer/features/shell/TerminalWorkspace.tsx` —— 在 `<AiAssistantPanel …>` 调用处(约 261-272 行)加:

```tsx
onRunCommand={runCommandSnippet}
```

(`runCommandSnippet` 已存在于 101-109 行,负责向活动 pane 粘贴并 `\r` 回车、聚焦终端——这就是执行路径。)

- [ ] **步骤 6:运行测试、类型检查、提交**

运行: `pnpm test -- AiAssistantPanel.test && pnpm test -- useQuickScripts.test && pnpm test -- QuickScriptsSection.test` → PASS。运行 `pnpm typecheck` → PASS。

```bash
git add src/renderer/features/ai/AiComposer.tsx src/renderer/features/ai/QuickScriptEditDialog.tsx \
  src/renderer/features/ai/QuickScriptConfirmDialog.tsx src/renderer/features/ai/QuickScriptToast.tsx \
  src/renderer/features/ai/AiAssistantPanel.tsx src/renderer/features/shell/TerminalWorkspace.tsx \
  src/renderer/styles/globals.css tests/renderer/features/ai/AiAssistantPanel.test.tsx
git commit -m "feat(ai): integrate quick scripts with assistant-ui slash commands into the AI panel"
```

---

## 任务 10(P1):设置——AI 生成开关 + 清除全部

**文件:**
- 新建: `src/renderer/features/ai/quickScriptPreferences.ts`
- 修改: `src/renderer/features/ai/useQuickScripts.ts`(generate 传入 `useLlm`)
- 修改: `src/renderer/features/settings/PreferencesWindow.tsx`(AI 区块新增)
- 测试: `tests/renderer/features/ai/quickScriptPreferences.test.ts`

**接口:**
- 消费: 任务 5 的 `quickScriptApi.clearData`。
- 产出: `loadQuickScriptPreferences(): { useAiGeneration: boolean }`、`saveQuickScriptPreferences(patch)`、`clearQuickScriptData(): Promise<void>`。

- [ ] **步骤 1:编写失败测试**(`tests/renderer/features/ai/quickScriptPreferences.test.ts`):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultQuickScriptPreferences,
  loadQuickScriptPreferences,
  saveQuickScriptPreferences,
} from "@/features/ai/quickScriptPreferences";

beforeEach(() => localStorage.clear());

describe("quickScriptPreferences", () => {
  it("defaults to AI generation on", () => {
    expect(loadQuickScriptPreferences()).toEqual(defaultQuickScriptPreferences);
    expect(defaultQuickScriptPreferences.useAiGeneration).toBe(true);
  });
  it("persists partial updates and ignores garbage", () => {
    saveQuickScriptPreferences({ useAiGeneration: false });
    expect(loadQuickScriptPreferences().useAiGeneration).toBe(false);
    localStorage.setItem("terminus.quickScriptsPreferences", "{not json");
    expect(loadQuickScriptPreferences().useAiGeneration).toBe(true);
  });
});
```

- [ ] **步骤 2:运行测试确认失败**

运行: `pnpm test -- quickScriptPreferences.test` → FAIL。

- [ ] **步骤 3:实现**

新建 `src/renderer/features/ai/quickScriptPreferences.ts`(镜像 `terminalPreferences.ts` 的结构——类型、STORAGE_KEY `terminus.quickScriptsPreferences`、默认值、带归一化的 load/save):

```ts
export type QuickScriptPreferences = { useAiGeneration: boolean };

export const defaultQuickScriptPreferences: QuickScriptPreferences = { useAiGeneration: true };

const STORAGE_KEY = "terminus.quickScriptsPreferences";

export function loadQuickScriptPreferences(): QuickScriptPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultQuickScriptPreferences };
    const parsed = JSON.parse(raw) as Partial<QuickScriptPreferences>;
    return { useAiGeneration: parsed.useAiGeneration !== false };
  } catch {
    return { ...defaultQuickScriptPreferences };
  }
}

export function saveQuickScriptPreferences(preferences: QuickScriptPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* 非致命 */
  }
}

export async function clearQuickScriptData(): Promise<void> {
  const { quickScriptApi } = await import("./quickScriptApi");
  await quickScriptApi.clearData();
}
```

`useQuickScripts.generate` 中把调用改为 `apiRef.current.generate({ sshSessionId, useLlm: loadQuickScriptPreferences().useAiGeneration })`(导入 loader;任务 9 中 hook 测试若有 `toHaveBeenCalledWith({ sshSessionId: "ssh-1" })` 断言,同一提交里改为 `toHaveBeenCalledWith({ sshSessionId: "ssh-1", useLlm: true })`)。

`PreferencesWindow.tsx` 中,找到 AI 区块(`AiProvidersSection` 挂载处 / `"ai"` 区块,`PREF_SECTIONS` 约 46-54 行),按文件既有的区块标记约定在其后追加:

```tsx
<div className="mt-4 rounded-lg border border-graphite bg-obsidian/40 p-3.5">
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="m-0 text-[13px] font-medium text-mist">Quick scripts</p>
      <p className="m-0 mt-0.5 text-[11.5px] leading-relaxed text-fog">
        Generate quick scripts from AI sessions using your AI provider. Off = fully offline rules mode.
      </p>
    </div>
    <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-fog">
      <input
        type="checkbox"
        aria-label="Use AI generation for quick scripts"
        checked={quickScriptUseAi}
        onChange={(event) => setQuickScriptUseAi(event.target.checked)}
      />
      AI generation
    </label>
  </div>
  <button
    type="button"
    className="mt-3 rounded-md border border-coral-red/40 px-2.5 py-1.5 text-[12px] text-coral-red transition-colors hover:bg-coral-red/12"
    onClick={() => void clearQuickScriptData().then(() => setQuickScriptCleared(true)).catch(() => undefined)}
  >
    Clear all quick script data
  </button>
  {quickScriptCleared ? <span className="ml-2 text-[11px] text-pulse-green">Cleared.</span> : null}
</div>
```

(`const [quickScriptUseAi, setQuickScriptUseAi] = useState(loadQuickScriptPreferences().useAiGeneration);`,变更时 `saveQuickScriptPreferences`;若该文件已有 checkbox/switch 原语,优先复用而非裸 `<input type="checkbox">`;`quickScriptCleared` 为局部 state。)

- [ ] **步骤 4:运行测试、类型检查、提交**

运行: `pnpm test -- quickScriptPreferences.test && pnpm test -- AiAssistantPanel.test` → PASS。

```bash
git add src/renderer/features/ai/quickScriptPreferences.ts src/renderer/features/ai/useQuickScripts.ts \
  src/renderer/features/settings/PreferencesWindow.tsx \
  tests/renderer/features/ai/quickScriptPreferences.test.ts tests/renderer/features/ai/useQuickScripts.test.tsx
git commit -m "feat(quickscripts): add settings toggle for AI generation and clear-all"
```

---

## 任务 11(P1):另存为全局命令片段

**文件:**
- 修改: `src/renderer/features/ai/QuickScriptEditDialog.tsx`(底部按钮)
- 测试: 扩展 `tests/renderer/features/ai/AiAssistantPanel.test.tsx`

**接口:**
- 消费: `createCommandSnippet(name, command)`(来自 `@/features/shell/commandSnippets`,localStorage 片段池;CommandDrawer 读取它)。

- [ ] **步骤 1:编写失败测试**

追加:打开某张卡片的编辑对话框(悬停操作 Edit),点击 "Save as snippet",断言 `JSON.parse(localStorage.getItem("terminus.commandSnippets"))` 含 `{ name: <title>, command: <script> }`,且片段变更事件已广播(监听 `subscribeCommandSnippets` 的 spy)。

- [ ] **步骤 2:运行测试确认失败** → FAIL(按钮不存在)。

- [ ] **步骤 3:实现**

`QuickScriptEditDialog` 底部,Delete 与右侧按钮组之间加入:

```tsx
<button
  type="button"
  onClick={() => onSaveSnippet?.({ title: qs.title, script: qs.script })}
  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[12.5px] text-fog transition-colors hover:bg-white/5 hover:text-mist"
>
  <BookmarkPlus size={13} />
  Save as snippet
</button>
```

新增可选 prop `onSaveSnippet?: (draft: { title: string; script: string }) => void`(缺省时隐藏)。面板接线:

```tsx
onSaveSnippet={(draft) => {
  createCommandSnippet(draft.title.trim() || draft.script.split("\n")[0], draft.script);
}}
```

(从 `@/features/shell/commandSnippets` 导入 `createCommandSnippet`;满足 PRD F8 P1——无需 IPC,见偏差 #3。)

- [ ] **步骤 4:运行测试、类型检查、提交**

运行: `pnpm test -- AiAssistantPanel.test` → PASS。`pnpm typecheck` → PASS。

```bash
git add src/renderer/features/ai/QuickScriptEditDialog.tsx src/renderer/features/ai/AiAssistantPanel.tsx tests/renderer/features/ai/AiAssistantPanel.test.tsx
git commit -m "feat(quickscripts): save a quick script as a global command snippet"
```

---

## 任务 12(P1):`quickscript:generated` 广播 + electron 冒烟断言

**文件:**
- 修改: `src/preload/index.cjs`(订阅面)
- 修改: `src/renderer/app/electron.d.ts`(bridge 类型)
- 修改: `src/renderer/features/ai/quickScriptApi.ts`(订阅辅助)
- 修改: `src/renderer/features/ai/AiAssistantPanel.tsx`(订阅 + 刷新)
- 修改: `e2e-electron/smoke.spec.ts`
- 测试: preload 在 vitest 中不可单测;由 electron 冒烟端到端覆盖。

**接口:**
- 产出: `window.terminus.onQuickScriptGenerated(listener): () => void`;`quickScriptApi.subscribeQuickScriptGenerated(listener): () => void`。

- [ ] **步骤 1:preload 桥**

`src/preload/index.cjs` 的 `contextBridge.exposeInMainWorld("terminus", { … })` 对象内追加:

```js
  onQuickScriptGenerated: (onEvent) => {
    const listener = (_event, payload) => onEvent(payload);
    ipcRenderer.on("terminus:quickscript-generated", listener);
    return () => ipcRenderer.removeListener("terminus:quickscript-generated", listener);
  },
```

`src/renderer/app/electron.d.ts` 的 `TerminusDesktopBridge` 类型扩展:

```ts
onQuickScriptGenerated: (onEvent: (event: QuickScriptGeneratedEvent) => void) => () => void;
```

(从 `@shared/ipc/quickscripts/types` 导入类型。)

- [ ] **步骤 2:渲染层订阅**

`quickScriptApi.ts`:

```ts
export function subscribeQuickScriptGenerated(
  listener: (event: QuickScriptGeneratedEvent) => void,
): () => void {
  const unsubscribe = window.terminus?.onQuickScriptGenerated?.(listener);
  return () => unsubscribe?.();
}
```

`AiAssistantPanel` 中(bridge 缺失的测试/浏览器环境优雅降级):

```tsx
useEffect(() => {
  if (!hostEntry?.hostId) return;
  return subscribeQuickScriptGenerated((event) => {
    if (event.hostId === hostEntry.hostId && event.sshSessionId !== sshSessionId) void quick.refresh();
  });
}, [hostEntry?.hostId, sshSessionId]);
```

(用到任务 8 hook 返回的 `refresh`;触发生成的那个面板已从 generate 响应直接刷新,广播只刷新同主机的其他面板。)

- [ ] **步骤 3:electron 冒烟断言**

向 `e2e-electron/smoke.spec.ts` 追加(现有测试内、终端写入断言之后——沿用该文件经 bridge 驱动的风格):

```ts
const quickScripts = await window.evaluate(async () => {
  const bridge = (window as unknown as { terminus: { invoke: (command: string, input: unknown) => Promise<unknown> } }).terminus;
  return bridge.invoke("quickscript_list", { hostId: "host-none" });
});
await expect(quickScripts).toEqual({ ok: true, data: [] });
```

- [ ] **步骤 4:验证并提交**

运行: `pnpm typecheck && pnpm test` → PASS。运行 `env -u ELECTRON_RUN_AS_NODE pnpm test:electron` → PASS(冒烟现在经真实 preload 桥端到端断言 quickscripts IPC)。

```bash
git add src/preload/index.cjs src/renderer/app/electron.d.ts src/renderer/features/ai/quickScriptApi.ts \
  src/renderer/features/ai/AiAssistantPanel.tsx e2e-electron/smoke.spec.ts
git commit -m "feat(quickscripts): broadcast generation events and assert IPC in electron smoke"
```

---

## 任务 13:feature 文档 + 全量验证

**文件:**
- 新建: `docs/features/quick-scripts.md`

- [ ] **步骤 1:编写 feature 文档**(AGENTS.md Feature Documentation——H1 标题、≤160 字符摘要、What/How/Where/Security;文档本身按仓库惯例用英文):

```markdown
# Quick Scripts

Quick Scripts turn the commands an AI session already ran into one-click cards: type `/生成快捷指令` in the SSH AI assistant panel and Buzz recaps the session into named scripts you can run, pin, edit, or dismiss.

## What it does

- `/生成快捷指令` (alias `/quick-script`) in the AI panel is intercepted before it reaches the model and triggers generation from the current session's `ssh_exec` calls. The slash menu is built on assistant-ui's trigger-popover primitives.
- Main process aggregates commands (frequency, success rate, chain-skeleton clustering), asks the configured AI provider to name and describe 1–5 scripts — every script line must match a session command verbatim — and falls back to a fully offline rules mode when no provider is configured, the call fails, or output fails validation.
- Suggestion cards render at the top of the panel: NEW/RULES badges, usage stats, hover actions (run / pin / edit / dismiss), full-script tooltip, shuffle rotation, per-host collapse memory.
- Executing a card writes to the current SSH terminal via one bracketed paste (`runtime.paste(script + "\r")`); risky scripts go through a confirmation dialog driven by the shared shell-risk classifier.
- Scripts are stored per host, AES-GCM encrypted; deleting a host (or vault) cascades.

## How to use

Open an SSH terminal → ⌘I to open the AI panel → run a few AI commands → type `/生成快捷指令`. Click a card to execute it. Settings → AI: toggle "AI generation" (off = offline rules mode) and "Clear all quick script data".

## Where it lives

- Main: `src/main/domains/quickscripts/` (extractor, generator, repository, service, commands)
- IPC: `quickscript_generate|list|update|delete|clear_data` in `src/shared/ipc/command-names.ts`; wire types in `src/shared/ipc/quickscripts/types.ts`
- Renderer: `src/renderer/features/ai/` (`useQuickScripts`, `AiComposer` with assistant-ui slash commands, `QuickScriptsSection`, dialogs, toast) integrated into `AiAssistantPanel`
- Shared risk classifier: `src/shared/shell-risk.ts`

## Security notes

- Session decryption, extraction, and LLM calls stay in the main process; only structured script entries cross IPC (PRD N1).
- `script` fields are AES-GCM encrypted at rest with the app master key (N2).
- LLM input is limited to aggregate command stats plus session title — never the conversation (N3); generation times out at 60s and falls back to rules mode (N4).
- Commands matching secret patterns (AWS keys, PEM headers, long tokens) are dropped and counted, never stored or sent (N8).
```

- [ ] **步骤 2:全量验证**

```bash
pnpm typecheck
pnpm test
env -u ELECTRON_RUN_AS_NODE pnpm test:electron
```

预期:全部通过。浏览器 e2e(`pnpm test:e2e --project=chromium`)——`ai-providers`/`sftp` 失败是既有基线(memory 记录);其余全绿。

手动冒烟(PRD 验收场景 A–E):`env -u ELECTRON_RUN_AS_NODE pnpm dev` → 连接 SSH 主机 → ⌘I → 让 AI 执行几条命令 → `/生成快捷指令` → 卡片出现(A)→ 点击安全卡片 → 命令落入终端(B)→ 点击含 `sudo` 的卡片 → 确认对话框 → Execute(C)→ 设置 → AI → 关闭 AI generation → 新会话 → `/生成快捷指令` → 出现 RULES 徽标卡片(D)→ 无命令的新会话 → `/生成快捷指令` → 内联空态提示(E)。顺带验证:输入 `/` 浮出 assistant-ui 菜单,↑↓/Enter/Esc 行为与原型一致;`/ Quick scripts` 按钮能打开菜单。

- [ ] **步骤 3:提交**

```bash
git add docs/features/quick-scripts.md
git commit -m "docs(quickscripts): add quick scripts feature doc"
```

---

## 自审(规划期间完成)

**规格覆盖:** F1 slash 拦截 + 菜单(任务 8/9,assistant-ui 机制),F2 提取/归一化/骨架(任务 2),F3 LLM + 逐字校验(任务 4),F4 规则降级(任务 4),F5 加密存储 + 级联(任务 3/5),F6 卡片渲染/刷新/收起/临时层(任务 7/8/9/12),F7 执行 + 风险门控 + bracketed paste(任务 6/8/9),F8 生命周期 pin/edit/dismiss/delete/另存片段(任务 8/9/11),F9 生成反馈状态(任务 7/8),F10 设置 + 清除(任务 10)。N1–N8 全覆盖(N1 服务在主进程;N2 cipher;N3 仅聚合统计出网 + useLlm 开关;N4 60s 超时 + 规则回退;N5 无新依赖——assistant-ui 相关包已在依赖中;N6 契约测试 + 纯提取器;N7 应用设计系统;N8 密钥过滤 + droppedCount)。里程碑 M1–M4 对应任务 2–5、4、7–9、10–12。偏差已全部记录(共 11 条)。

**占位符扫描:** 任务 11 步骤 1 以文字精确描述了断言内容(无 TBD);其余步骤均含完整代码。无 "TBD"/"TODO"/「以后再补」类占位。

**类型一致性:** `QuickScriptApi` 只定义一次(任务 1),任务 5 重导出;`QuickScriptGenPhase` 只在 `QuickScriptsSection.tsx` 定义(任务 7),`useQuickScripts`(任务 8)从其导入;`GeneratedScript` 定义于 `repository.ts`(任务 3),`generator.ts`/`service.ts`(任务 4)消费;wire 类型单一来源于 `src/shared/ipc/quickscripts/types.ts`;slash 命令单一来源于 `QUICK_SLASH_COMMANDS`(任务 8),`AiComposer`(任务 9)消费——没有手写 `QuickSlashMenu`(已被 assistant-ui 机制取代,见偏差 #11)。

**assistant-ui 集成核对:** `unstable_useSlashCommandAdapter` / `useLocalRuntime` / `ComposerPrimitive` / `LexicalComposerInput` 均已对照已安装版本(0.15.13 / 0.2.9)验证导出;本地 `ComposerTriggerPopover` 已支持 action 行为;composer 无公开 `setValue`,footer 按钮采用 `execCommand("insertText")` 方案并注明降级;现有测试迁移路径(fireEvent.change → userEvent.type、等待 Send 可用)已在任务 9 步骤 1 明示。







