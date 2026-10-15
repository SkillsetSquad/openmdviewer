# HTML and DOCX import

Choose `.html`, `.htm`, `.docx`, or `.pdf` using **Open files**, Ctrl/Cmd+O, the import command, or drag and drop. A mixed batch may include related images, Markdown and other already-supported local files. The converter opens a Markdown preview. No workspace records are created until **Import converted files** succeeds. **Download converted Markdown** downloads the complete result; **Discard preview**, Escape or closing the dialog discards the derived result without changing the workspace or the original files.

Conversion runs in a dedicated, self-hosted browser worker. It does not upload documents or require an application server. The worker is included in the offline application cache. **Cancel conversion** terminates the worker; retry starts a fresh instance. Startup has a 10-second budget and processing has a 45-second budget for the whole selected batch. Late results are rejected as well as timer expirations. Browser background scheduling can delay timeout delivery; these budgets do not claim an operating-system hard memory/CPU sandbox.

## Output and source preservation

An input such as `Imported/Report.html` or `Docs/Report.docx` produces Markdown at the same relative path with `.md` in place of the source extension. Exact original bytes are retained as download-only binary browser assets under the source directory's `_sources/` folder; retained HTML is not exposed as an executable HTML blob. Extracted images are stored under `_converted/<document stem>/`. Original files on disk are never modified, and converted documents have no implicit filesystem write connection.

Headings, paragraphs, basic tables, lists, emphasis, links, code blocks and supported images are converted where their source exposes those semantics. HTML title metadata (up to 1,000 characters) becomes Markdown frontmatter. Safe custom anchors are retained; the reader preserves their sanitized IDs. Source IDs already equal to their generated heading slug use the generated anchor. Local links between HTML/DOCX files selected in the same batch are rewritten to their derived `.md` paths. Related relative images should be selected in the same batch. Conversion does not search the user's disk or infer a permission grant for sibling files.

HTML is parsed into an inert syntax tree, not a DOM document, iframe or webpage. Scripts, styles, forms, active embeds and hidden HTML content are omitted. Derived HTML is sanitized before conversion to Markdown, then the normal untrusted Markdown renderer applies its existing security and remote-media consent rules. Only safely escaped, sanitized anchor IDs are emitted as raw anchor markup. External links remain explicit links, and remote Markdown images remain blocked until individually allowed in the reader.

DOCX parsing uses Mammoth's browser implementation with external file access and embedded style maps disabled. Supported embedded images become local assets. Unavailable/external images are omitted with a conversion notice; readable body text can still be imported. Unreadable document structure fails the conversion. The original DOCX retains the original layout and unavailable parts. Complex Word page layouts, equations, headers/footers, merged tables and unsupported image formats may need manual review; Markdown conversion is not a lossless Word layout reproduction.

Conversion notices are displayed per file (up to 50 distinct notices, with each message bounded to 2,000 characters). The preview shows at most 30,000 characters; download/import use the entire generated Markdown. Multiple converted files can be selected in the preview's document selector. The target workspace is captured when files are chosen, so a delayed result cannot be imported into another workspace accidentally. Open conversion controls participate in unload warnings and safe application updates.

## Atomic import and backups

Documents, originals and images import through the existing atomic IndexedDB import transaction. Existing workspace paths isolate the entire new batch under an import prefix, preserving relative links. Conflicting output paths within the batch (for example `Same.html` and `Same.md`) fail before import rather than silently replacing either source. Browser-storage failures retain the preview for download/retry. Imported copies can be edited, downloaded or explicitly saved using the regular file controls.

Workspace ZIP export includes derived Markdown, source assets and images. Reimporting such a ZIP restores the Markdown and original attachments without converting the source files again. HTML/DOCX files inside arbitrary ZIP archives are treated as attachments in this phase; extract and choose those files directly to invoke conversion. Direct directory connections continue to read Markdown/text and supported media; they do not perform implicit lossy conversion or write derived Markdown back over HTML/DOCX sources.

## Bounds and verification

Input is limited to 30 MiB per file, 100 MiB per batch and 10,000 selected files. Generated Markdown and HTML each have a 10 MiB bound. The complete persisted batch, including originals and images, must fit within 100 MiB. HTML requires UTF-8. Unsupported encodings fail explicitly.

DOCX preflight streams actual ZIP output in small input chunks, enforcing 30 MiB per expanded part, 100 MiB total and 10,000 parts. It rejects unsafe/duplicate paths, incomplete part streams, unsupported XML document types/entities and excessive XML markup. It repacks only the measured parts into a fresh archive before parsing, so differing original central-directory metadata cannot bypass the measured content bounds. This validates the measured part stream rather than certifying the original ZIP directory records; retained source bytes are untouched. HTML has a pre-parse markup bound and post-parse 200,000-node/256-level limits; these are conservative limits for import, not universal performance guarantees for arbitrary input.

Tests use an independent, generated OOXML fixture with headings, emphasis, lists, tables, a bookmark, an image and an unsafe hyperlink. Unit checks exercise actual browser-library conversion, originals/ZIP round trips, malformed XML/archive handling, lying archive size headers, path conflicts, worker cancellation and deadlines. Browser checks cover source preview without requests/execution, real DOCX conversion, image persistence, safe anchor navigation, original-byte export, mobile accessibility, active-worker cancellation/retry and offline conversion. Full reader regressions include the shared anchor renderer and existing file/import flows.

The conversion worker uses the packaged browser build and excludes Mammoth's CLI entry points. Its build checks that CLI-only argparse/sprintf modules do not enter the worker source graph. Dependencies remain self-hosted; there are no converter CDN or remote processing calls.

[PDF text extraction](PDF_IMPORT.md) is implemented with page diagnostics and ephemeral password handling. Scanned-page OCR, DOCX export, additional converter modules, bulk conversion inside archives and precise layout reproduction remain roadmap work.

Implementation references: [Mammoth browser API and security notes](https://github.com/mwilliamson/mammoth.js), [rehype-remark](https://github.com/rehypejs/rehype-remark), [rehype-sanitize](https://github.com/rehypejs/rehype-sanitize).

PDFs selected together with Markdown/text files remain attachments to preserve existing links. Select PDFs separately for extraction. See [PDF import](PDF_IMPORT.md) for the complete behavior and limitations.
