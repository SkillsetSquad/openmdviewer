import { filterSuggestions } from "./search-suggestions";
import MiniSearch from "minisearch";
import {
  defaultSearchOptions,
  literalMatches,
  parseSearchQuery,
  searchExcerpt,
  unicodePrefix,
  type SearchOptions,
  type SearchPage,
  type SearchHit,
} from "./search-results";
import { markdownModel, type MarkdownModel } from "./markdown-model";
import { workspaceNavigation } from "./references";
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
  private models = new Map<string, MarkdownModel>();
  sync(changes: SearchDocument[], removed: string[]) {
    for (const id of removed) {
      if (this.documents.has(id)) this.index.discard(id);
      this.documents.delete(id);
      this.models.delete(id);
    }
    for (const source of changes) {
      const model = markdownModel(source.content);
      this.models.set(source.id, model);
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
  navigation() {
    return workspaceNavigation([...this.documents.values()], this.models);
  }
  suggest(query: string) {
    return filterSuggestions(query, this.documents.values());
  }
  search(query: string): string[] {
    return this.find(query).hits.map((hit) => hit.id);
  }
  find(
    query: string,
    options: SearchOptions = defaultSearchOptions,
    offset = 0,
  ): SearchPage {
    if (query.length > 512)
      return {
        hits: [],
        total: 0,
        offset: 0,
        error:
          "Search supports up to 512 characters. Shorten this query to search.",
      };
    const { filters, phrases, words, terms } = parseSearchQuery(query);
    const literal =
      options.literal || options.caseSensitive || options.wholeWord;
    const indexed =
      !literal && words.length
        ? this.index.search(words.join(" "), { combineWith: "AND" })
        : null;
    const matchedTerms = new Map(
      indexed?.map((result) => [
        String(result.id),
        Object.keys(result.match),
      ]) || [],
    );
    const candidates = indexed
      ? indexed.map((result) => String(result.id))
      : [...this.documents.keys()];
    const matches = candidates.filter((id) => {
      const d = this.documents.get(id)!;
      const text = `${d.title}\n${d.path}\n${d.content}\n${d.headings}\n${d.tags.join(" ")}\n${d.metadata}`;
      if (
        !phrases.every(
          (phrase) => literalMatches(text, phrase, options, 1).length,
        )
      )
        return false;
      if (
        literal &&
        !words.every((term) => literalMatches(text, term, options, 1).length)
      )
        return false;
      return filters.every((token) => {
        const [key, ...parts] = token.split(":");
        const value = parts.join(":").replace(/^"|"$/g, "").toLowerCase();
        switch (key.toLowerCase()) {
          case "tag":
            return d.tags.some((tag) => tag.toLowerCase().includes(value));
          case "path":
            return d.path.toLowerCase().includes(value);
          case "heading":
            return d.headings.toLowerCase().includes(value);
          case "status":
            return d.status.toLowerCase() === value;
          case "type":
            return value === "markdown"
              ? /\.(md|markdown|mdown|mkd|mdx)$/i.test(d.path)
              : d.path
                  .toLowerCase()
                  .endsWith("." + (value === "text" ? "txt" : value));
          default:
            return true;
        }
      });
    });
    const start = Math.min(
      Math.max(0, Math.floor((Number.isFinite(offset) ? offset : 0) / 50) * 50),
      Math.max(0, Math.floor((matches.length - 1) / 50) * 50),
    );
    const hits: SearchHit[] = matches.slice(start, start + 50).map((id) => {
      const d = this.documents.get(id)!,
        model = this.models.get(id)!;
      const actualTerms = (matchedTerms.get(id) || [])
        .slice(0, 32)
        .map((term) => unicodePrefix(term, 512));
      const needles = [...new Set([...terms, ...actualTerms])];
      let position = -1,
        needle = "";
      for (const term of needles) {
        const match = literalMatches(d.content, term, options, 1)[0];
        if (match && (position < 0 || match.start < position)) {
          position = match.start;
          needle = d.content.slice(match.start, match.end);
          break;
        }
      }
      const line =
        position >= 0
          ? d.content.slice(0, position).split(/\r\n?|\n/).length
          : undefined;
      const headingFilter = filters
        .find((token) => /^heading:/i.test(token))
        ?.slice(8)
        .replace(/^"|"$/g, "");
      const heading = line
        ? model.headings.filter((h) => h.line <= line).at(-1)
        : model.headings.find(
            (h) =>
              needles.some(
                (term) => literalMatches(h.text, term, options, 1).length,
              ) ||
              (headingFilter &&
                h.text.toLowerCase().includes(headingFilter.toLowerCase())),
          );
      const bodyStart = d.content.length - model.frontmatter.body.length;
      const tagFilters = filters
        .filter((token) => /^tag:/i.test(token))
        .map((token) => token.slice(4).replace(/^"|"$/g, "").toLowerCase());
      const relevantTags = d.tags.filter(
        (tag) =>
          tagFilters.some((value) => tag.toLowerCase().includes(value)) ||
          needles.some((term) => literalMatches(tag, term, options, 1).length),
      );
      const relevantSet = new Set(relevantTags);
      const headingOptions = {
        ...options,
        caseSensitive: headingFilter ? false : options.caseSensitive,
        wholeWord: headingFilter ? false : options.wholeWord,
      };
      const headingNeedles = needles.length
        ? needles
        : headingFilter
          ? [headingFilter]
          : [];
      const headingMatch =
        position < 0 && heading
          ? headingNeedles
              .flatMap((term) =>
                literalMatches(heading.text, term, headingOptions, 1),
              )
              .sort((a, b) => a.start - b.start)[0]
          : undefined;
      return {
        id,
        title: d.title,
        path: d.path,
        tags: [
          ...relevantTags,
          ...d.tags.filter((tag) => !relevantSet.has(tag)),
        ].slice(0, 10),
        status: d.status,
        ...(position < 0 && heading
          ? searchExcerpt(
              heading.text,
              headingMatch?.start ?? -1,
              headingMatch ? headingMatch.end - headingMatch.start : 0,
              0,
              headingNeedles,
              headingOptions,
            )
          : searchExcerpt(
              d.content,
              position,
              needle.length,
              bodyStart,
              needles,
              options,
            )),
        terms: [
          ...new Set([
            ...needles,
            ...filters.map((token) =>
              token.slice(token.indexOf(":") + 1).replace(/^"|"$/g, ""),
            ),
          ]),
        ].slice(0, 64),
        fuzzy:
          !literal &&
          !!words.length &&
          !words.every(
            (term) =>
              literalMatches(
                `${d.title}\n${d.path}\n${d.content}\n${d.metadata}`,
                term,
                options,
                1,
              ).length,
          ),
        heading,
        ...(line
          ? {
              location: {
                line,
                offset: position,
                needle,
                sourceOnly:
                  position < bodyStart ||
                  model.sourceBlocks.some(
                    (block) =>
                      position < block.endOffset &&
                      position + needle.length > block.startOffset,
                  ),
              },
            }
          : {}),
      };
    });
    return { hits, total: matches.length, offset: start };
  }
}
