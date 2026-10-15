"use client";
import { useEffect, useRef, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
export default function Editor({
  value,
  onChange,
  dark,
  location,
}: {
  value: string;
  onChange: (value: string) => void;
  dark: boolean;
  location?: { line: number; token: number } | null;
}) {
  const viewRef = useRef<EditorView | null>(null);
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "Markdown source editor",
      }),
    ],
    [],
  );
  const focusLine = (view: EditorView, line: number) => {
    const target = view.state.doc.line(
      Math.max(1, Math.min(view.state.doc.lines, line)),
    );
    view.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
    view.focus();
  };
  useEffect(() => {
    if (location && viewRef.current) focusLine(viewRef.current, location.line);
  }, [location]);
  return (
    <CodeMirror
      aria-label="Markdown source editor"
      value={value}
      onChange={onChange}
      theme={dark ? "dark" : "light"}
      height="100%"
      extensions={extensions}
      onCreateEditor={(view) => {
        viewRef.current = view;
        if (location) focusLine(view, location.line);
      }}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        searchKeymap: true,
      }}
    />
  );
}
