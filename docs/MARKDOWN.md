# Markdown and metadata

The reader, outline, statistics, local search, and link navigation share a parsed Markdown model. Processing happens on the device. Metadata parsing does not rewrite stored Markdown.

## Frontmatter

YAML uses `---` delimiters:

```markdown
---
title: Operations manual
owner: Morgan
status: approved
tags: [operations, guide]
last_reviewed: 2026-10-15
next_review: 2027-01-15
---
# Getting started
```

TOML uses `+++` delimiters. JSON uses an opening `---json` and closing `---`, or `;;;` for both delimiters. The metadata must be a key/value object. Nested custom fields are available to local search; executable YAML tags are not supported. Parsing has a 128 KB header limit, bounded alias expansion, and nesting/value limits. Invalid metadata produces a visible error and remains intact in source view.

A frontmatter title is used in document search results. Frontmatter tags and categories appear with browser-local tags. The Edit tags dialog edits only browser-local tags; use source view to change frontmatter. Search supports combinations such as `status:approved tag:operations owner-name type:markdown`.

Reading statistics exclude the frontmatter header. Reading time uses a 220-word-per-minute estimate. Tasks and code blocks are counted from the parsed structure, so fenced examples do not become live tasks or headings.

## Links and headings

Relative links, root-relative workspace paths, reference-style Markdown links, and wiki links use the same document resolver. Examples:

```markdown
[Installation](../Getting%20Started/Installation.md#static-hosting)
[Reference][install]

[install]: /Docs/Getting%20Started/Installation.md

[[Installation#static-hosting|Install locally]]
```

Wiki names first resolve relative to the current folder, then by a unique workspace path or file name. Ambiguous names produce a message; the reader does not choose an arbitrary document. Use a folder-qualified path to disambiguate. Links only resolve within the selected workspace.

Headings support inline formatting, Setext syntax, Unicode, and duplicate-heading suffixes. Generated and imported HTML IDs keep a `user-content-` prefix to avoid DOM clobbering. Navigation accepts ordinary source anchors such as `#static-hosting`; the reader resolves the corresponding safe DOM ID. Sanitized HTML anchors and footnotes have their fragment links repaired rather than disabling the sanitizer's protection.

GitHub callouts are recognized only from their explicit `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`, `[!INFO]`, `[!SUCCESS]`, or `[!ERROR]` marker. Ordinary blockquotes are left as quotations.

## Code reading tools

See [code tools](CODE.md) for safe fence metadata, filename-based grammar selection, code search, line emphasis, wrapping, diff cues, paging, and a scratch editor. These controls preserve the original Markdown source.
