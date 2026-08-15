import { createElement, Fragment, type ReactNode } from "react";

const blockedTags = new Set([
  "embed",
  "form",
  "iframe",
  "math",
  "object",
  "script",
  "style",
  "svg",
]);

export function ReleaseNotes({ body }: { body: string }) {
  const document = new DOMParser().parseFromString(body, "text/html");

  return (
    <div className="max-h-48 overflow-y-auto rounded-md border border-graphite bg-carbon/60 p-3 text-sm leading-relaxed text-mist [&_a]:text-acid-lime [&_blockquote]:border-l-2 [&_blockquote]:border-smoke [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_h1]:mb-2 [&_h1]:mt-0 [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-0 [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/30 [&_pre]:p-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      {Array.from(document.body.childNodes).map(renderNode)}
    </div>
  );
}

function renderNode(node: ChildNode, index: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (blockedTags.has(tag)) return null;

  const children = Array.from(element.childNodes).map(renderNode);
  const props = { key: index };

  switch (tag) {
    case "a":
      return createElement(
        "span",
        { ...props, className: "text-acid-lime" },
        children,
      );
    case "b":
    case "strong":
      return createElement("strong", props, children);
    case "i":
    case "em":
      return createElement("em", props, children);
    case "br":
      return createElement("br", props);
    case "blockquote":
    case "code":
    case "del":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
    case "li":
    case "ol":
    case "p":
    case "pre":
    case "s":
    case "ul":
      return createElement(tag, props, children);
    default:
      return createElement(Fragment, props, children);
  }
}
