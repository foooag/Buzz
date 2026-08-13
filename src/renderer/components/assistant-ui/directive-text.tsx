import {
  type TextMessagePartProps,
  unstable_defaultDirectiveFormatter,
} from "@assistant-ui/react";
import { Server } from "lucide-react";
import { memo } from "react";

export const DirectiveText = memo(function DirectiveText({ text }: TextMessagePartProps) {
  const segments = unstable_defaultDirectiveFormatter.parse(text);
  return (
    <span className="whitespace-pre-wrap wrap-break-word">
      {segments.map((segment, index) => segment.kind === "text" ? (
        <span key={index}>{segment.text}</span>
      ) : (
        <span
          key={`${segment.type}:${segment.id}:${index}`}
          className="mx-0.5 inline-flex items-center gap-1 rounded-pill border border-acid-lime/25 bg-acid-lime/8 px-2 py-0.5 align-baseline text-[11px] font-medium text-acid-lime"
          data-directive-id={segment.id}
          data-directive-type={segment.type}
        >
          <Server className="size-3" />
          {segment.label}
        </span>
      ))}
    </span>
  );
});
