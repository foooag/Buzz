import { Folder, Server } from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/shared/utils/index";
import type { Group, Host } from "@/shared/types";
import { mentionCategories, searchMentionItems, type MentionItem } from "./mentionItems";

export type MentionPopoverProps = {
  open: boolean;
  query: string;
  hosts: Host[];
  groups: Group[];
  enabled: boolean;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
};

export function MentionPopover({ open, query, hosts, groups, enabled, onSelect, onClose }: MentionPopoverProps) {
  const items = enabled ? searchMentionItems(hosts, groups, query) : [];
  const categories = mentionCategories(items);
  return (
    <Popover open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* Anchor is positioned by the composer; content floats above the textarea */}
      <PopoverContent
        aria-label="Mention target"
        role="listbox"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "pop-in w-[min(320px,calc(100%-8px))] p-0 border-graphite bg-carbon text-mist shadow-[0_16px_48px_rgb(0_0_0/0.5)]",
        )}
      >
        {!enabled ? (
          <p className="px-3 py-2 text-[12px] text-fog">正在加载服务器和分组…</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-fog">没有匹配的服务器或分组</p>
        ) : (
          categories.map((cat) => (
            cat.items.length === 0 ? null : (
              <div key={cat.id}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-fog/70">{cat.label}</div>
                {cat.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    role="option"
                    aria-selected={false}
                    onClick={() => onSelect(item)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-[13px] text-mist transition-colors hover:bg-white/5"
                  >
                    {item.iconKey === "Folder" ? <Folder size={13} className="text-fog" /> : <Server size={13} className="text-fog" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      <span className="block truncate text-[10.5px] text-fog/80">{item.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
