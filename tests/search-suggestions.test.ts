import { describe, expect, it } from "vitest";
import { LocalSearch } from "../src/lib/search";
import { filterSuggestions } from "../src/lib/search-suggestions";
const documents = [
  {
    id: "one",
    path: "Team Docs/Runbooks/Start.md",
    tags: ["operations", "operations"],
    content:
      '---\nstatus: approved\ntags: ["opsec"]\n---\n# Local Browser\n\n## Authentication guide\n\nLocal words.',
  },
  {
    id: "two",
    path: "Team Docs/Guide.mdx",
    tags: ["operations"],
    content:
      "---\nstatus: draft\n---\n# Local Browser\n\n## Authentication guide",
  },
  { id: "three", path: "Notes.txt", tags: ["other"], content: "Plain text." },
];
describe("worker filter suggestions", () => {
  it("uses real tags, ancestor folders, headings, statuses and file types with per-document counts", () => {
    const search = new LocalSearch();
    search.sync(documents, []);
    expect(search.suggest("tag:op")).toEqual([
      {
        query: 'tag:"operations"',
        filter: "tag",
        value: "operations",
        count: 2,
      },
      { query: 'tag:"opsec"', filter: "tag", value: "opsec", count: 1 },
    ]);
    expect(search.suggest("path:team")).toEqual([
      {
        query: 'path:"Team Docs/"',
        filter: "path",
        value: "Team Docs/",
        count: 2,
      },
      {
        query: 'path:"Team Docs/Runbooks/"',
        filter: "path",
        value: "Team Docs/Runbooks/",
        count: 1,
      },
    ]);
    expect(search.suggest('local heading:"Auth')[0]).toEqual({
      query: 'local heading:"Authentication guide"',
      filter: "heading",
      value: "Authentication guide",
      count: 2,
    });
    expect(search.suggest("status:a")[0].value).toBe("approved");
    expect(
      search.suggest("type:").map((item) => [item.value, item.count]),
    ).toEqual([
      ["markdown", 2],
      ["text", 1],
    ]);
    for (const kind of ["tag", "path", "heading", "status", "type"])
      for (const suggestion of search.suggest(`${kind}:`))
        expect(search.find(suggestion.query).total).toBeGreaterThanOrEqual(
          suggestion.count,
        );
  });
  it("removes stale values on incremental edits/removals and avoids commands or ordinary quoted phrases", () => {
    const search = new LocalSearch();
    search.sync(documents, []);
    search.sync(
      [{ ...documents[0], tags: ["fresh"], content: "# Changed" }],
      ["two"],
    );
    expect(search.suggest("tag:op")).toEqual([]);
    expect(search.suggest("heading:auth")).toEqual([]);
    for (const query of [
      "> tag:",
      '"ordinary tag:op',
      'tag:"operations"',
      "just words",
      "x".repeat(513),
    ])
      expect(search.suggest(query)).toEqual([]);
    expect(search.suggest("tag:fr")[0].value).toBe("fresh");
  });
  it("bounds results and rejects metadata that cannot be represented faithfully by the query syntax", () => {
    const suggestions = filterSuggestions("tag:", [
      {
        path: "A.md",
        headings: "# Heading",
        status: "draft",
        tags: [
          'bad"value',
          "bad\nvalue",
          "x".repeat(201),
          ...Array.from({ length: 30 }, (_, index) => `valid-${index}`),
        ],
      },
    ]);
    expect(suggestions).toHaveLength(8);
    expect(suggestions.every((item) => item.value.startsWith("valid-"))).toBe(
      true,
    );
    expect(
      filterSuggestions("x".repeat(505) + " tag:", [
        { path: "A.md", headings: "", status: "", tags: ["Too long query"] },
      ]),
    ).toEqual([]);
  });
});
