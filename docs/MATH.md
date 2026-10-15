# Equations

The reader supports inline and display LaTeX through KaTeX. Processing and fonts remain on the device and work offline after the application is cached.

````markdown
Inline $x^2 + y^2$ stays in the paragraph.

$$
\frac{1}{2} \tag{A}
$$

```math
E = mc^2
```
````

Valid equations retain KaTeX's MathML representation for assistive technology; the duplicate visual layout is hidden from screen readers. Display equations scroll horizontally when necessary. Explicit KaTeX `\tag{A}` labels are supported; the reader does not automatically number equations or resolve `\label` / `\ref` across a workspace.

Every equation offers **Source** and **Copy LaTeX** controls. Inline controls use icons; both have keyboard-accessible names. Source inspection opens a read-only, selectable text area. Copying uses the original expression without Markdown delimiters. If the browser denies clipboard access, the source opens with a visible explanation so it can be copied manually. These controls never edit the stored document. Printing hides the controls and inspection panels while preserving equations.

Invalid or unsupported LaTeX displays its literal source and a bounded diagnostic instead of partial rendered output. Expressions longer than 30,000 characters remain literal in a scrollable view. KaTeX macro expansion and size limits bound rendering; imported expressions cannot enable trusted commands, fetch images, or create executable links. Macros do not persist between equations. Source view and Markdown/ZIP exports retain the complete original document.

Standalone HTML export currently keeps math as source. Use browser print / Save as PDF for a rendered copy.
