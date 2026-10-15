# Notes, highlights, and bookmarks

Open **Notes and bookmarks** from the document toolbar, the document actions list, or the command palette (`Ctrl/Cmd + K`). All reading data stays in this browser, associated with a document's stable local ID. Markdown source is unchanged.

- **Highlight a passage:** select prose in reading view, then open Notes and bookmarks. Give it an optional title/comment and choose Add reading item. A highlight can span inline emphasis and links, and multiple prose blocks.
- **Add a note:** open the dialog, choose Note, and write your thoughts. Notes can stand alone or refer to a selected passage.
- **Bookmark a section:** choose Bookmark and a heading, or Document start. The heading currently being read is suggested when available. Optional notes describe why you saved it.
- **Find reading items:** switch between This document and Whole workspace, and search titles, comments, saved quotes, and paths. Go to location opens the owning document in reading view. Edit and remove controls apply to the selected item. Lists show 50 items per page; search includes every page.

## Passage locations after edits

Saved passages include the exact rendered text and up to 64 characters of context on each side. A unique exact passage can move after edits. When exact text occurs more than once, only a uniquely matching context is accepted. Stored character positions never justify guessing a location in an edited document.

Missing or ambiguous passages remain in the list with their original quote and note. Removed or renamed heading anchors leave bookmarks marked as unavailable. Go to location explains these cases instead of jumping somewhere else. A bookmark follows its saved heading anchor, not a renamed heading's inferred meaning.

Highlights use the browser's CSS Custom Highlight API without rewriting the rendered Markdown DOM. Browsers without this API still retain notes/quotes and offer navigation; the dialog explains that persistent highlight painting is unavailable. Go to location selects a matched passage with the browser's ordinary text selection.

Selections are limited to 8,000 characters. Source editors, fenced code, interactive tables, math, diagrams, and media controls are excluded because generated widget text does not provide a stable prose anchor. There is a limit of 500 reading items per document, 200 characters per title, and 10,000 per note. Notes are plain text; imported markup is not executed.

## Persistence and portability

Reading items are stored in the existing IndexedDB document records. Save buttons wait for the browser write. A stale-tab conflict cannot replace newer content; drafts remain visible after a failed save. Keep both versions preserves the pending reading data in the conflict copy. The conflict dialog also offers a JSON download of that pending reading data. Content edits, document path changes, trash recovery, and source-version restoration retain current reading data. It does not save back to the original filesystem file.

Workspace ZIP backups include reading data in `.openmdviewer/workspace.json`, alongside unchanged Markdown and local media. Importing that ZIP restores reading data to newly imported documents; duplicate-path isolation keeps it attached to the correct imported copy. Existing older ZIP files without reading data still work. Workspace metadata is validated, and malformed or oversized reading-data records reject the import before any database write.

**Export JSON** downloads reading data for the selected scope, keyed by document path. This file includes saved quotes and comments, so share it intentionally. It excludes full document bodies. Standalone annotations JSON import is not implemented; ZIP provides the full restore workflow. Markdown/HTML exports and print output exclude personal notes and persistent highlight paint. Source documents and their browser-local reading data remain private until the reader explicitly exports them.

Unsaved dialog drafts are not a separate autosave feature. Save the item before closing the dialog. Duplicate document currently creates a fresh copy of the source and tags; its original reading data remains with the original document.

Automated Chromium coverage checks creation/edit/removal, actual range highlighting and navigation, unchanged source downloads, JSON/ZIP exports and re-imports, offline startup with the lazy dialog, lost-passage handling, mobile layout/accessibility, unavailable-API behavior, workspace isolation, and stale-tab preservation. Other browsers and assistive technologies still need certification.
