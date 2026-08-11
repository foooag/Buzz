import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  useLocalRuntime,
} from "@assistant-ui/react";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";
import { useCallback } from "react";

const testModel: ChatModelAdapter = {
  async *run() {
    yield { content: [] };
  },
};

export function LexicalTestPage() {
  const runtime = useLocalRuntime(testModel);
  const labelEditor = useCallback((element: HTMLDivElement | null) => {
    element
      ?.querySelector<HTMLElement>(".aui-lexical-input")
      ?.setAttribute("aria-label", "Lexical test input");
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <LexicalComposerInput
        ref={labelEditor}
        autoFocus
        placeholder="Type here…"
        className="m-6 min-h-32 rounded-xl border border-graphite bg-carbon px-4 py-3 text-[15px] leading-relaxed text-paper outline-hidden focus-within:border-acid-lime/45 [&_.aui-lexical-input]:min-h-24 [&_.aui-lexical-input]:outline-hidden [&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:text-fog"
      />
    </AssistantRuntimeProvider>
  );
}
