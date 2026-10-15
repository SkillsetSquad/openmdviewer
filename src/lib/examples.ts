import type { ReaderDocument } from "./types";
const configuration = `# Configuration Guide

Learn how to configure OpenMDViewer for your self-hosted environment, with examples, best practices, and advanced options.

> [!NOTE]
> **Self-hosted and fully under your control**
>
> OpenMDViewer runs entirely in your browser. Your documents stay on your device, giving you control over your data, privacy, and reading experience.

## 1. Overview

[OpenMDViewer](Introduction.md) is a modern, self-hosted Markdown reader designed for a fast and focused reading experience. It supports rich Markdown, local workspaces, and thoughtful navigation. A quiet home for your notes, documentation, and knowledge.

- Fast, focused reading, with no account required
- Beautiful, accessible light and dark themes
- Works offline after the app is cached
- Your files stay yours, on your own device

## 2. Basic Configuration

There is no application server to configure. Build the static site and serve the output anywhere:

\`\`\`bash
# Install dependencies
npm ci

# Build the static application
npm run build

# Serve the output locally
npx serve out
\`\`\`

For a subpath deployment, set \`NEXT_PUBLIC_BASE_PATH\` at build time.

## 3. Configuration Options

Here are the most commonly used options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| Theme | preference | Dark | Choose your reading atmosphere |
| Font size | number | 15 | Document text size in pixels |
| Line spacing | number | 1.75 | A little room to breathe |
| Reading width | number | 1100 | Maximum document width |
| Storage | IndexedDB | Local | Documents stay in this browser |

![A still alpine lake beneath mountains at sunset](asset:alpine-lake)

*A clean and focused reading experience for your Markdown documents.*

> “Good documentation is a love letter to your future self.”
>
> — Unknown

## 4. Advanced Setup

Make yourself at home. Your reading preferences are saved on this device.

1. Open **Reading settings** in the toolbar.
2. Choose a theme, font, text size, and line spacing.
3. Import Markdown files or an entire local folder.
4. Use **⌘ K** to search your documents and run commands.

> [!TIP]
> **A workspace that travels with you**
>
> Export your workspace as a ZIP before switching browsers or clearing site data. Browser storage is local to this device and this website.

## 5. Todo Checklist

- [x] Open the configuration guide
- [x] Explore the local-first reading experience
- [ ] Import your own Markdown documents
- [ ] Make the reading theme your own
- [ ] Export a backup of your workspace

## 6. Related Resources

- [Installation guide](Installation.md)
- [Docker deployment](Docker.md)
- [Markdown showcase](../Guides/Markdown%20Showcase.md)

---

Built for curiosity. Designed for focus. Yours to self-host.
`;
const showcase = `# Markdown Showcase

A little of everything. All rendered locally.

## Rich text

**Bold ideas**, *quiet emphasis*, ~~old thoughts~~, and [a relative link](../Getting%20Started/Configuration.md). Footnotes work too.[^1]

[^1]: A small detail, right where you need it.

## Mathematics

Einstein’s familiar equation: $E = mc^2$.

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

## Diagrams

\`\`\`mermaid
flowchart LR
  A[Open a document] --> B[Read beautifully]
  B --> C[Make it your own]
  C --> D[Keep it local]
\`\`\`

## Code

\`\`\`typescript
interface Document {
  title: string;
  content: string;
}

const read = (doc: Document) => doc.content;
console.log(read({ title: "Hello", content: "Your words, your space." }));
\`\`\`

## Tables

| Feature | Status | Runs in |
| --- | --- | --- |
| Markdown | Ready | Browser |
| Math | Ready | Browser |
| Diagrams | Ready | Browser |
| Local documents | Ready | IndexedDB |

## Tasks

- [x] Keep everything private
- [x] Make something beautiful
- [ ] Write your next idea

> [!WARNING]
> Export a backup before clearing your browser data.
`;
const examples: [string, string, string[]][] = [
  [
    "Docs/Getting Started/Configuration.md",
    configuration,
    ["guide", "configuration", "self-hosted"],
  ],
  [
    "Docs/Getting Started/Introduction.md",
    "# Welcome to OpenMDViewer\n\nA quieter place for your Markdown. Open a file, import a folder, or start writing. Everything happens on your device.\n\n## Your documents, your space\n\nNo accounts. No uploads. No mandatory external services. Your workspace is stored in this browser using IndexedDB.\n\n## Get started\n\nRead the [Configuration Guide](Configuration.md), explore the [Markdown Showcase](../Guides/Markdown%20Showcase.md), or use the Open files button.\n\n## Keyboard shortcuts\n\n| Shortcut | Action |\n| --- | --- |\n| Ctrl / ⌘ K | Search and commands |\n| Ctrl / ⌘ F | Find in document |\n| Ctrl / ⌘ S | Download Markdown |\n| Escape | Close dialog or exit focus |\n",
    ["welcome", "guide"],
  ],
  [
    "Docs/Getting Started/Installation.md",
    "# Installation\n\nDeploy the same static files anywhere.\n\n## Local development\n\n```bash\nnpm ci\nnpm run dev\n```\n\n## Static hosting\n\n```bash\nnpm run build\n# Upload the contents of out/ to a static host\n```\n\n## GitHub Pages\n\nThe included workflow builds with the repository base path and deploys the out directory. In repository settings, select GitHub Actions as the Pages source.\n\n## Docker\n\nSee [Docker.md](Docker.md) for a Node-free runtime container.\n\n## Offline\n\nAfter the initial online visit, the service worker caches the application. Imported documents are kept in IndexedDB. Export backups regularly.\n",
    ["setup"],
  ],
  [
    "Docs/Getting Started/Docker.md",
    "# Docker Deployment\n\nBuild once, serve anywhere. The runtime uses Nginx; Node.js is only used during the build.\n\n## Run\n\n```bash\ndocker compose up --build -d\n```\n\nOpen http://localhost:8080.\n\n## Subpath\n\nBuild with the NEXT_PUBLIC_BASE_PATH argument and mount the static output at that path on your web server.\n\n## Updates\n\nRebuild the image and reload the browser. Your documents remain in browser storage for the same origin.\n",
    ["docker", "self-hosted"],
  ],
  ["Docs/Guides/Markdown Showcase.md", showcase, ["markdown", "reference"]],
  [
    "Docs/Guides/Keyboard Shortcuts.md",
    "# Keyboard Shortcuts\n\nStay in the flow.\n\n| Shortcut | Action |\n| --- | --- |\n| Ctrl / ⌘ K | Command palette |\n| Ctrl / ⌘ F | Find in document |\n| Ctrl / ⌘ S | Download current file |\n| Escape | Close overlay / exit focus |\n\n## Navigate\n\nUse Tab to move between controls, Enter to activate, and the contents panel to jump to headings.\n",
    ["productivity"],
  ],
  [
    "Docs/API/Architecture.md",
    "# Architecture\n\n## Static by design\n\nNext.js produces HTML, CSS, and JavaScript. No application API, database server, or account is required.\n\n## Browser storage\n\nDocuments live in IndexedDB. Lightweight reading preferences live in localStorage.\n\n## Trust boundaries\n\nImported HTML is sanitized. MDX never executes JavaScript. Remote images require explicit permission. Mermaid uses strict security.\n",
    ["development"],
  ],
  [
    "Notes/Ideas.md",
    "# Ideas\n\nA space for things that might become something.\n\n## Someday\n\n- Build a personal field guide\n- Collect the things worth remembering\n- Write a note to my future self\n",
    ["notes"],
  ],
  [
    "Notes/Reading List.md",
    "# Reading List\n\n## On the shelf\n\n- [ ] A good book about design\n- [ ] The docs I keep meaning to read\n- [x] [The configuration guide](../Docs/Getting%20Started/Configuration.md)\n",
    ["reading"],
  ],
  [
    "Notes/Todos.md",
    "# Todos\n\n## Today\n\n- [ ] Open a Markdown file\n- [ ] Try split view\n- [ ] Export a workspace backup\n",
    ["notes"],
  ],
  [
    "Knowledge Base/Productivity.md",
    "# Productivity\n\n## Less, but better\n\nKeep your notes close and your distractions far away. Focus mode hides the sidebars so your words can take center stage.\n",
    ["knowledge"],
  ],
  [
    "Knowledge Base/DevOps.md",
    "# DevOps\n\n## A small footprint\n\nOpenMDViewer runs on any static host, from a Raspberry Pi to a CDN.\n\nSee the [Docker guide](../Docs/Getting%20Started/Docker.md).\n",
    ["knowledge"],
  ],
  [
    "Knowledge Base/Tools.md",
    "# Tools\n\n## A thoughtful toolkit\n\nMarkdown, math, diagrams, code, and local search. No accounts to manage.\n",
    ["knowledge"],
  ],
  [
    "Knowledge Base/Web Development.md",
    "# Web Development\n\n## Built with care\n\nNext.js, React, TypeScript, Tailwind CSS, and shadcn/ui.\n\n## Principles\n\n- Accessible controls\n- Static deployment\n- Local-first storage\n",
    ["development"],
  ],
  [
    "Archive/Welcome.md",
    "# The Archive\n\nA home for finished thoughts. Move your documents into folders when you import them, or rename their paths from the document menu.\n",
    ["archive"],
  ],
];
export function exampleDocuments(): ReaderDocument[] {
  const date = Date.parse("2026-10-15T08:00:00Z");
  return examples.map(([path, content, tags], i) => ({
    id: `example-${i}`,
    path,
    content,
    tags,
    createdAt: date,
    updatedAt: date,
    favorite: false,
    scroll: 0,
  }));
}
