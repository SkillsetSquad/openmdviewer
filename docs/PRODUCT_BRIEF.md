# PROJECT GOAL: THE ULTIMATE SELF-HOSTED MARKDOWN READER

## 1. Product Vision

Build a world-class, open-source, self-hosted Markdown reader and knowledge workspace using **Next.js, React, TypeScript, and Tailwind CSS**.

The objective is to create the most comprehensive Markdown reading experience available, combining beautiful document rendering, advanced navigation, knowledge management, developer utilities, document intelligence, and powerful import/export capabilities.

The application must be exceptionally fast, visually refined, privacy-focused, accessible, and completely usable offline.

**Fundamental principle: Everything must run client-side.**

The application must not require a backend API, Node.js application server, cloud infrastructure, external database, or user authentication to function.

Users should be able to deploy the application on their own infrastructure as a static website, open it in their browser, and immediately begin working with Markdown documents.

The product must remain completely free, open-source, and self-hostable.

### Primary Objective

Build a Markdown application that eliminates the need for multiple tools when reading, exploring, organizing, analyzing, comparing, converting, and publishing Markdown documents.

It must support everything from a single README.md file to a large documentation repository containing thousands of interconnected Markdown files.

### Product Philosophy

1. **Local-first:** User documents remain on their device unless they explicitly choose an external integration.
2. **Client-side only:** All core processing happens inside the browser.
3. **Self-hosted:** No mandatory external services or application backend.
4. **Offline-first:** Core functionality must work without internet access after the application has loaded and its necessary assets are cached.
5. **Open-source:** No subscriptions, feature paywalls, advertisements, or licensing restrictions on normal functionality.
6. **Performance-first:** Large documents and repositories must remain responsive.
7. **Privacy by design:** No unnecessary telemetry, tracking, or file uploads.
8. **Beautiful by default:** Reading Markdown should feel like using a premium document application.
9. **Keyboard-friendly:** Every important operation should be accessible without a mouse.
10. **Modular architecture:** Features should be independently maintainable and extensible.

---

# 2. Mandatory Technical Architecture

## Framework

Use:

- Next.js with App Router
- React
- TypeScript with strict type checking
- Tailwind CSS
- shadcn/ui for accessible UI components
- Lucide icons
- Zustand or a similarly lightweight state-management solution

Use modern, actively maintained, well-supported libraries wherever possible.

Avoid reinventing functionality already implemented reliably by established open-source packages.

## Strict Client-Side Architecture

The application must support Next.js static export.

Use:

```js
const nextConfig = {
  output: "export",
};
```

All document reading, rendering, searching, editing, indexing, conversion, and analysis must happen in the browser.

Do not use:

- Next.js API routes
- Server Actions
- Server-side document processing
- Server-side authentication
- Server databases
- Mandatory external APIs
- Server-side AI inference
- Background server workers

A standard static HTTP server must be sufficient to run the application.

Deployment targets should include:

- Nginx
- Caddy
- Apache
- Docker with a static web server
- NAS devices
- Raspberry Pi
- Private intranet servers
- Any hosting environment capable of serving static files

## Browser Storage

Use appropriate browser-native storage mechanisms.

**IndexedDB**

Store document metadata, indexes, preferences, recent history, bookmarks, document snapshots, annotations, and application state.

**Origin Private File System (OPFS)**

Store larger local document collections and persistent imported workspaces where supported.

**File System Access API**

Allow users to open and work with local Markdown directories directly in supported browsers.

**Local Storage**

Use only for lightweight application preferences where appropriate.

**Web Workers**

Move expensive operations away from the main UI thread.

**Service Workers**

Provide PWA functionality and offline application caching.

**WebAssembly**

Use when meaningful performance improvements justify the complexity.

No PostgreSQL, MongoDB, Redis, SQLite server, or other server-side database should be required.

---

# 3. World-Class Markdown Rendering Engine

The Markdown renderer is the foundation of the application.

It must accurately render real-world Markdown from GitHub repositories, documentation websites, AI tools, developer projects, and personal knowledge bases.

## Markdown Standards

Support:

- CommonMark
- GitHub Flavored Markdown
- Tables
- Task lists
- Strikethrough
- Automatic hyperlinks
- Nested lists
- Blockquotes
- Inline HTML, with safe sanitization
- Footnotes
- Reference links
- Escaped characters
- Definition lists
- Emoji shortcodes
- Heading anchors
- YAML frontmatter
- TOML frontmatter
- JSON frontmatter
- Markdown extensions commonly used in documentation

The parser should be extensible to support additional Markdown dialects.

## Advanced Code Rendering

Support syntax highlighting for a broad range of programming languages.

Features:

- Automatic language identification where feasible
- Syntax highlighting
- Language labels
- Line numbers
- Copy code button
- Code folding
- Expand/collapse code blocks
- Line highlighting
- Filename labels
- Word wrapping
- Horizontal scrolling
- Light/dark code themes
- Diff syntax highlighting
- Highlight added and removed lines
- Search within code blocks
- Download individual code snippets
- Open snippets in an optional editor

Use Shiki or an equivalent modern syntax-highlighting engine.

Avoid loading unnecessary language grammars on initial page load.

## Mathematical Expressions

Support:

- Inline LaTeX
- Display equations
- KaTeX rendering
- Mathematical symbols
- Equation numbering where supported
- Copying equation source
- Accessible equation representations

## Diagrams

Support Mermaid diagrams, including:

- Flowcharts
- Sequence diagrams
- Class diagrams
- State diagrams
- Entity relationship diagrams
- Gantt charts
- Pie charts
- Git graphs
- Timelines
- Mind maps
- User journey diagrams
- Quadrant charts

Diagram functionality:

- Zoom
- Pan
- Fullscreen
- Copy source
- Export as SVG
- Export as PNG
- Toggle source/rendered view
- Responsive rendering
- Theme adaptation
- Clear syntax-error reporting

Where practical, support additional diagram formats through optional modules.

## Callouts and Admonitions

Support GitHub-style and documentation-style callouts:

- Note
- Tip
- Important
- Warning
- Caution
- Info
- Success
- Error
- Custom callouts

Support collapsible callouts where appropriate.

## Embedded Content

Support:

- Local images
- SVG
- GIF
- Videos
- Audio
- PDFs
- Embedded code snippets
- Linked Markdown documents
- External webpages
- YouTube embeds
- Loom embeds
- Figma embeds
- GitHub references

External embeds must be optional, clearly identified, and disabled until explicitly allowed where privacy or security risks exist.

Provide graceful fallbacks for unavailable, blocked, or offline content.

---

# 4. Premium Reading Experience

The reading experience must be one of the application's strongest differentiators.

It should feel considerably more refined than a typical Markdown preview panel.

## Reading Themes

Implement:

- Light
- Dark
- OLED black
- Sepia
- Paper
- High contrast
- System automatic
- Custom themes

Support configurable:

- Accent colors
- Background colors
- Text colors
- Heading typography
- Body typography
- Code fonts
- Line spacing
- Paragraph spacing
- Reading width
- Font size
- Document padding

## Reading Modes

**Standard Mode**

Document with navigation, file tree, and toolbar.

**Focus Mode**

Distraction-free reading.

**Presentation Mode**

Turn Markdown headings and sections into a fullscreen presentation.

**Split Mode**

Markdown source on one side, rendered preview on the other.

**Source Mode**

View raw Markdown with syntax highlighting.

**Outline Mode**

Navigate exclusively using the document heading structure.

**Comparison Mode**

View two Markdown files side by side.

**Print Mode**

Provide a clean printable representation without application chrome.

## Reading Utilities

Implement:

- Reading progress indicator
- Estimated reading time
- Word count
- Character count
- Heading count
- Image count
- Code block count
- Sticky headings
- Collapsible sections
- Scroll-position restoration
- Smooth anchor navigation
- Previous/next document navigation
- Document bookmarks
- Highlighted passages
- Personal notes
- Reading history
- Recently opened documents

Allow users to resume reading documents exactly where they stopped.

---

# 5. File Management and Workspaces

The application must support both individual documents and large collections.

## File Input

Users must be able to:

- Drag and drop Markdown files
- Drag and drop folders where supported
- Open individual files
- Select local folders
- Import multiple files
- Import ZIP archives
- Open documents from URLs when browser security and CORS policies permit
- Open documents directly from supported Git providers
- Paste Markdown directly
- Create Markdown documents
- Open example documents

Supported extensions:

`.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx`, `.txt`

MDX must have safe handling: render supported Markdown content without executing arbitrary imported React or JavaScript code.

## Workspace Management

Support:

- Multiple workspaces
- Workspace switching
- Workspace renaming
- Workspace icons
- Workspace descriptions
- Workspace import/export
- Folder structure preservation
- Nested directories
- Favorites
- Pinned files
- Tags
- Collections
- Recently opened workspaces

## File Explorer

Provide a VS Code-quality explorer with:

- Nested folder tree
- Expand/collapse
- Folder search
- File search
- File-type indicators
- Drag-and-drop organization where write access exists
- Context menus
- Multiple selection
- Sorting
- Filtering
- File metadata
- Breadcrumb navigation
- Keyboard navigation

## File Operations

Where the storage provider supports writing:

- Create
- Rename
- Duplicate
- Move
- Delete
- Restore from application-managed snapshots where available
- Export
- Save As
- Download

Read-only sources must be clearly identified.

Never imply a file was saved back to disk unless the browser has actually completed the write.

---

# 6. Advanced Document Navigation

A major objective is making very large Markdown documents easy to explore.

## Table of Contents

Automatically generate a hierarchical table of contents.

Features:

- Sticky sidebar
- Nested headings
- Active section tracking
- Collapse/expand
- Search headings
- Jump navigation
- Scroll synchronization
- Copy heading links
- Heading depth configuration

## Document Outline

Show a structured overview of the current document.

Provide keyboard navigation between headings.

## Breadcrumbs

Display the full document hierarchy.

Example:

Documentation → Backend → Authentication → JWT

## Quick Navigation

Implement:

- Command palette
- Quick file switcher
- Recent files
- Recent headings
- Document history
- Back/forward navigation
- Cross-document links
- Keyboard-first actions

## Backlinks

Identify Markdown documents linking to the current document.

Provide a backlinks panel with source-document references.

## Outgoing Links

Show internal and external links referenced by a document.

## Broken Link Detection

Detect:

- Missing local files
- Invalid relative paths
- Missing heading anchors
- Unsupported references
- Duplicate heading anchors
- Case-sensitivity inconsistencies

External link validation must respect browser networking limitations.

## Knowledge Graph

Provide an interactive visualization of relationships between documents.

Features:

- Nodes representing documents
- Edges representing links
- Search
- Filtering
- Tag coloring
- Zoom
- Pan
- Click-to-open
- Isolated node detection
- Connected-document exploration

Graph rendering must remain efficient for larger workspaces.

---

# 7. Powerful Local Search Engine

Implement comprehensive search without a backend.

The search index must be created and stored locally.

## Global Search

Search across:

- Document titles
- Document contents
- Headings
- Frontmatter
- Tags
- File paths
- Code blocks
- Links

## Search Features

Include:

- Full-text search
- Fuzzy search
- Exact phrase search
- Case sensitivity
- Whole-word matching
- Regular expressions
- Search result highlighting
- Search suggestions
- Search history
- Instant search
- Search within the current document
- Search within selected folders
- Search within selected workspaces

## Advanced Search

Support filter expressions such as:

`tag:api`

`path:/backend/`

`type:markdown`

`status:approved`

`heading:authentication`

Allow combinations of filters.

## Search Results

Results must display:

- Document title
- Matching text excerpt
- Matching heading
- File path
- Highlighted terms
- Relevant metadata

Clicking a result should open the document at the matching location.

## Search Performance

Indexing should occur in Web Workers.

Use incremental indexing to avoid rebuilding the entire search index unnecessarily.

The application should remain responsive during indexing.

---

# 8. Advanced Tables

Markdown tables should behave like lightweight interactive data tables.

Implement:

- Responsive scrolling
- Sticky headers
- Sortable columns
- Search inside tables
- Column filtering
- Copy cells
- Copy rows
- Copy entire tables
- Export CSV
- Export JSON
- Download as spreadsheet-compatible data
- Column resizing
- Fullscreen table view
- Table statistics
- Mobile-friendly presentation

Preserve source Markdown semantics.

Do not modify the original document simply because users sort or filter its rendered table.

---

# 9. Image and Media Experience

Provide an advanced media viewer.

## Images

Features:

- Click-to-zoom
- Pan
- Fullscreen
- Image gallery
- Next/previous navigation
- Download
- Copy image
- Copy image URL
- View dimensions
- View available metadata
- SVG support
- Responsive images
- Lazy loading
- Missing-image handling

## Media

Support playback of browser-compatible audio and video formats.

Provide:

- Playback controls
- Fullscreen
- Picture-in-picture where available
- Playback speed
- Media metadata
- Captions when supplied
- Poster images

All media assets should remain local unless explicitly fetched from an external location.

---

# 10. Built-In Markdown Editor

Although reading is the primary focus, the application should include a capable optional editor.

## Editing Modes

- Source editor
- Split editor
- Live preview
- Read-only mode
- Focus writing mode

## Editor Capabilities

- Markdown syntax highlighting
- Auto-indentation
- Bracket matching
- Line numbering
- Search and replace
- Multi-cursor editing
- Undo/redo
- Word wrapping
- Formatting shortcuts
- Automatic list continuation
- Insert tables
- Insert links
- Insert images
- Insert code blocks
- Insert diagrams
- Markdown linting
- Formatting assistance

Use CodeMirror 6 or Monaco, selecting the implementation that provides the best balance of capabilities, bundle size, and performance.

## Safe Saving

Implement:

- Dirty-state detection
- Autosave to browser storage
- Explicit filesystem saves
- Recovery snapshots
- Unsaved-change warnings
- Conflict detection
- Restore previous revisions

Do not silently overwrite externally modified files.

---

# 11. Document Intelligence

Provide powerful document-analysis features without requiring cloud services.

## Document Statistics

Display:

- Reading time
- Word count
- Character count
- Sentence count
- Paragraph count
- Heading structure
- Code block count
- Links
- Images
- Tables
- Task completion statistics

## Structure Analysis

Detect:

- Missing H1
- Multiple H1 headings
- Skipped heading levels
- Empty sections
- Duplicate headings
- Broken anchors
- Very long paragraphs
- Excessively deep nesting
- Poor document hierarchy
- Missing image alt text
- Malformed Markdown structures

## Document Health Score

Create a transparent, rule-based scoring system.

Analyze:

- Markdown validity
- Link integrity
- Heading organization
- Accessibility
- Metadata completeness
- Structural consistency
- Documentation coverage signals
- Stale review dates
- Duplicate sections

Show actionable recommendations.

Example:

**Documentation Health: 82/100**

Issues:

- 12 broken links
- 4 missing heading anchors
- 7 images missing alt text
- 5 documents missing review dates
- 3 duplicated sections

Every issue should link directly to the affected document and location.

## Workspace Health Dashboard

Display:

- Total documents
- Total words
- Total folders
- Broken links
- Unlinked documents
- Missing metadata
- Stale documents
- Recently updated documents
- Overall documentation health

All calculations must happen locally.

---

# 12. AI-Powered Features

AI must be an **optional enhancement**, never a mandatory dependency.

The application must work fully without AI.

## Local Browser AI

Investigate browser-based inference using:

- WebGPU
- WebAssembly
- Transformers.js
- WebLLM
- Compatible downloadable models

Potential capabilities:

- Document summarization
- Selected-text explanation
- Document question answering
- Keyword extraction
- Semantic document search
- Content classification
- Similar document discovery
- Writing suggestions

Model weights may require an initial download and browser storage.

Capabilities must degrade gracefully on devices lacking sufficient memory or compatible hardware.

## Optional Bring Your Own Key

Allow explicit user-configured integrations with compatible AI providers.

Potential providers:

- OpenAI
- Anthropic
- OpenRouter
- Gemini
- Custom OpenAI-compatible endpoints

Only enable integrations that support secure, browser-compatible access.

Never ship embedded provider credentials or use a public shared API key.

Clearly warn users before transmitting private document content to third-party services.

Credentials should preferably remain in memory for the current session.

Providers requiring confidential server-side credentials or unsupported CORS behavior must be marked unavailable in pure client-side mode rather than routed through an undisclosed backend.

## AI Features

### Ask This Document

Ask questions about the currently opened Markdown document.

Responses should cite specific headings or passages.

### Ask Workspace

Search and answer questions using multiple documents.

### Summarization

Generate:

- Brief summary
- Detailed summary
- Key takeaways
- Action items
- Technical summary
- Executive summary

### Explain Selected Text

Users should be able to highlight a passage and request an explanation.

### Documentation Improvement

Suggest:

- Better organization
- Clearer writing
- Missing sections
- Improved examples
- Consistent terminology
- Reduced repetition
- Better headings

### Contradiction Detection

Identify potentially conflicting information across documents.

Example:

Document A states a refund period of 7 days.

Document B states a refund period of 14 days.

Show both references for manual review.

### Duplicate Content Detection

Identify semantically similar or duplicated documents.

### Prompt Conversion

Convert Markdown documents into structured prompts for:

- Codex
- Claude
- ChatGPT
- Cursor
- Other AI assistants

### AI Content Quality Analysis

Identify potentially generic, repetitive, verbose, unsupported, or poorly structured writing.

Do not claim reliable identification of AI authorship.

AI-generated recommendations must be distinguishable from deterministic validation results.

---

# 13. Developer-Focused Capabilities

The application must be particularly useful for developers reading technical documentation.

## GitHub Integration

Allow users to:

- Open public repositories
- Browse Markdown files
- Open README files
- View repository documentation
- Navigate repository directories
- Read changelogs
- Switch branches
- Switch tags
- Browse documentation versions
- Open links in GitHub
- Compare file revisions

Provide optional authenticated access using browser-compatible GitHub API mechanisms.

Do not require a server-side OAuth client secret.

Use explicit user authorization for remote writes.

## GitLab and Other Providers

Architect repository integrations as adapters.

Support GitLab and other compatible providers where practical.

## README Mode

Specially optimize rendering of:

- README.md
- CONTRIBUTING.md
- SECURITY.md
- CHANGELOG.md
- LICENSE.md
- AGENTS.md
- CLAUDE.md
- Technical documentation

## API Documentation Mode

Recognize common API documentation patterns.

Provide enhanced views for:

- HTTP methods
- Endpoint paths
- Request parameters
- Request bodies
- Response examples
- Authentication requirements
- Error codes
- Code examples

Preserve the underlying Markdown.

## Changelog Mode

Detect common changelog structures and render releases as a navigable timeline.

## Version Comparison

Support:

- Text diffs
- Word-level diffs
- Side-by-side comparisons
- Inline comparisons
- Added/removed line highlighting
- Markdown-aware structural comparisons
- Version history comparison

## Configuration File Viewing

Allow related text-based files to be viewed with appropriate syntax highlighting.

Examples:

- JSON
- YAML
- TOML
- XML
- INI
- ENV examples

Sensitive content should never be transmitted externally without explicit user action.

---

# 14. Import and Export System

The application must act as a universal Markdown document utility.

## Imports

Support:

- Markdown
- TXT
- HTML
- DOCX
- PDF
- ZIP archives
- Obsidian vault exports
- Notion Markdown exports
- GitHub repositories
- GitLab repositories
- Documentation repository folders
- Clipboard content

Where feasible, implement format conversion directly in the browser.

PDF imports should initially support extractable text PDFs.

Scanned PDFs require a separate optional browser-based OCR module.

For external platforms such as Google Docs, support file-based imports first. Direct account integration should only be added where a secure client-side authorization mechanism exists.

## Exports

Support:

- Markdown
- HTML
- PDF
- DOCX
- Plain text
- JSON
- ZIP
- CSV for tables
- Static documentation website
- Presentation output
- AI prompt formats

## Professional PDF Export

Provide:

- Print-friendly layouts
- Custom page sizes
- Margins
- Headers
- Footers
- Page numbers
- Table of contents
- Syntax-highlighted code
- Proper table formatting
- Custom typography
- Light/dark export settings
- Optional branding
- Cover pages
- Page-break controls

Use browser-native printing and client-side conversion libraries as appropriate.

## Static Documentation Website Generator

Allow users to export an entire Markdown workspace into a browsable static documentation website.

Include:

- Navigation sidebar
- Table of contents
- Search
- Themes
- Document links
- Responsive design
- Static assets

The generated documentation website should require only static hosting.

---

# 15. Knowledge Management

Build a local-first knowledge management layer.

## Metadata

Support frontmatter fields including:

- Title
- Description
- Author
- Tags
- Categories
- Status
- Owner
- Created date
- Updated date
- Last reviewed date
- Next review date
- Version
- Related documents

Allow custom metadata fields.

## Collections

Users should be able to group documents into collections.

Support:

- Manual collections
- Tag-based collections
- Saved searches
- Favorites
- Recent files
- Documents requiring review
- Documentation with errors

## Document Relationships

Support:

- Wiki-style links
- Relative links
- Backlinks
- Related documents
- Cross-references
- Embedded Markdown sections where supported
- Document graph

## Personal Annotations

Allow users to:

- Highlight text
- Add notes
- Bookmark sections
- Create personal reading lists
- Track reading progress

Store annotations locally and allow them to be exported.

---

# 16. Team Documentation Workflows

Support collaboration-oriented document workflows without introducing a mandatory backend.

## Document Lifecycle

Document statuses:

- Draft
- In review
- Approved
- Published
- Deprecated
- Archived

## Ownership

Allow metadata for:

- Document owner
- Department
- Reviewer
- Last reviewed
- Next review
- Approval notes

## Review Management

Implement:

- Review reminders while the application is active
- Documents requiring review
- Review history
- Reviewer notes
- Suggested updates
- Exportable review reports

## Comments and Suggestions

Allow locally stored:

- Document comments
- Paragraph-level comments
- Review notes
- Suggested edits

Provide exportable annotation and review files so teams can share changes through Git repositories or shared filesystem workflows.

## Git-Based Collaboration

Support collaboration through existing Git workflows:

- Branch-based changes
- Pull requests
- Document diffs
- Git-based version history
- Review metadata

The application must not pretend that browser-local status fields constitute enforceable organization-wide permissions.

True multi-user RBAC, SSO, centralized audit logs, real-time synchronization, and enforced approval workflows require a trusted shared authority or additional infrastructure. These should not be falsely advertised as fully functional in a browser-only implementation.

Optional WebRTC-based peer collaboration may be explored, but it must not become a dependency of the core application.

---

# 17. Advanced Productivity Features

Implement:

- Global command palette
- Keyboard shortcut customization
- Quick document switching
- Multi-tab document browsing
- Split panels
- Resizable sidebars
- Focus mode
- Zen mode
- Fullscreen mode
- Recently opened files
- Workspace history
- Document pinning
- Quick actions
- Contextual toolbars
- Multi-document comparison
- Drag-and-drop operations
- Clipboard utilities
- Bulk export
- Bulk document analysis
- Batch renaming where file access permits
- Table-to-CSV conversion
- Link extraction
- Image extraction
- Markdown formatting tools

## Command Palette

Use `Ctrl/Cmd + K`.

Example commands:

- Open document
- Open workspace
- Search documents
- Toggle theme
- Export PDF
- Copy Markdown
- Show backlinks
- Show graph
- Analyze document
- Compare documents
- Open settings
- Toggle focus mode

Support fuzzy command matching.

---

# 18. Exceptional User Interface

The UI should feel like a premium productivity application.

Design inspiration:

- Linear
- Raycast
- GitBook
- Obsidian
- VS Code
- Vercel Dashboard

Do not copy these interfaces directly.

Create a distinctive visual identity.

## Desktop Layout

Use a flexible three-column layout.

**Left Sidebar**

Workspace navigation, folders, collections, favorites, and recent files.

**Main Content**

Beautifully rendered Markdown document.

**Right Sidebar**

Table of contents, document properties, backlinks, annotations, and contextual utilities.

All sidebars must be collapsible and resizable.

## Mobile Layout

Create a responsive layout with:

- Collapsible navigation
- Touch-friendly controls
- Mobile search
- Responsive tables
- Fullscreen reading
- Compact toolbars
- Swipe-friendly media galleries

## Visual Requirements

- Consistent spacing
- Clear typography hierarchy
- Subtle animations
- Excellent color contrast
- Minimal visual clutter
- Appropriate hover states
- Accessible tooltips
- Beautiful loading states
- Skeleton loaders
- Empty states
- Clear error messages
- Smooth transitions
- No unnecessary animations

Use design tokens rather than scattered hard-coded styles.

The interface must remain usable for documents that contain complex tables, diagrams, and large code blocks.

---

# 19. Accessibility

Target WCAG 2.2 AA compliance.

Requirements include:

- Keyboard navigation
- Visible focus indicators
- Screen reader support
- Semantic HTML
- Accessible dialogs
- Proper heading hierarchy
- ARIA labels where necessary
- Sufficient color contrast
- Reduced-motion support
- Responsive text scaling
- Accessible table navigation
- Accessible error messages
- Logical tab order

Do not sacrifice accessibility for visual styling.

---

# 20. Security and Privacy

Privacy and security must be first-class design requirements.

## Privacy

- No user accounts
- No mandatory cloud services
- No document uploads
- No advertising
- No third-party analytics by default
- No remote logging of private documents
- No mandatory AI integrations
- No tracking pixels
- No hidden external dependencies

## Markdown Security

Treat all imported Markdown as untrusted.

Implement:

- HTML sanitization
- XSS protection
- Safe URL protocol validation
- Prevention of arbitrary JavaScript execution
- Secure iframe handling
- Restrictions on dangerous embeds
- Safe link handling
- Content Security Policy
- Secure file handling
- Strict handling of imported MDX

Mermaid diagrams and other rendering plugins must not bypass these controls.

## External Integrations

Users must explicitly authorize integrations that:

- Contact external services
- Read private repositories
- Access local folders
- Transmit document content
- Use AI providers
- Write to remote repositories

## Encryption

Support optional encryption of application-managed local workspaces using browser-native cryptographic APIs.

Explain clearly that encryption does not protect against a compromised browser, malicious extensions, or scripts running in the application's trusted origin.

Avoid promising end-to-end encryption where no actual multi-endpoint encryption protocol exists.

---

# 21. Performance Requirements

Performance is a major product differentiator.

## Targets

Target:

- Minimal initial JavaScript bundle
- Fast application startup
- Smooth scrolling
- Responsive search
- Efficient memory usage
- No unnecessary re-renders
- Lazy loading of large files
- Lazy loading of diagrams
- Lazy loading of syntax-highlighting languages
- Incremental document parsing where feasible
- Virtualized long lists
- Efficient file-tree rendering
- Web Worker-based indexing
- Efficient IndexedDB access

## Large Document Support

Optimize for:

- Markdown files exceeding 1 MB
- Long technical manuals
- Thousands of headings
- Large tables
- Hundreds of images
- Repositories containing thousands of files

Large-document behavior must be measured using realistic benchmark datasets.

Avoid claiming universal performance guarantees without testing target hardware.

## Caching

Cache:

- Parsed Markdown representations where beneficial
- Search indexes
- Document metadata
- Generated outlines
- Diagram assets where appropriate
- Browser AI models
- Static application resources

Implement cache invalidation and reasonable storage limits.

---

# 22. Progressive Web Application

The application should function as an installable PWA.

Implement:

- Web app manifest
- App icons
- Offline startup
- Service Worker caching
- Offline document access for locally imported files
- Offline search
- Persistent application preferences
- Update notifications
- Safe cache migration
- Storage usage management

Offline access must not require a cloud account.

---

# 23. Extensibility

Design the application with modular boundaries.

Create independent modules for:

- Markdown parsing
- Rendering
- Syntax highlighting
- Diagrams
- Search
- File providers
- Export
- Import
- AI
- Themes
- Document analysis
- Workspace management
- Annotations

Allow optional functionality to be enabled or disabled.

Prefer extension through typed interfaces and explicit registries rather than arbitrary runtime code execution.

A full third-party plugin marketplace is not required for the initial release.

---

# 24. Testing and Quality Assurance

Quality is as important as feature count.

## Automated Tests

Implement:

- Unit tests
- Integration tests
- Browser end-to-end tests
- Markdown rendering snapshot tests
- Import/export tests
- Accessibility checks
- Security tests
- Performance benchmarks

## Markdown Compatibility Tests

Validate rendering using a comprehensive Markdown fixture suite.

Test:

- Basic CommonMark
- GFM tables
- Nested task lists
- Complex code blocks
- Footnotes
- Unicode
- RTL text
- Mixed HTML
- Complex links
- Frontmatter
- Mermaid
- KaTeX
- Nested relative paths
- Malformed Markdown
- Large Markdown documents

## Browser Compatibility

Target current major browsers:

- Chrome
- Edge
- Firefox
- Safari

Use progressive enhancement for capabilities that are not supported equally across browsers, particularly direct folder access and filesystem writes.

## Regression Prevention

Maintain a fixture library of complex Markdown documents.

Rendering improvements must not silently break previously supported Markdown syntax.

---

# 25. Deployment Requirements

The application must support self-hosted deployment with minimal effort.

## Docker

Provide a production-ready Dockerfile that builds the Next.js static application and serves it using a lightweight HTTP server.

The runtime container must not require Node.js.

## Static Deployment

The generated static output must be deployable directly.

Provide documentation for:

- Nginx
- Caddy
- Apache
- Docker Compose
- Reverse proxies
- Subpath deployment
- HTTPS configuration
- Offline operation
- Application updates

## Configuration

Provide a simple client-side configuration mechanism for:

- Application title
- Branding
- Default theme
- Enabled features
- Default reading preferences
- Optional integration endpoints
- Maximum local cache usage

Never include private API credentials in build-time or public runtime configuration.

---

# 26. Suggested Implementation Stack

Use the following technologies as a starting point, subject to compatibility and maintenance validation.

| Component | Preferred Technology |
|---|---|
| Application | Next.js App Router |
| Language | TypeScript |
| UI Framework | React |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Icons | Lucide |
| Markdown pipeline | unified / remark / rehype |
| GitHub Markdown | remark-gfm |
| Syntax highlighting | Shiki |
| Math | KaTeX |
| Diagrams | Mermaid |
| Editor | CodeMirror 6 |
| Local database | IndexedDB |
| IndexedDB wrapper | Dexie |
| Local files | File System Access API |
| Private file storage | OPFS |
| Search | MiniSearch / FlexSearch |
| State management | Zustand |
| Large lists | TanStack Virtual |
| Tables | TanStack Table |
| Document exports | Browser-compatible libraries |
| PDF reading | PDF.js |
| DOCX import | Mammoth |
| Local AI | WebLLM / Transformers.js |
| Cryptography | Web Crypto API |
| Offline support | Service Worker |
| Automated testing | Vitest / Playwright |
| Deployment | Static export + Nginx/Caddy |

Choose libraries based on actual compatibility with browser-only static deployments.

Libraries requiring privileged server runtimes must not be introduced into the client-side execution path.

---

# 27. Implementation Roadmap

Implement the project in deliberate phases while maintaining a working application.

## Phase 1 — Foundation

Deliver:

- Next.js static application
- Design system
- Responsive layout
- Theme system
- File importing
- Local storage
- Markdown renderer
- GFM compatibility
- Syntax highlighting
- Mermaid
- KaTeX
- Table of contents
- File navigation

The application must already be a genuinely useful Markdown reader.

## Phase 2 — Advanced Reader

Deliver:

- Reading modes
- Advanced tables
- Image viewer
- Document search
- Global search
- Keyboard shortcuts
- Command palette
- Tabs
- Split view
- Bookmarks
- Reading history
- Offline PWA

## Phase 3 — Knowledge Workspace

Deliver:

- Multiple workspaces
- Metadata
- Tags
- Collections
- Backlinks
- Knowledge graph
- Broken-link detection
- Document health
- Workspace health dashboard

## Phase 4 — Editor and Conversions

Deliver:

- Source editor
- Live preview
- Safe saving
- Undo/redo
- Version snapshots
- Document comparison
- PDF export
- DOCX export
- HTML export
- Import converters
- Static documentation website export

## Phase 5 — Developer Integrations

Deliver:

- GitHub repository browsing
- Branch/version selection
- Changelog mode
- README mode
- API documentation mode
- Git-based diffing
- Optional authenticated Git operations

## Phase 6 — AI Intelligence

Deliver:

- Browser AI integration
- Document summarization
- Document Q&A
- Workspace Q&A
- Semantic search
- Suggested improvements
- Contradiction detection
- Duplicate content detection
- Optional BYOK provider integration

## Phase 7 — Collaboration and Polish

Deliver:

- Local comments
- Review annotations
- Document lifecycle metadata
- Git-friendly review exports
- Advanced accessibility improvements
- Performance optimizations
- Browser compatibility fixes
- Deployment documentation
- Comprehensive automated testing

---

# 28. Definition of Done

The product is considered successful when users can:

1. Deploy the application using Docker or any static hosting solution without provisioning a backend or database.
2. Open Markdown documents and entire local workspaces without uploading them.
3. Read documents with excellent typography, diagrams, syntax highlighting, tables, and navigation.
4. Search and navigate thousands of interconnected documents efficiently.
5. Work offline with locally cached documents.
6. Manage documents and metadata locally.
7. Edit Markdown and save changes safely where browser permissions allow.
8. Import and export widely used document formats.
9. Analyze documentation quality and identify structural issues.
10. Browse compatible Git repositories using optional integrations.
11. Use optional AI features without making AI mandatory.
12. Generate static documentation websites.
13. Maintain control over their files, integrations, and local application data.
14. Use the application across major browsers with documented capability differences.
15. Run the entire application without an account, subscription, or external application service.

---

# 29. Engineering Principles

Throughout development:

**Do not prioritize feature quantity over quality.**

Every implemented feature must be:

- Functional
- Tested
- Accessible
- Performant
- Secure
- Maintainable
- Visually consistent

Do not add non-functional buttons or placeholder interactions and present them as completed features.

Do not invent backend dependencies to solve problems that should be addressed through browser-native APIs.

Do not compromise the local-first architecture for convenience.

Use reusable components and avoid duplicating functionality.

Keep optional dependencies separate from the main application bundle whenever possible.

Document technical trade-offs.

Use progressive enhancement where browser capabilities differ.

Always preserve user data integrity.

Treat imported files and external content as untrusted.

Optimize for maintainability and long-term open-source development.

---

# 30. Ultimate Product Goal

**Create the definitive open-source, self-hosted Markdown reading and knowledge-management application.**

A single application capable of beautifully displaying a README, navigating thousands of technical documents, visualizing knowledge relationships, searching entire documentation repositories, comparing revisions, exporting professional documents, auditing documentation quality, and optionally using AI to understand complex information.

All without requiring users to create accounts, trust a cloud service, upload private documents, maintain a database, or operate an application backend.

The experience should feel as polished as a premium commercial product while preserving the freedom, simplicity, transparency, and ownership of a fully self-hosted application.

**The final result should not merely compete with existing Markdown viewers. It should establish a new standard for what a modern Markdown reader can do.**