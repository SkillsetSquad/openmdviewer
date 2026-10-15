"use client";
import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import {
  LanguageDescription,
  type LanguageSupport,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Modal } from "./modal";
import { Button } from "@/components/ui/button";
import { download } from "@/lib/documents";
import { useReader } from "@/lib/store";
export default function SnippetEditor({
  code,
  filename,
  language,
  onClose,
}: {
  code: string;
  filename: string;
  language: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(code);
  const [support, setSupport] = useState<LanguageSupport>();
  const [message, setMessage] = useState("");
  const theme = useReader((s) => s.preferences.theme);
  const dark =
    !["light", "sepia"].includes(theme) &&
    (theme !== "system" ||
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    let canceled = false;
    const match =
      LanguageDescription.matchLanguageName(
        languages,
        language.replace(/^diff-/, ""),
        false,
      ) || LanguageDescription.matchFilename(languages, filename);
    match
      ?.load()
      .then((loaded) => {
        if (!canceled) setSupport(loaded);
      })
      .catch(() => {
        if (!canceled)
          setMessage(
            "Editor syntax colors are unavailable; editing still works.",
          );
      });
    return () => {
      canceled = true;
    };
  }, [language, filename]);
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": "Snippet source editor",
      }),
      ...(support ? [support] : []),
    ],
    [support],
  );
  return (
    <Modal
      title="Snippet scratch editor"
      wide
      onClose={onClose}
      className="snippet-editor-dialog"
    >
      <div className="snippet-editor-content">
        <p className="dialog-description">
          {filename} · Temporary scratch copy. Changes here do not modify the
          Markdown document and are discarded when this editor closes. Download
          or copy to keep them.
        </p>
        <CodeMirror
          aria-label="Snippet source editor"
          value={value}
          onChange={setValue}
          theme={dark ? "dark" : "light"}
          height="360px"
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            searchKeymap: true,
          }}
        />
        <div className="snippet-editor-actions">
          <Button
            onClick={() => {
              download(filename, value, "text/plain;charset=utf-8");
              setMessage("Edited snippet download requested.");
            }}
          >
            Download edited snippet
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                setMessage("Edited snippet copied.");
              } catch {
                setMessage(
                  "Clipboard access was unavailable. Download the edited snippet instead.",
                );
              }
            }}
          >
            Copy edited snippet
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setValue(code);
              setMessage("Scratch copy reset to the original snippet.");
            }}
          >
            Reset scratch copy
          </Button>
        </div>
        <p role="status" className="snippet-editor-status">
          {message}
        </p>
      </div>
    </Modal>
  );
}
