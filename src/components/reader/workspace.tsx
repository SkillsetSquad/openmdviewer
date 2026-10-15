"use client";
import {
  defaultSearchOptions,
  hasSearchQuery,
  type SearchOptions,
  type SearchHit,
} from "@/lib/search-results";
import { renderedSearchRange, refreshSearchHit } from "@/lib/search-navigation";
import { revealElement } from "@/lib/reveal-element";
import type { CommandId } from "@/lib/commands";
import type { HealthIssue } from "@/lib/health";
import { resolveDocumentLink } from "@/lib/references";
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
  StickyNote,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
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
  Network,
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
import { DocumentTabs, documentTabId } from "./document-tabs";
import { Modal } from "./modal";
import { Markdown } from "./markdown";
import { useAnnotations } from "@/hooks/use-annotations";
import { captureQuote, locateQuote, readingText } from "@/lib/annotation-dom";
import { parseAnnotations, annotationExport } from "@/lib/annotations";
import { useSearchHistory } from "@/hooks/use-search-history";
import { useLocalSearch } from "@/hooks/use-local-search";
import { useAppUpdates } from "@/hooks/use-app-updates";
import { useWorkspaceSession } from "@/hooks/use-workspace-session";
import { WorkspaceManager } from "./workspace-manager";
import { RevisionHistory, WorkspaceTrash } from "./recovery";
import { useReader } from "@/lib/store";
import {
  workspaceMetadataPath,
  workspaceMetadata,
} from "@/lib/workspace-archive";
import { readLocalFiles, isolateImport } from "@/lib/import";
import { storage } from "@/lib/storage";
import {
  documentTags,
  download,
  downloadLocalAsset,
  fileName,
  headings,
  newDocument,
  safePath,
  stats,
  supportedFile,
} from "@/lib/documents";
import type {
  ReaderDocument,
  ReaderTheme,
  ReaderAnnotation,
  TextQuote,
} from "@/lib/types";
const Annotations = lazy(() => import("./annotations"));
const CommandPalette = lazy(() => import("./command-palette"));
const WorkspaceGraph = lazy(() => import("./workspace-graph"));
const Insights = lazy(() => import("./insights"));
const DocumentProperties = lazy(() => import("./document-properties"));
const Editor = lazy(() => import("./editor"));
type DialogName =
  | "search"
  | "settings"
  | "new"
  | "rename"
  | "export"
  | "tags"
  | "analyze"
  | "health"
  | "graph"
  | "notes"
  | "properties"
  | "help"
  | "workspaces"
  | "history"
  | "trash"
  | null;

const IconButton = ({
  label,
  onClick,
  children,
  active,
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
  const [toast, setToast] = useState("");
  const notify = useCallback((message: string) => setToast(message), []);
  const session = useWorkspaceSession(notify);
  const {
    loaded,
    workspaceId,
    workspaces,
    switching,
    assetURLs,
    storageStatus,
    save,
    flushEdit,
    scheduleSave,
    hasPendingChanges,
    refreshAssets,
    reloadWorkspaces,
    switchWorkspace,
    conflict,
    resolveConflict,
    resolvingConflict,
  } = session;
  const [dialog, setDialog] = useState<DialogName>(null);
  const recentSearches = useSearchHistory(
    workspaceId,
    dialog === "search",
    notify,
  );
  const [query, setQueryValue] = useState("");
  const [searchOptions, setSearchOptions] =
    useState<SearchOptions>(defaultSearchOptions);
  const [searchOffset, setSearchOffset] = useState(0);
  const setQuery = useCallback((value: string) => {
    setQueryValue(value);
    setSearchOffset(0);
  }, []);
  const [pendingSearchHit, setPendingSearchHit] = useState<SearchHit | null>(
    null,
  );
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
  const [findOpen, setFindOpen] = useState(false);
  const [find, setFind] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [sourceLocation, setSourceLocation] = useState<{
    line: number;
    token: number;
  } | null>(null);
  const assetPaths = useMemo(() => Object.keys(assetURLs), [assetURLs]);
  const [formValue, setFormValue] = useState("");
  const [leftWidth, setLeftWidth] = useState(264);
  const [rightWidth, setRightWidth] = useState(260);
  const articleRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const doc = documents.find((d) => d.id === activeId);
  const [selectedPassage, setSelectedPassage] = useState<TextQuote>();
  const [pendingReadingItem, setPendingReadingItem] = useState<{
    documentId: string;
    item: ReaderAnnotation;
  } | null>(null);
  const annotationLocations = useAnnotations(
    articleRef,
    doc?.annotations,
    doc?.content || "",
    mode !== "source",
    activeId,
  );
  function openNotes() {
    setSelectedPassage(
      articleRef.current
        ? captureQuote(articleRef.current, window.getSelection())
        : undefined,
    );
    setDialog("notes");
  }
  async function saveReadingItems(
    documentId: string,
    items: ReaderAnnotation[],
  ) {
    if (!(await flushEdit())) return false;
    const current = useReader
      .getState()
      .documents.find((d) => d.id === documentId);
    if (!current) throw new Error("This document is no longer available.");
    const annotations = parseAnnotations(items);
    const ok = await save({ ...current, annotations });
    if (ok)
      useReader.setState((state) => ({
        documents: state.documents.map((d) =>
          d.id === documentId ? { ...d, annotations } : d,
        ),
      }));
    return ok;
  }
  useEffect(() => {
    if (
      !pendingReadingItem ||
      pendingReadingItem.documentId !== activeId ||
      mode === "source"
    )
      return;
    const frame = requestAnimationFrame(() => {
      const root = articleRef.current;
      if (!root) return;
      const item = pendingReadingItem.item;
      if (item.quote) {
        const match = locateQuote(readingText(root), item.quote);
        if (match.range) {
          root.focus({ preventScroll: true });
          revealElement(
            match.range.startContainer.parentElement,
          )?.scrollIntoView({
            block: "center",
            behavior: "smooth",
          });
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(match.range);
        } else
          notify(
            match.status === "ambiguous"
              ? "Several passages match this saved quote. Its location is uncertain."
              : "The saved passage is no longer found. Your note and original quote are preserved.",
          );
      } else {
        const heading = item.heading
          ? Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(
              (element) => element.id === item.heading,
            )
          : root;
        if (heading) {
          root.focus({ preventScroll: true });
          revealElement(heading)?.scrollIntoView({
            block: "start",
            behavior: "smooth",
          });
        } else
          notify(
            "That bookmarked section is no longer found. The bookmark is preserved.",
          );
      }
      setPendingReadingItem(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingReadingItem, activeId, mode, notify]);
  const effectiveTags = useMemo(() => (doc ? documentTags(doc) : []), [doc]);
  const outline = useMemo(() => headings(doc?.content || ""), [doc?.content]);
  const metadata = useMemo(() => stats(doc?.content || ""), [doc?.content]);
  const dark =
    ["dark", "oled", "contrast"].includes(preferences.theme) ||
    (preferences.theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    if (!loaded || switching) return;
    try {
      localStorage.setItem(
        "openmdviewer.preferences",
        JSON.stringify(preferences),
      );
      localStorage.setItem(`openmdviewer.active.${workspaceId}`, activeId);
    } catch {}
  }, [preferences, activeId, workspaceId, loaded, switching]);
  useEffect(() => {
    if (!loaded) return;
    const narrow = window.matchMedia("(max-width: 1000px)");
    const mobile = window.matchMedia("(max-width: 750px)");
    const closeDetails = () => {
      if (narrow.matches) setRightOpen(false);
    };
    const closeFiles = () => {
      if (mobile.matches) setLeftOpen(false);
    };
    const frame = window.requestAnimationFrame(() => {
      closeDetails();
      closeFiles();
    });
    narrow.addEventListener("change", closeDetails);
    mobile.addEventListener("change", closeFiles);
    return () => {
      window.cancelAnimationFrame(frame);
      narrow.removeEventListener("change", closeDetails);
      mobile.removeEventListener("change", closeFiles);
    };
  }, [loaded]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (
        hasPendingChanges() ||
        conflict ||
        storageStatus === "Browser storage unavailable"
      ) {
        e.preventDefault();
        flushEdit();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flushEdit, storageStatus, conflict, hasPendingChanges]);
  const appUpdate = useAppUpdates(flushEdit, notify);
  const openDocument = useCallback(
    (id: string) => {
      flushEdit();
      setPendingSearchHit(null);
      setSourceLocation(null);
      if (activeId !== id) setHistory((h) => [...h, activeId].slice(-40));
      open(id);
      if (window.innerWidth < 900) setLeftOpen(false);
    },
    [activeId, open, flushEdit],
  );
  const openFinding = (issue: HealthIssue) => {
    if (!documents.some((d) => d.id === issue.documentId)) {
      notify("That document is no longer in this workspace view.");
      return;
    }
    openDocument(issue.documentId);
    setMode("split");
    setSourceLocation((current) => ({
      line: issue.line,
      token: (current?.token || 0) + 1,
    }));
    setDialog(null);
  };
  const openSearchResult = async (id: string, hit?: SearchHit) => {
    if (!(await flushEdit())) return;
    const current = useReader
      .getState()
      .documents.find((item) => item.id === id);
    if (!current) return;
    const currentHit = hit ? refreshSearchHit(hit, current.content) : undefined;
    if (hit && !currentHit) {
      notify(
        "This search result changed. Search again to locate the current text.",
      );
      return;
    }
    hit = currentHit || undefined;
    if (!query.trimStart().startsWith(">"))
      await recentSearches.remember(query, searchOptions);
    openDocument(id);
    setDialog(null);
    if (hit?.location && (hit.location.sourceOnly || mode !== "read")) {
      if (mode === "read") setMode("split");
      setSourceLocation((value) => ({
        line: hit.location!.line,
        token: (value?.token || 0) + 1,
      }));
    } else if (!hit?.location && hit?.heading && mode !== "read") {
      setSourceLocation((value) => ({
        line: hit.heading!.line,
        token: (value?.token || 0) + 1,
      }));
    } else if (hit?.location || hit?.heading) setPendingSearchHit(hit);
  };
  useEffect(() => {
    if (
      !pendingSearchHit ||
      pendingSearchHit.id !== activeId ||
      mode !== "read"
    )
      return;
    const frame = requestAnimationFrame(() => {
      const root = articleRef.current;
      if (!root) return;
      const range = renderedSearchRange(root, pendingSearchHit);
      if (!range && !pendingSearchHit.location && pendingSearchHit.heading) {
        const heading = document.getElementById(pendingSearchHit.heading.id);
        if (heading && root.contains(heading)) {
          revealElement(heading)?.scrollIntoView({
            block: "center",
            behavior: "smooth",
          });
          root.focus({ preventScroll: true });
        }
      }
      if (range) {
        revealElement(range.startContainer.parentElement)?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
        root.focus({ preventScroll: true });
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else if (pendingSearchHit.location) {
        setMode("split");
        setSourceLocation((value) => ({
          line: pendingSearchHit.location!.line,
          token: (value?.token || 0) + 1,
        }));
        notify(
          `Opened matching source line ${pendingSearchHit.location.line}.`,
        );
      }
      setPendingSearchHit(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingSearchHit, activeId, mode, setMode, notify]);
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
        scheduleSave(updated);
      } else {
        flushEdit();
        void save(updated);
      }
    },
    [doc, documents, setDocuments, save, flushEdit, scheduleSave],
  );
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const modalOpen = !!document.querySelector("dialog[open]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (modalOpen) {
          const input = document.querySelector<HTMLInputElement>(
            ".command-palette-dialog input[role=combobox]",
          );
          if (input) {
            input.focus();
            input.select();
          }
          return;
        }
        setDialog("search");
        setQuery("");
        return;
      }
      // Dialogs own their keyboard interaction; do not run background actions.
      if (modalOpen) return;
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
    const paletteKeys = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k")
        return;
      const modal = document.querySelector("dialog[open]");
      if (modal && !modal.classList.contains("command-palette-dialog")) return;
      // Reserve the application shortcut before CodeMirror's Ctrl+K edit binding runs.
      event.stopPropagation();
      keys(event);
    };
    window.addEventListener("keydown", paletteKeys, true);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("keydown", paletteKeys, true);
      window.removeEventListener("keydown", keys);
    };
  }, [doc, flushEdit, setQuery]);
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
      const state = useReader.getState();
      const from = state.documents.find(
        (document) => document.id === state.activeId,
      );
      if (!from) return;
      try {
        const result = resolveDocumentLink(from, href, state.documents);
        const target = result.target;
        if (!target && assetURLs[result.path]) {
          downloadLocalAsset(result.path, assetURLs[result.path]);
          return;
        }
        if (!target) {
          notify(
            result.error === "ambiguous"
              ? `Several documents match this wiki link: ${result.path}`
              : `Document not in this workspace: ${result.path}`,
          );
          return;
        }
        if (target.id !== state.activeId) openDocument(target.id);
        if (result.actualAnchor)
          setTimeout(
            () =>
              revealElement(
                document.getElementById(result.actualAnchor),
              )?.scrollIntoView({ behavior: "smooth", block: "start" }),
            target.id === state.activeId ? 0 : 100,
          );
      } catch {
        notify("This document link is not valid.");
      }
    },
    [openDocument, notify, assetURLs],
  );
  async function importFiles(files: File[]) {
    flushEdit();
    try {
      const imported = await readLocalFiles(files);
      const additions = imported.documents;
      if (!additions.length && !imported.assets.length) {
        notify("Choose Markdown, text, media files, or a ZIP containing them.");
        return;
      }
      const existingDocuments = await storage.load(workspaceId);
      isolateImport(
        additions,
        imported.assets,
        new Set([
          ...existingDocuments.map((d) => d.path),
          ...(await storage.loadAssets(workspaceId)).map((a) => a.path),
        ]),
      );
      if (additions.length + existingDocuments.length > 10000)
        throw new Error("This workspace supports up to 10,000 documents.");
      for (const added of additions) {
        added.workspaceId = workspaceId;
        added.revision = 0;
      }
      await storage.import(additions, imported.assets, workspaceId);
      await refreshAssets();
      if (useReader.getState().workspaceId !== workspaceId) {
        notify(
          "Import completed in the previous workspace. Switch back to view it.",
        );
        return;
      }
      setDocuments([...useReader.getState().documents, ...additions]);
      if (additions[0]) openDocument(additions[0].id);
      notify(
        `Imported ${additions.length} documents and ${imported.assets.length} media files. Kept on this device.`,
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
    for (const asset of await storage.loadAssets(workspaceId))
      data[asset.path] = new Uint8Array(await asset.blob.arrayBuffer());
    data[workspaceMetadataPath] = strToU8(
      workspaceMetadata(
        documents,
        workspaces.find((w) => w.id === workspaceId),
      ),
    );
    download(
      "openmdviewer-workspace.zip",
      zipSync(data) as BlobPart,
      "application/zip",
    );
    notify("Workspace ZIP download requested.");
  }
  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify("Clipboard unavailable. Use Export to download this document.");
    }
  }
  function printDocument() {
    setDialog(null);
    setMode("read");
    // Let React remove the modal and restore the rendered document before print.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }
  async function runCommand(id: CommandId) {
    setDialog(null);
    try {
      switch (id) {
        case "files":
          filesRef.current?.click();
          break;
        case "folder":
          folderRef.current?.click();
          break;
        case "new":
          setFormValue("Untitled.md");
          setDialog("new");
          break;
        case "graph":
          setDialog("graph");
          break;
        case "settings":
          setDialog("settings");
          break;
        case "workspaces":
          setDialog("workspaces");
          break;
        case "theme":
          setPreferences({ theme: dark ? "light" : "dark" });
          break;
        case "focus":
          setFocus((value) => !value);
          break;
        case "health":
          await flushEdit();
          setDialog("health");
          break;
        case "trash":
          setDialog("trash");
          break;
        case "help":
          setDialog("help");
          break;
        case "exportZip":
          await exportZip();
          break;
        case "read":
          if (doc) setMode("read");
          break;
        case "source":
          if (doc) setMode("source");
          break;
        case "split":
          if (doc) setMode("split");
          break;
        case "backlinks":
          if (doc) {
            setPanel("backlinks");
            setRightOpen(true);
            if (window.innerWidth <= 1000) setLeftOpen(false);
          }
          break;
        case "analyze":
          if (doc) {
            await flushEdit();
            setDialog("analyze");
          }
          break;
        case "notes":
          if (doc) openNotes();
          break;
        case "properties":
          if (doc) setDialog("properties");
          break;
        case "history":
          if (doc) {
            await flushEdit();
            setDialog("history");
          }
          break;
        case "copy":
          if (doc) await copy(doc.content, "Markdown copied.");
          break;
        case "exportMarkdown":
          if (doc) download(doc.path, doc.content);
          break;
        case "exportPdf":
          if (doc) printDocument();
          break;
        case "presentation":
          if (doc) {
            setFocus(!presentation);
            setPresentation(!presentation);
          }
          break;
      }
    } catch {
      notify(
        "Could not finish that action. Your documents remain on this device.",
      );
    }
  }
  function jump(id: string) {
    revealElement(document.getElementById(id))?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
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
    revealElement(node.parentElement)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
  const commandsOnly = query.trimStart().startsWith(">");
  const documentQuery = commandsOnly ? "" : query;
  const {
    ids: searchIds,
    page: searchPage,
    failed: searchFailed,
    navigation,
    indexing,
    cancel: cancelRegexSearch,
    retry: retryRegexSearch,
  } = useLocalSearch(documents, documentQuery, searchOptions, searchOffset);
  const searching =
    hasSearchQuery(documentQuery, searchOptions) &&
    searchIds === null &&
    !searchFailed;
  const results = useMemo(
    () =>
      commandsOnly
        ? []
        : searchIds
          ? searchIds
              .map((id) => documents.find((d) => d.id === id))
              .filter((d): d is ReaderDocument => !!d)
          : hasSearchQuery(query, searchOptions)
            ? []
            : documents.slice(0, 40),
    [commandsOnly, documents, query, searchIds, searchOptions],
  );
  const documentSummaries = useMemo(
    () =>
      Object.fromEntries(
        navigation.summaries.map((summary) => [summary.id, summary]),
      ),
    [navigation],
  );
  const navigationReady = !doc || !!documentSummaries[doc.id];
  const backlinks = useMemo(
    () =>
      doc
        ? documents.filter((d) =>
            navigation.edges.some(
              (edge) => edge.from === d.id && edge.to === doc.id,
            ),
          )
        : [],
    [doc, documents, navigation],
  );
  const filtered = useMemo(
    () =>
      documents
        .filter(
          (d) =>
            (collection !== "favorites" || d.favorite) &&
            (!fileFilter ||
              `${d.path} ${(documentSummaries[d.id]?.tags || d.tags).join(" ")}`
                .toLowerCase()
                .includes(fileFilter.toLowerCase())),
        )
        .sort((a, b) =>
          collection === "recent" ? b.updatedAt - a.updatedAt : 0,
        ),
    [documents, collection, fileFilter, documentSummaries],
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
        accept=".md,.markdown,.mdown,.mkd,.mdx,.txt,.zip,.png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.pdf,.mp3,.wav,.mp4,.webm,.ogg,.m4a,.aac,.flac,.opus,.ogv,.vtt"
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
            <div className="workspace-switcher">
              <label className="sr-only" htmlFor="workspace-select">
                Current workspace
              </label>
              <select
                id="workspace-select"
                value={workspaceId}
                disabled={switching || !loaded}
                onChange={async (e) => {
                  if (await switchWorkspace(e.target.value)) {
                    setHistory([]);
                    setCollection("all");
                    setFileFilter("");
                  }
                }}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.icon} {w.name}
                  </option>
                ))}
              </select>
              <IconButton
                label="Manage workspaces"
                onClick={() => setDialog("workspaces")}
              >
                <Settings2 size={14} />
              </IconButton>
            </div>
            <div className="workspace-label">
              <button
                title="Workspace health"
                aria-label="Workspace health"
                onClick={async () => {
                  await flushEdit();
                  setDialog("health");
                }}
              >
                WORKSPACE <ShieldCheck size={11} />
              </button>
              <div>
                <IconButton
                  label="Workspace graph"
                  onClick={() => setDialog("graph")}
                >
                  <Network size={15} />
                </IconButton>
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
                <button
                  className="icon-button"
                  title="Workspace trash"
                  aria-label="Workspace trash"
                  onClick={() => setDialog("trash")}
                >
                  <History size={15} />
                </button>
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
              aria-label="Search in document"
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
          <DocumentTabs
            items={tabs.flatMap((id) => {
              const item = documents.find((document) => document.id === id);
              return item ? [{ id: item.id, path: item.path }] : [];
            })}
            activeId={activeId}
            onOpen={openDocument}
            onClose={(id) => {
              void flushEdit();
              closeTab(id);
            }}
          />
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
        <div
          className={`document-area mode-${mode}`}
          id="active-document-panel"
          role={tabs.length > 1 && doc ? "tabpanel" : undefined}
          aria-labelledby={
            tabs.length > 1 && doc ? documentTabId(activeId) : undefined
          }
          tabIndex={-1}
        >
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
                  location={sourceLocation}
                  value={doc.content}
                  onChange={(content) => update({ content }, true)}
                />
              </Suspense>
            </section>
          )}
          {(mode !== "source" || !doc) && (
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
                      {effectiveTags[0] || "Document"}
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
                        label="Notes and bookmarks"
                        onClick={openNotes}
                      >
                        <StickyNote size={15} />
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
                            galleryContent={doc.content}
                            key={doc.id}
                            content={doc.content.slice(
                              0,
                              doc.content.indexOf("![A still alpine lake"),
                            )}
                            onLink={navigateLink}
                            assetURLs={assetURLs}
                            sourcePath={doc.path}
                          />
                        </div>
                        <div className="configuration-right">
                          <Markdown
                            galleryContent={doc.content}
                            key={doc.id}
                            content={doc.content.slice(
                              doc.content.indexOf("![A still alpine lake"),
                            )}
                            onLink={navigateLink}
                            assetURLs={assetURLs}
                            sourcePath={doc.path}
                          />
                        </div>
                      </>
                    ) : (
                      <Markdown
                        galleryContent={doc.content}
                        key={doc.id}
                        content={doc.content}
                        onLink={navigateLink}
                        assetURLs={assetURLs}
                        sourcePath={doc.path}
                      />
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
      {rightOpen && !focus && doc && (
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
                  Backlinks{" "}
                  <small>{navigationReady ? backlinks.length : "…"}</small>
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
                  {!navigationReady || indexing ? (
                    <p className="empty-panel">Indexing local links…</p>
                  ) : backlinks.length ? (
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
                  <Button variant="outline" onClick={() => setDialog("graph")}>
                    <Network size={14} />
                    Explore workspace graph
                  </Button>
                </div>
              )}
              <section className="details-section">
                <div className="section-heading">
                  <h2>Document Info</h2>
                  <IconButton
                    label="Document properties"
                    onClick={() => setDialog("properties")}
                  >
                    <Info size={14} />
                  </IconButton>
                </div>
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
                  {effectiveTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        setSearchOptions(defaultSearchOptions);
                        setQuery(
                          `tag:${/\s/.test(tag) && !tag.includes('"') ? `"${tag}"` : tag}`,
                        );
                        setDialog("search");
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                  {!effectiveTags.length && (
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
                    Copy Markdown
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
                  <button onClick={openNotes}>
                    <StickyNote size={14} />
                    Notes and bookmarks
                    {doc.annotations?.length ? (
                      <span>{doc.annotations.length}</span>
                    ) : null}
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
                  <button onClick={printDocument}>
                    <Printer size={14} />
                    Print<kbd>⌘ P</kbd>
                  </button>
                  <button
                    onClick={async () => {
                      await flushEdit();
                      setDialog("history");
                    }}
                  >
                    <History size={14} />
                    Version history
                  </button>
                  <button
                    onClick={async () => {
                      if (!doc) return;
                      try {
                        const paths = new Set(documents.map((d) => d.path));
                        let n = 2;
                        let path = doc.path.replace(
                          /(\.[^.]*)?$/,
                          ` (copy ${n})$1`,
                        );
                        while (paths.has(path))
                          path = doc.path.replace(
                            /(\.[^.]*)?$/,
                            ` (copy ${++n})$1`,
                          );
                        const created = await storage.put({
                          ...newDocument(path, doc.content),
                          workspaceId,
                          tags: doc.tags,
                        });
                        if (useReader.getState().workspaceId !== workspaceId) {
                          notify(
                            "The copy was saved in the previous workspace.",
                          );
                          return;
                        }
                        setDocuments([
                          ...useReader.getState().documents,
                          created,
                        ]);
                        openDocument(created.id);
                        notify("Document duplicated in this workspace.");
                      } catch {
                        notify("Could not duplicate this document.");
                      }
                    }}
                  >
                    <Copy size={14} />
                    Duplicate document
                  </button>
                  <button
                    onClick={async () => {
                      if (!doc || !(await flushEdit())) return;
                      try {
                        const current = useReader
                          .getState()
                          .documents.find((d) => d.id === doc.id)!;
                        await storage.trash(current, current.revision || 0);
                        setDocuments(
                          useReader
                            .getState()
                            .documents.filter((d) => d.id !== doc.id),
                        );
                        closeTab(doc.id);
                        notify(
                          "Moved to workspace trash. You can restore it at any time.",
                        );
                      } catch (error) {
                        notify(
                          error instanceof Error
                            ? error.message
                            : "Could not move the document to trash.",
                        );
                      }
                    }}
                  >
                    <X size={14} />
                    Move to trash
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
                        <small>
                          {documentSummaries[d.id]?.title || fileName(d.path)}
                        </small>
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
      {appUpdate.available && (
        <div className="app-update" role="status">
          <span>A new version is ready.</span>
          <button
            disabled={appUpdate.applying}
            onClick={() => void appUpdate.apply()}
          >
            {appUpdate.applying
              ? "Saving and updating…"
              : "Apply application update"}
          </button>
        </div>
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
        <Suspense
          fallback={
            <Modal
              title="Search your workspace"
              onClose={() => setDialog(null)}
            >
              <p role="status">Loading local commands…</p>
            </Modal>
          }
        >
          <CommandPalette
            query={query}
            onQuery={setQuery}
            history={recentSearches.items}
            historyError={recentSearches.error}
            onRemember={() =>
              void recentSearches.remember(query, searchOptions)
            }
            onRemoveHistory={(key) => void recentSearches.remove(key)}
            onClearHistory={() => void recentSearches.clear()}
            onRestoreHistory={(entry) => {
              setQuery(entry.query);
              setSearchOptions(entry.options);
            }}
            options={searchOptions}
            onOptions={(value) => {
              setSearchOptions(value);
              setSearchOffset(0);
            }}
            page={searchPage}
            onPage={setSearchOffset}
            documents={results}
            summaries={documentSummaries}
            hasDocument={!!doc}
            searching={searching}
            onCancelSearch={cancelRegexSearch}
            onRetrySearch={retryRegexSearch}
            failed={searchFailed}
            onClose={() => {
              if (searchOptions.regex) cancelRegexSearch();
              setDialog(null);
            }}
            onCommand={(id) => void runCommand(id)}
            onOpen={(id, hit) => void openSearchResult(id, hit)}
          />
        </Suspense>
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
                    added.workspaceId = workspaceId;
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
            {dialog === "tags" && (
              <p className="dialog-description">
                These tags are stored locally. Frontmatter tags also appear in
                the reader; edit those in source view.
              </p>
            )}
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
                const { exportHTMLBody } = await import("@/lib/html-export");
                const html = await exportHTMLBody(doc.content);
                download(
                  fileName(doc.path).replace(/\.[^.]+$/, ".html"),
                  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Document export</title><style>body{font:17px/1.7 system-ui;max-width:850px;margin:50px auto;padding:20px}pre{overflow:auto;background:#eee;padding:20px}dt{font-weight:700;margin-top:1em}dd{margin:0.4em 0 1em 1.4em}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}img{max-width:100%}</style><body>${html}</body></html>`,
                  "text/html",
                );
                setDialog(null);
              }}
            >
              <Code2 />
              <span>
                <strong>HTML document</strong>
                <small>Standalone document · media as references</small>
              </span>
              <ArrowDownToLine size={16} />
            </button>
            <button onClick={printDocument}>
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
      {(dialog === "health" || dialog === "analyze") && (
        <Suspense
          fallback={
            <div className="workspace-loading" role="status">
              Loading local checks…
            </div>
          }
        >
          <Insights
            key={`${workspaceId}:${dialog === "analyze" ? activeId : "all"}`}
            documents={documents}
            assetPaths={assetPaths}
            documentId={dialog === "analyze" ? activeId : undefined}
            onOpenIssue={openFinding}
            onClose={() => setDialog(null)}
          />
        </Suspense>
      )}
      {dialog === "graph" && (
        <Suspense
          fallback={
            <Modal title="Workspace graph" onClose={() => setDialog(null)}>
              <p role="status">Loading local graph…</p>
            </Modal>
          }
        >
          <WorkspaceGraph
            key={workspaceId}
            navigation={navigation}
            activeId={activeId}
            indexing={indexing}
            failed={searchFailed}
            onClose={() => setDialog(null)}
            onOpen={(id) => {
              openDocument(id);
              setDialog(null);
            }}
          />
        </Suspense>
      )}
      {dialog === "notes" && doc && (
        <Suspense
          fallback={
            <Modal title="Notes and bookmarks" onClose={() => setDialog(null)}>
              <p className="empty-panel">Loading reading tools…</p>
            </Modal>
          }
        >
          <Annotations
            key={doc.id}
            doc={doc}
            documents={documents}
            selection={selectedPassage}
            locations={annotationLocations}
            currentHeading={activeHeading}
            onClose={() => setDialog(null)}
            onSave={saveReadingItems}
            onNavigate={(documentId, item) => {
              setDialog(null);
              setMode("read");
              openDocument(documentId);
              setPendingReadingItem({ documentId, item });
            }}
          />
        </Suspense>
      )}
      {dialog === "properties" && doc && (
        <Suspense
          fallback={
            <div className="workspace-loading" role="status">
              Loading document properties…
            </div>
          }
        >
          <DocumentProperties
            document={doc}
            onClose={() => setDialog(null)}
            onEdit={() => {
              setDialog(null);
              setMode("split");
              setSourceLocation((current) => ({
                line: 1,
                token: (current?.token || 0) + 1,
              }));
            }}
          />
        </Suspense>
      )}
      {switching && (
        <div className="workspace-loading" role="status">
          Opening workspace…
        </div>
      )}
      {dialog === "workspaces" && (
        <WorkspaceManager
          workspaces={workspaces}
          current={workspaceId}
          onChanged={reloadWorkspaces}
          onSwitch={async (id) => {
            const changed = await switchWorkspace(id);
            if (changed) {
              setHistory([]);
              setCollection("all");
              setFileFilter("");
            }
            return changed;
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "history" && doc && (
        <RevisionHistory
          document={doc}
          onClose={() => setDialog(null)}
          onRestore={async (content) => {
            const restored = { ...doc, content, updatedAt: Date.now() };
            const ok = await save(restored, "restore");
            if (ok) {
              setDocuments(
                useReader
                  .getState()
                  .documents.map((d) =>
                    d.id === doc.id ? { ...restored, revision: d.revision } : d,
                  ),
              );
              notify(
                "Previous revision restored. The replaced version remains in history.",
              );
            }
            return ok;
          }}
        />
      )}
      {dialog === "trash" && (
        <WorkspaceTrash
          workspaceId={workspaceId}
          onClose={() => setDialog(null)}
          onRestore={(restored) => {
            setDocuments([...useReader.getState().documents, restored]);
            notify(`Restored ${restored.path}.`);
          }}
        />
      )}
      {conflict && (
        <Modal
          title="This document changed in another tab"
          dismissible={false}
          onClose={() => {}}
        >
          <p className="dialog-description">
            Your edits have not overwritten the saved version of{" "}
            {conflict.local.path}. Preserve both versions as separate documents,
            or load the saved version.
          </p>
          <div className="dialog-buttons">
            <Button
              variant="outline"
              onClick={() =>
                download(
                  conflict.local.path,
                  useReader
                    .getState()
                    .documents.find((d) => d.id === conflict.local.id)
                    ?.content || conflict.local.content,
                )
              }
            >
              Download my edits
            </Button>
            {!!conflict.local.annotations?.length && (
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    "openmdviewer-pending-annotations.json",
                    annotationExport([conflict.local]),
                    "application/json",
                  )
                }
              >
                Download pending reading data
              </Button>
            )}
            <Button
              variant="outline"
              disabled={resolvingConflict}
              onClick={() => void resolveConflict(false)}
            >
              Load saved version
            </Button>
            <Button
              disabled={resolvingConflict}
              onClick={() => void resolveConflict(true)}
            >
              Keep both versions
            </Button>
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
