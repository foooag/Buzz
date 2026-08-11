import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export function TiptapTestPage() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    autofocus: true,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        "aria-label": "Tiptap test input",
        "aria-multiline": "true",
        role: "textbox",
        class:
          "min-h-24 whitespace-pre-wrap text-[15px] leading-relaxed text-paper outline-hidden",
      },
    },
  });

  return (
    <EditorContent
      editor={editor}
      className="m-6 min-h-32 rounded-xl border border-graphite bg-carbon px-4 py-3 focus-within:border-acid-lime/45"
    />
  );
}
