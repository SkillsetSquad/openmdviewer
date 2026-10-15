# Import a Markdown URL

Use **Open Markdown URL** in the file-navigation controls or command palette (`Ctrl/Cmd + K`). Enter a complete HTTPS URL for a raw Markdown/plain-text document and choose **Fetch preview**. Opening the dialog, typing a URL or previewing source does not import anything. The remote server must permit browser CORS reads; this application does not use a proxy or bypass server access rules.

Review the rendered document or the read-only **URL source preview**, choose its relative **Local document path**, then select **Import reviewed document**. The new copy is stored in the workspace selected when the dialog opened. A path collision is isolated in an `Imports/Batch N/` folder; existing documents are preserved. Browser edits remain local and never write to the remote URL. Once imported, the document works offline with the cached application. Keep external backups because browser storage can be evicted.

## Network and privacy

Fetching is explicit and uses one credential-free GET, CORS mode, no-store caching, no referrer and rejected redirects. No cookies, Authorization headers, application credentials or provider keys are sent. The URL server still receives the request and ordinary browser/network information, including the document URL and its query parameters. Embedded URL username/password credentials are rejected. Public HTTPS and explicitly entered HTTPS intranet URLs are subject to the browser's normal network/CORS restrictions.

Use the final raw-file URL: redirects, login pages and HTML responses are not converted by this importer. GitHub repository browsing remains a separate option for branch/tag selection, verified Git objects and source provenance. HTTP-only, cookie-authenticated or custom-header endpoints are unsupported here. Download a file and use local import/conversion when the server cannot permit a direct browser read.

The entered URL, including temporary query parameters, is kept only in the open dialog and request; it is not added to the imported document's metadata, recent URL history, localStorage, IndexedDB or portable exports. Document contents retain exactly the fetched UTF-8 text, including any URLs already present in that text. The browser's networking tools, extensions and browser/session behavior are outside this app-level exclusion.

Only the selected text response is fetched automatically. Linked documents and relative media are not recursively downloaded or rewritten; the original Markdown references may therefore be unavailable locally. Import related files separately with corresponding paths. Absolute external images/audio/video keep the reader's per-resource consent controls. Untrusted HTML/MDX is handled by the existing sanitized, non-executable Markdown pipeline. Local links in the preview do not trigger additional document fetches.

## Bounds and errors

Each read has a 30-second deadline and a 5 MiB limit, enforced against both the exposed Content-Length and streamed bytes. Supported response types are `text/markdown`, `text/x-markdown`, `text/plain`, `application/octet-stream`, or an absent Content-Type; UTF-8 is required, and invalid UTF-8/NUL-containing bodies fail. Full HTML documents mislabeled as text also fail with a converter suggestion. Browser CORS, network and redirect failures cannot always be distinguished and are reported together without echoing the URL/query or server response body.

The rendered preview is limited to the first 100,000 UTF-16 characters, with an explicit notice for larger responses. The source preview and import retain the complete text up to the byte limit. Fetch cancellation, closing the dialog and failed reads import nothing. Final local persistence is non-dismissible while saving and uses the existing transactional importer. Storage failures remain visible; the application does not claim a completed disk write or remote synchronization.

Automated tests cover exact Unicode/BOM/CRLF preservation, explicit fetch/import separation, omitted credentials/referrer, MIME/encoding/HTML checks, byte bounds, deadlines, cancellation/late responses, preserved path collisions, offline imported copies, unsafe source rendering and mobile accessibility. These are bounded application checks, not a guarantee that every remote server or browser permits CORS.
