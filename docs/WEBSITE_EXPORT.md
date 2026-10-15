# Static documentation website export

Use **Export → Documentation website** or search commands for **Export documentation website**. Choose **Generate website ZIP**, review the counts/notices, then **Download website ZIP**. Generation takes an in-memory snapshot after pending browser edits save successfully. It does not publish anything or modify the workspace. Cancel or close the dialog to stop its isolated worker. Generate a fresh snapshot to include later edits.

Extract the ZIP and serve the whole folder on any static HTTP host. Open `index.html`. The generated site has no Next.js runtime, application backend, API calls, external fonts, package installation or document uploads. All page and asset links are relative, so root and nested deployments work without a build setting. The `.nojekyll` file supports GitHub Pages. Configure ordinary HTML/CSS/JavaScript/image MIME types, `text/vtt` for captions and `application/octet-stream` for `.bin` attachments. A service worker is deliberately not installed on the destination host.

## Reading and navigation

Every current, non-trashed document gets its own HTML page. The index lists all documents with their source paths. A paginated sidebar displays 50 documents at a time; its literal search matches all entered words across titles, paths and complete readable document text. Text is not truncated to a preview. Search is case-insensitive; it does not interpret regex or the reader's advanced filter syntax. Navigation uses page links and normal browser history. Titles use frontmatter title, then the first H1, then the source filename.

Pages include heading contents, light/dark themes, responsive navigation, keyboard focus, a skip link and print styles. The theme preference is scoped to the exported site's hosting path. If storage is unavailable, switching still works for the current page. Search, paginated navigation and theme switching use JavaScript; the index, document pages, contents and document links remain usable with JavaScript disabled.

Markdown, reference and wiki links resolve using workspace rules. Cross-page headings use the actual sanitized IDs, including custom HTML heading IDs. Missing/ambiguous links lose their destination and are recorded rather than becoming misleading exported paths. Missing headings retain their destination fragment and are reported. Generated filenames are unique opaque page names; source folders and names remain visible in navigation and `export-report.json`. The export does not rename the source workspace.

CommonMark/GFM, tables, code, callouts, definition lists, emoji, footnotes and sanitized HTML use the shared Markdown pipeline. Math and Mermaid remain readable source; this export does not bundle KaTeX/Mermaid, syntax highlighting, the editor, graph or annotation tools. Those richer publishing capabilities remain future work.

## Local assets and privacy

Only referenced local assets are copied. PNG/JPEG/GIF/WebP signatures are checked before embedding raster images. Other image formats remain download links. Original SVG/HTML/PDF and other attachments use opaque `.bin` filenames with download links; source bytes remain unchanged. Local audio/video use native controls and browser codec support. UTF-8 WebVTT tracks with a valid header and no NUL bytes are included; unavailable/invalid captions are omitted and reported. Caption files must be served with the correct MIME type.

Remote images/media, posters, captions, frames and active HTML are not loaded. External ordinary links remain explicit links. The exported CSP allows only the site's own scripts, styles, images and media, disallows connections/frames/objects/forms, and prevents inline scripts. Imported strings are rendered as escaped text or sanitized Markdown; generated navigation never uses imported `innerHTML`.

This is a publishing artifact. Everyone who can access its files can read its document text and search data. Review every page and linked attachment before sharing. Source paths, workspace title and description are included. Frontmatter is used for document titles but its raw metadata is not included. A secret written in ordinary Markdown remains ordinary published content. Personal notes/highlights/bookmarks, snapshots, trash, file handles, browser preferences and source Markdown files are excluded. This artifact is not a restorable workspace backup; use the existing workspace ZIP for that.

## Limits and verification

The exporter supports up to 10,000 documents, 30 MiB per document, 100 MiB total source documents/assets and 100 MiB expanded generated output. Exceeding a limit fails the whole export instead of silently omitting documents. The worker has a 10-second startup budget and 120-second processing budget. Cancellation terminates the worker. These are bounds, not a universal performance guarantee or operating-system memory sandbox.

`export-report.json` lists all generated document pages and copied asset mappings, the actual notice count and the first 500 notices (each bounded to 1,000 characters). The dialog shows the first 50 retained notices. README.txt in the ZIP explains hosting, privacy and rendering limits. The included OpenMDViewer MIT license covers generated template code, not the exported documents. ZIP compression uses a fixed timestamp for reproducibility.

Automated checks exercise generation in the real browser worker, ZIP bytes, cross-page and custom-heading links, wiki links, source/download integrity, full-text matches late in long documents, pagination beyond 100 documents, JavaScript-disabled navigation, root/nested static hosting, mobile accessibility/overflow, offline generation after an app restart, worker cancellation/retry and existing standalone HTML exports. Chromium is covered; broader browser certification and large-workspace benchmarks remain outstanding.
