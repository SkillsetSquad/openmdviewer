# PDF extraction fixtures

Generated locally by `../generate-pdf-fixtures.py` using ReportLab, Pillow and ReportLab's bundled Bitstream Vera font. The retained font license is included. These contain synthetic test data only. Generation is not required to run tests; the committed PDF bytes are the fixtures.

- `extractable.pdf`: two text pages with Unicode Latin text, Markdown-looking literal text, an inert test JavaScript OpenAction and an external URI annotation, followed by an image-only page. The test host uses the reserved `pdf-attacker.invalid` domain; conversion must never request it or execute PDF actions.
- `scan-only.pdf`: one raster image without a selectable text layer. OCR is deliberately absent from this importer.
- `password.pdf`: encrypted test document. The public test-only opening password is `fixture-open`; it is not an account credential. Tests verify local password retry and unchanged encrypted original bytes.
- `layout.pdf`: a two-column page, a rotated page and a Japanese predefined-character-map page. The metadata title is deliberately `Page 2` to check generated page-anchor collisions. Extraction preserves available text without claiming layout reconstruction.

All eight pages were rendered with Poppler and visually inspected. Extractable text was independently checked with `pdftotext`. Fixture PDF content is not user data. The script intentionally includes the test action/annotation as security coverage; do not treat its source as a production PDF authoring template.
