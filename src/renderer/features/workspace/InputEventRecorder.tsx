import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";

type InputEventRecorderProps = {
  children: ReactNode;
  targetLabel: string;
};

function describeNode(node: Node | null) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    return `#text(${JSON.stringify(node.textContent ?? "")})`;
  }

  const element = node as HTMLElement;
  return `${element.tagName.toLowerCase()}${element.getAttribute("aria-label") ? `[aria-label=${JSON.stringify(element.getAttribute("aria-label"))}]` : ""}`;
}

function isTargetEvent(event: Event, targetLabel: string) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(`[aria-label=${JSON.stringify(targetLabel)}]`));
}

function snapshotEvent(event: Event) {
  const selection = window.getSelection();
  const keyboardEvent = event instanceof KeyboardEvent ? event : null;
  const inputEvent = event instanceof InputEvent ? event : null;
  const compositionEvent = event instanceof CompositionEvent ? event : null;

  return JSON.stringify({
    time: Math.round(performance.now()),
    type: event.type,
    key: keyboardEvent?.key ?? null,
    data: inputEvent?.data ?? compositionEvent?.data ?? null,
    inputType: inputEvent?.inputType ?? null,
    isComposing:
      keyboardEvent?.isComposing ?? inputEvent?.isComposing ?? false,
    active: describeNode(document.activeElement),
    anchor: describeNode(selection?.anchorNode ?? null),
    anchorOffset: selection?.anchorOffset ?? null,
    focus: describeNode(selection?.focusNode ?? null),
    focusOffset: selection?.focusOffset ?? null,
  });
}

export function InputEventRecorder({
  children,
  targetLabel,
}: InputEventRecorderProps) {
  const [entries, setEntries] = useState<string[]>([]);

  const record = (event: Event) => {
    setEntries((current) => [...current.slice(-79), snapshotEvent(event)]);
  };

  const recordSynthetic = (event: SyntheticEvent) => record(event.nativeEvent);

  useEffect(() => {
    const recordSelection = (event: Event) => {
      const selection = window.getSelection();
      const selectionInsideTarget =
        selection?.anchorNode instanceof Node &&
        selection.anchorNode.parentElement?.closest(
          `[aria-label=${JSON.stringify(targetLabel)}]`,
        );

      if (!isTargetEvent(event, targetLabel) && !selectionInsideTarget) return;
      record(event);
    };

    document.addEventListener("selectionchange", recordSelection, true);
    return () => {
      document.removeEventListener("selectionchange", recordSelection, true);
    };
  }, [targetLabel]);

  return (
    <div
      onKeyDownCapture={recordSynthetic}
      onBeforeInputCapture={recordSynthetic}
      onInputCapture={recordSynthetic}
      onKeyUpCapture={recordSynthetic}
      onCompositionStartCapture={recordSynthetic}
      onCompositionUpdateCapture={recordSynthetic}
      onCompositionEndCapture={recordSynthetic}
      onFocusCapture={recordSynthetic}
      onBlurCapture={recordSynthetic}
    >
      {children}
      <section className="m-6 rounded-xl border border-graphite bg-carbon p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-paper">Input event recorder</h2>
        <button
          type="button"
          onClick={() => setEntries([])}
          className="rounded-md border border-graphite px-2 py-1 text-xs text-fog hover:text-paper"
        >
          Clear
        </button>
      </div>
      <pre
        aria-label={`${targetLabel} event log`}
        className="max-h-96 min-h-32 overflow-auto whitespace-pre-wrap break-all text-xs leading-relaxed text-fog"
      >
        {entries.length > 0
          ? entries.map((entry, index) => `${index + 1}. ${entry}`).join("\n")
          : "Type in the editor to capture keyboard, input, composition, focus, and selection events."}
      </pre>
      </section>
    </div>
  );
}
