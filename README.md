# OpenMDViewer

**Your words. Your space.** A free, open-source Markdown reader and local knowledge workspace by SkillsetSquad. A compact, three-pane interface with a file tree, a focused reading surface, and contextual document navigation.

[Live reader](https://skillsetsquad.github.io/openmdviewer/) · [Deployment guide](docs/DEPLOYMENT.md) · [Product roadmap](docs/PRODUCT_BRIEF.md) · [Contributor instructions](AGENTS.md)

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

- Responsive dark reader inspired by the supplied design: collapsible file tree, breadcrumbs, document tabs, reading toolbar, contents, properties, tags, actions, backlinks, and a local connection graph.
- CommonMark/GFM, sortable/filterable tables with CSV copy/export, task lists, footnotes, sanitized HTML, KaTeX, lazy Shiki highlighting with line numbers/copy/download/folding, strict Mermaid diagrams with zoom/source/SVG export.
- Local Markdown/text/MDX and media imports, folder selection, ZIP imports with size limits, duplicate-path protection, drag and drop, document creation and path renaming.
- IndexedDB document persistence; local reading preferences; scroll restoration; favorites; tags; source/split editing with CodeMirror and debounced browser autosave.
- Incremental worker-based fuzzy search with phrases and `tag:`, `path:`, `heading:` filters, in-document find, keyboard commands, focus and presentation reading, six theme choices, font and layout settings.
- Markdown, sanitized HTML, ZIP workspace export; browser print / Save as PDF; basic deterministic heading/link/alt-text analysis.
- Static PWA with all application modules precached for offline use, bundled fonts/images, CSP, no telemetry or document uploads.

Browser autosave saves to **this browser**, not back to the original file. Download Markdown or export a ZIP to keep an external copy. Browser storage can be evicted or cleared. The sample workspace is clearly example documentation; displayed counts are calculated from the actual documents.

Remote Markdown images are blocked until individually allowed. Arbitrary MDX/JavaScript, iframes, and active HTML are never executed. Files are processed locally. Remote links opened by the user leave the app.

## Roadmap and current boundaries

The full supplied [product specification](docs/PRODUCT_BRIEF.md) is retained as a phased roadmap, not a claim that every proposed feature exists. Multiple named workspaces, OPFS/direct filesystem writing, version snapshots/comparison, richer format conversion, repository browsing, browser AI, encryption, annotations, lifecycle workflows, and workspace publishing remain future work. No placeholder buttons advertise these features.

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
