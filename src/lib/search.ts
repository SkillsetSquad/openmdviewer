import MiniSearch from "minisearch";
export interface SearchDocument {
  id: string;
  path: string;
  content: string;
  tags: string[];
  title: string;
  headings: string;
}
export class LocalSearch {
  private index = new MiniSearch<SearchDocument>({
    fields: ["title", "path", "content", "headings", "tags"],
    storeFields: ["path"],
    searchOptions: {
      boost: { title: 3, path: 2, headings: 2 },
      prefix: true,
      fuzzy: 0.2,
    },
  });
  private documents = new Map<string, SearchDocument>();
  sync(changes: SearchDocument[], removed: string[]) {
    for (const id of removed) {
      if (this.documents.has(id)) this.index.discard(id);
      this.documents.delete(id);
    }
    for (const doc of changes) {
      if (this.documents.has(doc.id)) this.index.replace(doc);
      else this.index.add(doc);
      this.documents.set(doc.id, doc);
    }
  }
  search(query: string): string[] {
    const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const filters = tokens.filter((t) => /^(tag|path|heading):/i.test(t));
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
        const text = `${d.path}\n${d.content}`.toLowerCase();
        if (!phrases.every((p) => text.includes(p))) return false;
        return filters.every((t) => {
          const [kind, ...parts] = t.split(":");
          const v = parts.join(":").toLowerCase();
          return kind.toLowerCase() === "tag"
            ? d.tags.some((tag) => tag.toLowerCase().includes(v))
            : kind.toLowerCase() === "path"
              ? d.path.toLowerCase().includes(v)
              : d.headings.toLowerCase().includes(v);
        });
      })
      .slice(0, 50);
  }
}
