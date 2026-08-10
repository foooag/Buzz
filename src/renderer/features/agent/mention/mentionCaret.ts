// Computes pixel coordinates of a character position in a textarea using a
// hidden mirror div that copies the textarea's font/sizing styles.
const PROPERTIES = [
  "borderBottomWidth", "borderLeftWidth", "borderRightWidth", "borderTopWidth",
  "boxSizing", "fontFamily", "fontSize", "fontStyle", "fontWeight",
  "letterSpacing", "lineHeight", "paddingBottom", "paddingLeft",
  "paddingRight", "paddingTop", "tabSize", "textIndent", "textRendering",
  "textTransform", "width", "wordBreak", "wordSpacing",
] as const;

let mirror: HTMLDivElement | undefined;

export function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): { top: number; left: number } {
  if (!mirror) {
    mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    document.body.appendChild(mirror);
  }
  const style = window.getComputedStyle(textarea);
  // Cast through Record<string, string>: CSSStyleDeclaration includes read-only
  // properties (length, parentRule) that TS forbids assigning through keyof indexing.
  const target = mirror!.style as unknown as Record<string, string>;
  for (const prop of PROPERTIES) target[prop] = style[prop as keyof CSSStyleDeclaration] as string;
  mirror!.style.height = "auto";
  mirror!.style.overflow = "hidden";
  mirror!.textContent = textarea.value.slice(0, position);
  const span = document.createElement("span");
  span.textContent = "​";
  mirror!.appendChild(span);
  const rect = textarea.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  return { top: spanRect.top - rect.top + textarea.scrollTop, left: spanRect.left - rect.left + textarea.scrollLeft };
}
