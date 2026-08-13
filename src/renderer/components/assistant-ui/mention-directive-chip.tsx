import type { DirectiveChipProps } from "@assistant-ui/react-lexical";
import { Folder, Server } from "lucide-react";

const ICON_BY_TYPE: Record<string, typeof Server> = {
  host: Server,
  server: Server,
  group: Folder,
};

/**
 * Inline highlight chip for `@mentions` typed in the composer input. Mirrors
 * the style used to render mentions inside sent messages (see directive-text)
 * so the chip looks the same while editing and after sending.
 *
 * Wired into the Lexical input via its `directiveChip` prop.
 */
export function MentionDirectiveChip({
  directiveType,
  label,
}: DirectiveChipProps) {
  const Icon = ICON_BY_TYPE[directiveType] ?? Server;
  return (
    <span
      className="mx-0.5 inline-flex items-center gap-1 rounded-pill border border-acid-lime/25 bg-acid-lime/8 px-2 py-0.5 align-baseline text-[11px] font-medium text-acid-lime"
      data-directive-type={directiveType}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
