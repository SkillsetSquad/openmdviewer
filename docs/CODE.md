# Code reading tools

Fenced and indented code blocks have local reading controls. Inline code remains inline. Code is never executed. Snippet operations use the parsed code body without its enclosing fence; document downloads retain the original Markdown source.

````text
```ts title="src/main.ts" {2,4-6} startLine=10 lineNumbers=true
// snippet text
```
````

Use the language after the opening fence for syntax colors. Use `auto` with a known filename extension to select a grammar from the filename, such as `auto title="src/main.py"`. This is filename-based selection, not content-based language guessing. The web grammar registry is supplemented with explicitly loaded Diff/Patch, Rust, Go, Ruby, C#, PowerShell, Dockerfile, TOML, and INI grammars. Unknown languages and filename extensions remain readable plain text.

Supported metadata:

- `title="path/name.ext"` or `filename='path/name.ext'` displays a filename and supplies the snippet's download name. Downloads use a safe basename, never the source path as a filesystem write target.
- `{2,4-6}` emphasizes the second and fourth through sixth snippet lines. Positions count from the first line of the snippet, independent of displayed numbering.
- `startLine=10` starts displayed line labels at ten.
- `lineNumbers=false` initially hides the line labels. The toolbar can toggle them.

Metadata is bounded and parsed as data. It cannot enable event handlers, URLs, dynamic imports, or arbitrary transformations. Code token text and labels are rendered through React escaping. Only the explicitly installed language grammars and themes can load.

## Reading controls

The toolbar expands/collapses the block, toggles wrapping and line labels, opens literal text search, copies or downloads the original snippet, and opens a scratch editor. Reader controls remain stable when sidebars or workspace state change. Horizontal scrolling remains available when wrapping is off. Light, dark, and system themes select the matching syntax colors.

Search matches literal text, including punctuation. It offers case matching, previous/next, Enter/Shift+Enter navigation, and a highlighted current line. Queries are limited to 256 characters. The first 10,000 matches are available; a `+` in the result count identifies additional matches. Find searches the whole snippet and navigates to the relevant line page.

`diff`, `patch`, and `diff-<language>` fences distinguish added (`+`) and removed (`-`) lines. Patch headers and hunk markers have separate styling. The source prefixes remain visible and are included in copy/download. For example, `diff-ts` colors its content using the TypeScript grammar while retaining diff line cues.

Snippets exceeding 400 lines use pages of 200 lines to bound the rendered view. Copy/download retain the complete original snippet on every page. Print temporarily expands collapsed snippets and restores all original lines, then returns to the previous reading state. Current search paint and reader controls are excluded from print.

Syntax coloring is lazy. Snippets larger than 200,000 characters or 3,000 lines use an explicit plain-text fallback, with paging/search/copy/download and scratch editing still available. These limits reduce syntax-token work; they are not a measured performance guarantee for arbitrary documents or hardware.

## Scratch editor

The editor opens a temporary CodeMirror copy with undo/redo, folding, line numbers, and search shortcuts. Language support loads only when needed. It can copy or download edited text, or reset to the original snippet. It never executes code or changes the containing Markdown document. Scratch changes are discarded when the dialog closes; copy or download before closing to keep them.

The application precaches lazy modules and grammar assets for offline use after installation. Extra editor grammars increase that application cache; document text is not sent to grammar providers or external services. Clipboard refusal and unavailable syntax colors produce explicit fallbacks.

Automated Chromium coverage checks filename metadata and line labels, emphasis, source-preserving downloads, literal search, diff cues, inert input, scratch-only editing, actual clipboard content, offline lazy loading, long-snippet paging/printing, mobile overflow, and serious/critical accessibility findings. Other browsers and assistive technologies still require certification.
