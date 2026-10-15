import MiniSearch from "minisearch";
import { markdownModel } from "./markdown-model";
import { metadataString, metadataTags } from "./frontmatter";
export interface SearchDocument {
  id: string;
  path: string;
  content: string;
  tags: string[];
  title?: string;
  headings?: string;
}
interface IndexedDocument extends SearchDocument {
  title: string;
  headings: string;
  metadata: string;
  status: string;
}
export class LocalSearch {
  private index = new MiniSearch<IndexedDocument>({
    fields: ["title", "path", "content", "headings", "tags", "metadata"],
    storeFields: ["path"],
    searchOptions: {
      boost: { title: 3, path: 2, headings: 2 },
      prefix: true,
      fuzzy: 0.2,
    },
  });
  private documents = new Map<string, IndexedDocument>();
  sync(changes: SearchDocument[], removed: string[]) {
    for (const id of removed) {
      if (this.documents.has(id)) this.index.discard(id);
      this.documents.delete(id);
    }
    for (const source of changes) {
      const model = markdownModel(source.content);
      const meta = model.frontmatter.metadata;
      const doc: IndexedDocument = {
        ...source,
        title:
          metadataString(meta, "title") ||
          source.title ||
          model.headings.find((h) => h.depth === 1)?.text ||
          source.path,
        headings:
          source.headings || model.headings.map((h) => h.text).join("\n"),
        tags: [...new Set([...source.tags, ...metadataTags(meta)])],
        metadata: JSON.stringify(meta),
        status: metadataString(meta, "status"),
      };
      if (this.documents.has(doc.id)) this.index.replace(doc);
      else this.index.add(doc);
      this.documents.set(doc.id, doc);
    }
  }
  search(query: string): string[] {
    const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const filters = tokens.filter((t) =>
      /^(tag|path|heading|status|type):/i.test(t),
    );
    const phrases = tokens
      .filter((t) => t.startsWith('"'))
      .map((t) => t.replace(/^"|"$/g, "").toLowerCase());
    const words = tokens
      .filter((t) => !filters.includes(t) && !t.startsWith('"'))
      .join(" ");
    const candidates = words
      ? this.index
          .search(words, { combineWith: "AND" })
          .map((r) => r.id as string)
      : [...this.documents.keys()];
    return candidates
      .filter((id) => {
        const d = this.documents.get(id)!;
        const text = `${d.path}\n${d.content}\n${d.metadata}`.toLowerCase();
        if (!phrases.every((p) => text.includes(p))) return false;
        return filters.every((t) => {
          const [key, ...parts] = t.split(":");
          const v = parts.join(":").replace(/^"|"$/g, "").toLowerCase();
          if (key.toLowerCase() === "tag")
            return d.tags.some((tag) => tag.toLowerCase().includes(v));
          if (key.toLowerCase() === "path")
            return d.path.toLowerCase().includes(v);
          if (key.toLowerCase() === "heading")
            return d.headings.toLowerCase().includes(v);
          if (key.toLowerCase() === "status")
            return d.status.toLowerCase() === v;
          if (key.toLowerCase() === "type")
            return v === "markdown"
              ? /\.(md|markdown|mdown|mkd|mdx)$/i.test(d.path)
              : d.path.toLowerCase().endsWith("." + (v === "text" ? "txt" : v));
          return true;
        });
      })
      .slice(0, 50);
  }
}
