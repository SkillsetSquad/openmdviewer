export interface CodeMeta {
  filename: string;
  startLine: number;
  lineNumbers: boolean;
  ranges: { from: number; to: number }[];
}
export function parseCodeMeta(source = ""): CodeMeta {
  const result: CodeMeta = {
    filename: "",
    startLine: 1,
    lineNumbers: true,
    ranges: [],
  };
  const meta = source.slice(0, 1000);
  for (const match of meta.matchAll(
    /(?:^|\s)(title|filename|startLine|lineNumbers)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi,
  )) {
    const value = match[2] ?? match[3] ?? match[4];
    switch (match[1].toLowerCase()) {
      case "title":
      case "filename":
        result.filename = value
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .slice(0, 200);
        break;
      case "startline":
        if (/^\d{1,7}$/.test(value))
          result.startLine = Math.max(1, Math.min(1000000, Number(value)));
        break;
      case "linenumbers":
        result.lineNumbers = !/^(false|off|0)$/i.test(value);
        break;
    }
  }
  for (const part of (meta.match(/\{([\d,\s-]+)\}/)?.[1] || "")
    .split(",")
    .slice(0, 64)) {
    const match = /^\s*(\d{1,7})(?:\s*-\s*(\d{1,7}))?\s*$/.exec(part);
    if (!match) continue;
    const from = Number(match[1]),
      to = Number(match[2] || match[1]);
    if (from >= 1 && from <= to && to <= 1000000)
      result.ranges.push({ from, to });
  }
  return result;
}
const extensions: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  jsx: "jsx",
  tsx: "tsx",
  python: "py",
  bash: "sh",
  shell: "sh",
  shellscript: "sh",
  powershell: "ps1",
  ruby: "rb",
  rust: "rs",
  csharp: "cs",
  cpp: "cpp",
  json: "json",
  yaml: "yml",
  markdown: "md",
  text: "txt",
  plaintext: "txt",
  auto: "txt",
  html: "html",
  css: "css",
  sql: "sql",
  go: "go",
  java: "java",
  diff: "diff",
  patch: "diff",
};
export function codeFileName(language: string, filename = "") {
  if (filename) {
    const base = filename
      .replace(/\\/g, "/")
      .split("/")
      .pop()!
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
      .slice(0, 200);
    if (base && base !== "." && base !== "..") return base;
  }
  const lang = language.replace(/^diff-/, "").toLowerCase();
  return `snippet.${(Object.hasOwn(extensions, lang) ? extensions[lang] : "") || (/^[a-z\d]{1,12}$/.test(lang) ? lang : "txt")}`;
}
export interface CodeMatch {
  start: number;
  end: number;
  line: number;
}
export function findCodeMatches(
  code: string,
  query: string,
  caseSensitive = false,
) {
  const matches: CodeMatch[] = [];
  if (!query) return { matches, truncated: false };
  const escaped = query.slice(0, 256).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(escaped, caseSensitive ? "gu" : "giu");
  let line = 0,
    cursor = 0;
  for (const match of code.matchAll(expression)) {
    if (matches.length === 10000) return { matches, truncated: true };
    const start = match.index;
    while (cursor < start) if (code[cursor++] === "\n") line++;
    matches.push({ start, end: start + match[0].length, line });
  }
  return { matches, truncated: false };
}
export function diffLineKind(line: string, language: string) {
  if (!/^(diff|patch)(-|$)/i.test(language)) return "";
  if (/^(\+\+\+|---|@@|diff |index )/.test(line)) return "header";
  return line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : "";
}

export function codeLanguage(language: string, filename: string) {
  if (language && language !== "auto") return language.replace(/^diff-/i, "");
  if (
    /^(Dockerfile|Containerfile)$/i.test(
      filename.replace(/\\/g, "/").split("/").pop() || "",
    )
  )
    return "dockerfile";
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  const known: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    py: "python",
    sh: "bash",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    html: "html",
    css: "css",
    rs: "rust",
    go: "go",
    java: "java",
    sql: "sql",
    rb: "ruby",
    cs: "csharp",
    ps1: "powershell",
    dockerfile: "dockerfile",
    toml: "toml",
    ini: "ini",
    diff: "diff",
    patch: "diff",
  };
  return Object.hasOwn(known, extension) ? known[extension] : "text";
}
