# Connected local folders

Open **Open folder** in the workspace sidebar, **Open local folder** in the command palette, or **Local file connection → Local folder controls**. In a secure browser context with `showDirectoryPicker`, **Choose local folder** opens the browser's native directory picker with read access. The picker starts directly in the click handler, before hashing or browser storage work.

A read-only preview enumerates supported Markdown/text documents and media with exact paths relative to the selected root. **Connect folder workspace** creates a separate named workspace, cached documents/media, child-file connections, and the directory connection in one IndexedDB transaction. Empty folders can be connected, then scanned after documents are added. A failed/canceled scan or failed transaction creates no partial workspace. Existing workspaces remain available.

Cached documents and media remain readable after reload and offline. The directory handle is retained in browser IndexedDB; permissions may need to be granted again. Reload does not automatically enumerate the folder or replace cached contents. The connection is specific to this browser origin, so another deployment path/origin has its own permissions and local data. Clearing site data removes cached data and connections; export portable ZIP backups separately.

## Explicit scans and review

**Scan connected folder** requests read access directly from its click handler and takes another read-only snapshot. It compares raw SHA-256 disk hashes with each connected file's last accepted baseline, and separately compares the cached browser content with its browser baseline. Results identify new files, unchanged files, disk changes, browser changes, changes on both sides, missing files, and disconnected/trashed browser copies. The result list has a path/status filter and 50-row pages.

**Add new files** imports only paths absent from the original connection manifest. The addition, new child connections, and updated manifest commit atomically, guarded by the connection token and browser path checks. A stale scan from another tab cannot silently replace a newer connection. Browser path collisions reject the addition without replacing existing content.

Scans never overwrite existing browser documents, annotations, revisions, or media. Missing files remain cached. A browser rename keeps the file connection to the original disk file; it does not rename the actual file. External renames appear as a missing old path and a new path. Browser trash/disconnection is respected, rather than silently reimporting or reconnecting the original path on the next scan.

Use **Review file** on a document row to open its existing local file controls. **Reload from disk** applies the established browser-edit review and revision snapshots; **Save to connected file** applies the established explicit permission, disk-checksum review, browser-revision checks, staged write and post-close verification. A verified save/reload keeps the folder provenance when it still refers to the same file. **Save As** to another file detaches that document from folder ownership. Individual file controls and the folder scanner share the same cross-tab Web Lock.

Changed media remains the previously cached version; reconnect the selected directory as a new workspace to inspect a fresh collection. Scanning is a point-in-time observation, not an operating-system-wide filesystem transaction. Concurrent external changes can make any report stale. File save/reload rechecks its actual target before applying changes. No background watcher or automatic synchronization is claimed.

**Disconnect folder** removes the directory handle and folder-owned child-file connections. It retains the workspace, browser documents, cached media, annotations, revision history, disk files, and independent file connections. Folder and file handles are excluded from portable ZIP metadata.

## Limits and fallback

Each scan permits up to 10,000 supported files, 100 MiB of supported content, 30 MiB per file, 50,000 visited entries, and 64 nested directory levels. `.git`, `node_modules`, and `.next` directories are skipped; unsupported files are skipped. Ambiguous path components fail rather than being silently normalized into another path. Markdown must be valid UTF-8 without NUL bytes. Files are read sequentially, with progress and cancellation between asynchronous operations; an in-flight native read must return before cancellation can finish. Limits/errors fail the complete scan, so an incomplete traversal cannot falsely label entries missing.

Where the native picker is unavailable, **Import a folder copy** opens the existing folder-file input. That fallback imports browser copies and does not imply a persistent directory connection or disk-write permission. Native picker UI and permission prompts depend on the browser and OS. See [Chrome's File System Access documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) for the browser API model.

## Verification and remaining work

Unit tests exercise traversal/limits, cancellation, strict decoding, hash comparisons, v5 → v6 migration, atomic rollback, stale connection tokens, and source-preserving disconnect. Browser tests substitute the native picker function with genuine OPFS directory/file handles, exercising actual enumeration, structured-clone persistence, native file reads/writes, local media, conflict reports and mobile accessibility. This verifies the browser filesystem operations; it does not automate the OS picker window or certify OS permission prompts.

Directory-wide writing, physical create/rename/move/delete operations, media reconciliation in the current workspace, automatic watchers, identity-based external rename tracking, selective scan exclusions, and the separate OPFS large-workspace storage backend remain future work. Cached documents/media currently use IndexedDB.
