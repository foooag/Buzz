import { ChevronRight, Loader2 } from "lucide-react";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import { cn } from "@/shared/utils";

export type ToolGroupVariant = "outline" | "ghost" | "muted";

export type ToolGroupRootProps = PropsWithChildren<{
  variant?: ToolGroupVariant;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional node rendered before the trigger label (e.g. a status dot). */
  leading?: ReactNode;
  /** The trigger header. If omitted, a default trigger renders from count/active. */
  trigger?: ReactNode;
  count?: number;
  active?: boolean;
}>;

/**
 * Groups consecutive tool-call parts. The `ghost` variant matches the docs
 * ToolGroup `variant="ghost"` (no container chrome) — the whole group is a
 * label row + the tool rows beneath it, no enclosing border/background.
 *
 * Uses a native `<details>` for collapse (matches the ReasoningGroup idiom;
 * no Radix Collapsible dependency in this project).
 */
export function ToolGroupRoot({
  variant = "outline",
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  leading,
  trigger,
  count = 0,
  active = false,
  children,
}: ToolGroupRootProps) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const containerClass =
    variant === "ghost"
      ? ""
      : variant === "muted"
        ? "rounded-xl border border-graphite/60 bg-obsidian/30 p-2"
        : "rounded-xl border border-graphite p-2";

  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = (event.currentTarget as HTMLDetailsElement).open;
        if (next !== open) setOpen(next);
      }}
      className={cn("group/tool", containerClass)}
    >
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 px-1 py-1 text-[11px] text-fog transition-colors hover:text-mist">
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-fog/70 transition-transform",
            open && "rotate-90",
          )}
        />
        {leading}
        {trigger ?? (
          <DefaultTrigger count={count} active={active} />
        )}
      </summary>
      <div className="mt-1.5 flex flex-col gap-2">{children}</div>
    </details>
  );
}

function DefaultTrigger({ count, active }: { count: number; active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {active ? (
        <Loader2 className="spin size-3 text-acid-lime" />
      ) : (
        <span className="size-1.5 rounded-full bg-fog/50" />
      )}
      <span className="font-medium">
        {active ? "Running" : "Ran"} {count} {count === 1 ? "command" : "commands"}
      </span>
    </span>
  );
}

/** Passthrough wrapper — kept for parity with the docs composable API. */
export function ToolGroupContent({ children }: PropsWithChildren) {
  return <>{children}</>;
}
