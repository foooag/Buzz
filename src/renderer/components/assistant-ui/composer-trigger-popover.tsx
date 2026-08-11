import {
  ComposerPrimitive,
  type Unstable_DirectiveFormatter,
  type Unstable_IconComponent,
  type Unstable_TriggerItem,
} from "@assistant-ui/react";
import { ArrowLeft, Folder, Server } from "lucide-react";
import type { ComponentProps } from "react";

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

type ComposerTriggerPopoverProps = Omit<
  ComponentProps<typeof ComposerPrimitive.Unstable_TriggerPopover>,
  "children"
> & (DirectiveBehavior | ActionBehavior) & {
  iconMap?: Record<string, Unstable_IconComponent>;
  fallbackIcon?: Unstable_IconComponent;
  categoriesLabel?: string;
  itemsLabel?: string;
};

export function ComposerTriggerPopover({
  directive,
  action,
  iconMap,
  fallbackIcon: FallbackIcon = Server,
  categoriesLabel = "Targets",
  itemsLabel = "Items",
  ...props
}: ComposerTriggerPopoverProps) {
  const iconFor = (item: Unstable_TriggerItem) => {
    const key = typeof item.metadata?.icon === "string" ? item.metadata.icon : item.type;
    return iconMap?.[key] ?? FallbackIcon;
  };

  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      {...props}
      className="absolute inset-x-0 bottom-[calc(100%+8px)] z-50 max-h-72 overflow-hidden rounded-xl border border-graphite bg-carbon p-1.5 text-mist shadow-xl"
    >
      {directive ? (
        <ComposerPrimitive.Unstable_TriggerPopover.Directive {...directive} />
      ) : action ? (
        <ComposerPrimitive.Unstable_TriggerPopover.Action {...action} />
      ) : null}

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
                    <span className="block truncate text-[12.5px] text-mist">{item.label}</span>
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
    </ComposerPrimitive.Unstable_TriggerPopover>
  );
}
