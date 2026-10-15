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
- Convert HTML/DOCX in a cancellable isolated worker; never insert source HTML into a browser document. Measure actual expanded DOCX parts before parsing, block external file access, sanitize derived HTML, and preserve originals separately from Markdown. Require preview approval before atomic browser import.
- Keep expensive optional rendering lazy. Preserve local files; browser autosave must never imply disk writes.
- Native file picker and permission calls must start in their click handler before asynchronous preparation. Keep explicit disk writes in `src/lib/local-files.ts`, separate from browser autosave.
- Keep directory scans read-only, explicit, bounded and cancellable. Preserve relative paths; atomically add new paths with connection-token checks. Changed and missing entries must retain cached browser versions until explicit file review. Keep directory handles out of portable exports.
- Coordinate connected-file operations across tabs, recheck disk bytes and browser revisions before committing, and verify the closed file before advancing connection baselines. External changes require review; file handles must stay out of portable exports.
- Support root and subpath deployments. All assets must be self-hosted and offline-capable.

## Quality

- Match the reference: dark three-pane reader, blue accents, file tree, document toolbar, typography, contents/properties panel. Support small screens, keyboard navigation, reduced motion, and print.
- Every visible control must work. No fabricated statistics or placeholder features.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` for relevant changes; exercise core flows with Playwright.
- Keep deployment reproducible with npm lockfile, static Pages workflow, and a Node-free runtime Docker image.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
