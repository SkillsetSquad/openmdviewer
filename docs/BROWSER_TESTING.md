# Browser compatibility verification

The Pages deployment workflow runs the full feature suite in Playwright Chromium against root and `/openmdviewer` static builds. This is the release gate. A separate **Cross-browser reader compatibility** workflow runs the existing `tests/e2e/reader.spec.ts` and `tests/e2e/preferences.spec.ts` contracts in Linux Firefox and WebKit, again at both paths. It is explicitly dispatched while this additional coverage is being established; it does not publish or change a deployment.

The compatibility suite reuses the actual reader tests rather than replacing them with a shallower smoke test. It covers layout, custom/paper themes, independent reading fonts and spacing, palette validation, neutral printing, mobile navigation, untrusted Markdown, editing/persistence/downloads, math/diagrams, accessibility checks, offline startup, tables, local assets, worker search, workspace isolation, snapshots/trash, cross-tab conflicts, migration, safe application updates, frontmatter/wiki/footnote navigation, health reports and the workspace graph including a thousand-document fixture. Fixture counts and measured outcomes are test observations, not universal performance guarantees.

## Run locally

Install the browser engines matching the locked Playwright version, then build and test:

```sh
npx playwright install firefox webkit
npm run build
npm run test:compat
NEXT_PUBLIC_BASE_PATH=/openmdviewer npm run build
npm run test:subpath -- --config=playwright.compat.config.ts
```

Select one engine with `--project=firefox` or `--project=webkit`. Tests run serially because the existing update test temporarily changes its isolated static server's service worker. The subpath helper copies the export into a temporary directory and removes it when the run ends. Do not run other tests or rebuild the same output directory concurrently.

In GitHub Actions, dispatch `.github/workflows/compatibility.yml` on the desired commit/ref. Its independent browser jobs install system dependencies, build the static app and test both hosting paths. Failure traces are retained for seven days. Read each job's actual result; a successful workflow dispatch or completed build is not a passing browser test.

## Interpretation and remaining scope

Playwright Firefox and WebKit exercise those rendering engines. They do not certify every shipping Firefox/Safari version, Apple platform integration, actual Edge or iOS devices, all assistive technologies, or full WCAG 2.2 AA compliance. Native filesystem capabilities still depend on browser support; individual files, ZIP and downloads remain portable alternatives.

The complete per-feature suite remains Chromium coverage. Repository/URL fixture tests use request interception; engine-specific service-worker interception behavior must be accounted for before reusing them as broad compatibility evidence. Separate real, credential-free public repository and raw URL checks can verify actual browser CORS behavior without those fixture routes. They are network-dependent and are not part of this deterministic core reader job.

On this development Mac, bundled Playwright Firefox currently exits before page creation with `Could not find profile folder`. A different TMPDIR did not resolve the launch failure. An [upstream report](https://github.com/microsoft/playwright/issues/42768) describes the same error involving macOS protection of Firefox's app-data directory; that is relevant diagnostic context, not proof of the cause on every machine. The Linux job supplies an independent test environment. No host privacy settings or personal browser profiles need to be changed for this workflow.

## Binary asset storage

A local WebKit run reproduced a native IndexedDB error while preparing Blob/File values. A direct storage probe failed for Blob and succeeded for the same bytes as ArrayBuffer. The application now retries this specific failure after the entire import transaction rolls back, storing binary buffers and recreating Blob values at the storage API boundary. It remembers that format for the storage session, preserves MIME/path metadata, and reads existing Blob records without rewriting them. Ordinary Blob-capable browsers keep their existing representation. No database schema/index change or host privacy-setting change is required.

The fallback covers regular imports, complete repository-workspace imports and folder connections. Source tokens/path/conflict validations run again inside the retried transaction. Other errors, including quota errors, are not retried. Failed byte preparation leaves the failed transaction rolled back. ZIP exports and media readers receive the same Blob API as before.

Legacy migration has separate native-Blob and byte-record browser cases. Each attempts its declared record format. If native-Blob setup reports the exact Blob-preparation error before application migration, that case is explicitly marked unsupported with the original error in the test annotations; other setup errors fail. The byte-record migration remains required. Chromium and Firefox can still exercise the native-Blob case where their IndexedDB implementation supports it. Read the actual passed/skipped counts: an unsupported baseline is not proof of native-Blob migration in that engine.

The upgrade converts each readable legacy payload to bytes within the existing atomic database upgrade, using Dexie.waitFor while reading Blob bytes. It retains the original legacy asset records unchanged, handles both Blob and byte inputs, and reconstructs browser media only after the upgrade commits. Unit tests simulate native Blob writes being unavailable in the destination store, verify exact migrated bytes, and check that originals remain untouched.

Reader editing tests use real select-all/backspace/typing/Enter keystrokes and assert the resulting editor lines before checking preview/persistence. Firefox's synthetic contenteditable fill left these multiline editors empty in the first CI run. The assertions for rendered contents, persistence, history and recovery remain in place; no application editing behavior is bypassed or mocked.

Reader edit fixtures select the source and type the replacement with native character keys and Enter events, then assert every CodeMirror line before checking rendered content and persistence. There is no separate empty-document clear: on a slow runner, a delay between clearing and typing can exceed the real autosave debounce and open the conflict dialog for that empty intermediate edit. Firefox's automation insertText path did not keep the first line synchronized when subsequent Enter events were sent; native character keys retain the complete multi-line assertions. These fixtures exercise the editor without modifying its state directly or changing autosave/conflict behavior.
