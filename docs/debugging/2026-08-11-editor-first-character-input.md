# 编辑器只能输入首字符：根因与修复

日期：2026-08-11

状态：已解决

调试分支：`codex/debug-agent-input`

## 1. 症状

在中文界面环境中，Agent composer、独立 Lexical 页面和独立 Tiptap 页面逐键输入 `whoami` 时只保留首字符 `w`。第一个字符写入后，第二次输入会触发 DOM 回写，Selection 从 offset 1 跳到 offset 0。

以下路径容易掩盖问题：

- 英文 locale 下输入。
- 一次性直接插入整段文本。
- 自动化窗口没有真正成为 macOS 前台应用。

诊断路由：

- `http://127.0.0.1:1420/#/lexical-test`
- `http://127.0.0.1:1420/#/tiptap-test`

## 2. 根因

根因位于 `src/renderer/shared/i18n/index.tsx` 的 `DocumentTranslator`，与 Electron、Tiptap、Lexical、assistant-ui 或 IME 本身无关。

中文 locale 下，`DocumentTranslator` 使用 `MutationObserver` 监听整个 `document.body`，并把第一次看到的 Text 节点内容记录到 `originalText`，随后把节点恢复或翻译为该“原文”。

对可编辑区域而言，这个假设不成立：Text 节点内容是用户正在修改的数据。

故障顺序如下：

1. 用户输入 `w`，编辑器创建或更新 Text 节点。
2. 全局翻译器把 `w` 缓存为该节点的原始内容。
3. 用户输入 `h`，浏览器把节点更新为 `wh`。
4. MutationObserver 收到 `characterData` 变化。
5. 翻译器使用缓存的 `w` 覆盖 `wh`。
6. 该 DOM 回写破坏编辑器维护的 Selection，光标跳到 offset 0。
7. 后续字符继续被回写，因此视觉上只能输入首字符。

## 3. 修复

`translateTree` 现在跳过以下可编辑区域及其整个子树：

- `input`
- `textarea`
- `select`
- `[contenteditable]`，但排除显式的 `[contenteditable="false"]`

翻译器继续处理普通文档文本，但不再读取、缓存或回写用户可编辑内容。

用于调查的 React 状态型事件记录器已移除。它不属于产品功能，并会给 Selection 调试增加额外渲染噪音。

## 4. 已验证的排除项

以下实验没有解决问题，因为它们不触及全局翻译器：

- 将 React 19.2.7 临时升级到 19.2.8。
- 切换 Lexical 0.48 和 0.49。
- 移除 assistant-ui Lexical 同步层。
- 移出 `ComposerPrimitive.Root`。
- 关闭 React StrictMode。
- 关闭 Electron renderer sandbox。
- 移除 preload。
- 关闭拼写检查。
- 使用 macOS 英文输入源。
- 使用无痕 Chrome。

`xulux-base-demo` 能正常输入，是因为它没有 Buzz 的全局 `DocumentTranslator`。Next.js 与 Vite 的差异不是根因。

## 5. 自动化复现注意事项

Electron 在 macOS 上进行键盘 E2E 时，测试必须先让 Electron app 和 BrowserWindow 成为前台焦点。仅检查 `document.activeElement` 不足以证明原生窗口拥有键盘焦点。

回归测试执行以下步骤：

1. 强制设置 `terminus-locale=zh-CN` 并重新加载 renderer。
2. 依次打开 Tiptap 和 Lexical 诊断路由。
3. 只聚焦一次编辑器。
4. 通过 `window.keyboard.press()` 逐键输入 `whoami`。
5. 每个字符后断言完整文本和 Selection anchor/focus offset。

不要用“每个字符重新调用一次元素级 `locator.press()`”作为 Selection 证据；元素级调用可能重复定位或聚焦目标。

## 6. 回归覆盖

- `tests/renderer/shared/i18n.test.tsx`
  - 中文 locale 下，连续修改 contenteditable Text 节点不会被翻译器回写。
  - 普通文档文本仍正常翻译。
- `e2e-electron/smoke.spec.ts`
  - 中文 locale 下，Tiptap 与 Lexical 均可逐键输入完整 `whoami`。
  - 每一步 Selection offset 均随文本长度从 1 增长到 6。

## 7. 验证命令

```bash
pnpm typecheck
pnpm test
pnpm exec electron-vite build
pnpm exec playwright test --config playwright.electron.config.ts -g "keeps Lexical"
```

验证结果：完整 Vitest 96 个测试文件、319 项测试全部通过；中文 locale 下的 Electron Tiptap/Lexical 输入回归通过。

完整 `pnpm test:electron` 中编辑器输入用例通过，但既有桌面服务 smoke 在当前机器因 `PTY_OPEN_FAILED` 失败。该失败发生在终端 PTY 建立阶段，与 renderer 输入修复无关。
