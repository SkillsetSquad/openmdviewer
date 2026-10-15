"use client";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
export default function Editor({
  value,
  onChange,
  dark,
}: {
  value: string;
  onChange: (value: string) => void;
  dark: boolean;
}) {
  return (
    <CodeMirror
      aria-label="Markdown source editor"
      value={value}
      onChange={onChange}
      theme={dark ? "dark" : "light"}
      height="100%"
      extensions={[markdown(), EditorView.lineWrapping]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        searchKeymap: true,
      }}
    />
  );
}
