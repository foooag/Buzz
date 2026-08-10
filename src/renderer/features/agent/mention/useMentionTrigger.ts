import { useCallback, useEffect, useState } from "react";
import { getCaretCoordinates } from "./mentionCaret";

export function extractMentionQuery(text: string, caret: number): { query: string } | undefined {
  const before = text.slice(0, caret);
  const match = before.match(/@([^\s@]*)$/);
  if (!match) return undefined;
  return { query: match[1]! };
}

export type MentionTriggerState = {
  open: boolean;
  query: string;
  coords: { top: number; left: number } | null;
  close: () => void;
};

export function useMentionTrigger(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  onChange: (open: boolean, coords: { top: number; left: number } | null) => void,
): MentionTriggerState {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const recompute = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const found = extractMentionQuery(ta.value, ta.selectionStart ?? 0);
    if (!found) {
      setOpen(false);
      setQuery("");
      return;
    }
    const position = (ta.selectionStart ?? 0) - found.query.length - 1; // index of '@'
    setCoords(getCaretCoordinates(ta, Math.max(0, position)));
    setQuery(found.query);
    setOpen(true);
  }, [textareaRef]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handler = () => recompute();
    ta.addEventListener("input", handler);
    ta.addEventListener("click", handler);
    ta.addEventListener("keyup", handler);
    return () => {
      ta.removeEventListener("input", handler);
      ta.removeEventListener("click", handler);
      ta.removeEventListener("keyup", handler);
    };
  }, [textareaRef, recompute]);

  useEffect(() => { onChange(open, coords); }, [open, coords, onChange]);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);

  return { open, query, coords, close };
}
