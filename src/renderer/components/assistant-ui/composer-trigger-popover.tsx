import {
  ComposerPrimitive,
  type Unstable_DirectiveFormatter,
  type Unstable_IconComponent,
  type Unstable_TriggerItem,
  unstable_useTriggerPopoverScopeContext,
} from "@assistant-ui/react";
import { ArrowLeft, Folder, Server } from "lucide-react";
import { useMemo, type ComponentProps } from "react";
import { cn } from "@/shared/utils/cn";

type DirectiveBehavior = {
  directive: {
    formatter: Unstable_DirectiveFormatter;
    onInserted?: (item: Unstable_TriggerItem) => void;
  };
  action?: never;
};

type ActionBehavior = {
  action: {
    onExecute: (item: Unstable_TriggerItem) => void;
    removeOnExecute?: boolean;
  };
  directive?: never;
};

/**
 * Structural copy of `Unstable_TriggerAdapter`. The real type lives in
 * `@assistant-ui/core`, which isn't a direct dependency of this app, so we
 * re-declare the minimal shape the flat-mode wrapper needs to build a derived
 * adapter from the categorized one it receives.
 */
type FlatTriggerAdapter = {
  categories(): readonly { id: string; label: string }[];
  categoryItems(categoryId: string): readonly Unstable_TriggerItem[];
  search(query: string): readonly Unstable_TriggerItem[];
};

type TriggerAdapterLike = {
  categories(): readonly { id: string; label: string }[];
  categoryItems(categoryId: string): readonly Unstable_TriggerItem[];
  search?(query: string): readonly Unstable_TriggerItem[];
};

type ComposerTriggerPopoverProps = Omit<
  ComponentProps<typeof ComposerPrimitive.Unstable_TriggerPopover>,
  "children" | "adapter"
> &
  (DirectiveBehavior | ActionBehavior) & {
    adapter?: TriggerAdapterLike;
    iconMap?: Record<string, Unstable_IconComponent>;
    fallbackIcon?: Unstable_IconComponent;
    categoriesLabel?: string;
    itemsLabel?: string;
    /** Display mode. `"drilldown"` (default) keeps the two-level category → item flow; `"flat"` shows every item grouped under its category header at once. */
    variant?: "drilldown" | "flat";
  };

export function ComposerTriggerPopover({
  directive,
  action,
  adapter,
  iconMap,
  fallbackIcon: FallbackIcon = Server,
  categoriesLabel = "Targets",
  itemsLabel = "Items",
  variant = "drilldown",
  ...props
}: ComposerTriggerPopoverProps) {
  const iconFor = (item: Unstable_TriggerItem) => {
    const key =
      typeof item.metadata?.icon === "string" ? item.metadata.icon : item.type;
    return iconMap?.[key] ?? FallbackIcon;
  };

  // Flat mode feeds the popover a derived adapter whose `categories()` is
  // empty. That flips the popover into search mode even on an empty query
  // (see triggerNavigationResource.ts search-mode gate), so the library's own
  // keyboard handling navigates one flat item list — no custom keydown needed.
  const flatPool = useMemo<readonly Unstable_TriggerItem[]>(() => {
    if (variant !== "flat" || !adapter) return [];
    const out: Unstable_TriggerItem[] = [];
    for (const cat of adapter.categories()) {
      for (const item of adapter.categoryItems(cat.id)) out.push(item);
    }
    return out;
  }, [adapter, variant]);

  const flatAdapter = useMemo<FlatTriggerAdapter | null>(() => {
    if (variant !== "flat" || !adapter) return null;
    return {
      categories: () => [],
      categoryItems: () => [],
      // Must return the same filtered list, in the same order, that FlatBody
      // renders — otherwise scope.highlightedIndex desyncs from the rows.
      search: (query: string) => filterFlat(flatPool, query),
    };
  }, [flatPool, adapter, variant]);

  const effectiveAdapter =
    variant === "flat" ? (flatAdapter ?? undefined) : adapter;

  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      {...props}
      adapter={effectiveAdapter}
      className="absolute inset-x-0 bottom-[calc(100%+8px)] z-50 max-h-72 overflow-hidden rounded-xl border border-graphite bg-carbon p-1.5 text-mist shadow-xl"
    >
      {directive ? (
        <ComposerPrimitive.Unstable_TriggerPopover.Directive {...directive} />
      ) : action ? (
        <ComposerPrimitive.Unstable_TriggerPopover.Action {...action} />
      ) : null}

      {variant === "flat" ? (
        <FlatBody adapter={adapter} iconFor={iconFor} />
      ) : (
        <DrilldownBody
          adapter={adapter}
          iconFor={iconFor}
          iconMap={iconMap}
          categoriesLabel={categoriesLabel}
          itemsLabel={itemsLabel}
        />
      )}
    </ComposerPrimitive.Unstable_TriggerPopover>
  );
}

type BodyProps = {
  adapter?: TriggerAdapterLike;
  iconFor: (item: Unstable_TriggerItem) => Unstable_IconComponent;
  iconMap?: Record<string, Unstable_IconComponent>;
  categoriesLabel: string;
  itemsLabel: string;
};

function DrilldownBody({
  adapter,
  iconFor,
  iconMap,
  categoriesLabel,
  itemsLabel,
}: BodyProps) {
  return (
    <>
      <ComposerPrimitive.Unstable_TriggerPopoverCategories className="space-y-1">
        {(categories) => (
          <>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-fog">
              {categoriesLabel}
            </p>
            {categories.map((category) => {
              const Icon = iconMap?.[category.id] ?? Folder;
              return (
                <ComposerPrimitive.Unstable_TriggerPopoverCategoryItem
                  key={category.id}
                  categoryId={category.id}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] outline-hidden data-highlighted:bg-graphite data-highlighted:text-paper"
                >
                  <Icon className="size-4 text-fog" />
                  <span>{category.label}</span>
                </ComposerPrimitive.Unstable_TriggerPopoverCategoryItem>
              );
            })}
          </>
        )}
      </ComposerPrimitive.Unstable_TriggerPopoverCategories>

      <ComposerPrimitive.Unstable_TriggerPopoverItems className="space-y-1">
        {(items) => (
          <>
            <div className="flex items-center gap-1 px-1 py-1">
              <ComposerPrimitive.Unstable_TriggerPopoverBack
                aria-label="Back to target categories"
                className="rounded-md p-1.5 text-fog outline-hidden hover:bg-graphite hover:text-paper"
              >
                <ArrowLeft className="size-3.5" />
              </ComposerPrimitive.Unstable_TriggerPopoverBack>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fog">
                {itemsLabel}
              </p>
            </div>
            {items.map((item, index) => {
              const Icon = iconFor(item);
              return (
                <ComposerPrimitive.Unstable_TriggerPopoverItem
                  key={`${item.type}:${item.id}`}
                  item={item}
                  index={index}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left outline-hidden data-highlighted:bg-graphite data-highlighted:text-paper"
                >
                  <Icon className="size-4 shrink-0 text-acid-lime" />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-mist">
                      {item.label}
                    </span>
                    {item.description ? (
                      <span className="block truncate text-[10.5px] text-fog">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </ComposerPrimitive.Unstable_TriggerPopoverItem>
              );
            })}
          </>
        )}
      </ComposerPrimitive.Unstable_TriggerPopoverItems>
    </>
  );
}

function FlatBody({
  adapter,
  iconFor,
}: {
  adapter?: TriggerAdapterLike;
  iconFor: (item: Unstable_TriggerItem) => Unstable_IconComponent;
}) {
  const { open, query } = unstable_useTriggerPopoverScopeContext();

  // Group items under their category headers, filtering by the current query.
  // Each item carries the exact index it occupies in the popover's flat
  // search-results list (scope.items) so data-highlighted stays accurate.
  const grouped = useMemo(() => {
    const lower = query.toLowerCase();
    let flatIndex = -1;
    return (adapter?.categories() ?? [])
      .map((cat) => {
        const items = (adapter?.categoryItems(cat.id) ?? [])
          .filter((it) => matchesQuery(it, lower))
          .map((it) => {
            flatIndex += 1;
            return { item: it, index: flatIndex };
          });
        return { cat, items };
      })
      .filter((group) => group.items.length > 0);
  }, [adapter, query]);

  // TriggerPopover keeps its children mounted while inactive so behavior
  // primitives can stay registered. Custom flat-mode content must therefore
  // hide itself until the trigger character is actually present.
  if (!open) return null;

  if (grouped.length === 0) {
    return (
      <p className="px-2.5 py-3 text-[12px] text-fog">
        No matching servers or groups.
      </p>
    );
  }

  return (
    <div className="scroll-thin max-h-72 overflow-y-auto pr-1">
      {grouped.map(({ cat, items }, groupIndex) => (
        <div key={cat.id} className="space-y-1">
          <p
            className={cn(
              "px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-fog",
              groupIndex === 0 ? "pt-0" : "pt-2",
            )}
          >
            {cat.label}
          </p>
          {items.map(({ item, index }) => {
            const Icon = iconFor(item);
            return (
              <ComposerPrimitive.Unstable_TriggerPopoverItem
                key={`${item.type}:${item.id}`}
                item={item}
                index={index}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left outline-hidden data-highlighted:bg-graphite data-highlighted:text-paper"
              >
                <Icon className="size-4 shrink-0 text-acid-lime" />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-mist">
                    {item.label}
                  </span>
                  {item.description ? (
                    <span className="block truncate text-[10.5px] text-fog">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </ComposerPrimitive.Unstable_TriggerPopoverItem>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Matches the library's matcher (triggerNavigationResource.ts / useMentionAdapter.ts). */
function matchesQuery(item: Unstable_TriggerItem, lower: string): boolean {
  return (
    item.id.toLowerCase().includes(lower) ||
    item.label.toLowerCase().includes(lower) ||
    (item.description?.toLowerCase().includes(lower) ?? false)
  );
}

function filterFlat(
  pool: readonly Unstable_TriggerItem[],
  query: string,
): readonly Unstable_TriggerItem[] {
  const lower = query.toLowerCase();
  // lower === "" → .includes("") is always true → returns the full pool.
  return pool.filter((item) => matchesQuery(item, lower));
}
