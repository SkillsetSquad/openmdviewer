# Interactive Markdown tables

Regular Markdown tables provide local search, per-column filters, sorting, copy controls, CSV/JSON downloads, column resizing, numeric summaries, and an expanded view that fills the browser viewport. These operations change the reader view, not the stored Markdown. Download Markdown to keep the original source and formatting.

## Filter and sort

The search field matches text across a row. **Column filters** adds a field below each header; column filters combine with the whole-table search using AND. Matching is case-insensitive substring matching. Hiding column filters clears those column filters. **Reset table view** clears search, filters, sorting, and manual widths.

Use a header's sort button to cycle through ascending, descending, and original source order. Plain finite numbers sort numerically; other values use natural text order. Equal values retain their original order. Header formatting and links remain separate from the sort control.

Tables display up to 50 matching rows per page. Previous/next controls browse the rest. Copying or exporting the table includes **all matching rows**, in the current sort order, rather than only the current page. Counts describe the actual source rows, matching rows, and data columns; copy-control columns are excluded.

## Copy and download

- **Cell and row copy controls** adds a copy button to each visible cell and row. Cell copy uses the rendered plain text. Row copy uses one CSV record without the header.
- **Copy table as CSV** includes headers and all matching rows.
- CSV downloads quote values and protect spreadsheet-sensitive formula prefixes, including formulas preceded by whitespace. That protection can prefix negative numeric text with an apostrophe. The source document is unchanged. Cell-text copy deliberately preserves the plain value.
- JSON downloads use `{ "columns": [...], "rows": [[...], ...] }`. This preserves duplicate and empty headers without overwriting object keys. Values are strings; rich formatting becomes plain text and images contribute their alt text.

Clipboard access can be denied by the browser. A failed copy displays a message; CSV and JSON downloads remain available. A download request does not imply that an original file was overwritten or that a filesystem write completed.

## Resize, expand, and inspect

Drag a header divider to resize its column. Keyboard users can focus a divider and use Left/Right for 16-pixel adjustments, Home for the 80-pixel minimum, or End for the 640-pixel maximum. Before manual resizing, widths are automatic. Wide tables scroll within their own container; headers remain visible while scrolling vertically.

**Expand table** opens a full-viewport dialog with the same filters, sorting, widths, copy controls, and pagination. Closing returns to the same table view. Table state survives ordinary scrolling and viewport changes; switching documents starts a fresh view.

**Table statistics** shows approximate numeric summaries for all matching rows. Only plain finite numeric values are included. Currency, comma-formatted numbers, blank values, and nonnumeric text are excluded. A dash means an aggregate is unavailable, including a sum that overflows the finite numeric range. The JSON export retains the original string values.

## Printing and limits

Browser printing restores all source rows and their original order, hides table controls, and removes the scrolling height limit. After printing, the filtered reader view returns. Printing does not rewrite the source.

Merged cells, multiple row groups, captions, footers, and other irregular HTML tables retain their original sanitized layout. Matrix-oriented sort/filter/copy/export controls are omitted for those tables; expansion remains available. This avoids silently discarding cells or misrepresenting spans.

Filtering, sorting, and numeric summaries run locally in the browser. Pagination bounds the number of displayed data rows; it does not move Markdown parsing or table processing into a worker. Automated Chromium coverage includes 120-row pagination/printing fixtures, rich cells, merged HTML, duplicate headings, mobile overflow, keyboard/pointer resizing, and source preservation. Larger real-world table benchmarks and other browsers remain to be verified.
