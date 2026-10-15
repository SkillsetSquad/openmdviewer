# Callouts and disclosures

Callouts begin with an explicit marker on the first line of a blockquote:

```markdown
> [!NOTE]
> A regular note with **formatted text**.

> [!WARNING] Before you continue
> Review this operation carefully.
```

Standard types are `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`, `INFO`, `SUCCESS`, and `ERROR`, matched without case sensitivity. A custom type starts with an ASCII letter and contains up to 40 letters, digits, underscores, or hyphens:

```markdown
> [!release-plan] Launch checklist :rocket:
> - Verify the build
> - Keep an external backup
```

Without a title, the marker supplies the label. An optional title occupies the rest of the marker line and can contain inline Markdown, links, and emoji. Inline markup spanning multiple lines is left as an ordinary quotation rather than guessing the title boundary. Escaped or entity-encoded markers remain quotations; fenced examples remain code.

## Folding

Add `+` immediately after the closing bracket to start expanded, or `-` to start collapsed:

```markdown
> [!TIP]- Optional details
> The content is available when opened.
>
> > [!WARNING]+ Nested warning
> > Nested content.
```

The reader uses native `details` and `summary` elements. Focus the summary and press Enter or Space to toggle it. Folding changes only the current reading view; it never edits Markdown and resets to the source's declared state after reopening/reloading a document. Theme or preference changes preserve the current view state.

Callout titles and bodies participate in local search, statistics, links, and annotations. Open a callout before selecting a passage within it; selections spanning hidden content are not captured as one continuous quote. Heading navigation, document links, in-document find, and saved reading locations reveal any enclosing disclosures before scrolling. Browser printing expands closed callouts for the print operation and then restores their prior states.

Standalone HTML export flattens callouts into labeled blockquotes so every body is readable and printable without JavaScript. Markdown and workspace ZIP exports preserve the exact source, including fold markers.

Custom types use the reader's neutral callout style. Imported content cannot supply scripts or custom executable behavior through a type or title. Remote media inside callouts follows the same individual-consent rules as the rest of a document.
