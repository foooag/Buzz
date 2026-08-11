# 编辑器只能输入首字符：线索、排除项与后续验证

日期：2026-08-11  
状态：调查中  
调试分支：`codex/debug-agent-input`

## 1. 当前结论

现有证据不支持“Lexical 或 Tiptap 在 Electron 中无法使用”，也不足以把问题归因于 `@assistant-ui/react-lexical@0.2.9`、`ComposerPrimitive` 或 React 19 的某一个补丁版本。

目前最稳定的分界是输入方式：

- 通过物理键盘或离散单键事件逐字输入时，只保留第一个字符。
- 通过 ChatGPT 内置浏览器输入、Playwright 整段 `type("whoami")` 或类似的直接文本插入路径时，可以得到完整文本。

因此，下一步应优先调查普通浏览器中的键盘、输入法、`beforeinput`、组合输入和 DOM Selection 链路，而不是继续更换编辑器或 Electron 配置。

## 2. 症状定义

目标输入为 `whoami`。

### 失败路径

逐个发送 `w`、`h`、`o`、`a`、`m`、`i` 后，编辑区最终只显示 `w`。首字符后编辑区仍保持焦点，但后续字符没有进入最终文本。

### 成功路径

一次性插入字符串 `whoami` 时，编辑区最终显示完整的 `whoami`。用户也确认，通过 ChatGPT 内置浏览器进行输入是正常的。

这说明编辑区不是只读或整体失效；至少存在一条可以正常写入、渲染和保存完整文本的输入路径。

## 3. 当前环境与测试入口

调试时的主要依赖如下：

- React：实际安装 `19.2.7`
- React DOM：实际安装 `19.2.7`
- `@assistant-ui/react`：`0.15.13`
- `@assistant-ui/react-lexical`：`0.2.9`
- Lexical：由 assistant-ui 解析到 `0.49.0`
- Tiptap：`3.30.0`

独立测试路由：

- `http://127.0.0.1:1420/#/lexical-test`
- `http://127.0.0.1:1420/#/tiptap-test`

对应文件：

- `src/renderer/features/workspace/LexicalTestPage.tsx`
- `src/renderer/features/workspace/TiptapTestPage.tsx`
- `src/renderer/features/agent/composer/MentionComposer.tsx`
- `src/renderer/features/agent/AgentPage.tsx`

## 4. 实验结果矩阵

| 场景 | 输入方式 | 结果 | 能说明什么 |
| --- | --- | --- | --- |
| Agent 页面中的 `LexicalComposerInput` | 离散单键 | 只保留首字符 | 复现原始问题 |
| 独立 `LexicalComposerInput` 页面 | 离散单键 | 只保留首字符 | Agent 页面布局不是必要条件 |
| 原生 Lexical 0.49，移除 assistant-ui 同步插件 | 离散单键 | 只保留首字符 | assistant-ui `SyncPlugin` 不是自动化复现的必要条件 |
| 原生 Lexical 0.48 | 离散单键 | 只保留首字符 | 不能只归因于 Lexical 0.49 回归 |
| 独立 Tiptap 页面 | 离散单键 | 完整输入 | 当前 Chromium 环境并非所有 `contenteditable` 都必然失败 |
| Agent 页面中的 `LexicalComposerInput` | 一次性文本输入 | 完整输入 | 编辑器可接收完整文本，失败集中在逐键路径 |
| 独立 Lexical 页面 | 一次性文本输入 | 完整输入 | 同上，且不依赖 Agent 页面 |
| ChatGPT 内置浏览器 | 内置文本输入 | 用户确认正常 | 内置输入路径与普通浏览器物理输入存在关键差异 |

原生 Lexical 0.48、0.49 和 React 版本切换均为临时 A/B 测试，测试结束后已恢复正式源文件和依赖版本。

## 5. 已排除或明显降级的原因

### 5.1 Electron 不是必要条件

使用普通浏览器打开 `http://127.0.0.1:1420` 时，输入不经过 Electron 主进程或 preload。问题仍可出现，因此 Electron 不是复现该问题的必要条件。

这不等于 Electron 对输入链路完全没有影响，只表示不能再使用“Electron 不支持 Lexical/Tiptap”解释当前全部现象。

### 5.2 `ComposerPrimitive.Root` 不是必要条件

已经将 `LexicalComposerInput` 移到 `ComposerPrimitive.Root` 外测试，问题没有消失。独立 Lexical 测试页也不依赖 Agent 页中的 composer 布局。

因此，`ComposerPrimitive.Root` 不是首字符问题的必要条件。

### 5.3 assistant-ui `SyncPlugin` 不是必要条件

临时使用原生 `LexicalComposer`、`PlainTextPlugin` 和 `ContentEditable`，不加载 `LexicalComposerInput` 自带的 assistant-ui 双向同步插件，离散单键自动化仍然只保留首字符。

因此，不能把同步调用 `composer.setText()` 视为已经证实的根因。它仍可能放大某些集成问题，但不是当前自动化复现的必要条件。

### 5.4 React StrictMode 不是必要条件

临时移除 `StrictMode` 后继续复现。开发环境的双挂载不是充分解释。

### 5.5 React 19.2.7 不是唯一可疑版本

临时将 React 和 React DOM 升级到 `19.2.8` 后继续复现，随后已经恢复 `19.2.7`。

因此不能认为只要升级到 19.2.8 就能解决问题，也没有证据支持当前问题由 19.2.7 单独造成。

### 5.6 Lexical 0.49 单版本回归不是充分解释

原生 Lexical 0.48 的临时对照也出现相同的离散单键结果。因此没有证据证明这是 0.49 独有的回归。

### 5.7 `contenteditable` 或浏览器整体不可用不成立

独立 Tiptap 页面可以接受完整的离散单键输入，Lexical 也能接受整段文本插入。因此浏览器的 `contenteditable` 能力并未整体失效。

### 5.8 “换成 Tiptap 仍失败”不能证明两个编辑器共享同一根因

用户曾将 Agent composer 中的 Lexical 替换为 Tiptap，并观察到相似症状；但该实验实现已经不在当前代码中，无法确认是否在每次更新时重建 editor、回写受控值或重置选区。

独立 Tiptap 页面逐键输入正常，说明 Tiptap 本身至少在隔离环境中不复现。Agent 内的 Tiptap 现象可能是另一个集成问题，不能直接用于证明 Electron 或 `contenteditable` 有共同缺陷。

## 6. 仍未排除的变量

### 6.1 macOS 输入法与组合输入

物理键盘会经过系统输入源和 IME，可能产生 `compositionstart`、`compositionupdate`、`compositionend`，并改变 `beforeinput.data`、`inputType` 和 `isComposing`。ChatGPT 内置浏览器的文本输入可能直接插入字符串，从而绕过这条链路。

这是当前优先级最高的方向。

### 6.2 普通浏览器的扩展或配置

语法检查、翻译、快捷键、输入增强和密码管理扩展都可能监听或改写 `contenteditable` 的键盘事件与 Selection。内置浏览器与用户普通浏览器通常不共享完全相同的扩展和配置。

### 6.3 首字符更新后的 DOM Selection

首字符成功后，编辑区仍处于 active 状态，但尚未记录每个原生事件结束后的 anchor、focus、offset 和 selection range。焦点存在不代表有效插入选区仍存在。

### 6.4 离散键自动化与真实物理输入不完全等价

自动化离散 `press()` 或 keypress 可以复现首字符现象，但自动化工具可能在每次调用前重新 focus 元素，或者生成与硬件键盘不同的事件序列。

因此自动化结果用于定位差异，但不能替代普通浏览器中对真实事件日志的采集。

### 6.5 Vite 与 Next.js 运行时差异

`xulux-base-demo` 使用 Next.js，而 Buzz renderer 使用 Vite。两者的开发模式、模块解析和渲染调度不同，尚未进行锁定依赖、相同浏览器和相同输入法下的严格对照。

## 7. 为什么 `xulux-base-demo` 不能直接作为版本反证

本地 `xulux-base-demo` 目录没有 lockfile 和已安装的 `node_modules`，依赖声明使用范围版本，而且运行框架是 Next.js。因此仅从源码和 `package.json` 无法知道用户观察到正常输入时实际使用的 React、Lexical、assistant-ui 解析版本。

若要把它作为有效对照，需要：

1. 为两个项目记录完整 lockfile 和实际安装版本。
2. 使用同一个浏览器、同一个 profile、同一个输入法。
3. 使用相同的物理输入步骤，而不是一个项目粘贴、另一个项目逐键输入。
4. 同时记录原生输入事件和 Selection。

## 8. 当前最可能的故障模型

当前现象更符合以下模型：

1. 首字符通过普通浏览器的物理键盘或 IME 事件进入编辑器。
2. 首字符提交后，编辑器、浏览器、输入法或扩展中的某一层改变了 Selection 或组合输入状态。
3. 后续离散键事件仍可能到达页面，但没有作用于有效的可编辑选区，或被组合输入逻辑吞掉。
4. 整段文本插入绕过了字符之间的 Selection/IME 状态切换，所以可以成功。

这是待验证模型，不是最终根因。

## 9. 下一步最小验证方案

### 9.1 无代码测试

按以下顺序测试两个独立路由和 Agent 路由：

1. 将 macOS 输入源切换为纯英文 `ABC` 后逐键输入 `whoami`。
2. 在普通浏览器无痕窗口中测试，暂时排除扩展。
3. 比较逐键输入、粘贴 `whoami` 和 ChatGPT 内置浏览器输入。
4. 记录具体浏览器名称、版本、输入源，以及问题出现在哪个路由。

结果解释：

- `ABC` 正常、原输入法失败：优先调查 IME/composition。
- 无痕正常、普通窗口失败：优先调查扩展或 profile 配置。
- 粘贴和内置输入正常、物理逐键失败：优先调查键盘事件与 Selection。
- 独立 Tiptap 正常、独立 Lexical 失败：优先调查 Lexical 事件处理。
- 两个独立页面都失败：优先调查普通浏览器环境，而不是 Agent 集成。

### 9.2 事件记录器

在仅开发环境可见的诊断页增加事件记录器，至少记录：

- `keydown`
- `keypress`
- `beforeinput`
- `input`
- `keyup`
- `compositionstart`
- `compositionupdate`
- `compositionend`
- `event.key`
- `event.data`
- `event.inputType`
- `event.isComposing`
- `event.defaultPrevented`
- `document.activeElement`
- Selection 的 anchor/focus node、offset 和 rangeCount
- 每个事件同步阶段、microtask 和下一帧时的编辑区文本

应分别采集普通浏览器物理输入和 ChatGPT 内置浏览器成功输入，寻找第二个字符开始出现的第一处差异。

## 10. 当前不建议的动作

在获得事件日志之前，不建议：

- 因此问题放弃 Electron。
- 直接认定 Lexical 或 Tiptap 在 Electron 中不可用。
- 继续无目标升级 React、Lexical 或 assistant-ui。
- 仅根据整段自动化输入成功宣布问题已解决。
- 将 Agent 内一次未经保留的 Tiptap 替换实验当成通用 `contenteditable` 结论。

## 11. 相关提交与验证

- 调试快照：`cd037fc feat(agent): add sidebar workflow and input diagnostics`
- 调查 handoff：`51b3a89 docs(handoff): capture agent input debugging state`
- `pnpm typecheck` 已通过。
- Vitest 全量结果：95 个测试文件、317 项测试全部通过。
- 暂时性 A/B 改动均已恢复，没有提交绝对路径导入、React 临时版本或关闭 StrictMode 的修改。
