# Offline application cache

The generated service worker caches the fixed application resources from the static export: scripts, styles, fonts, images, parser resources and workers. Imported documents, reading data, native handles and fetched URL/repository responses remain outside this cache. Their browser-storage and export behavior is unchanged.

## Installation and updates

An install downloads at most eight resources concurrently. Each resource has up to three attempts for HTTP 408/429/5xx, network failures or aborted request timeouts. Retries wait 500 ms and then 1,000 ms. Permanent HTTP failures, off-origin responses and Cache Storage/quota errors fail that install instead of being repeatedly retried.

The 15-second request timeout includes response-body download. A two-minute budget aborts outstanding network work. Cache Storage itself remains subject to the browser's storage implementation and quotas. A slow or unavailable host can therefore leave offline preparation unsuccessful; this is not a universal completion-time guarantee.

Every listed resource must succeed before installation completes. A failed install removes its candidate cache and does not replace the active worker or delete the previous cache. The reader reports the failed preparation and keeps export available. Reload online after correcting the host/network problem to retry.

Cache identity includes the generated worker logic, URL scope and exported asset bytes. A worker-only behavior change gets a different cache identity even if application assets are identical. This prevents failed-install cleanup from deleting the active version's cache. The build also encodes static file paths as URL pathnames, retaining valid punctuation and escaping spaces, fragments, query delimiters and literal percent signs.

Successful updates preserve the existing explicit apply flow: pending browser/file operations must finish before an update is activated and the reader reloads. Old application caches are pruned only after successful activation, and only within this deployment's cache prefix. Workspace IndexedDB data is not cleared. Static responses are trusted from the serving origin; the build fingerprint is a version identifier, not per-response browser hash verification.

## Verification

```sh
npm run build
npx playwright test --config=playwright.offline-cache.config.ts --project=cache-chromium
NEXT_PUBLIC_BASE_PATH=/openmdviewer npm run build
npm run test:subpath -- --config=playwright.offline-cache.config.ts --project=cache-chromium
```

Use `cache-webkit` or `cache-firefox` with the matching Playwright engine installed. The dedicated tests use a loopback-only static fault host on port 3116; it is test tooling and is not exported or part of the deployed application. Run them serially against their isolated output. The regular reader suite still checks ordinary offline startup and safe updates; its config excludes only the dedicated fault-host file.

The fault host returns one real HTTP 503 for a known application asset and then serves it normally. The test verifies retry, a completed cache, offline startup and a cached lazy dialog. A separate update returns a permanent 404; the test verifies one failed request, a failure notice, retention of the previous active cache, and the imported document after offline reload. Unit contracts exercise concurrency, retries, request/body and overall network budgets, permanent/quota failures, fixed GET allowlists, unrelated-cache preservation and the actual build's worker-only version changes. CI is configured to run the fault contracts at both hosting paths in Chromium and in the independent Firefox/WebKit jobs.

The lifecycle relies on the browser's [install waitUntil contract](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil). The installer checks HTTP success before [Cache.put](https://developer.mozilla.org/en-US/docs/Web/API/Cache/put), since that API can also store unsuccessful responses.
