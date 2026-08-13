import { code } from "@streamdown/code";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";

/**
 * Renders an assistant message's text part as streaming markdown via Streamdown
 * (built-in Shiki syntax highlighting, streaming caret, incomplete-markdown
 * repair). Reads the part from MessagePartContext via useMessagePartText.
 */
export function StreamdownText() {
  return (
    <StreamdownTextPrimitive
      plugins={{ code }}
      shikiTheme={["github-light", "github-dark"]}
      caret="block"
      containerClassName="text-[13px] leading-relaxed text-mist"
    />
  );
}
