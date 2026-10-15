"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  BookOpen,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  FilePlus2,
  FileText,
  FolderOpen,
  GitFork as Github,
  History,
  Info,
  Link2,
  List,
  Maximize2,
  Menu,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  Plus,
  Printer,
  Search,
  Settings2,
  ShieldCheck,
  SplitSquareHorizontal,
  Star,
  Sun,
  Type,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileTree } from "./file-tree";
import { Modal } from "./modal";
import { Markdown } from "./markdown";
import { useLocalSearch } from "@/hooks/use-local-search";
import { useReader } from "@/lib/store";
import { storage } from "@/lib/storage";
import { exampleDocuments } from "@/lib/examples";
import {
  analyze,
  documentTitle,
  download,
  fileName,
  headings,
  newDocument,
  resolvePath,
  safePath,
  stats,
  supportedFile,
} from "@/lib/documents";
import type { ReaderDocument, ReaderTheme } from "@/lib/types";
import { basePath } from "@/lib/types";
const Editor = lazy(() => import("./editor"));
type DialogName =
  | "search"
  | "settings"
  | "new"
  | "rename"
  | "export"
  | "tags"
  | "analyze"
  | "help"
  | null;

const IconButton = ({
  label,
  onClick,
  children,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) => (
  <button
    className={`icon-button ${active ? "active" : ""}`}
    title={label}
    aria-label={label}
    aria-pressed={active}
    onClick={onClick}
  >
    {children}
  </button>
);

export default function Workspace() {
  const {
    documents,
    activeId,
    tabs,
    mode,
    preferences,
    setDocuments,
    open,
    closeTab,
    setMode,
    setPreferences,
  } = useReader();
  const [loaded, setLoaded] = useState(false);
  const [storageStatus, setStorageStatus] = useState(
    "Opening local workspace…",
  );
  const [dialog, setDialog] = useState<DialogName>(null);
  const [query, setQuery] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [collection, setCollection] = useState<"all" | "favorites" | "recent">(
    "all",
  );
  const [panel, setPanel] = useState<"contents" | "backlinks" | "graph">(
    "contents",
  );
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [focus, setFocus] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeHeading, setActiveHeading] = useState("");
  const [toast, setToast] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [formValue, setFormValue] = useState("");
  const [leftWidth, setLeftWidth] = useState(264);
  const [rightWidth, setRightWidth] = useState(260);
  const articleRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEdit = useRef<ReaderDocument | null>(null);
  const doc = documents.find((d) => d.id === activeId);
  const outline = useMemo(() => headings(doc?.content || ""), [doc?.content]);
  const metadata = useMemo(() => stats(doc?.content || ""), [doc?.content]);
  const dark =
    ["dark", "oled", "contrast"].includes(preferences.theme) ||
    (preferences.theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const notify = useCallback((message: string) => setToast(message), []);
  const save = useCallback(
    async (document: ReaderDocument) => {
      try {
        await storage.put(document);
        setStorageStatus("Saved in this browser");
      } catch {
        setStorageStatus("Browser storage unavailable");
        notify("Could not save locally. Export a backup to keep your changes.");
      }
    },
    [notify],
  );
  const flushEdit = useCallback(() => {
    if (editTimer.current) clearTimeout(editTimer.current);
    if (pendingEdit.current) {
      void save(pendingEdit.current);
      pendingEdit.current = null;
    }
  }, [save]);
  useEffect(() => {
    let canceled = false;
    storage
      .load()
      .then(async (saved) => {
        if (canceled) return;
        const docs = saved.length ? saved : exampleDocuments();
        setDocuments(docs);
        if (!saved.length) await storage.putAll(docs);
        let last = "";
        try {
          const prefs = JSON.parse(
            localStorage.getItem("openmdviewer.preferences") || "{}",
          );
          setPreferences(prefs);
          last = localStorage.getItem("openmdviewer.active") || "";
        } catch {}
        open(docs.some((d) => d.id === last) ? last : docs[0].id);
        setStorageStatus("Saved in this browser");
        setLoaded(true);
      })
      .catch(() => {
        if (!canceled) {
          const docs = exampleDocuments();
          setDocuments(docs);
          open(docs[0].id);
          setStorageStatus("Browser storage unavailable");
          setLoaded(true);
          notify(
            "Local storage could not be opened. Download your files before closing.",
          );
        }
      });
    return () => {
      canceled = true;
    };
  }, [open, setDocuments, setPreferences, notify]);
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(
          "openmdviewer.preferences",
          JSON.stringify(preferences),
        );
        localStorage.setItem("openmdviewer.active", activeId);
      } catch {}
    }
  }, [preferences, activeId, loaded]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (
        pendingEdit.current ||
        storageStatus === "Browser storage unavailable"
      ) {
        e.preventDefault();
        flushEdit();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flushEdit, storageStatus]);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
        .catch(() => {});
  }, []);
  const openDocument = useCallback(
    (id: string) => {
      flushEdit();
      if (activeId !== id) setHistory((h) => [...h, activeId].slice(-40));
      open(id);
      if (window.innerWidth < 900) setLeftOpen(false);
    },
    [activeId, open, flushEdit],
  );
  const update = useCallback(
    (patch: Partial<ReaderDocument>, debounce = false) => {
      if (!doc) return;
      const updated = {
        ...doc,
        ...patch,
        updatedAt: patch.content !== undefined ? Date.now() : doc.updatedAt,
      };
      setDocuments(documents.map((d) => (d.id === doc.id ? updated : d)));
      if (debounce) {
        pendingEdit.current = updated;
        setStorageStatus("Saving to browser…");
        if (editTimer.current) clearTimeout(editTimer.current);
        editTimer.current = setTimeout(flushEdit, 450);
      } else {
        flushEdit();
        void save(updated);
      }
    },
    [doc, documents, setDocuments, save, flushEdit],
  );
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDialog("search");
        setQuery("");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        filesRef.current?.click();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushEdit();
        if (doc) download(doc.path, doc.content);
      }
      if (e.key === "Escape") {
        setFindOpen(false);
        setFocus(false);
        setPresentation(false);
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [doc, flushEdit]);
  useEffect(() => {
    if (!loaded || !viewportRef.current) return;
    viewportRef.current.scrollTop =
      useReader.getState().documents.find((d) => d.id === activeId)?.scroll ||
      0;
    setProgress(0);
  }, [activeId, loaded]); // Restore only when switching documents, not while editing.
  useEffect(() => {
    if (!articleRef.current || !viewportRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActiveHeading(visible.target.id);
      },
      { root: viewportRef.current, rootMargin: "-5% 0px -75% 0px" },
    );
    articleRef.current
      .querySelectorAll("h1,h2,h3,h4,h5,h6")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [doc?.content, mode, loaded]);
  const navigateLink = useCallback(
    (href: string) => {
      if (!doc) return;
      try {
        const [path, anchor] = href.split("#");
        const target = path
          ? documents.find((d) => d.path === resolvePath(doc.path, path))
          : doc;
        if (!target) {
          notify(`Document not in this workspace: ${path}`);
          return;
        }
        if (target.id !== activeId) openDocument(target.id);
        if (anchor)
          setTimeout(
            () =>
              document
                .getElementById(decodeURIComponent(anchor))
                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
            target.id === activeId ? 0 : 100,
          );
      } catch {
        notify("This document link is not valid.");
      }
    },
    [doc, documents, activeId, openDocument, notify],
  );
  async function importFiles(files: File[]) {
    flushEdit();
    try {
      const additions: ReaderDocument[] = [];
      for (const file of files) {
        if (file.size > 30 * 1024 * 1024) {
          notify(`Skipped ${file.name}: the import limit is 30 MB per file.`);
          continue;
        }
        if (/\.zip$/i.test(file.name)) {
          const { unzipSync, strFromU8 } = await import("fflate");
          let expanded = 0;
          const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()), {
            filter: (entry) => {
              if (!supportedFile(entry.name)) return false;
              expanded += entry.originalSize;
              if (
                entry.originalSize > 30 * 1024 * 1024 ||
                expanded > 100 * 1024 * 1024
              )
                throw new Error(
                  "Archive exceeds the 100 MB expanded import limit.",
                );
              return true;
            },
          });
          for (const [path, bytes] of Object.entries(unzipped))
            if (supportedFile(path))
              additions.push(newDocument(path, strFromU8(bytes)));
        } else if (supportedFile(file.name))
          additions.push(
            newDocument(
              file.webkitRelativePath || `Imported/${file.name}`,
              await file.text(),
            ),
          );
      }
      if (!additions.length) {
        notify("Choose Markdown, MDX, text files, or a ZIP containing them.");
        return;
      }
      const used = new Set(documents.map((d) => d.path));
      for (const added of additions) {
        const original = added.path;
        let n = 2;
        while (used.has(added.path))
          added.path = original.replace(/(\.[^.]*)?$/, ` (${n++})$1`);
        used.add(added.path);
      }
      if (additions.length + documents.length > 10000)
        throw new Error("This workspace supports up to 10,000 documents.");
      await storage.putAll(additions);
      setDocuments([...documents, ...additions]);
      openDocument(additions[0].id);
      notify(
        `Imported ${additions.length} ${additions.length === 1 ? "document" : "documents"}. Kept on this device.`,
      );
    } catch (error) {
      notify(
        `Import failed: ${error instanceof Error ? error.message : "Browser storage unavailable"}`,
      );
    }
  }
  async function fileInput(e: ChangeEvent<HTMLInputElement>) {
    await importFiles(Array.from(e.target.files || []));
    e.target.value = "";
  }
  async function exportZip() {
    flushEdit();
    const { zipSync, strToU8 } = await import("fflate");
    const data = Object.fromEntries(
      documents.map((d) => [safePath(d.path), strToU8(d.content)]),
    );
    download(
      "openmdviewer-workspace.zip",
      zipSync(data) as BlobPart,
      "application/zip",
    );
    notify("Workspace ZIP downloaded.");
  }
  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify("Clipboard unavailable. Use Export to download this document.");
    }
  }
  function jump(id: string) {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveHeading(id);
  }
  function findNext() {
    const textNodes: Text[] = [];
    if (!articleRef.current || !find.trim()) return;
    const walker = document.createTreeWalker(
      articleRef.current,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    const node = textNodes.find((n) =>
      n.textContent?.toLowerCase().includes(find.toLowerCase()),
    );
    if (!node) {
      notify("No matches in the rendered document.");
      return;
    }
    const start = node.textContent!.toLowerCase().indexOf(find.toLowerCase());
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + find.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    node.parentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const filtered = useMemo(
    () =>
      documents
        .filter(
          (d) =>
            (collection !== "favorites" || d.favorite) &&
            (!fileFilter ||
              `${d.path} ${d.tags.join(" ")}`
                .toLowerCase()
                .includes(fileFilter.toLowerCase())),
        )
        .sort((a, b) =>
          collection === "recent" ? b.updatedAt - a.updatedAt : 0,
        ),
    [documents, collection, fileFilter],
  );
  const searchIds = useLocalSearch(documents, query);
  const results = useMemo(() => {
    if (searchIds)
      return searchIds
        .map((id) => documents.find((d) => d.id === id))
        .filter((d): d is ReaderDocument => !!d);
    const tokens = query.toLowerCase().match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return documents
      .filter((d) =>
        tokens.every((token) => {
          const [filter, ...rest] = token.split(":");
          const value = rest.join(":");
          if (filter === "tag" && value)
            return d.tags.some((t) => t.toLowerCase().includes(value));
          if (filter === "path" && value)
            return d.path.toLowerCase().includes(value);
          if (filter === "heading" && value)
            return headings(d.content).some((h) =>
              h.text.toLowerCase().includes(value),
            );
          return `${d.path}\n${d.content}`
            .toLowerCase()
            .includes(token.replace(/^"|"$/g, ""));
        }),
      )
      .slice(0, 40);
  }, [documents, query, searchIds]);
  const backlinks = useMemo(
    () =>
      doc
        ? documents.filter(
            (d) =>
              d.id !== doc.id &&
              [
                ...d.content.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/g),
              ].some((m) => {
                try {
                  return resolvePath(d.path, m[1]) === doc.path;
                } catch {
                  return false;
                }
              }),
          )
        : [],
    [doc, documents],
  );
  function resize(side: "left" | "right", e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const initial = e.clientX;
    const size = side === "left" ? leftWidth : rightWidth;
    const move = (ev: PointerEvent) =>
      (side === "left" ? setLeftWidth : setRightWidth)(
        Math.max(
          220,
          Math.min(
            400,
            size + (ev.clientX - initial) * (side === "left" ? 1 : -1),
          ),
        ),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <div
      className={`workspace theme-${preferences.theme} ${focus ? "focus-mode" : ""} ${presentation ? "presentation-mode" : ""}`}
      style={
        {
          "--left-width": `${leftWidth}px`,
          "--right-width": `${rightWidth}px`,
          "--reader-size": `${preferences.fontSize}px`,
          "--reader-leading": preferences.lineHeight,
          "--reader-width": `${preferences.readingWidth}px`,
          "--reader-font":
            preferences.fontFamily === "serif"
              ? "Georgia, serif"
              : preferences.fontFamily === "mono"
                ? "var(--font-geist-mono), monospace"
                : "var(--font-geist-sans), sans-serif",
        } as CSSProperties
      }
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <a className="skip-link" href="#document-content">
        Skip to document
      </a>
      <input
        className="sr-only"
        tabIndex={-1}
        type="file"
        aria-label="Import Markdown files"
        multiple
        accept=".md,.markdown,.mdown,.mkd,.mdx,.txt,.zip"
        ref={filesRef}
        onChange={fileInput}
      />
      <input
        className="sr-only"
        tabIndex={-1}
        type="file"
        multiple
        aria-label="Import local folder"
        ref={folderRef}
        {...({ webkitdirectory: "", directory: "" } as object)}
        onChange={fileInput}
      />
      {leftOpen && !focus && (
        <>
          <aside className="left-sidebar" aria-label="File navigation">
            <div className="brand">
              <div className="brand-mark">
                M<span>↓</span>
              </div>
              <div>
                <strong>OpenMDViewer</strong>
                <p>
                  Self-hosted{" "}
                  <span className="local-status">
                    <i /> Local
                  </span>
                </p>
              </div>
              <IconButton
                label="Close file navigation"
                onClick={() => setLeftOpen(false)}
              >
                <PanelLeftClose size={17} />
              </IconButton>
            </div>
            <button
              className="search-trigger"
              onClick={() => {
                setDialog("search");
                setQuery("");
              }}
            >
              <Search size={16} />
              <span>Search files…</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="workspace-label">
              <span>WORKSPACE</span>
              <div>
                <IconButton
                  label="Open folder"
                  onClick={() => folderRef.current?.click()}
                >
                  <FolderOpen size={15} />
                </IconButton>
                <IconButton
                  label="Create document"
                  onClick={() => {
                    setFormValue("Untitled.md");
                    setDialog("new");
                  }}
                >
                  <Plus size={15} />
                </IconButton>
              </div>
            </div>
            <div className="collection-bar">
              <button
                className={collection === "all" ? "active" : ""}
                onClick={() => setCollection("all")}
              >
                <FolderOpen size={13} />
                Files
              </button>
              <button
                className={collection === "favorites" ? "active" : ""}
                onClick={() => setCollection("favorites")}
              >
                <Star size={13} />
                Favorites
              </button>
              <button
                className={collection === "recent" ? "active" : ""}
                onClick={() => setCollection("recent")}
                aria-label="Recent documents"
                title="Recent documents"
              >
                <History size={14} />
              </button>
            </div>
            {documents.length > 20 && (
              <input
                className="file-filter"
                aria-label="Filter file tree"
                placeholder="Filter files…"
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
              />
            )}
            <div className="tree-scroll">
              {!loaded ? (
                <div className="tree-loading">Opening your workspace…</div>
              ) : filtered.length ? (
                <FileTree
                  documents={filtered}
                  activeId={activeId}
                  onOpen={openDocument}
                />
              ) : (
                <div className="empty-panel">
                  {collection === "favorites"
                    ? "Star a document to keep it here."
                    : "No matching documents."}
                </div>
              )}
            </div>
            <div className="sidebar-bottom">
              <Button
                className="open-files-button"
                variant="outline"
                onClick={() => filesRef.current?.click()}
              >
                <Upload size={15} />
                Open files<span>⌘ O</span>
              </Button>
              <div className="storage-card">
                <ShieldCheck size={19} />
                <div>
                  <strong>
                    {loaded
                      ? `${documents.length} documents, all local`
                      : "Local-first by design"}
                  </strong>
                  <p>{storageStatus}</p>
                </div>
                <span className="status-dot" />
              </div>
              <div className="sidebar-footer">
                <span>YOUR WORDS. YOUR SPACE.</span>
                <a
                  href="https://github.com/SkillsetSquad/openmdviewer"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View source on GitHub"
                >
                  <Github size={15} />
                </a>
                <IconButton
                  label="Help and shortcuts"
                  onClick={() => setDialog("help")}
                >
                  <CircleHelp size={15} />
                </IconButton>
              </div>
            </div>
          </aside>
          <div
            className="resize-handle left-resize"
            role="separator"
            aria-label="Resize file navigation"
            aria-orientation="vertical"
            onPointerDown={(e) => resize("left", e)}
          />
        </>
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            {(!leftOpen || focus) && (
              <IconButton
                label="Open file navigation"
                onClick={() => {
                  setFocus(false);
                  setLeftOpen(true);
                }}
              >
                <Menu size={18} />
              </IconButton>
            )}
            <IconButton
              label="Previous document"
              onClick={() => {
                const previous = history[history.length - 1];
                if (previous) {
                  flushEdit();
                  open(previous);
                  setHistory(history.slice(0, -1));
                }
              }}
            >
              <ArrowLeft size={15} />
            </IconButton>
            {doc?.path
              .split("/")
              .slice(0, -1)
              .map((part, i) => (
                <span className="breadcrumb-part" key={i}>
                  {part}
                  <ChevronRight size={13} />
                </span>
              ))}
            <span className="current-breadcrumb">
              <FileText size={14} />
              {doc ? fileName(doc.path) : "Your workspace"}
            </span>
          </div>
          <div className="toolbar">
            <button
              className="document-search"
              onClick={() => setFindOpen(!findOpen)}
            >
              <Search size={14} />
              <span>Search in document…</span>
              <kbd>⌘ F</kbd>
            </button>
            <div className="mode-group">
              <IconButton
                label="Reading view"
                active={mode === "read"}
                onClick={() => setMode("read")}
              >
                <BookOpen size={17} />
              </IconButton>
              <IconButton
                label="Split view"
                active={mode === "split"}
                onClick={() => setMode("split")}
              >
                <SplitSquareHorizontal size={17} />
              </IconButton>
              <IconButton
                label="Source view"
                active={mode === "source"}
                onClick={() => setMode("source")}
              >
                <Code2 size={17} />
              </IconButton>
            </div>
            <IconButton
              label="Toggle light and dark theme"
              onClick={() => setPreferences({ theme: dark ? "light" : "dark" })}
            >
              {dark ? <Moon size={17} /> : <Sun size={17} />}
            </IconButton>
            <IconButton
              label="Reading settings"
              onClick={() => setDialog("settings")}
            >
              <Type size={19} />
            </IconButton>
            <IconButton
              label="Toggle focus mode"
              active={focus}
              onClick={() => setFocus(!focus)}
            >
              <Maximize2 size={16} />
            </IconButton>
            <IconButton
              label="Toggle document details"
              active={rightOpen}
              onClick={() => setRightOpen(!rightOpen)}
            >
              <PanelRightClose size={16} />
            </IconButton>
          </div>
        </header>
        {tabs.length > 1 && (
          <div
            className="document-tabs"
            role="tablist"
            aria-label="Open documents"
          >
            {tabs.map((id) => {
              const d = documents.find((d) => d.id === id);
              return (
                d && (
                  <div className={activeId === id ? "active" : ""} key={id}>
                    <button
                      role="tab"
                      aria-selected={activeId === id}
                      onClick={() => openDocument(id)}
                    >
                      <FileText size={13} />
                      {fileName(d.path)}
                    </button>
                    <button
                      aria-label={`Close ${fileName(d.path)} tab`}
                      onClick={() => {
                        flushEdit();
                        closeTab(id);
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )
              );
            })}
          </div>
        )}
        {findOpen && (
          <form
            className="find-bar"
            onSubmit={(e) => {
              e.preventDefault();
              findNext();
            }}
          >
            <Search size={16} />
            <input
              autoFocus
              aria-label="Find in document"
              placeholder="Find in document…"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
            <button type="submit">Find</button>
            <button
              type="button"
              aria-label="Close document search"
              onClick={() => setFindOpen(false)}
            >
              <X size={15} />
            </button>
          </form>
        )}
        <div className={`document-area mode-${mode}`}>
          {(mode === "source" || mode === "split") && doc && (
            <section className="editor-pane" aria-label="Markdown editor">
              <div className="editor-heading">
                <Code2 size={14} />
                Markdown source
                <span>Autosaved to browser · download to save a file</span>
              </div>
              <Suspense
                fallback={<p className="empty-panel">Loading editor…</p>}
              >
                <Editor
                  key={doc.id}
                  dark={dark}
                  value={doc.content}
                  onChange={(content) => update({ content }, true)}
                />
              </Suspense>
            </section>
          )}
          {mode !== "source" && (
            <div
              className="document-viewport"
              ref={viewportRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                setProgress(
                  el.scrollHeight <= el.clientHeight
                    ? 100
                    : Math.round(
                        (el.scrollTop / (el.scrollHeight - el.clientHeight)) *
                          100,
                      ),
                );
                if (doc) {
                  useReader.setState((s) => ({
                    documents: s.documents.map((d) =>
                      d.id === doc.id ? { ...d, scroll: el.scrollTop } : d,
                    ),
                  }));
                  void storage.scroll(doc.id, el.scrollTop).catch(() => {});
                }
              }}
            >
              {!loaded ? (
                <div className="reader-skeleton">
                  <div />
                  <div />
                  <div />
                  <div />
                </div>
              ) : doc ? (
                <div className="reading-surface">
                  <div className="document-eyebrow">
                    <span className="guide-badge">
                      <BookOpen size={12} />
                      {doc.tags[0] || "Document"}
                    </span>
                    <span>
                      <Clock3 size={12} />
                      {metadata.minutes} min read
                    </span>
                    <div className="document-quick-actions">
                      <IconButton
                        label={
                          doc.favorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        active={doc.favorite}
                        onClick={() => update({ favorite: !doc.favorite })}
                      >
                        <Star
                          size={15}
                          fill={doc.favorite ? "currentColor" : "none"}
                        />
                      </IconButton>
                      <IconButton
                        label="Rename document"
                        onClick={() => {
                          setFormValue(doc.path);
                          setDialog("rename");
                        }}
                      >
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        label="Export document"
                        onClick={() => setDialog("export")}
                      >
                        <ArrowDownToLine size={15} />
                      </IconButton>
                    </div>
                  </div>
                  <article
                    id="document-content"
                    tabIndex={-1}
                    ref={articleRef}
                    className={`markdown-body ${doc.id === "example-0" && !presentation ? "configuration-document" : ""}`}
                  >
                    {doc.id === "example-0" &&
                    !presentation &&
                    doc.content.includes("![A still alpine lake") ? (
                      <>
                        <div className="configuration-left">
                          <Markdown
                            content={doc.content.slice(
                              0,
                              doc.content.indexOf("![A still alpine lake"),
                            )}
                            onLink={navigateLink}
                          />
                        </div>
                        <div className="configuration-right">
                          <Markdown
                            content={doc.content.slice(
                              doc.content.indexOf("![A still alpine lake"),
                            )}
                            onLink={navigateLink}
                          />
                        </div>
                      </>
                    ) : (
                      <Markdown content={doc.content} onLink={navigateLink} />
                    )}
                  </article>
                  <footer className="document-footer">
                    <span>
                      <ShieldCheck size={13} />
                      This document stays on your device
                    </span>
                    <button onClick={() => jump(outline[0]?.id || "")}>
                      Back to top ↑
                    </button>
                  </footer>
                </div>
              ) : (
                <div className="welcome-empty">
                  <BookOpen size={38} />
                  <h1>A little space for your words.</h1>
                  <p>Open a Markdown file or create something new.</p>
                  <Button onClick={() => filesRef.current?.click()}>
                    Open files
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFormValue("Untitled.md");
                      setDialog("new");
                    }}
                  >
                    New document
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="bottom-status">
          <span>
            <span className="status-dot" />
            {storageStatus}
          </span>
          <span>
            {metadata.words.toLocaleString()} words
            <span className="status-divider">·</span>
            {doc
              ? fileName(doc.path).split(".").pop()?.toUpperCase()
              : "MARKDOWN"}
            <span className="status-divider">·</span>UTF-8
          </span>
        </div>
      </div>
      {rightOpen && !focus && (
        <>
          <div
            className="resize-handle right-resize"
            role="separator"
            aria-label="Resize document details"
            aria-orientation="vertical"
            onPointerDown={(e) => resize("right", e)}
          />
          <aside className="right-sidebar" aria-label="Document details">
            <div className="progress-header">
              <div>
                <span style={{ width: `${progress}%` }} />
              </div>
              <span>{progress}%</span>
            </div>
            <div className="right-inner">
              <div
                className="detail-tabs"
                role="tablist"
                aria-label="Document context"
              >
                <button
                  role="tab"
                  aria-selected={panel === "contents"}
                  className={panel === "contents" ? "active" : ""}
                  onClick={() => setPanel("contents")}
                >
                  Contents
                </button>
                <button
                  role="tab"
                  aria-selected={panel === "backlinks"}
                  className={panel === "backlinks" ? "active" : ""}
                  onClick={() => setPanel("backlinks")}
                >
                  Backlinks <small>{backlinks.length}</small>
                </button>
                <button
                  role="tab"
                  aria-selected={panel === "graph"}
                  className={panel === "graph" ? "active" : ""}
                  onClick={() => setPanel("graph")}
                >
                  Graph
                </button>
              </div>
              {panel === "contents" && (
                <nav className="contents-list" aria-label="Table of contents">
                  {outline
                    .filter((h) => h.depth > 1)
                    .map((h) => (
                      <button
                        className={activeHeading === h.id ? "active" : ""}
                        style={{
                          paddingLeft: `${13 + Math.max(0, h.depth - 2) * 12}px`,
                        }}
                        key={h.id}
                        onClick={() => jump(h.id)}
                      >
                        {h.text}
                      </button>
                    ))}
                  {outline.length < 2 && (
                    <p className="empty-panel">
                      Add headings to build an outline.
                    </p>
                  )}
                </nav>
              )}
              {panel === "backlinks" && (
                <div className="backlinks-panel">
                  {backlinks.length ? (
                    backlinks.map((d) => (
                      <button key={d.id} onClick={() => openDocument(d.id)}>
                        <Link2 size={14} />
                        <span>
                          {fileName(d.path)}
                          <small>{d.path}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="empty-panel">
                      No documents link here yet. Relative Markdown links appear
                      here automatically.
                    </p>
                  )}
                </div>
              )}
              {panel === "graph" && (
                <div className="graph-panel">
                  <div className="graph-visual">
                    <svg
                      viewBox="0 0 220 170"
                      aria-label="Current document and its backlinks"
                    >
                      <g stroke="var(--border)">
                        {backlinks.map((d, i) => (
                          <line
                            key={d.id}
                            x1="110"
                            y1="85"
                            x2={
                              110 +
                              70 *
                                Math.cos(
                                  (i * 2 * Math.PI) /
                                    Math.max(backlinks.length, 1),
                                )
                            }
                            y2={
                              85 +
                              60 *
                                Math.sin(
                                  (i * 2 * Math.PI) /
                                    Math.max(backlinks.length, 1),
                                )
                            }
                          />
                        ))}
                      </g>
                      <circle
                        cx="110"
                        cy="85"
                        r="10"
                        fill="var(--accent-blue)"
                      />
                      {backlinks.map((d, i) => (
                        <circle
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${fileName(d.path)}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") openDocument(d.id);
                          }}
                          onClick={() => openDocument(d.id)}
                          key={d.id}
                          cx={
                            110 +
                            70 *
                              Math.cos(
                                (i * 2 * Math.PI) /
                                  Math.max(backlinks.length, 1),
                              )
                          }
                          cy={
                            85 +
                            60 *
                              Math.sin(
                                (i * 2 * Math.PI) /
                                  Math.max(backlinks.length, 1),
                              )
                          }
                          r="6"
                          fill="var(--muted-foreground)"
                        >
                          <title>{d.path}</title>
                        </circle>
                      ))}
                    </svg>
                  </div>
                  <p>
                    {backlinks.length} incoming{" "}
                    {backlinks.length === 1 ? "connection" : "connections"}
                  </p>
                </div>
              )}
              <section className="details-section">
                <h2>Document Info</h2>
                <dl>
                  <div>
                    <dt>
                      <Clock3 size={14} />
                      Last updated
                    </dt>
                    <dd>
                      {doc
                        ? new Date(doc.updatedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <FileText size={14} />
                      Words
                    </dt>
                    <dd>{metadata.words.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>
                      <Clock3 size={14} />
                      Reading time
                    </dt>
                    <dd>{metadata.minutes} min</dd>
                  </div>
                  <div>
                    <dt>
                      <List size={14} />
                      Headings
                    </dt>
                    <dd>{metadata.headings}</dd>
                  </div>
                  <div>
                    <dt>
                      <Code2 size={14} />
                      Language
                    </dt>
                    <dd>Markdown</dd>
                  </div>
                </dl>
              </section>
              <section className="details-section">
                <div className="section-heading">
                  <h2>Tags</h2>
                  <IconButton
                    label="Edit tags"
                    onClick={() => {
                      setFormValue(doc?.tags.join(", ") || "");
                      setDialog("tags");
                    }}
                  >
                    <Plus size={14} />
                  </IconButton>
                </div>
                <div className="tag-list">
                  {doc?.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        setQuery(`tag:${tag}`);
                        setDialog("search");
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                  {!doc?.tags.length && (
                    <span className="muted">No tags yet</span>
                  )}
                </div>
              </section>
              <section className="details-section">
                <h2>Actions</h2>
                <div className="action-list">
                  <button
                    onClick={() => copy(doc?.content || "", "Markdown copied.")}
                  >
                    <Copy size={14} />
                    Copy Markdown<kbd>⌘ C</kbd>
                  </button>
                  <button
                    onClick={() =>
                      setMode(mode === "source" ? "read" : "source")
                    }
                  >
                    <FileText size={14} />
                    {mode === "source" ? "Reading view" : "Open raw file"}
                    <Code2 size={13} />
                  </button>
                  <button onClick={() => setDialog("export")}>
                    <ArrowDownToLine size={14} />
                    Export
                    <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setFocus(!presentation);
                      setPresentation(!presentation);
                    }}
                  >
                    <Maximize2 size={14} />
                    Presentation mode
                  </button>
                  <button onClick={() => window.print()}>
                    <Printer size={14} />
                    Print<kbd>⌘ P</kbd>
                  </button>
                  <button onClick={() => setDialog("analyze")}>
                    <CheckCheck size={14} />
                    Analyze document
                  </button>
                </div>
              </section>
              <section className="details-section related-section">
                <h2>Related Documents</h2>
                {documents
                  .filter(
                    (d) =>
                      d.id !== activeId &&
                      d.path.split("/").slice(0, -1).join("/") ===
                        doc?.path.split("/").slice(0, -1).join("/"),
                  )
                  .slice(0, 3)
                  .map((d) => (
                    <button
                      className="related-document"
                      key={d.id}
                      onClick={() => openDocument(d.id)}
                    >
                      <FileText size={16} />
                      <span>
                        {fileName(d.path)}
                        <small>{documentTitle(d)}</small>
                      </span>
                    </button>
                  ))}
              </section>
              <div className="privacy-note">
                <ShieldCheck size={14} />
                <span>
                  Private by design.
                  <br />
                  No accounts. No uploads.
                </span>
              </div>
            </div>
          </aside>
        </>
      )}
      {focus && (
        <button
          className="exit-focus"
          onClick={() => {
            setFocus(false);
            setPresentation(false);
          }}
        >
          <ArrowLeft size={15} />
          Exit {presentation ? "presentation" : "focus"}
          <kbd>esc</kbd>
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {dialog === "search" && (
        <Modal
          title="Search your workspace"
          onClose={() => setDialog(null)}
          wide
        >
          <div className="palette-search">
            <Search size={20} />
            <input
              autoFocus
              placeholder="Search documents, headings, or commands…"
              aria-label="Search documents and commands"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>esc</kbd>
          </div>
          <div className="palette-results">
            {!query && (
              <>
                <div className="result-label">QUICK ACTIONS</div>
                {[
                  { label: "Open files", icon: Upload, action: "files" },
                  {
                    label: "Open local folder",
                    icon: FolderOpen,
                    action: "folder",
                  },
                  { label: "Create document", icon: FilePlus2, action: "new" },
                  {
                    label: "Reading settings",
                    icon: Settings2,
                    action: "settings",
                  },
                  {
                    label: "Toggle focus mode",
                    icon: Maximize2,
                    action: "focus",
                  },
                  {
                    label: "Export workspace ZIP",
                    icon: ArrowDownToLine,
                    action: "export",
                  },
                ].map(({ label, icon: Icon, action }) => (
                  <button
                    className="command-result"
                    key={label}
                    onClick={() => {
                      setDialog(null);
                      if (action === "files") filesRef.current?.click();
                      if (action === "folder") folderRef.current?.click();
                      if (action === "new") {
                        setFormValue("Untitled.md");
                        setDialog("new");
                      }
                      if (action === "settings") setDialog("settings");
                      if (action === "focus") setFocus(!focus);
                      if (action === "export") void exportZip();
                    }}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </>
            )}
            <div className="result-label">
              {query ? `${results.length} MATCHING DOCUMENTS` : "DOCUMENTS"}
            </div>
            {results.map((d) => (
              <button
                className="search-result"
                key={d.id}
                onClick={() => {
                  openDocument(d.id);
                  setDialog(null);
                }}
              >
                <FileText size={18} />
                <span>
                  <strong>{documentTitle(d)}</strong>
                  <small>{d.path}</small>
                  {query && (
                    <p>
                      {d.content
                        .slice(
                          Math.max(
                            0,
                            d.content
                              .toLowerCase()
                              .indexOf(query.toLowerCase()) - 40,
                          ),
                          Math.max(
                            0,
                            d.content
                              .toLowerCase()
                              .indexOf(query.toLowerCase()) - 40,
                          ) + 150,
                        )
                        .replace(/[#*`]/g, "")}
                    </p>
                  )}
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
            {query && !results.length && (
              <div className="empty-panel">
                No matches. Try a different phrase, path:docs, or tag:guide.
              </div>
            )}
          </div>
          <footer className="palette-footer">
            <span>
              <ShieldCheck size={12} />
              Search runs on this device
            </span>
            <span>Tab to navigate · Enter to open</span>
          </footer>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title="Make yourself at home" onClose={() => setDialog(null)}>
          <p className="dialog-description">
            A reading space that feels like yours. Preferences stay on this
            device.
          </p>
          <div className="settings-form">
            <label>
              Appearance
              <select
                value={preferences.theme}
                onChange={(e) =>
                  setPreferences({ theme: e.target.value as ReaderTheme })
                }
              >
                <option value="dark">Midnight · Dark</option>
                <option value="light">Daylight · Light</option>
                <option value="sepia">Warm paper · Sepia</option>
                <option value="oled">Lights out · OLED</option>
                <option value="contrast">High contrast</option>
                <option value="system">Match system</option>
              </select>
            </label>
            <label>
              Typography
              <select
                value={preferences.fontFamily}
                onChange={(e) =>
                  setPreferences({
                    fontFamily: e.target.value as "sans" | "serif" | "mono",
                  })
                }
              >
                <option value="sans">Sans serif</option>
                <option value="serif">Literary serif</option>
                <option value="mono">Monospace</option>
              </select>
            </label>
            <label>
              Text size <span>{preferences.fontSize}px</span>
              <input
                type="range"
                min="12"
                max="24"
                value={preferences.fontSize}
                onChange={(e) => setPreferences({ fontSize: +e.target.value })}
              />
            </label>
            <label>
              Line spacing <span>{preferences.lineHeight}</span>
              <input
                type="range"
                min="1.3"
                max="2.2"
                step="0.05"
                value={preferences.lineHeight}
                onChange={(e) =>
                  setPreferences({ lineHeight: +e.target.value })
                }
              />
            </label>
            <label>
              Reading width <span>{preferences.readingWidth}px</span>
              <input
                type="range"
                min="600"
                max="1400"
                step="20"
                value={preferences.readingWidth}
                onChange={(e) =>
                  setPreferences({ readingWidth: +e.target.value })
                }
              />
            </label>
          </div>
          <div className="dialog-buttons">
            <Button
              variant="outline"
              onClick={() =>
                setPreferences({
                  theme: "dark",
                  fontSize: 15,
                  lineHeight: 1.75,
                  readingWidth: 1100,
                  fontFamily: "sans",
                })
              }
            >
              Reset defaults
            </Button>
            <Button onClick={() => setDialog(null)}>Done</Button>
          </div>
        </Modal>
      )}
      {(dialog === "new" || dialog === "rename" || dialog === "tags") && (
        <Modal
          title={
            dialog === "new"
              ? "A fresh page"
              : dialog === "rename"
                ? "Rename document"
                : "Edit document tags"
          }
          onClose={() => setDialog(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (dialog === "tags")
                update({
                  tags: [
                    ...new Set(
                      formValue
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    ),
                  ],
                });
              else {
                const path = safePath(formValue);
                if (!supportedFile(path)) {
                  notify("Use a Markdown or text file extension.");
                  return;
                }
                if (
                  documents.some(
                    (d) =>
                      d.path === path &&
                      d.id !== (dialog === "rename" ? activeId : ""),
                  )
                ) {
                  notify("That document path already exists.");
                  return;
                }
                if (dialog === "new") {
                  const added = newDocument(
                    path,
                    `# ${fileName(path).replace(/\.[^.]+$/, "")}\n\nYour next idea starts here.\n`,
                  );
                  try {
                    await storage.put(added);
                    setDocuments([...documents, added]);
                    openDocument(added.id);
                    setMode("split");
                  } catch {
                    notify(
                      "Could not create document. Browser storage is unavailable.",
                    );
                    return;
                  }
                } else update({ path });
              }
              setDialog(null);
            }}
          >
            <label className="form-label">
              {dialog === "tags" ? "Tags, separated by commas" : "File path"}
              <input
                autoFocus
                required={dialog !== "tags"}
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder={
                  dialog === "tags"
                    ? "guide, reference, notes"
                    : "Notes/My next idea.md"
                }
              />
            </label>
            {dialog !== "tags" && (
              <p className="dialog-description">
                Use / to organize into folders. Changes are saved in this
                browser.
              </p>
            )}
            <div className="dialog-buttons">
              <Button
                variant="outline"
                type="button"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {dialog === "new" ? "Create document" : "Save changes"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "export" && (
        <Modal title="Take your words with you" onClose={() => setDialog(null)}>
          <p className="dialog-description">
            Download a copy. Your originals stay right where they are.
          </p>
          <div className="export-options">
            <button
              onClick={() => {
                if (doc) download(doc.path, doc.content);
                setDialog(null);
              }}
            >
              <FileText />
              <span>
                <strong>Markdown</strong>
                <small>The original, editable source</small>
              </span>
              <ArrowDownToLine size={16} />
            </button>
            <button
              onClick={async () => {
                if (!doc) return;
                const { unified } = await import("unified");
                const { default: remarkParse } = await import("remark-parse");
                const { default: remarkRehype } = await import("remark-rehype");
                const { default: rehypeSanitize } =
                  await import("rehype-sanitize");
                const { default: rehypeStringify } =
                  await import("rehype-stringify");
                const html = await unified()
                  .use(remarkParse)
                  .use(remarkGfmModule)
                  .use(remarkRehype)
                  .use(rehypeSanitize)
                  .use(rehypeStringify)
                  .process(doc.content);
                download(
                  fileName(doc.path).replace(/\.[^.]+$/, ".html"),
                  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Document export</title><style>body{font:17px/1.7 system-ui;max-width:850px;margin:50px auto;padding:20px}pre{overflow:auto;background:#eee;padding:20px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}img{max-width:100%}</style><body>${html}</body></html>`,
                  "text/html",
                );
                setDialog(null);
              }}
            >
              <Code2 />
              <span>
                <strong>HTML document</strong>
                <small>Sanitized standalone document</small>
              </span>
              <ArrowDownToLine size={16} />
            </button>
            <button
              onClick={() => {
                setDialog(null);
                setTimeout(() => window.print(), 100);
              }}
            >
              <Printer />
              <span>
                <strong>Print / Save as PDF</strong>
                <small>A clean layout, without the interface</small>
              </span>
              <ArrowDownToLine size={16} />
            </button>
            <button
              onClick={() => {
                void exportZip();
                setDialog(null);
              }}
            >
              <FolderOpen />
              <span>
                <strong>Entire workspace</strong>
                <small>All Markdown files, with folders, as a ZIP</small>
              </span>
              <ArrowDownToLine size={16} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === "analyze" && doc && (
        <Modal title="A closer look" onClose={() => setDialog(null)}>
          <p className="dialog-description">
            A local, rule-based check of headings, local links, and image
            descriptions. External links are not checked.
          </p>
          <div className="analysis-stats">
            <span>
              <strong>{metadata.words}</strong>words
            </span>
            <span>
              <strong>{metadata.headings}</strong>headings
            </span>
            <span>
              <strong>
                {metadata.completed}/{metadata.tasks}
              </strong>
              tasks done
            </span>
          </div>
          <div className="analysis-issues">
            {analyze(doc, documents).length ? (
              analyze(doc, documents).map((issue, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (issue.heading) {
                      setDialog(null);
                      jump(issue.heading);
                    }
                  }}
                >
                  <Info size={16} />
                  {issue.message}
                </button>
              ))
            ) : (
              <div className="analysis-good">
                <CheckCheck size={26} />
                <strong>Looking good.</strong>
                <p>No issues found in these checks.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="A quieter place for Markdown"
          onClose={() => setDialog(null)}
        >
          <p className="dialog-description">
            OpenMDViewer is free, open-source, and entirely client-side. Your
            documents live in this browser, never on a server.
          </p>
          <div className="help-shortcuts">
            <p>
              <span>Search and commands</span>
              <kbd>⌘ / Ctrl K</kbd>
            </p>
            <p>
              <span>Find in document</span>
              <kbd>⌘ / Ctrl F</kbd>
            </p>
            <p>
              <span>Download Markdown</span>
              <kbd>⌘ / Ctrl S</kbd>
            </p>
            <p>
              <span>Exit focus / close dialog</span>
              <kbd>Escape</kbd>
            </p>
          </div>
          <p className="dialog-description">
            Drop Markdown files anywhere, or use Open files to import a ZIP. Use
            Open folder to preserve folder structure. Export regularly: browser
            data can be cleared by you or the browser.
          </p>
          <a
            className="github-link"
            href="https://github.com/SkillsetSquad/openmdviewer"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={17} />
            Made openly by SkillsetSquad
            <ExternalLink size={14} />
          </a>
        </Modal>
      )}
    </div>
  );
}
// Kept outside the render path; used only when exporting HTML.
import remarkGfmModule from "remark-gfm";
