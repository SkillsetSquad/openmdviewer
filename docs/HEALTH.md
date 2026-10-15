# Local documentation checks

Open **Workspace health** in the file navigation header, or **Analyze document** in a document's actions. Findings open the affected document in split view with the source cursor on the original line. Frontmatter line offsets are included. **Document properties** shows declared frontmatter and parsed statistics; it never substitutes an inferred owner or review date.

A report is a snapshot of the current tab's workspace view. Refresh it after editing. Whole-workspace parsing and checks run in a dedicated browser worker; no network requests validate external URLs. A JSON report can be downloaded locally.

## Scoring

Each document starts at 100. Every finding subtracts its displayed rule weight; the minimum is 0. Workspace health is the rounded arithmetic mean of document scores. An empty workspace has no score. The report's **Scoring rules** tab lists every rule and weight from the same configuration used by the analyzer. The JSON export includes each finding's rule, source line, and deduction.

The rules cover title and heading structure, duplicate DOM anchors, empty sections, paragraphs over 200 words, local document/image/attachment paths, heading fragments, path case, ambiguous wiki names, blocked URL schemes, image descriptions, owner/review metadata, review schedules, and exact normalized duplicate bodies.

A score describes those checks, not the truth, completeness, security certification, or organizational approval of the content. These are deterministic rules, not AI judgments. Recommendations for missing owner or review metadata may not be relevant to every personal note.

## Review dates

Only declared frontmatter review dates establish review history. Browser import/edit timestamps are not evidence of a review. Recognized spellings include `last_reviewed`, `last-reviewed`, `lastReviewed`, `last_reviewed_at`, and `lastReviewedAt`, with corresponding `next_review` variants.

Dates must be valid ISO calendar dates or ISO timestamps. Comparisons use today's calendar date on the device. A declared next-review date controls whether the review is overdue. With no valid next-review date, a last review older than 180 days is flagged. Invalid dates and future last-review dates are reported separately. Unknown dates remain unknown.

## Links, duplicates, and limits

Local links use the same resolver and sanitized heading IDs as the reader. Known imported attachments are downloadable and count as available local targets. Remote URLs are listed in source but are not fetched or labeled valid. Missing images are checked against imported asset paths. Case mismatches and ambiguous wiki names are reported rather than silently choosing a different file.

Duplicate-body checks remove frontmatter, trim outer whitespace, and normalize runs of whitespace. They apply only to bodies with at least 50 characters. They do not claim semantic similarity or AI authorship detection. Unlinked documents have no resolved cross-document edge in the workspace; within-document heading links do not connect two documents.

One report accepts at most 25 million source string characters. For larger workspaces, analyze individual documents or split the workspace. A document-only report resolves its destinations against the whole workspace but does not claim a whole-workspace graph, duplicate-body audit, or unlinked-document count. No universal latency or memory guarantee has been established for large collections.
