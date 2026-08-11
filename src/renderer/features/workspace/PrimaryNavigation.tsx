import {
  FolderOpen,
  History,
  Network,
  Pilcrow,
  Server,
  Sparkles,
  TextCursorInput,
} from "lucide-react";
import { NavLink } from "react-router";

const destinations = [
  { id: "servers", label: "Servers", icon: Server },
  { id: "agent", label: "Agent", icon: Sparkles },
  { id: "lexical-test", label: "Lexical Test", icon: TextCursorInput },
  { id: "tiptap-test", label: "Tiptap Test", icon: Pilcrow },
  { id: "sftp", label: "SFTP", icon: FolderOpen },
  { id: "forwarding", label: "Port Forwarding", icon: Network },
  { id: "history", label: "History", icon: History },
] as const;

export function PrimaryNavigation() {
  return (
    <nav aria-label="Primary" className="grid gap-1.5">
      {destinations.map(({ id, label, icon: Icon }) => (
        <NavLink
          key={id}
          to={`/${id}`}
          className="flex min-h-[40px] items-center gap-3 rounded-[10px] px-3.5 text-[13px] text-fog no-underline transition-colors hover:bg-white/5 hover:text-mist aria-[current=page]:bg-graphite aria-[current=page]:text-mist aria-[current=page]:shadow-[inset_3px_0_#e4f222]"
        >
          <Icon size={17} className="shrink-0" />
          <span className="overflow-hidden text-ellipsis whitespace-nowrap group-data-[sidebar-size=compact]/sidebar:hidden">
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
