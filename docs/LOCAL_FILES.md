# Connected local files

Open **Local file connection** in the shared toolbar, **Connect a local file** in the file sidebar, or **Local file / Save As** in search commands or the export dialog. The toolbar control is available in reading, source, and split views.

Browser autosave continues to save only to IndexedDB. **Save to connected file** and **Save As** are separate, explicit disk actions. A download remains a browser document copy and does not establish a file connection. Ctrl/Cmd S retains its existing Markdown-download behavior.

## Open and connect

**Open connected file** uses the browser's native file picker to select one Markdown/text file. The app creates a browser copy and stores its file handle in IndexedDB. Opening an already connected file in the same workspace reopens its cached browser document; use **Reload from disk** to check external changes. Choosing the same file in another workspace creates an independent browser copy and connection.

Connections accept `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx`, and `.txt`, up to 30 MB each. Connected files must be valid UTF-8 without NUL bytes; invalid encodings are rejected before writing. Browser text containing NUL characters or incomplete Unicode surrogates is also rejected before opening a writer. MDX remains inert Markdown rather than executable JavaScript. A single-file handle does not grant access to sibling images or other files. Use folder/ZIP imports to include local media until direct directory connections are implemented.

The browser document path and connected file are distinct and displayed together. Browser rename, move, duplication, trash, or restore operations do not rename, move, duplicate, or delete disk files. Duplicated documents do not inherit the original's connection. **Save As** chooses a new target and, after verification, connects this document to it. **Disconnect file** removes only the browser's connection record; its cached document and disk file are preserved.

## Explicit saving

The picker and permission requests are invoked directly from their click handlers, before asynchronous work consumes the browser's required user gesture. Opening a file requests read access. Saving an existing connection requests write access. Permissions may need to be granted again after a browser restart or revocation. The app never requests write access during autosave or startup.

Before saving, pending browser edits must finish successfully. The app checks the persisted browser document revision and the connection token so another tab's newer browser copy or changed connection cannot be silently replaced. Local file operations are coordinated across tabs with a Web Lock, and writes request an exclusive file writer.

Disk identity is checked with SHA-256 of the actual bytes, not only timestamps or sizes. The checksum is checked before creating a writable stream, after opening it, and after staging content. The browser document and connection are checked again before closing the stream. Closing commits the staged contents; a detected conflict aborts the stream. A successful close is followed by a read and checksum verification before the app reports **Saved and verified** or advances its stored baseline.

Unchanged files are not rewritten. The reviewed target file's current UTF-8 BOM and uniform CRLF convention are preserved, while mixed line endings are retained as supplied by the browser document. Save As into a new empty file writes UTF-8 using the current document's text. A literal leading U+FEFF text character is preserved with a separate encoding marker so repeated saves do not consume it or grow additional markers. Native save pickers may create an empty destination as part of selection; the app does not delete that browser-created entry when a later operation is canceled.

These checks reduce conflicts but are not a cross-process filesystem compare-and-swap: a separate native application can still race between the final check and commit or edit immediately afterward. The browser controls actual file access and commit behavior. A failed or unverified write is reported without claiming that the latest browser copy was saved. If disk contents were verified but connection persistence fails, that separate outcome is stated explicitly.

## Changed disk contents and reload

If an existing destination contains other data, or a connected file changed externally, the app shows the browser and disk versions before replacement. Previews are limited to 20,000 characters; complete text downloads are available for review. Imported markup in these previews is inert text.

**Replace reviewed disk version** rechecks the displayed disk checksum. If the file changed again, the review refreshes instead of overwriting the newer version. **Keep browser copy** dismisses the proposed replacement. No automatic disk merge, background watcher, or hidden overwrite is performed.

**Reload from disk** requests read access and refreshes an unchanged browser copy. If the browser copy also has edits, **Load reviewed disk version** requires explicit review. Changed browser contents are preserved in the existing revision history, which retains the newest 50 content revisions. Browser revision conflicts still use the existing conflict-recovery flow. Loading disk contents never writes the disk file.

## Persistence, support, and verification

File handles and baselines are browser- and origin-local, isolated by workspace, and excluded from ZIP exports. Clearing site data removes connections and browser copies, while disk files remain. Export a ZIP or Markdown copy for a portable backup; reconnect native files in another browser or deployment origin.

Native picker support is detected in the current secure browser context. When unavailable, the dialog provides working file imports and Markdown downloads. Browser permission policy, revoked access, moved/deleted files, storage quota, or operating-system restrictions can prevent access; the browser copy remains available for recovery. A file operation in progress participates in the unload warning and blocks application-update reloads until it finishes.

Automated Chromium checks use genuine OPFS `FileSystemFileHandle` objects and native writable streams, including structured-clone persistence in IndexedDB, byte verification, BOM/CRLF preservation, denied permissions, external changes, stale tabs, workspace isolation, and offline writes. Native picker functions are substituted to return these isolated test handles. The operating-system picker dialogs and writes to a user-selected real filesystem location have not been manually certified. OPFS is used by these tests, not yet as the application's large-workspace storage backend.

Direct folder handles, directory rescanning, filesystem rename/move/delete, batch disk saves, OPFS-backed workspace collections, and source-file watching remain roadmap work.

Browser API references: [Chrome File System Access guidance](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) and the [File System Standard](https://fs.spec.whatwg.org/).
