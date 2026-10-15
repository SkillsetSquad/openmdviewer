import { parseDocument } from "yaml";
import { parse as parseToml } from "smol-toml";
export type MetadataValue =
  | string
  | number
  | boolean
  | null
  | MetadataValue[]
  | { [key: string]: MetadataValue };
export interface Frontmatter {
  format: "yaml" | "toml" | "json" | null;
  metadata: Record<string, MetadataValue>;
  body: string;
  lineOffset: number;
  error?: string;
}
function plain(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): MetadataValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 16384);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date)
    return Number.isFinite(value.valueOf()) ? value.toISOString() : null;
  if (depth > 8) return "[Metadata nesting limit]";
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular metadata]";
    seen.add(value);
    if (Array.isArray(value))
      return value.slice(0, 200).map((v) => plain(v, depth + 1, seen));
    const result: Record<string, MetadataValue> = Object.create(null);
    for (const [key, item] of Object.entries(value).slice(0, 200))
      if (!["__proto__", "constructor", "prototype"].includes(key))
        result[key.slice(0, 120)] = plain(item, depth + 1, seen);
    return result;
  }
  return null;
}
export function frontmatter(content: string): Frontmatter {
  const first = /^\uFEFF?(---(?:yaml|yml|json)?|\+\+\+|;;;)\s*\r?\n/i.exec(
    content,
  );
  if (!first)
    return { format: null, metadata: {}, body: content, lineOffset: 0 };
  const marker = first[1].toLowerCase();
  const closing = marker.startsWith("---") ? "---" : marker;
  const format =
    marker === "+++"
      ? "toml"
      : marker === ";;;" || marker === "---json"
        ? "json"
        : "yaml";
  const window = content.slice(first[0].length, first[0].length + 131072);
  const end = new RegExp(
    `^${closing.replace(/[+]/g, "\\+")}[ \\t]*\\r?(?:\\n|$)`,
    "m",
  ).exec(window);
  if (!end)
    return {
      format,
      metadata: {},
      body: content,
      lineOffset: 0,
      error: "Frontmatter has no closing delimiter within 128 KB.",
    };
  const headerEnd = first[0].length + end.index + end[0].length;
  const source = window.slice(0, end.index);
  const result: Frontmatter = {
    format,
    metadata: {},
    body: content.slice(headerEnd),
    lineOffset: (content.slice(0, headerEnd).match(/\n/g) || []).length,
  };
  try {
    let value: unknown;
    if (format === "json") value = JSON.parse(source);
    else if (format === "toml") value = parseToml(source);
    else {
      const document = parseDocument(source, { uniqueKeys: true });
      if (document.errors.length) throw document.errors[0];
      value = document.toJS({ maxAliasCount: 50 });
    }
    if (
      value !== null &&
      (!value || typeof value !== "object" || Array.isArray(value))
    )
      throw new Error("Frontmatter must contain key/value fields.");
    result.metadata = (value === null ? {} : plain(value)) as Record<
      string,
      MetadataValue
    >;
  } catch (error) {
    result.error =
      error instanceof Error
        ? error.message.split("\n").slice(0, 2).join(" ")
        : "Invalid frontmatter.";
  }
  return result;
}
export function metadataString(
  metadata: Record<string, MetadataValue>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" || typeof value === "number")
      return String(value);
  }
  return "";
}
export function metadataTags(
  metadata: Record<string, MetadataValue>,
): string[] {
  const values = [metadata.tags, metadata.categories].flatMap((value) =>
    Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [],
  );
  return [
    ...new Set(
      values
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);
}
