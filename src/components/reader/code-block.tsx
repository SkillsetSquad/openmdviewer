"use client";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Pencil,
  Search,
  WrapText,
  ListOrdered,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import type { ThemedTokenWithVariants } from "shiki";
import { flushSync } from "react-dom";
import { download } from "@/lib/documents";
import {
  codeFileName,
  codeLanguage,
  diffLineKind,
  findCodeMatches,
  parseCodeMeta,
  type CodeMatch,
} from "@/lib/code-tools";
const SnippetEditor = lazy(() => import("./snippet-editor"));
// Additional common grammars omitted from Shiki's web registry. Imports are explicit and local.
const extraGrammars = {
  diff: () => import("shiki/langs/diff.mjs"),
  patch: () => import("shiki/langs/diff.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  rs: () => import("shiki/langs/rust.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  rb: () => import("shiki/langs/ruby.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  cs: () => import("shiki/langs/csharp.mjs"),
  powershell: () => import("shiki/langs/powershell.mjs"),
  ps1: () => import("shiki/langs/powershell.mjs"),
  dockerfile: () => import("shiki/langs/docker.mjs"),
  docker: () => import("shiki/langs/docker.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  ini: () => import("shiki/langs/ini.mjs"),
};
const pageSize = 200;
function tokenStyle(token: ThemedTokenWithVariants): CSSProperties {
  const light = token.variants.light,
    dark = token.variants.dark;
  const font = (
    value: number | undefined,
    bit: number,
    yes: string,
    no: string,
  ) => ((value || 0) & bit ? yes : no);
  return {
    "--shiki-light": light?.color,
    "--shiki-dark": dark?.color,
    "--code-light-style": font(light?.fontStyle, 1, "italic", "normal"),
    "--code-dark-style": font(dark?.fontStyle, 1, "italic", "normal"),
    "--code-light-weight": font(light?.fontStyle, 2, "700", "400"),
    "--code-dark-weight": font(dark?.fontStyle, 2, "700", "400"),
    "--code-light-decoration": font(light?.fontStyle, 4, "underline", "none"),
    "--code-dark-decoration": font(dark?.fontStyle, 4, "underline", "none"),
  } as CSSProperties;
}
function pieces(
  content: string,
  offset: number,
  matches: CodeMatch[],
  active: number | undefined,
) {
  const result: React.ReactNode[] = [];
  let cursor = 0;
  let lo = 0,
    hi = matches.length;
  while (lo < hi) {
    const middle = (lo + hi) >>> 1;
    if (matches[middle].end <= offset) lo = middle + 1;
    else hi = middle;
  }
  for (
    let index = lo;
    index < matches.length && matches[index].start < offset + content.length;
    index++
  ) {
    const match = matches[index];
    const start = Math.max(0, match.start - offset),
      end = Math.min(content.length, match.end - offset);
    if (end <= start) continue;
    if (start > cursor) result.push(content.slice(cursor, start));
    result.push(
      <mark
        key={`${start}:${end}`}
        className={match.start === active ? "code-match-active" : undefined}
      >
        {content.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < content.length) result.push(content.slice(cursor));
  return result.length ? result : content;
}
function renderTokens(
  tokens: ThemedTokenWithVariants[],
  initialOffset: number,
  matches: CodeMatch[],
  active: number | undefined,
) {
  const result: React.ReactNode[] = [];
  let offset = initialOffset;
  for (const [index, token] of tokens.entries()) {
    result.push(
      <span className="code-token" style={tokenStyle(token)} key={index}>
        {pieces(token.content, offset, matches, active)}
      </span>,
    );
    offset += token.content.length;
  }
  return result;
}
export function CodeBlock({
  code,
  language,
  meta = "",
}: {
  code: string;
  language: string;
  meta?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const options = useMemo(() => parseCodeMeta(meta), [meta]);
  const lines = useMemo(() => code.split("\n"), [code]);
  const offsets = useMemo(() => {
    let offset = 0;
    const result: number[] = [];
    for (const line of lines) {
      result.push(offset);
      offset += line.length + 1;
    }
    return result;
  }, [lines]);
  const [highlighted, setHighlighted] = useState<{
    code: string;
    language: string;
    tokens: ThemedTokenWithVariants[][];
    resolved: string;
    failed?: boolean;
  }>();
  const [copiedSource, setCopiedSource] = useState<string | null>(null);
  const copied = copiedSource === code;
  const [collapsed, setCollapsed] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [numbers, setNumbers] = useState<boolean>();
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [active, setActive] = useState(0);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState("");
  const filename = codeFileName(language, options.filename);
  const requestedLanguage = codeLanguage(language, options.filename);
  const large = code.length > 200000 || lines.length > 3000;
  const current =
    highlighted?.code === code && highlighted.language === requestedLanguage
      ? highlighted
      : undefined;
  const findings = useMemo(
    () => findCodeMatches(code, query, caseSensitive),
    [code, query, caseSensitive],
  );
  const byLine = useMemo(() => {
    const map = new Map<number, CodeMatch[]>();
    for (const match of findings.matches) {
      const existing = map.get(match.line);
      if (existing) existing.push(match);
      else map.set(match.line, [match]);
    }
    return map;
  }, [findings]);
  const activeIndex = Math.min(
    active,
    Math.max(0, findings.matches.length - 1),
  );
  const activeMatch = findings.matches[activeIndex];
  const paginated = lines.length > 400 && !printing;
  const pages = paginated ? Math.ceil(lines.length / pageSize) : 1;
  const currentPage = Math.min(page, pages - 1);
  const start = paginated ? currentPage * pageSize : 0;
  const visible = paginated ? lines.slice(start, start + pageSize) : lines;
  useEffect(() => {
    if (large) return;
    let canceled = false;
    import("shiki/bundle/web")
      .then(
        async ({
          codeToTokensWithThemes,
          bundledLanguages,
          getSingletonHighlighter,
        }) => {
          const requested = requestedLanguage;
          const themes = {
            light: "github-light",
            dark: "github-dark-high-contrast",
          } as const;
          let tokens: ThemedTokenWithVariants[][];
          let resolved: string;
          const extra = Object.hasOwn(extraGrammars, requested)
            ? extraGrammars[requested as keyof typeof extraGrammars]
            : undefined;
          if (extra) {
            const [{ default: grammar }, { codeToTokensWithThemes: tokenize }] =
              await Promise.all([extra(), import("shiki/core")]);
            const highlighter = await getSingletonHighlighter({
              langs: [grammar],
              themes: Object.values(themes),
            });
            const name =
              grammar.find(
                (item) =>
                  item.name === requested || item.aliases?.includes(requested),
              )?.name || grammar[0].name;
            tokens = tokenize(highlighter.getInternalContext(), code, {
              lang: name,
              themes,
            });
            resolved = name;
          } else {
            const bundled = Object.hasOwn(bundledLanguages, requested)
              ? (requested as keyof typeof bundledLanguages)
              : "text";
            tokens = await codeToTokensWithThemes(code, {
              lang: bundled,
              themes,
            });
            resolved = bundled;
          }
          if (!canceled)
            setHighlighted({
              code,
              language: requestedLanguage,
              tokens,
              resolved,
            });
        },
      )
      .catch(() => {
        if (!canceled)
          setHighlighted({
            code,
            language: requestedLanguage,
            tokens: [],
            resolved: "text",
            failed: true,
          });
      });
    return () => {
      canceled = true;
    };
  }, [code, requestedLanguage, large]);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true)),
      after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  function reveal(match: CodeMatch | undefined) {
    if (!match) return;
    setPage(lines.length > 400 ? Math.floor(match.line / pageSize) : 0);
    setCollapsed(false);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector(`[data-source-line="${match.line + 1}"]`)
        ?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        }),
    );
  }
  function search(value: string, sensitive = caseSensitive) {
    setQuery(value);
    setActive(0);
    reveal(findCodeMatches(code, value, sensitive).matches[0]);
  }
  function closeFind() {
    setFindOpen(false);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLButtonElement>('[aria-label="Find in code"]')
        ?.focus(),
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedSource(code);
      setStatus("Snippet copied.");
    } catch {
      setCopiedSource(null);
      setStatus(
        "Clipboard access was unavailable. Download the snippet instead.",
      );
    }
  }
  return (
    <div
      ref={root}
      className={`code-block advanced-code ${wrap ? "code-wrap" : ""} ${(numbers ?? options.lineNumbers) ? "code-numbered" : ""}`}
      role="group"
      aria-label={
        options.filename
          ? `Code snippet: ${options.filename}`
          : `Code snippet: ${language || "text"}`
      }
    >
      <div className="code-toolbar">
        <button
          aria-label={collapsed ? "Expand code block" : "Collapse code block"}
          aria-expanded={!collapsed}
          aria-controls={`${id}-body`}
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronDown size={13} className={collapsed ? "-rotate-90" : ""} />
          <span>
            {language === "auto"
              ? `${requestedLanguage} · filename`
              : language || requestedLanguage}
          </span>
        </button>
        {options.filename && (
          <span className="code-filename" title={options.filename}>
            {options.filename}
          </span>
        )}
        <div className="code-actions">
          <button
            aria-label="Find in code"
            title="Find in code"
            aria-expanded={findOpen}
            onClick={() => {
              setFindOpen(!findOpen);
              if (!findOpen) {
                setCollapsed(false);
                requestAnimationFrame(() => searchInput.current?.focus());
              }
            }}
          >
            <Search size={13} />
          </button>
          <button
            aria-label="Wrap code lines"
            title="Wrap code lines"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={13} />
          </button>
          <button
            aria-label="Show code line numbers"
            title="Show code line numbers"
            aria-pressed={numbers ?? options.lineNumbers}
            onClick={() => setNumbers(!(numbers ?? options.lineNumbers))}
          >
            <ListOrdered size={13} />
          </button>
          <button
            aria-label="Edit scratch copy of snippet"
            title="Edit scratch copy"
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} />
          </button>
          <button
            aria-label="Download code"
            title="Download code"
            onClick={() => {
              download(filename, code, "text/plain;charset=utf-8");
              setStatus("Original snippet download requested.");
            }}
          >
            <Download size={13} />
          </button>
          <button
            aria-label={copied ? "Snippet copied" : "Copy code"}
            onClick={() => void copy()}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
      {findOpen && (
        <div
          className="code-find"
          role="search"
          aria-label="Find within this snippet"
        >
          <input
            ref={searchInput}
            type="search"
            aria-label="Find code text"
            value={query}
            maxLength={256}
            placeholder="Find in code…"
            onChange={(event) => search(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const next =
                  (active +
                    (event.shiftKey ? -1 : 1) +
                    findings.matches.length) %
                  findings.matches.length;
                if (findings.matches.length) {
                  setActive(next);
                  reveal(findings.matches[next]);
                }
              }
              if (event.key === "Escape") {
                event.stopPropagation();
                closeFind();
              }
            }}
          />
          <button
            aria-label="Match code case"
            aria-pressed={caseSensitive}
            onClick={() => {
              setCaseSensitive(!caseSensitive);
              search(query, !caseSensitive);
            }}
          >
            Aa
          </button>
          <span role="status">
            {query
              ? findings.matches.length
                ? `${activeIndex + 1} of ${findings.matches.length}${findings.truncated ? "+" : ""} matches`
                : "No matches"
              : "Literal text search"}
          </span>
          <button
            aria-label="Previous code match"
            disabled={!findings.matches.length}
            onClick={() => {
              const next =
                (activeIndex - 1 + findings.matches.length) %
                findings.matches.length;
              setActive(next);
              reveal(findings.matches[next]);
            }}
          >
            <ArrowUp size={13} />
          </button>
          <button
            aria-label="Next code match"
            disabled={!findings.matches.length}
            onClick={() => {
              const next = (activeIndex + 1) % findings.matches.length;
              setActive(next);
              reveal(findings.matches[next]);
            }}
          >
            <ArrowDown size={13} />
          </button>
          <button aria-label="Close code find" onClick={closeFind}>
            <X size={13} />
          </button>
        </div>
      )}
      {(!collapsed || printing) && (
        <div id={`${id}-body`} className="code-body">
          <pre
            className="shiki code-lines"
            role="region"
            tabIndex={0}
            aria-label="Snippet source"
          >
            <code>
              {visible.map((line, index) => {
                const sourceIndex = start + index;
                const lineMatches = byLine.get(sourceIndex) || [];
                const emphasis = options.ranges.some(
                  (range) =>
                    sourceIndex + 1 >= range.from &&
                    sourceIndex + 1 <= range.to,
                );
                const diff = diffLineKind(line, language);
                const offset = offsets[sourceIndex];
                const tokens = current?.tokens[sourceIndex];
                return (
                  <span
                    className={`code-line ${emphasis ? "code-emphasis" : ""} ${diff ? `code-diff-${diff}` : ""} ${lineMatches.some((match) => match.start === activeMatch?.start) ? "code-line-current" : ""}`}
                    key={sourceIndex}
                    data-source-line={sourceIndex + 1}
                    data-line={options.startLine + sourceIndex}
                  >
                    <span className="code-line-text">
                      {tokens?.length
                        ? renderTokens(
                            tokens,
                            offset,
                            lineMatches,
                            activeMatch?.start,
                          )
                        : pieces(line, offset, lineMatches, activeMatch?.start)}
                    </span>
                  </span>
                );
              })}
            </code>
          </pre>
          {paginated && (
            <nav className="code-pagination" aria-label="Snippet line pages">
              <button
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous lines
              </button>
              <span>
                Lines {start + 1}–{Math.min(start + pageSize, lines.length)} of{" "}
                {lines.length}
              </span>
              <button
                disabled={currentPage === pages - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Next lines
              </button>
            </nav>
          )}
        </div>
      )}
      {(large ||
        current?.failed ||
        (current &&
          current.resolved === "text" &&
          !["text", "txt", "plaintext"].includes(requestedLanguage))) && (
        <p className="code-render-note">
          {large
            ? "Large snippet shown as plain text; all lines remain available through paging, search, copy, download, and the scratch editor."
            : current?.failed
              ? "Syntax colors could not load. The original snippet remains available."
              : `No bundled grammar for ${requestedLanguage}; shown as plain text.`}
        </p>
      )}
      {status && (
        <p role="status" className="code-feedback">
          {status}
        </p>
      )}
      {editing && (
        <Suspense
          fallback={<p className="code-render-note">Loading scratch editor…</p>}
        >
          <SnippetEditor
            code={code}
            language={language}
            filename={filename}
            onClose={() => setEditing(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
