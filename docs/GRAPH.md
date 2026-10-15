# Workspace graph

Open **Workspace graph** beside the WORKSPACE label in the file navigation, from the command palette’s quick actions, or from **Explore workspace graph** in the right-hand Graph tab.

Every document in the current workspace is a node. Resolved local Markdown and wiki links connect documents. A repeated link to the same destination is one directed connection with a link count. Incoming/outgoing details retain direction and counts. Self-links, external URLs, missing files, and imported media are excluded. Use workspace health to investigate unresolved references.

## Explore

- Search by title, path, or tag. Every space-separated term must occur somewhere in those fields; graph search uses case-insensitive substring matching.
- Filter by tag, connected documents, or isolated documents. Filters combine with search and the current neighborhood.
- Select a node or a document-list row. The details show tags, the original path, and incoming/outgoing links. Select a linked document to continue exploring.
- Choose **Explore connections** to see direct neighbors, documents within two links, or the whole connected group. Connections are followed in both directions for neighborhood exploration. **Show whole workspace** removes the neighborhood restriction while preserving other filters.
- Double-click a node or use **Open document** to read it. The list and details provide the same navigation without needing to operate the canvas.

Isolation means no resolved incoming or outgoing link to another document anywhere in this workspace. Hiding neighbors with filters does not make a document isolated. The summary distinguishes visible documents/connections from the workspace-wide isolated count.

Colors use the first alphabetical tag; untagged documents are gray. The palette can repeat for different tags, so read the tag labels rather than treating color as a unique identifier. Positions group connected documents using a deterministic layout; distance is not a relevance or similarity score.

## Canvas controls

Drag to pan; scroll to zoom around the pointer. The plus/minus buttons zoom, **Fit** shows the visible documents, and **Center selected** brings the selected visible node into view. Focus the canvas to use arrow keys to pan, `+` / `-` to zoom, or `Home` to fit. Touch dragging pans; the visible buttons provide touch zoom controls.

## Local processing and scale

The graph reuses the local search worker’s document summaries and resolved links. A separate worker prepares layout and filters. Neither worker uploads documents or fetches external links. The optional graph module and worker are included in the offline application cache.

Canvas draws the graph; document and relation lists show 40 rows per page. Offscreen points are not drawn, and labels are limited at overview zoom. All matching documents remain in the graph and can be found through search or pagination. No force simulation runs on the main thread. Pan/zoom positions are temporary and reset on filter changes or reopening.

Automated coverage includes a synthetic 1,200-document chain in Chromium and deterministic layout checks with 3,000 nodes. These are bounded fixtures, not a universal performance guarantee or a realistic large-repository benchmark. The file explorer still renders its ordinary document tree; graph pagination does not virtualize the rest of the application. Browser compatibility beyond Chromium remains to be verified.
