# Read-only GitHub repository browsing

Use **Browse GitHub repository** in the file-navigation controls or command palette. Enter `owner/repository` or its `https://github.com/owner/repository` URL, then select **Browse repository**. Loading is explicit; opening the dialog alone does not make requests. GitHub Enterprise hosts and file/tree URLs are not accepted by this adapter.

The repository's default branch opens at an immutable commit. Browse directories, preview Markdown in the reader or inspect its source, and select documents/local media across folders. The root README is previewed and selected when available. Common extensionless README/LICENSE/CHANGELOG and related documentation names can also be read and imported. Other regular Markdown/text extensions match the existing importer. Symlinks and submodules are not followed; unsupported entries are counted as omitted. Local images/media are downloaded only when selected for import. The preview retains the reader's separate explicit consent for external media.

The folder list filters and paginates locally, 50 entries per page. Folder navigation is lazy: it reads only the requested Git trees. Markdown relative links can open other documents from the pinned commit; same-document and cross-document heading links use the rendered heading IDs. Wiki links support explicit paths/extension variants. Repository-wide ambiguous basename discovery is not inferred; select that document in the tree. Local media without a cached browser copy has an honest unavailable preview.

## Branches and tags

Choose **Branch or tag** to open that reference at a newly resolved commit. Slash-containing branches are supported. Lists load in pages of 100 with explicit **More branches/tags** controls; this is a loaded subset until pagination finishes. Switching references clears the old preview/selection before displaying the new snapshot. **Load latest snapshot** explicitly re-resolves the selected reference and resets selection. It does not silently refresh an existing imported workspace.

Files are read by Git blob ID, after checking that their paths/modes belong to the snapshot's Git tree. The downloaded bytes must have the declared size and match the Git blob SHA-1 object ID. This verifies correspondence to the reported Git object; it does not certify authorship, commit signatures or collision resistance. Truncated directory responses fail instead of becoming a misleading complete listing. Symlinks, Git LFS external content and submodule repositories are not fetched.

## Local import and offline use

Select **Import selected files locally** to fetch and verify every selected file before creating a new workspace. Paths and selected local assets are preserved. A single IndexedDB transaction adds the workspace, documents and assets; failed/canceled reads create no partial workspace. Existing workspaces and remote files are unchanged. Browser edits and local-file saves never write back to GitHub.

Document properties retain the repository, branch/tag label, immutable commit, original repository path and blob ID, with a **View original file on GitHub** link. This is original-source provenance, not a claim that subsequent browser edits still match that blob. The validated provenance survives workspace ZIP export/import. Tokens, arbitrary provider URLs and unknown source metadata fields are excluded.

Imported text and selected local media remain usable offline after the app has cached its own assets. Repository browsing and new remote reads need connectivity; there is no background synchronization. Keep Markdown/workspace backups because browser storage can be cleared or evicted. Imported private documents are ordinary unencrypted local browser data.

## Optional authentication and network behavior

Public repositories can be read without a token. For private repositories or higher API limits, enter an optional GitHub token with read access to the repository's contents before browsing. No OAuth client secret or application backend is needed. The token input clears on submission; its value is kept only in the current adapter's memory, sent only as an Authorization header to `https://api.github.com`, and cleared when the dialog closes or a new repository replaces it. It is not placed in URLs, localStorage, IndexedDB, document metadata, service-worker caches or exports. This is not a claim of protection against a compromised browser/extension or an explicitly configured password manager.

The adapter performs GET requests only, with `credentials: omit`, `cache: no-store`, `referrerPolicy: no-referrer` and redirects rejected. It constructs endpoint URLs itself and never follows response-provided download/Link URLs. Moved repositories need their current canonical repository URL. No remote write, commit, branch creation or Git push is implemented. The host/API is fixed to GitHub; the typed adapter interface leaves room for other providers.

API remaining/reset/retry values are shown only when GitHub exposes them; unavailable headers are labeled unavailable. Rate-limit and permission failures are distinct where the response permits that distinction. A known active rate limit blocks additional requests until its reported retry/reset time. There are no automatic retry loops or fabricated request budgets. Browser CORS failures, denied organization/token access, missing refs and empty repositories are reported without implying that an import completed.

## Bounds and verification

Each request has a 30-second read deadline. Metadata responses are bounded to 8 MiB, directory listings to 20,000 entries, file reads to 5 MiB and session verified-content/import batches to 50 MiB. A batch supports up to 200 selected files and needs at least one text document. Session requests are capped at 500. Branch/tag pagination supports up to 2,000 loaded refs of each kind. Large directories, unsupported encodings, NUL-containing text, Git LFS pointers, mismatched bytes and malformed responses fail explicitly. Limits are not universal performance guarantees or an OS memory sandbox.

Automated checks cover immutable tree/blob reads, exact content hashes, fixed-origin credential handling, token exclusion, rate headers, slash-containing refs, branch/tag switching, provenance backup/restore, atomic storage rollback, directory pagination, relative/heading navigation, preview sanitization, cancellation/late responses, mobile accessibility and offline imported documents/media. Provider-shaped fixtures do not replace live verification: the actual public repository/API path is also checked separately. Private organization SSO policies and every major browser have not been certified.

GitHub references: [Git trees](https://docs.github.com/en/rest/git/trees), [Git blobs and raw media](https://docs.github.com/en/rest/git/blobs), [cross-origin API requests](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests), [rate-limit behavior](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api). The adapter pins API version `2026-03-10`.

## Compare a file across references

In a document preview, expand **Compare this file across Git references**, choose **Compare with branch or tag**, and select **Compare pinned file**. The current preview is the before version; the selected reference is resolved explicitly to a separate immutable after commit. Both commit IDs and the after file's GitHub link are displayed. The same exact path is read and Git-blob verified through the adapter; absent paths fail clearly, without guessing renames. Branch selection, import selection, local documents and remote files remain unchanged.

The read-only inline diff includes added/removed/unchanged rows, both source line numbers and measured line counts. Changes have visible +/− markers as well as background colors. Results page at 100 rows, with a keyboard-focusable scrolling region for long lines. Source is displayed as escaped text, including imported HTML or scripts. Changing the comparison reference or preview clears the previous result; failures and cancellation do not leave a stale successful diff. An identical result means exact text equality; line endings and final-newline differences are counted.

Comparison is bounded to 100,000 characters and 4,000 lines per version, a 2,000-edit limit and a 150 ms diff deadline inside a dedicated cancellable worker, with a 10-second overall startup/processing deadline. Larger/more complex files fail with a download-source suggestion rather than silently truncating. The existing network, size, cancellation, session-cache and rate limits still apply. This is a same-path file comparison, not merge, rename detection, commit-history discovery or remote editing. Automated tests cover exact line numbers, bounds, immutable cross-reference reads, escaped script text, source preservation and identical results.
