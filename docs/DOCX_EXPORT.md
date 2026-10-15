# Editable Word document export

Open **Export → Word document**, or use the command **Export Word document**. Choose the layout options, select **Generate Word document**, review its notices, then select **Download Word document**. The exporter flushes pending browser edits before taking the selected document's text and local-asset snapshot. Changing an option discards the prior generated file; generate again to apply the new settings. A fresh copy also includes later edits.

Export runs in an isolated browser worker using pinned `docx` 9.11.0 and the existing sanitized Markdown pipeline. It requires no document upload, application server, account, external font or remote conversion service. Its worker and dialog are self-hosted and included in the application offline cache. Cancel or close the dialog to terminate pending work. The original Markdown, reading notes and disk files are not changed by export.

## Content and layout

The DOCX contains editable Word paragraphs, headings, bold/italic/strikethrough text, lists, tables, code and supported local images. The first source H1 uses Word's Title style; remaining headings use the matching heading level. Headings and sanitized anchors have generated Word bookmarks; same-document links and optional linked contents target those bookmarks. External HTTP/HTTPS/mailto/tel links remain hyperlinks. Workspace/wiki/document attachment links remain readable text references rather than links to unavailable local files.

Options include A4 or US Letter paper, local-image embedding, linked contents after the first title and page-number footers. Contents is a static linked heading list, not a Word field with page numbers. It needs a source H1 and at least one additional heading; an unavailable contents section is reported. Body type is Arial, code uses Courier New, and page margins are 0.75 inches. Font appearance depends on the viewer's installed fonts. Page numbers use Word fields; the app does not invent a page count.

Ordered lists preserve their configured starting number in the generated DOCX. Nested lists use separate numbering definitions and indentation. Task items use editable `[x]` / `[ ]` text rather than interactive form controls. Quotes use indentation and light shading. Collapsed callout/disclosure contents are included. Code keeps line breaks and tabs as Word elements. Math and Mermaid retain readable source; they are not converted into native equations or diagram graphics. Footnotes remain linked/listed document content rather than native Word footnote objects.

Tables use native editable cells, fixed printable widths and shaded header cells. Column spans are retained within the column limit. Row spans are flattened and reported. Complex tables, wide content and deeply nested layouts need review in the intended Word viewer. This is a semantic document conversion, not a reproduction of the reader's dark interface or a claim of identical pagination across Word, LibreOffice and other consumers.

## Images and privacy

Available local PNG/JPEG/GIF images can be embedded with their exact original bytes, signature-derived dimensions, preserved aspect ratio and alt text. Images scale to the printable width and a bounded height. The app does not fetch remote images. Unsupported/unavailable/oversized images and audio/video become labeled text references with notices. SVG/WebP/AVIF conversion, embedded PDFs, original-source attachments and interactive media are not bundled into the Word file. Turning off image embedding produces text references for all images.

The file includes ordinary document text, embedded image bytes (including any original image metadata) and the public document title. It excludes raw frontmatter fields, personal notes/highlights/bookmarks, snapshots, trash, file handles, browser preferences and source Markdown. A secret written in ordinary document text remains ordinary exported content. Author and last-modified-by fields are blank. Unsupported Word XML characters are replaced and reported. Source Markdown remains unchanged.

Reimport the resulting DOCX through the existing conversion preview if needed. Word's Title style maps to an H1 during import. Reimport is a separate semantic conversion; it does not restore the exact original Markdown syntax, list starts, code styling or browser-private reading data. Use Markdown or a workspace ZIP for source backups.

## Bounds and verification

Limits are 30 MiB of source text, 100 MiB of provided local assets, 200,000 sanitized nodes, 1,000 image occurrences, 10 MiB per embedded image, dimensions at most 16,384 per side / 40 million pixels, 2,000 rows and 20 columns per table, and 50 MiB of final DOCX. Exceeding structural/source/output limits fails the whole export. Unsupported images remain text references with notices. The worker has a 10-second startup and 120-second processing budget. These limits are not an OS memory sandbox or a performance guarantee for every document.

The dialog displays actual image/table counts, file size, total notices and the first 200 notices (bounded to 1,000 characters each). There is no fabricated layout/page metric. Tests inspect real OOXML structure and embedded bytes, independently read content with Mammoth, round-trip browser-produced DOCX through the import preview, verify current edits/options, exercise cancellation/retry and offline/mobile behavior, and preserve existing reader/export flows. A real browser-produced multi-page fixture is rendered with the bundled LibreOffice renderer and every page is inspected. Microsoft Word, Google Docs and Safari/Firefox have not been certified by this test suite.

Library API: [docx browser packing](https://docx.js.org/api/classes/index.Packer.html), [image runs](https://docx.js.org/api/classes/index.ImageRun.html). Implementation follows the pinned package's actual public types.
