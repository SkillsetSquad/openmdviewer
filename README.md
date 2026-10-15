# OpenMDViewer

**Your words. Your space.** A free, open-source Markdown reader and local knowledge workspace by SkillsetSquad. A compact, three-pane interface with a file tree, a focused reading surface, and contextual document navigation.

[Live reader](https://skillsetsquad.github.io/openmdviewer/) · [Deployment guide](docs/DEPLOYMENT.md) · [Product roadmap](docs/PRODUCT_BRIEF.md) · [Markdown support](docs/MARKDOWN.md) · [Callouts](docs/CALLOUTS.md) · [Health checks](docs/HEALTH.md) · [Workspace graph](docs/GRAPH.md) · [Keyboard commands](docs/COMMANDS.md) · [Local search](docs/SEARCH.md) · [Connected files](docs/LOCAL_FILES.md) · [Tables](docs/TABLES.md) · [Images](docs/IMAGES.md) · [Audio/video](docs/MEDIA.md) · [Notes/bookmarks](docs/ANNOTATIONS.md) · [Code tools](docs/CODE.md) · [Equations](docs/MATH.md) · [Diagrams](docs/DIAGRAMS.md) · [Contributor instructions](AGENTS.md)

## Run locally

Requires Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For a static production build:

```sh
npm run build
npm start
```

The `out/` directory is the entire application. No application server, accounts, credentials, API, or external database is needed. `npm start` is a convenience static server for local preview.

## Available now

- Responsive dark reader inspired by the supplied design: collapsible file tree, breadcrumbs, document tabs, reading toolbar, contents, properties, tags, actions, backlinks, and an interactive workspace graph with search, tag/connection filters, neighborhood exploration, zoom/pan, and an accessible document list.
- CommonMark/GFM, standard/custom callouts with formatted titles and accessible folding, semantic definition lists, GitHub emoji shortcodes with literal escape handling, YAML/TOML/JSON frontmatter, wiki/reference links, safe heading and footnote navigation, sortable tables with whole-table and column filters, cell/row copying, CSV/JSON export, resizing, pagination, numeric summaries, and full-viewport viewing, task lists, footnotes, sanitized HTML, accessible KaTeX equations with source inspection/copying and explicit tags, lazy Shiki highlighting with filename labels, line emphasis, wrapping, code search, diff cues, copy/download, line paging, folding, and a scratch editor, strict Mermaid diagrams with pan/zoom, an expanded viewport, theme adaptation, source copying, and sanitized SVG/PNG exports.
- Personal notes, prose highlights, and heading bookmarks with workspace-wide search, conservative passage relocation, JSON export, and ZIP backup/restore. Reading data is stored separately from Markdown source.
- Native local audio/video playback with speed, WebVTT captions, measured duration/dimensions, original downloads, browser-supported fullscreen/picture-in-picture, and separate remote-media/poster/caption consent.
- Full-viewport image gallery with zoom/pan, keyboard navigation, local dimensions/type/byte size, original downloads, PNG clipboard copying, and individual remote-image consent.
- HTML/DOCX conversion with a cancellable local worker, explicit Markdown preview/import, extracted images, retained originals, and ZIP backup support. See [document conversion](docs/CONVERSION.md).
- Local Markdown/text/MDX and media imports, folder selection, ZIP imports with size limits, duplicate-path protection, drag and drop, document creation and path renaming.
- Optional native local-file connections with explicit Save / Save As, checksum-checked replacement reviews, reload from disk, persisted browser handles, and portable import/download fallbacks. Browser autosave remains independent. See [support and verification limits](docs/LOCAL_FILES.md).
- Named, isolated local workspaces with icons and descriptions; IndexedDB document persistence; local reading preferences; scroll restoration; favorites; tags; source/split editing with CodeMirror and debounced browser autosave, the previous 50 content revisions, restore/compare, recoverable trash, duplication, and stale-tab conflict detection.
- Incremental worker-based fuzzy/literal search, cancellable/time-limited native regex search, phrases, case/whole-word controls, highlighted excerpts, section/source-line navigation, exact result counts, pagination, workspace-local recent queries with matching options, metadata-based filter suggestions, and `tag:`, `path:`, `heading:`, `status:`, and `type:` filters, in-document find, a fuzzy command palette with keyboard navigation and commands-only search, focus and presentation reading, six theme choices, font and layout settings.
- Markdown, sanitized standalone HTML with passive media references, ZIP workspace export with media, folders, tags, favorites, and document dates; browser print / Save as PDF; worker-based document/workspace health reports with transparent rule scores, declared review-date checks, broken-link and image diagnostics, duplicate-body detection, JSON export, and source-line navigation.
- Static PWA with all application modules precached for offline use, bundled fonts/images, CSP, no telemetry or document uploads.

Browser autosave saves to **this browser**, not back to the original file. Explicit local-file saves are available separately where the browser supports native file pickers. Download Markdown or export a ZIP to keep an external copy. Browser storage can be evicted or cleared. ZIP exports contain current documents, media, and metadata; recovery snapshots and trash remain browser-local. When two tabs edit the same document, saving the stale tab opens a conflict dialog with a keep-both option. Conflicts are reviewed one document at a time; unresolved conflicts and failed writes continue to block workspace switching and application updates until recovered. The sample workspace is clearly example documentation; displayed counts are calculated from the actual documents.

Remote Markdown images, audio, video, posters, and captions are blocked until individually allowed. Arbitrary MDX/JavaScript, iframes, and active HTML are never executed. Files are processed locally. Remote links opened by the user leave the app.

## Roadmap and current boundaries

The full supplied [product specification](docs/PRODUCT_BRIEF.md) is retained as a phased roadmap, not a claim that every proposed feature exists. OPFS workspace storage, physical directory create/rename/move/delete operations, PDF/text extraction and richer format import/export, repository browsing, browser AI, encryption, lifecycle workflows, and workspace publishing remain future work. No placeholder buttons advertise these features.

Core browser flows have automated Chromium coverage. Firefox, Safari, large-workspace benchmarks, and complete WCAG 2.2 AA conformance have not yet been certified. Folder selection depends on browser support; individual files and ZIP provide portable alternatives. Imported images and media are stored with their relative paths in IndexedDB and included in workspace ZIP exports. Image rendering is local; arbitrary active media is never executed.

## Development checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests cover path safety, heading anchors, link analysis, untrusted input, imports/exports, editing persistence, themes, navigation, math, diagrams, mobile overflow, serious/critical axe findings, and offline startup with lazy modules. CI runs these checks before publishing the static Pages artifact.

See [AGENTS.md](AGENTS.md) before making changes. Commit every completed logical change. [MIT licensed](LICENSE); [asset credits](docs/ASSETS.md).

Connected folders can be opened as separate workspaces with retained native handles, relative local media, explicit change scans, and safe additions. Existing changed/missing contents are preserved for review. See [local folder connections](docs/LOCAL_FOLDERS.md) for usage, limits, verification boundaries, and remaining directory operations.
