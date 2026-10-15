# Local PDF text import

Choose one or more `.pdf` files with **Open files** or drag and drop to open the existing conversion preview. Import reads the PDF text layer in browser workers, creates Markdown, and retains the exact original PDF under `_sources/` as a binary download. No document or original is persisted until **Import converted files** succeeds. Discard and cancel preserve the current workspace.

Markdown bundles keep their existing attachment behavior: when the same selection contains Markdown/text files, its PDFs remain ordinary attachments at their original relative paths. This preserves Markdown links such as `[Download](guide.pdf)` and does not require an attachment to be parseable as a PDF. To extract those PDFs, select the PDFs separately. HTML/DOCX selections without Markdown can convert PDFs in the same preview. Mixed-batch reports and derived documents retain the selected input order.

## Extraction and reading

Each extracted document has a generated title heading (PDF title metadata, or the source filename), an original-PDF download link, and generated page headings. Source text is serialized as literal Markdown text: PDF strings resembling Markdown headings, links or HTML do not become executable content or invented source structure. Line grouping uses the supplied text stream, end-of-line markers and measured run positions; it does not promise reconstruction of columns, tables or page layout.

The preview shows the actual source page count, pages with extractable text, and pages without it. Pages without text are labeled as potentially blank or image-only. The importer does not assume that every such page is a scan. A page with an existing OCR text layer can yield text; this importer does not perform OCR. Image-only pages retain their original pixels in the source PDF, with an explicit extraction note rather than fabricated transcription.

PDF images, forms, annotations, bookmarks, JavaScript actions and page styling are not converted or executed. Complex reading order, vertical/rotated text and multi-column layouts need review. PDF.js performs its normal text-layer normalization. Latin Unicode and a Japanese predefined-character-map fixture are covered; this is not a claim that all possible font encodings or broken PDFs are recoverable.

Links from converted HTML/DOCX into another selected PDF are rewritten to its derived Markdown path. Viewer page fragments such as `report.pdf#page=2` use that PDF's actual generated page heading ID, including title/page-name collisions. Original annotations inside the PDF are not extracted as links. Ordinary source-PDF links download the unchanged source.

## Passwords and local data

An encrypted PDF can request a password in the preview. A wrong password can be retried. Passwords are held only in component/worker memory for the current conversion request, are cleared from the input field on submission, and are not persisted in document metadata, workspace exports, preferences or browser history by the app. Closing the preview releases its password map and workers.

Unlocking does not mean workspace encryption: imported text is plaintext in browser storage, Markdown downloads and ZIP exports. The original encrypted PDF remains unchanged. The password prompt explains this before import. Conversion does not establish organizational access controls or protect against a compromised browser or extension.

## Worker and resource handling

The conversion worker uses PDF.js 6.4.299's public worker-port and binary-data-factory APIs. A dedicated nested module worker parses each PDF; it is explicitly released on success/error, and cancellation terminates the conversion worker and its descendant parser. No fake PDF parser is moved onto the UI thread. The shared 10-second converter startup / 45-second processing budgets continue to apply to the complete batch.

Standard fonts and predefined character maps are packaged as one deterministic, self-hosted `pdf-resources.zip`. The factory only serves known packaged names and rejects arbitrary resource paths/types. It never takes a PDF-supplied URL as a fetch target. Font-face loading, system fonts, image decoding/Wasm and XFA rendering are disabled for this text-only path. The module worker uses a `.js` filename with module mode so standard static-server JavaScript MIME mappings work at root and subpaths. Relevant third-party licenses are retained with the generated assets.

The parser, resource pack and preview are included in the existing offline application cache. Browser documents, passwords and external responses are not added to that cache. Core PDF extraction, encrypted-PDF retry, local character maps, and original downloads work without document uploads, an application server or a CDN dependency.

## Bounds, testing and remaining work

The existing 30 MiB per-input / 100 MiB batch bounds apply. Additional bounds are 500 pages per PDF, 200,000 text items per page, 1,000,000 items per PDF, and 10 MiB of extracted text/generated Markdown. Exceeding a bound fails the conversion; the app does not silently import an arbitrary first subset of pages. NUL characters in extracted strings are replaced and reported. These checks and worker deadlines are not an operating-system memory sandbox or a universal performance guarantee for adversarial PDFs.

The committed fixtures are independently generated with ReportLab and rendered/inspected with Poppler. Coverage includes multi-page text, Unicode, image-only pages, inert PDF actions/URI annotations, encryption, columns, rotation and Japanese character maps. Browser checks cover original-byte export, literal text safety, no action requests, password retry, page-link collisions, mobile accessibility, malformed inputs, offline extraction and nested-parser termination. The cancellation test substitutes the parser script only in isolated local static fixtures and restores it afterward; it is skipped against the immutable public deployment. Production checks exercise the actual published parser/resource bytes and real PDF fixtures.

Scanned-page OCR, PDF image extraction, an embedded page-rendering viewer, annotation/form conversion and layout-faithful PDF-to-Markdown reconstruction remain separate work. Browser printing / Save as PDF remains the existing export path; this import feature does not add a professional PDF publishing engine.

API references: [PDF.js document/text APIs](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [PDFWorker public port API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFWorker.html). The implementation follows the pinned package's actual types/source where generated online documentation differs.
