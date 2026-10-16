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

## Conditional HTML normalization

Plain Markdown already has a structured HTML tree after remark-rehype. The shared reader, metadata and HTML-export pipelines skip an extra HTML parser round trip when that tree has neither raw source nodes nor generated footnote data attributes. Raw nodes are detected at every depth. Raw HTML and generated footnotes retain the original normalization path, and every tree still passes through the sanitizer. Existing Markdown rendering, math, source locations and media-consent controls remain in place.

Raw HTML fixtures retain identical sanitized output. Plain Markdown comparisons preserve semantic tags, attributes and text; table-container/root whitespace serialization can differ. The reader's JSX/table renderers already ignore that structural whitespace. Generated footnote attributes keep their exact existing normalization, and source-position tests cover the direct structured-tree path.

Three further local runs of the same generated manual with both changes retained all headings and DOM elements. Median import-to-rendered-DOM time was 1,173 ms and median maximum long-task duration was 817 ms. This is an incremental improvement over the cache-only measurements above, with the same local-fixture limitations.

The reader still performs model parsing and rendered Markdown work synchronously. The remaining approximately 0.8-second long task in this fixture is a known responsiveness gap. Worker/progressive rendering work and broader document-size/hardware measurements remain necessary. These changes do not constitute completion of the product brief's full performance requirements.
