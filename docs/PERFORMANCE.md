# Markdown metadata cache and measured limits

The reader derives document titles, statistics, headings, links, image references and navigation data from the shared Markdown model. Reusing that model avoids parsing the same source separately for those consumers.

The LRU cache retains at most 24 models and 4,194,304 source characters in total. Any document whose source fits the total character budget is eligible. An earlier independent 1,048,576-character entry cutoff left slightly larger manuals uncached even when the total budget had room, causing repeated full parses. Both total limits are unchanged; the smaller eligibility cutoff has been removed. Models larger than the total budget remain uncached.

The budget counts JavaScript source characters, not UTF-8 bytes or measured heap allocation. A model contains additional arrays and metadata. This is a bounded cache policy, not a promise of a fixed total application memory footprint.

## Verification

```sh
npx vitest run tests/markdown-model-cache.test.ts
```

The regression tests verify that a document above one MiB is reused and that large entries are evicted when their combined source lengths exceed the total budget. Markdown rendering and security fixtures remain separate checks; cached model reuse must preserve headings, source positions, links and sanitization behavior.

A local Chromium comparison used the same generated 1,049,432-byte technical manual in Node 24 production builds: 2,502 headings, 100 code blocks, 50 tables and 125 local image references. Three runs per build retained all 2,502 rendered headings and 18,994 DOM elements. Median import-to-rendered-DOM time changed from 2,546 ms to 1,352 ms; median maximum long-task duration changed from 2,202 ms to 1,002 ms. A separate generated 1,200-document ZIP import and unique-result worker search also completed in each run. These measurements describe that local fixture and machine; they are not cross-device performance guarantees or target-host certification.

The reader still performs model parsing and rendered Markdown work synchronously. The remaining approximately one-second long task in this fixture is a known responsiveness gap. Worker/progressive rendering work and broader document-size/hardware measurements remain necessary. This cache change does not constitute completion of the product brief's full performance requirements.
