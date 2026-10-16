# OpenMDViewer contributor instructions

## Working agreement

- Commit every completed logical change with a descriptive commit message. Run relevant checks before committing. Do not amend or overwrite unrelated work.
- Inspect git status and diff before edits. Keep the working tree clean at delivery.
- Use the supplied product brief in `docs/PRODUCT_BRIEF.md` as the roadmap; document implemented features and gaps honestly.

## Architecture

- Next.js App Router, strict TypeScript, Tailwind, shadcn/ui, Lucide. Static export only.
- No API routes, Server Actions, application server, accounts, database server, telemetry, or document uploads.
- Read/process/store documents in the browser. IndexedDB for document data; localStorage only for small preferences.
- Imported Markdown/MDX is untrusted. Sanitize HTML, disallow executable MDX, keep remote media blocked until explicit consent, and use Mermaid strict security.
- URL imports must be explicit, credential-free HTTPS reads with CORS, rejected redirects, bounded UTF-8 bodies and cancellation. Require review before local import; preserve source text and existing paths, keep entered URLs out of persistence, and never recursively fetch links/media.
- Repository adapters must be explicitly invoked and read-only. Pin refs to immutable commits/trees, verify Git blob bytes, reject truncated/unsafe paths and symlinks, bound/cancel reads, and keep tokens in memory on fixed-origin requests only. Import complete selections in one local transaction; retain validated provenance without credentials or automatic remote writes.
- Git file comparisons must retain both immutable commit IDs, read the same path through the verified adapter, escape diff text, bound computation/rendering, and leave local/import/remote state unchanged. Never infer renames or silently truncate a comparison.
- DOCX exports must use the sanitized Markdown pipeline and an isolated, bounded, cancellable worker. Preserve editable structure and source documents, embed only supported local raster bytes, keep remote media passive, exclude browser-private data, and show actual counts/notices before download. Inspect real generated packages and render representative output before delivery.
- Website exports must be generated in a bounded, cancellable browser worker. Sanitize document HTML, rewrite workspace links to actual generated pages/anchors, include only referenced local assets, keep remote media inert, exclude browser-private reading data and handles, and provide a review report before download. Generated sites must work on static root/subpath hosts without the reader runtime.
- PDF import must use bounded, cancellable text-layer extraction with explicit no-text notices. Keep passwords ephemeral, source PDFs unchanged and binary, and all parser/font/CMap assets self-hosted. Preserve Markdown-bundle PDF attachments; never imply OCR or source page-layout reconstruction.
- Convert HTML/DOCX in a cancellable isolated worker; never insert source HTML into a browser document. Measure actual expanded DOCX parts before parsing, block external file access, sanitize derived HTML, and preserve originals separately from Markdown. Require preview approval before atomic browser import.
- Keep HTML reparsing conditional on raw source nodes or generated footnote attributes that require normalization. Always sanitize every tree, and verify reader/source navigation and export semantics when changing this path.
- Keep Markdown metadata caching bounded by entry count and total source characters. Cache documents that fit that total budget; avoid smaller eligibility cutoffs that force repeated full parses. Report measured fixture results and remaining long tasks honestly.
- Keep collections workspace-scoped and separate from source documents. Fence edits/deletes with collection revisions, validate member ownership, preserve stable IDs through rename/trash, and import definitions/documents/assets atomically. ZIP membership uses paths mapped to fresh IDs; preserve existing collection names and never include unrelated workspace criteria.
- Record actual reading openings separately from document edit times and revisions. Keep activity browser-local and out of portable workspace metadata. Use the existing search/analysis workers for collection criteria, paginate complete results, and retain drafts after revision conflicts.
- Keep reading preferences bounded and allowlisted; custom palettes must contain only six-digit colors with validated text/link contrast. Keep font sources local, derive matching code/editor modes, and preserve neutral print output despite inline palette variables.
- Keep expensive optional rendering lazy. Preserve local files; browser autosave must never imply disk writes.
- Native file picker and permission calls must start in their click handler before asynchronous preparation. Keep explicit disk writes in `src/lib/local-files.ts`, separate from browser autosave.
- Keep directory scans read-only, explicit, bounded and cancellable. Preserve relative paths; atomically add new paths with connection-token checks. Changed and missing entries must retain cached browser versions until explicit file review. Keep directory handles out of portable exports.
- Coordinate connected-file operations across tabs, recheck disk bytes and browser revisions before committing, and verify the closed file before advancing connection baselines. External changes require review; file handles must stay out of portable exports.
- Version offline caches from worker logic as well as static assets. Bound installation concurrency/retries and network time, require every listed resource before activation, and retain the active version on failure. Isolate cache namespaces across deployment paths; prune only exact own legacy build versions during migration. Never retry quota/permanent HTTP errors or cache documents, unknown URLs or external responses. Keep test-only fault hosts outside the export and run their dedicated root/subpath contracts.
- Support root and subpath deployments. All assets must be self-hosted and offline-capable.

## Quality

- Match the reference: dark three-pane reader, blue accents, file tree, document toolbar, typography, contents/properties panel. Support small screens, keyboard navigation, reduced motion, and print.
- Every visible control must work. No fabricated statistics or placeholder features.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` for relevant changes; exercise core flows with Playwright.
- Preserve legacy Blob assets. Retry only the exact native Blob-preparation failure after transaction rollback, serialize fallback bytes outside the transaction, reconstruct Blobs at the storage boundary, and repeat all source/token/path checks on retry. Do not retry quota or unrelated persistence failures. During legacy upgrades, use Dexie.waitFor while preparing one readable asset at a time and preserve the original legacy records.
- Keep cross-browser verification independent of host browser profiles and privacy settings. Reuse real reader contracts, run serially against isolated static output, retain failure evidence, and distinguish Playwright engine coverage from shipping-browser certification.
- Verify Docker runtime changes against isolated, uniquely named root/subpath test containers on loopback. Check real HTTP headers/status, the actual health command and Node-free runtime; remove only verifier-owned resources, never prune or alter unrelated containers.
- Keep deployment reproducible with npm lockfile, static Pages workflow, and a Node-free runtime Docker image.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
