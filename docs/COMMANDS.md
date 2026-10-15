# Keyboard commands and local search

Open the palette with **Ctrl/Cmd + K** or **Search files**. It searches both documents and implemented actions. Type `>` at the beginning to search actions only; `>` by itself lists all available commands. An empty ordinary query shows common quick actions and up to 40 documents.

Use **↑ / ↓** to move the highlighted result, **Enter** to choose it, or **Escape** to close. Arrow navigation wraps at either end and keeps focus in the search field. The highlighted result is exposed through the combobox/listbox accessibility pattern. Closing returns focus to the original control when that control still exists. Ctrl/Cmd + K inside the palette focuses and selects the query for replacement.

## Command matching

Command labels and aliases use local MiniSearch prefix/fuzzy matching, with all words required. For example, `settngs` finds reading settings, `grph` finds the graph, `clipboard` finds Copy Markdown, and `export pdf` finds Print or save as PDF. Quoted phrases and existing document filters (`tag:`, `path:`, `heading:`, `status:`, `type:`) keep their document-search meaning.

Available actions cover file/folder import, document creation, workspace management/trash, themes and reading settings, focus mode, graph and health reports, help, reading/source/split views, backlinks, document properties, revision history, copying Markdown, Markdown/ZIP downloads, presentation mode, and browser printing. Document-specific actions are hidden when no document is open. Revision history compares saved revisions of one document; it does not yet compare two independent documents.

Print or save as PDF opens the browser print flow after closing the palette and restoring rendered reading view. PDF output depends on the browser's print options. Download actions request a browser download; they do not write back to an imported file.

## Document search and privacy

Document search continues to run in its separate local worker, with fuzzy terms, phrases, and filters. It returns up to 50 matching documents; refine the query to find a more specific file. Source excerpts are bounded previews, not a promise that every matched term appears in the excerpt. Commands remain usable if the document search worker is unavailable.

All matching runs on this device. Opening the palette does not upload documents or call a remote search service. The palette and its dependencies are included in the offline application cache.

Dialogs own their keyboard interaction. Background shortcuts do not replace an open form or run document actions behind a dialog. Closing the palette preserves the underlying focus/presentation mode; pressing Escape again outside a dialog exits those reading modes.

## Document tabs

When more than one document is open, the active tab is a keyboard stop. Left/Right move between tabs and activate the document; Home/End choose the first/last tab. Delete closes the focused tab. Separate, labeled close buttons are available without entering the tablist. After closing, focus moves to the next active tab, or to the document panel when a single tab remains.

Notes and bookmarks opens local reading items for the current document. See [reading data](ANNOTATIONS.md).

**Local file / Save As** opens explicit file-connection controls. Browser autosave and Ctrl/Cmd S downloads retain their existing behavior. See [connected-file support](LOCAL_FILES.md).
