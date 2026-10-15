# Local document search

Open the search palette with **Ctrl/Cmd K** or **Search files**. Document search runs in the local index worker; imported Markdown and queries are not uploaded. The index updates when document content, paths, or tags change. Scroll-position and annotation updates do not rebuild document search. Offline startup rebuilds the index from this browser's stored documents.

## Matching

**Fuzzy** is the default. It supports prefixes and approximate spelling through MiniSearch, with title, path, and heading boosts. A result identifies a fuzzy spelling match when the entered word does not appear literally. Highlighting uses actual matching text, including the index's related terms.

Choose **Literal** to require the entered words as substrings. Quoted phrases require contiguous literal text. **Match case** and **Whole words** switch Fuzzy to literal matching; selecting Fuzzy clears those flags. Whole-word boundaries use Unicode letters, numbers, combining marks, and underscores. Matching is not locale-specific. There is a 512-character query limit.

```text
"local browser"
path:"Docs/Getting Started" tag:operations
heading:"Static hosting" status:approved type:markdown
```

Filters combine with each other and with text terms. Filter values remain case-insensitive, independently of the text's Match case setting. `tag:`, `path:`, and `heading:` use substring matches; `status:` uses the declared frontmatter status; `type:markdown` groups the supported Markdown extensions and `type:text` selects `.txt` files. Search is scoped to the current workspace. `path:` can narrow it to a folder.

The palette shortcut is reserved before the document editor's edit bindings, so opening search from a focused source line does not alter Markdown.

Type **>** to search commands only. Matching controls affect documents; command matching and keyboard actions retain their existing behavior.

## Regular expressions

Choose **Regex** to use the entire query as a JavaScript regular-expression pattern. Enter the pattern without `/.../` delimiters or trailing flags. Captures, alternatives, character classes, lookaround, backreferences, and Unicode property escapes use this browser's native implementation. Unicode and multiline line anchors are enabled. Matching is case-insensitive unless **Match case** is checked. **Whole words** checks Unicode boundaries around each actual match. Use `[\s\S]` when a match needs to span lines; dot does not match line breaks.

```text
TODO-\d+
(?<=Ticket-)\d+
\b(foo|bar)\b
^## .+$
```

Regex mode evaluates each title, path, raw source, heading, tag, and frontmatter metadata field independently. Filter-looking strings such as `tag:api` are pattern text in this mode; use Fuzzy/Literal for filter expressions. The `>` command prefix remains reserved; use `\x3e` for a literal leading greater-than sign. Pattern whitespace is significant and is preserved in recent searches. Invalid patterns show their syntax error. Empty patterns show the regular document list.

Pattern execution runs in a separate, short-lived worker. Prepared document data travels directly from the index worker over a message channel, bypassing the UI thread. Changes to the query, matching options, page, or indexed documents terminate any previous regex evaluation. Search starts after a 150 ms typing pause. Once the worker starts evaluating, it has a 1.5-second budget for the complete workspace search and previews; exceeding that budget terminates the worker and reports the limit. Browser scheduling can delay timeout delivery in background tabs. **Cancel regex search**, closing search, or switching matching also stops the evaluation. **Retry regex search** starts a fresh worker. The ordinary index, navigation, and command actions remain available after a timeout or cancellation. There is no fallback to an approximate pattern or partially counted result.

Counts and pagination cover matching documents, with the same one-result-per-document convention as other modes. Highlights come from actual pattern offsets, including lookaround context. Zero-width matches have no invented highlight or selected text and navigate to their source line. Matches longer than 4,096 characters also navigate to source with a bounded target payload. If repeated rendered text cannot be uniquely identified using its source context, navigation falls back to source rather than selecting a different occurrence. Source excerpts remain bounded and imported markup stays inert. The regex worker is self-hosted and cached for offline use.

## Result previews

Each row shows the document title, full path, a bounded source excerpt, section context when available, actual source line when located, declared status, and up to ten tags with matching tags prioritized. Source excerpts include Markdown syntax as inert text. They are generated around matches anywhere in the document, including beyond its first 50,000 characters. Unicode characters are not split at excerpt boundaries.

The palette shows an exact matching-document count. Results are paged in groups of 50; **Previous results** and **Next results** expose the remaining matches. Arrow keys and Enter operate on the current page's document/command list. There is one result per document, showing a representative match rather than every occurrence.

Opening a prose result reveals its enclosing callouts, scrolls to the matching passage, and selects that text. Code, math, frontmatter, and raw HTML source matches open at their source line in the source/split editor. If a source match cannot be mapped safely to rendered text, it also opens at its source line. When already using source or split view, results preserve that mode and move to the matching line. A result whose source text changed while opening is rejected with a visible explanation rather than guessing a new location.

Title/path/tag-only matches can open the document without a body location. A heading-only match opens the corresponding section. Search does not rewrite Markdown or save back to original files.

## Filter suggestions

Start typing `tag:`, `path:`, `heading:`, `status:`, or `type:` to see up to eight matching values from this workspace. Suggestions come from the worker's current index: actual tags, ancestor folders, heading text, declared statuses, and supported file types. Each count is the number of workspace documents containing that exact value, independently of other filters already entered. Suggestions use case-insensitive prefixes, rank common values first, and update after document edits/imports/removals. They do not predict words from document bodies.

Arrow keys and Enter select a suggestion; clicking one also works. It fills a quoted filter value, preserves earlier query text, and keeps focus in search. Values containing double quotes, line breaks, or more than 200 characters are omitted because they cannot be represented faithfully within the bounded query syntax.

## Recent searches

Opening a document result remembers its nonempty query and Fuzzy/Literal/Regex, Match case, and Whole words settings. **Remember search** also saves a query explicitly, including a query with no results. Typing and closing the palette does not save draft queries; command-only queries are not saved.

Expand **Recent searches** to restore, remove, or clear queries. Restoring resets pagination and restores matching options; it does not open a document automatically. Repeated queries with the same options move to the top, and distinct options remain separate entries. The newest 30 are retained per workspace.

History is stored in this browser's IndexedDB, isolated by workspace, and available offline. Other tabs on the same origin see updates. Removing or clearing history affects only that workspace's queries. It does not alter Markdown, annotations, revision snapshots, or media. Search history is not included in workspace ZIP exports, synced across devices, or sent to a service. Clearing site data removes it. If browser storage fails, document search remains usable and the app reports the history failure.

## Current boundaries

Cross-workspace search and a list of every occurrence remain roadmap work. Regex punctuation is searchable as ordinary text in Literal mode. User-supplied patterns run only in the dedicated regex worker. If the index worker is unavailable, the palette explains the failure and command actions remain available.
