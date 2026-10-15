import { describe, expect, it } from "vitest";
import { LocalSearch } from "../src/lib/search";
import { findRegex } from "../src/lib/regex-search";
import { defaultSearchOptions } from "../src/lib/search-results";
import { refreshSearchHit } from "../src/lib/search-navigation";
import {
  searchHistoryEntry,
  searchOptionsLabel,
} from "../src/lib/search-history";
const options = { ...defaultSearchOptions, regex: true };
const docs = [
  {
    id: "one",
    path: "Guide.md",
    tags: ["api"],
    content:
      "---\ntitle: Release 42\nstatus: approved\n---\n# Releases\n\nID-42 and ID-420, id-42.\n\nfoo foo\n\nalpha\nbeta\n\n```js\nconst secret77 = 1;\n```",
  },
  {
    id: "two",
    path: "Other.md",
    tags: [],
    content: "# Other\n\nID-7 and barfoo.\n\nwordword",
  },
];
function index(documents = docs) {
  const search = new LocalSearch();
  search.sync(documents, []);
  return search;
}
describe("isolated native regex search", () => {
  it("supports grouping, lookaround, backreferences, Unicode and line anchors with precise offsets", () => {
    const prepared = index().regexDocuments();
    expect(findRegex(prepared, "(?<=ID-)42(?!0)", options).total).toBe(1);
    const hit = findRegex(prepared, "(?<=ID-)42(?!0)", {
      ...options,
      caseSensitive: true,
    }).hits[0];
    expect(
      hit.excerptRanges
        .map((range) => hit.excerpt.slice(range.start, range.end))
        .filter(Boolean),
    ).toContain("42");
    expect(
      hit.excerptRanges.some(
        (range) => hit.excerpt.slice(range.start, range.end) === "420",
      ),
    ).toBe(false);
    expect(hit.location?.needle).toBe("42");
    expect(
      findRegex(prepared, String.raw`\b(\w+)\s+\1\b`, options).hits[0].location
        ?.needle,
    ).toBe("foo foo");
    expect(findRegex(prepared, "^alpha$", options).hits[0].location?.line).toBe(
      11,
    );
    expect(
      findRegex(prepared, String.raw`alpha\s+beta`, options).hits[0].location
        ?.needle,
    ).toBe("alpha\nbeta");
    expect(findRegex(prepared, String.raw`\p{L}{3}\p{N}+`, options).total).toBe(
      1,
    );
  });
  it("uses actual match ranges in separate title, path and heading fields without guessing highlights", () => {
    const prepared = index().regexDocuments();
    const title = findRegex(prepared, "(?<=Release )42", options).hits[0];
    expect(title.titleRanges).toEqual([{ start: 8, end: 10 }]);
    expect(title.pathRanges).toEqual([]);
    expect(title.terms).toEqual([]);
    expect(
      findRegex(prepared, "Guide(?=\\.md)", options).hits[0].pathRanges,
    ).toEqual([{ start: 0, end: 5 }]);
    expect(
      findRegex(prepared, "approved", options).hits[0].location?.sourceOnly,
    ).toBe(true);
    expect(
      findRegex(prepared, "secret\\d+", options).hits[0].location?.sourceOnly,
    ).toBe(true);
  });
  it("retains Unicode word boundaries and case controls and treats filter-looking text as pattern text", () => {
    const prepared = index().regexDocuments();
    expect(
      findRegex(prepared, "ID-42", {
        ...options,
        wholeWord: true,
      }).hits[0].excerptRanges.map((range) =>
        findRegex(prepared, "ID-42", {
          ...options,
          wholeWord: true,
        }).hits[0].excerpt.slice(range.start, range.end),
      ),
    ).not.toContain("ID-420");
    expect(findRegex(prepared, "BARfoo", options).total).toBe(1);
    expect(
      findRegex(prepared, "BARfoo", { ...options, caseSensitive: true }).total,
    ).toBe(0);
    expect(findRegex(prepared, "tag:api", options).total).toBe(0);
    expect(
      findRegex(
        index([
          { id: "u", path: "U.md", tags: [], content: "# U\n\nword𐐀 word" },
        ]).regexDocuments(),
        "word",
        { ...options, wholeWord: true },
      ).hits[0].location?.offset,
    ).toBe(12);
  });
  it("reports invalid/oversized patterns and handles empty-width matches without loops or fabricated text", () => {
    const prepared = index().regexDocuments();
    expect(findRegex(prepared, "[", options).error).toMatch(
      /Invalid regular expression/,
    );
    expect(findRegex(prepared, "x".repeat(513), options).error).toMatch(/512/);
    const hit = findRegex(prepared, "(?=ID-42)", options).hits[0];
    expect(hit.location).toMatchObject({
      line: 7,
      needle: "",
      sourceOnly: true,
    });
    expect(refreshSearchHit(hit, docs[0].content)).not.toBeNull();
    expect(
      refreshSearchHit(hit, docs[0].content.replace("ID-42", "Changed")),
    ).toBeNull();
    expect(findRegex(prepared, "$", options).total).toBe(2);
  });
  it("pages every matching document and updates the prepared corpus after edits/removals", () => {
    const search = index(
      Array.from({ length: 125 }, (_, i) => ({
        id: String(i),
        path: `Document-${i}.md`,
        tags: [],
        content: `# Document ${i}\n\nTicket-${i}`,
      })),
    );
    const page = findRegex(
      search.regexDocuments(),
      "Ticket-\\d+",
      options,
      100,
    );
    expect(page).toMatchObject({ total: 125, offset: 100 });
    expect(page.hits).toHaveLength(25);
    search.sync(
      [{ id: "0", path: "New.md", tags: [], content: "# Changed" }],
      ["1"],
    );
    expect(
      findRegex(search.regexDocuments(), "Ticket-\\d+", options).total,
    ).toBe(123);
  });
  it("bounds previews and long navigation payloads while preserving original source", () => {
    const content = "# Large\n\n" + "a".repeat(60000);
    const prepared = index([
      { id: "long", path: "Long.md", tags: [], content },
    ]).regexDocuments();
    const hit = findRegex(prepared, "a{50000}", options).hits[0];
    expect(hit.excerpt.length).toBeLessThan(224);
    expect(hit.location?.needle.length).toBe(4096);
    expect(hit.location?.sourceOnly).toBe(true);
    expect(prepared[0].content).toBe(content);
  });
  it("preserves regex pattern whitespace and mode in history without changing legacy query keys", () => {
    const entry = searchHistoryEntry(" foo ", options)!;
    expect(entry.query).toBe(" foo ");
    expect(entry.options).toMatchObject({ regex: true, literal: false });
    expect(searchOptionsLabel(entry.options)).toBe("Regex");
    expect(searchHistoryEntry("foo", defaultSearchOptions)?.key).toBe(
      JSON.stringify(["foo", false, false, false]),
    );
    expect(entry.key).not.toBe(searchHistoryEntry("foo", options)?.key);
  });
});
