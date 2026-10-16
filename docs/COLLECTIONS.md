# Collections implementation status

Collection storage and ZIP portability are being developed on `feat/collections`. Collection creation, editing, browsing and saved-search controls are not exposed in the reader yet. This is an internal foundation, not a shipped collection-management feature.

## Data contract

Each collection belongs to one local workspace, with its own revision and timestamps. A manual collection retains ordered, deduplicated document IDs; renaming or trashing a document does not change its membership. Tag collections retain one tag. Saved searches retain a bounded query and the existing literal/fuzzy, case, whole-word and isolated-regex options. Saving or importing a definition never executes its query. Collection writes do not edit Markdown, annotations, document revisions or snapshots.

A workspace supports up to 100 collections; a manual group supports up to 10,000 document IDs. Names and tags are bounded at 80 characters; queries follow the existing 512-character search-history contract. Names are unique within a workspace after Unicode NFKC normalization and lowercasing. Every member must exist in that workspace, including its retained trash. A stale edit/delete raises a collection-specific conflict. There is no automatic stale overwrite or deletion of source documents.

## Backups and import

Workspace ZIP metadata keeps collection definitions alongside document metadata. Manual IDs become paths in the archive; restore maps them to fresh imported document IDs before path-collision prefixes are applied. Tag/search criteria remain unchanged and will apply to the destination workspace. Existing collection names are preserved, with imported copies receiving an `(imported N)` suffix where needed. Definitions, source documents and assets commit together or roll back together. Conversion batches containing ZIP archives retain their definitions too.

Only active documents are included in workspace ZIPs. Manual references to browser-local trash are consequently omitted from that backup, matching the existing exclusion of trash and recovery snapshots. Internal collection IDs, revisions and workspace IDs are not exported; repository tokens, native handles and unrelated workspace queries are not part of the collection payload. Unknown input fields are discarded. An archive referencing an absent manual member is rejected before document metadata is applied. Older ZIPs without collections continue to work.

## Verification and remaining work

Tests exercise actual IndexedDB transactions, two simultaneous storage connections, membership through rename/trash/recovery, limits, name collisions, atomic rollback, migration from schema version six, ZIP round trips with colliding paths, unrelated-workspace exclusion and mixed ZIP/conversion batches. The browser fixture seeds known definitions and uses the real ZIP export/import controls to verify persistence and byte preservation.

Remaining work: accessible collection management, document membership selection, paginated browsing, tag and saved-query results using the existing search worker, collection-aware refresh/conflict recovery, and built-in review/error views. Add end-to-end coverage for those controls before merging this branch into the release.
