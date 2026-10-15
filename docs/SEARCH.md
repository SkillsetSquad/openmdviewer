# Local document search

Open the search palette with **Ctrl/Cmd K** or **Search files**. Document search runs in the local index worker; imported Markdown and queries are not uploaded. The index updates when document content, paths, or tags change. Scroll-position and annotation updates do not rebuild document search. Offline startup rebuilds the index from this browser's stored documents.

## Matching

**Fuzzy** is the default. It supports prefixes and approximate spelling through MiniSearch, with title, path, and heading boosts. A result identifies a fuzzy spelling match when the entered word does not appear literally. Highlighting uses actual matching text, including the index's related terms.

Choose **Literal** to require the entered words as substrings. Quoted phrases require contiguous literal text. **Match case** and **Whole words** switch to literal matching; selecting Fuzzy clears those flags. Whole-word boundaries use Unicode letters, numbers, combining marks, and underscores. Matching is not locale-specific. There is a 512-character query limit.

```text
"local browser"
path:"Docs/Getting Started" tag:operations
heading:"Static hosting" status:approved type:markdown
```

Filters combine with each other and with text terms. Filter values remain case-insensitive, independently of the text's Match case setting. `tag:`, `path:`, and `heading:` use substring matches; `status:` uses the declared frontmatter status; `type:markdown` groups the supported Markdown extensions and `type:text` selects `.txt` files. Search is scoped to the current workspace. `path:` can narrow it to a folder.

The palette shortcut is reserved before the document editor's edit bindings, so opening search from a focused source line does not alter Markdown.

Type **>** to search commands only. Matching controls affect documents; command matching and keyboard actions retain their existing behavior.

## Result previews

Each row shows the document title, full path, a bounded source excerpt, section context when available, actual source line when located, declared status, and up to ten tags with matching tags prioritized. Source excerpts include Markdown syntax as inert text. They are generated around matches anywhere in the document, including beyond its first 50,000 characters. Unicode characters are not split at excerpt boundaries.

The palette shows an exact matching-document count. Results are paged in groups of 50; **Previous results** and **Next results** expose the remaining matches. Arrow keys and Enter operate on the current page's document/command list. There is one result per document, showing a representative match rather than every occurrence.

Opening a prose result reveals its enclosing callouts, scrolls to the matching passage, and selects that text. Code, math, frontmatter, and raw HTML source matches open at their source line in the source/split editor. If a source match cannot be mapped safely to rendered text, it also opens at its source line. When already using source or split view, results preserve that mode and move to the matching line. A result whose source text changed while opening is rejected with a visible explanation rather than guessing a new location.

Title/path/tag-only matches can open the document without a body location. A heading-only match opens the corresponding section. Search does not rewrite Markdown or save back to original files.

## Filter suggestions

Start typing `tag:`, `path:`, `heading:`, `status:`, or `type:` to see up to eight matching values from this workspace. Suggestions come from the worker's current index: actual tags, ancestor folders, heading text, declared statuses, and supported file types. Each count is the number of workspace documents containing that exact value, independently of other filters already entered. Suggestions use case-insensitive prefixes, rank common values first, and update after document edits/imports/removals. They do not predict words from document bodies.

Arrow keys and Enter select a suggestion; clicking one also works. It fills a quoted filter value, preserves earlier query text, and keeps focus in search. Values containing double quotes, line breaks, or more than 200 characters are omitted because they cannot be represented faithfully within the bounded query syntax.

## Recent searches

Opening a document result remembers its nonempty query and Fuzzy/Literal, Match case, and Whole words settings. **Remember search** also saves a query explicitly, including a query with no results. Typing and closing the palette does not save draft queries; command-only queries are not saved.

Expand **Recent searches** to restore, remove, or clear queries. Restoring resets pagination and restores matching options; it does not open a document automatically. Repeated queries with the same options move to the top, and distinct options remain separate entries. The newest 30 are retained per workspace.

History is stored in this browser's IndexedDB, isolated by workspace, and available offline. Other tabs on the same origin see updates. Removing or clearing history affects only that workspace's queries. It does not alter Markdown, annotations, revision snapshots, or media. Search history is not included in workspace ZIP exports, synced across devices, or sent to a service. Clearing site data removes it. If browser storage fails, document search remains usable and the app reports the history failure.

## Current boundaries

Regular-expression queries, cross-workspace search, and a list of every occurrence remain roadmap work. Regex punctuation is searchable as ordinary text in Literal mode; no user-supplied regular expression runs in the document worker. If the index worker is unavailable, the palette explains the failure and command actions remain available.
