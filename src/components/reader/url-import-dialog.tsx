"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { newDocument } from "@/lib/documents";
import {
  fetchMarkdownURL,
  urlImportLimits,
  urlImportPath,
  type URLMarkdown,
} from "@/lib/url-import";
import type { ReaderDocument } from "@/lib/types";
import { Modal } from "./modal";
import { Markdown } from "./markdown";
export default function URLImportDialog({
  workspaceId,
  workspaceName,
  onApply,
  onBusy,
  onClose,
}: {
  workspaceId: string;
  workspaceName: string;
  onApply: (document: ReaderDocument, workspaceId: string) => Promise<void>;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [target] = useState(() => ({ id: workspaceId, name: workspaceName }));
  const [url, setURL] = useState("");
  const [result, setResult] = useState<URLMarkdown | null>(null);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false);
  const [source, setSource] = useState(false),
    [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null),
    active = useRef(true),
    working = useRef(false);
  const previewRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
      onBusy(false);
    };
  }, [onBusy]);
  async function fetchPreview() {
    if (working.current) return;
    working.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    onBusy(true);
    setResult(null);
    setMessage("Fetching the document…");
    try {
      const value = await fetchMarkdownURL(url, abort.signal);
      abort.signal.throwIfAborted();
      if (active.current) {
        setResult(value);
        setPath(`Imported/${value.name}`);
        setSource(false);
        setMessage("Preview ready. Review the document before importing.");
      }
    } catch (error) {
      if (active.current)
        setMessage(
          error instanceof Error && error.name === "AbortError"
            ? "URL request canceled. Nothing was imported."
            : error instanceof Error
              ? error.message
              : "URL import failed.",
        );
    } finally {
      working.current = false;
      if (active.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <Modal
      title="Open Markdown URL"
      onClose={onClose}
      dismissible={!saving}
      wide
      className="url-import-dialog"
    >
      <div className="url-import-body">
        <p>
          Fetch one raw Markdown/text document, review it, then import a local
          copy into <strong>{target.name}</strong>. The URL server receives this
          request. Cookies, credentials and referrer are omitted. The URL is not
          stored with the imported document.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void fetchPreview();
          }}
        >
          <label htmlFor="markdown-url">Document URL</label>
          <input
            id="markdown-url"
            type="url"
            required
            value={url}
            disabled={busy || saving}
            onChange={(event) => {
              setURL(event.target.value);
              setResult(null);
              setMessage("");
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://example.com/README.md"
          />
          <Button type="submit" disabled={busy || saving || !url.trim()}>
            Fetch preview
          </Button>
        </form>
        {message && <p role="status">{message}</p>}
        {busy && (
          <Button variant="outline" onClick={() => controller.current?.abort()}>
            Cancel URL request
          </Button>
        )}
        {result && (
          <>
            <p>
              Fetched from {result.origin} · {result.bytes.toLocaleString()}{" "}
              bytes · {result.type}
            </p>
            <p>
              Only this document is fetched. Relative links and media keep their
              original text and may be unavailable locally; absolute remote
              media still requires separate consent. Browser edits never write
              to the URL.
            </p>
            <label htmlFor="url-import-path">Local document path</label>
            <input
              id="url-import-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              disabled={saving}
            />
            <p>
              Existing paths are preserved: a conflicting import is placed in a
              separate Imports batch.
            </p>
            <div className="repository-buttons">
              <Button
                variant="outline"
                aria-pressed={!source}
                onClick={() => setSource(false)}
              >
                Read URL preview
              </Button>
              <Button
                variant="outline"
                aria-pressed={source}
                onClick={() => setSource(true)}
              >
                URL source preview
              </Button>
            </div>
            {result.content.length > urlImportLimits.previewCharacters && (
              <p>
                Rendered preview shows the first 100,000 characters. Source
                preview and import retain all{" "}
                {result.content.length.toLocaleString()} characters.
              </p>
            )}
            <div ref={previewRoot} className="url-import-preview">
              {source ? (
                <textarea
                  aria-label="Fetched Markdown source"
                  readOnly
                  value={result.content}
                />
              ) : (
                <article className="markdown-body">
                  <Markdown
                    content={result.content.slice(
                      0,
                      urlImportLimits.previewCharacters,
                    )}
                    sourcePath={path || "Remote document.md"}
                    assetURLs={{}}
                    onLink={(href) => {
                      if (href.startsWith("#")) {
                        try {
                          const id = decodeURIComponent(href.slice(1));
                          const element = Array.from(
                            previewRoot.current?.querySelectorAll<HTMLElement>(
                              "[id]",
                            ) || [],
                          ).find(
                            (node) =>
                              node.id === id ||
                              node.id === `user-content-${id}`,
                          );
                          if (element) {
                            element.scrollIntoView({ block: "start" });
                            return;
                          }
                        } catch {}
                      }
                      setMessage(
                        "This local link is not available in the URL preview. Import related documents separately to preserve their paths.",
                      );
                    }}
                  />
                </article>
              )}
            </div>
            <Button
              disabled={saving || busy}
              onClick={() => {
                if (working.current) return;
                let localPath: string;
                try {
                  localPath = urlImportPath(path);
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Choose a valid path.",
                  );
                  return;
                }
                working.current = true;
                setSaving(true);
                onBusy(true);
                setMessage("Importing the reviewed document in this browser…");
                void onApply(newDocument(localPath, result.content), target.id)
                  .then(onClose)
                  .catch((error) => {
                    if (active.current)
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "The local import failed. Retry after checking browser storage.",
                      );
                  })
                  .finally(() => {
                    working.current = false;
                    if (active.current) {
                      setSaving(false);
                      onBusy(false);
                    }
                  });
              }}
            >
              {saving ? "Importing…" : "Import reviewed document"}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
