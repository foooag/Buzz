import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useAui,
  useLocalRuntime,
  unstable_useSlashCommandAdapter,
  type ChatModelAdapter,
  type Unstable_TriggerItem,
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

  // 库的 slash adapter 只暴露 search 形式的条目;应用的 flat 浮层按 categories
  // 渲染。把同一命令池暴露为单个 category,flat 模式才有可渲染、可导航的选项。
  const slashItems = useMemo<Unstable_TriggerItem[]>(
    () => [
      ...QUICK_SLASH_COMMANDS.map((command) => ({
        id: command.token.slice(1),
        type: "command",
        label: command.token,
        description: command.hint,
        metadata: { icon: "sparkles" },
      })),
      { id: "quick-script", type: "command", label: "/quick-script", description: "Alias of /生成快捷指令", metadata: { icon: "sparkles" } },
    ],
    [],
  );
  const slashAdapter = useMemo(
    () => ({
      categories: () => [{ id: "quick-scripts", label: "Quick scripts" }],
      categoryItems: () => slashItems,
      search: (query: string) => slashItems.filter((item) => matchesSlashQuery(item, query)),
    }),
    [slashItems],
  );

  // 保持可访问名称稳定,现有测试选择器继续有效(MentionComposer 同款技巧)。
  const labelEditor = useCallback((element: HTMLDivElement | null) => {
    element?.querySelector<HTMLElement>(".aui-lexical-input")?.setAttribute("aria-label", "Message AI assistant");
  }, []);

  const slashHintRef = useRef<HTMLButtonElement | null>(null);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
        <div className="relative">
          <ComposerTriggerPopover
            char="/"
            variant="flat"
            {...slash}
            adapter={slashAdapter}
            itemsLabel="Slash commands"
            aria-label="Slash commands"
          />
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
                        document.execCommand?.("insertText", false, "/");
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
                  <AiComposerSendButton disabled={disabled} />
                )}
              </span>
            </div>
          </ComposerPrimitive.Root>
        </div>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>
    </AssistantRuntimeProvider>
  );
}

// 普通 Send 按钮:assistant-ui 的 Send 原语在 composer 为空时会自动禁用,
// 但面板测试(以及原 textarea 的交互)把「agent 就绪」当作唯一门槛。
// 空内容点击 send() 会安全地空操作(composer.canSend 为 false 时直接返回)。
function AiComposerSendButton({ disabled }: { disabled: boolean }) {
  const aui = useAui();
  return (
    <button
      type="button"
      aria-label="Send"
      disabled={disabled}
      onClick={() => { void aui.composer.send(); }}
      className="inline-flex h-7 items-center gap-1.5 rounded-md bg-acid-lime px-2.5 text-[11px] font-semibold text-void outline-hidden transition hover:brightness-105 disabled:bg-graphite disabled:text-fog"
    >
      <span>Send</span>
      <Send size={13} />
    </button>
  );
}

/** 与库的匹配器一致(composer-trigger-popover.tsx 的 matchesQuery)。 */
function matchesSlashQuery(item: Unstable_TriggerItem, query: string): boolean {
  const lower = query.toLowerCase();
  return (
    item.id.toLowerCase().includes(lower) ||
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  );
}
