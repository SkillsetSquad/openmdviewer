# Workspace collections

Open **Browse collections** from the file navigation or command palette (`Ctrl/Cmd + K`). Collections group browser-local documents without moving source files, changing Markdown, or writing to connected folders. Each workspace has its own saved groups and recorded reading history.

## Create and browse

Choose **New collection**, enter a name, then select a type:

- **Manual selection:** choose individual documents, filter by title/path, or select/deselect all matches. Selection persists across pages. Groups retain stable document IDs, so renaming or moving a document path does not remove it. Trashed members stay saved but are hidden until restored. The editor reports all saved selections, including retained trash.
- **Tag-based group:** enter a tag from properties or frontmatter. Matching ignores case. Suggestions show up to 500 existing tags; the group evaluates all indexed tags. A group can be empty until matching documents exist.
- **Saved search:** retain a query plus fuzzy/literal/regex matching, case and whole-word choices. The query runs locally when its group opens, using the reader's existing search worker and result navigation. Regex uses the existing cancellable, time-limited worker. Invalid expressions and unavailable indexes produce explicit errors. Editing a query draft does not run it.

Manual lists and search results show at most 50 documents per page, with actual result counts and next/previous controls. All matching documents remain available across pages. Selecting a search result uses its real source/heading location rather than a guessed passage. Titles and tags come from the shared local index; filenames remain usable while manual-group titles are indexing.

Saved definitions are limited to 100 per workspace, with up to 10,000 manual references each. Names/tags are bounded at 80 characters and queries at 512. Names are unique after Unicode NFKC normalization and lowercasing. The limits apply to stored definitions, not a promise of a fixed memory footprint or universal device performance.

## Built-in views

- **Recently opened** uses separately recorded browser opening times, newest first. It does not infer reading from file edit dates. The sidebar's older edit-date view is labeled **Recently updated documents**.
- **Favorites** uses the document's existing favorite flag.
- **Needs review** uses the local health worker's missing, invalid or overdue declared review dates. It does not infer an actual human review or organizational approval.
- **Documentation issues** uses findings from the existing transparent health rules, including informational findings. It is not a factual-accuracy score or an external-link validator.

Review/issue results are explicit local snapshots with a checked time and **Refresh checks**. They use the existing 25-million-character analysis limit. Closing the view terminates its analysis worker. Collection browsing does not contact a remote service.

## Edit, delete and conflicting tabs

**Edit collection** changes only the saved definition. **Cancel editing** leaves its saved version intact. **Delete** asks you to confirm removal of the group/search; its documents, source files, tags and notes remain in place.

Writes and deletions check the collection's revision inside a transaction. If another tab changed it, the stale operation is rejected. An edit draft remains visible: **Load saved collection** explicitly replaces it with the latest saved definition; **Save draft as new collection** preserves it under a different available name. There is no automatic stale overwrite. **Refresh collections** and returning focus to the window reload the saved list while retaining an open editor's original revision for conflict detection.

## Backups and import

Workspace ZIP metadata carries collection definitions alongside document metadata. Manual IDs become paths in the archive; restore maps them to fresh imported IDs before path-collision prefixes are applied. Tag/search criteria remain unchanged and apply to the destination workspace. Existing collection names are preserved; imported copies receive an `(imported N)` suffix where needed. Definitions, documents and assets commit together or roll back together. Conversion batches containing ZIPs retain their definitions too.

Only active documents are included in workspace ZIPs. References to browser-local trash are omitted from that backup, matching the exclusion of trash and recovery snapshots. Reading activity, internal collection IDs/revisions, native handles and unrelated workspace queries are excluded. Unknown input fields are discarded. Missing manual members reject the archive before document metadata is applied. Older ZIPs without collections remain compatible.

## Verification boundaries

Unit tests cover workspace ownership, simultaneous connections, stale writes/deletes, rename/trash/recovery membership, limits, normalized name collisions, atomic rollback, schema-six migration, ZIP path collisions, unrelated-workspace exclusion, mixed conversion batches and separate reading activity. Browser fixtures exercise real creation/edit/delete, two-tab draft recovery, tag/search navigation, malformed regex, built-in views, source preservation, pagination through 125 generated matches, mobile overflow, accessible controls and ZIP restoration. These generated fixtures do not certify all devices, all shipping browsers or complete WCAG conformance.
