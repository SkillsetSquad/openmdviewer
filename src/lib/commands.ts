import MiniSearch from "minisearch";

export const commands = [
  {
    id: "files",
    label: "Open files",
    keywords: "import markdown text upload",
    quick: true,
  },
  {
    id: "urlImport",
    label: "Open Markdown URL",
    keywords: "remote fetch raw link import http https",
  },
  {
    id: "repository",
    label: "Browse GitHub repository",
    keywords: "remote public private branch tag readme import git",
  },
  {
    id: "folder",
    label: "Open local folder",
    keywords: "import directory files",
    quick: true,
  },
  {
    id: "localFile",
    label: "Local file / Save As",
    keywords: "connected filesystem disk save open file permissions",
  },
  {
    id: "new",
    label: "Create document",
    keywords: "new note markdown",
    quick: true,
  },
  {
    id: "graph",
    label: "Show workspace graph",
    keywords: "knowledge network connections",
    quick: true,
  },
  {
    id: "collections",
    label: "Browse collections",
    keywords:
      "manual tag saved search reading list review recent favorites groups",
  },
  {
    id: "settings",
    label: "Reading settings",
    keywords: "preferences font typography theme appearance",
    quick: true,
  },
  {
    id: "focus",
    label: "Toggle focus mode",
    keywords: "distraction free reading fullscreen",
    quick: true,
  },
  {
    id: "exportZip",
    label: "Export workspace ZIP",
    keywords: "download backup archive media",
    quick: true,
  },
  {
    id: "exportSite",
    label: "Export documentation website",
    keywords: "publish static html site download navigation search",
  },
  {
    id: "workspaces",
    label: "Manage workspaces",
    keywords: "open switch workspace name description",
  },
  {
    id: "theme",
    label: "Toggle light and dark theme",
    keywords: "appearance color",
  },
  {
    id: "health",
    label: "Analyze workspace health",
    keywords: "check quality broken links report",
  },
  {
    id: "trash",
    label: "Open workspace trash",
    keywords: "restore recover deleted documents",
  },
  { id: "help", label: "Help and shortcuts", keywords: "keyboard guide" },
  {
    id: "read",
    label: "Reading view",
    keywords: "preview rendered markdown",
    document: true,
  },
  {
    id: "source",
    label: "Source view",
    keywords: "raw code editor edit markdown",
    document: true,
  },
  {
    id: "split",
    label: "Split view",
    keywords: "edit preview side by side editor",
    document: true,
  },
  {
    id: "backlinks",
    label: "Show backlinks",
    keywords: "incoming links references",
    document: true,
  },
  {
    id: "analyze",
    label: "Analyze document",
    keywords: "health check broken links report quality",
    document: true,
  },
  {
    id: "notes",
    label: "Notes and bookmarks",
    keywords: "annotations highlights passages personal reading",
    document: true,
  },
  {
    id: "properties",
    label: "Document properties",
    keywords: "metadata frontmatter statistics words owner",
    document: true,
  },
  {
    id: "history",
    label: "Version history",
    keywords: "snapshots revisions compare restore differences",
    document: true,
  },
  {
    id: "copy",
    label: "Copy Markdown",
    keywords: "clipboard source",
    document: true,
  },
  {
    id: "exportMarkdown",
    label: "Download Markdown",
    keywords: "export original source file",
    document: true,
  },
  {
    id: "exportPdf",
    label: "Print or save as PDF",
    keywords: "export portable document print",
    document: true,
  },
  {
    id: "exportDocx",
    label: "Export Word document",
    keywords: "download editable docx microsoft office",
    document: true,
  },
  {
    id: "presentation",
    label: "Toggle presentation mode",
    keywords: "slides fullscreen headings",
    document: true,
  },
] as const;
export type CommandId = (typeof commands)[number]["id"];
export type PaletteCommand = (typeof commands)[number];
const byId = new Map(commands.map((command) => [command.id, command]));
const index = new MiniSearch({
  fields: ["label", "keywords"],
  searchOptions: {
    prefix: true,
    fuzzy: 0.25,
    combineWith: "AND",
    boost: { label: 3 },
  },
});
index.addAll(commands.map((command) => ({ ...command })));

export function commandMatches(
  query: string,
  hasDocument: boolean,
): PaletteCommand[] {
  const only = query.trimStart().startsWith(">");
  const text = (only ? query.trimStart().slice(1) : query).trim();
  // Document filter syntax and quoted phrases retain their existing meaning.
  if (
    !only &&
    (/(?:^|\s)(?:tag|path|heading|status|type):/i.test(text) ||
      text.includes('"'))
  )
    return [];
  const matches = text
    ? index
        .search(text)
        .map((result) => byId.get(result.id as CommandId)!)
        .filter(Boolean)
    : commands.filter((command) => only || "quick" in command);
  return matches.filter((command) => hasDocument || !("document" in command));
}
