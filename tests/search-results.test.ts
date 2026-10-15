import { it, expect } from "vitest";
import { refreshSearchHit } from "../src/lib/search-navigation";
import { LocalSearch } from "../src/lib/search";
import {
  defaultSearchOptions,
  literalMatches,
  searchExcerpt,
  highlightRanges,
} from "../src/lib/search-results";
const literal = { ...defaultSearchOptions, literal: true };
function index(content: string, path = "Docs/Guide.md") {
  const search = new LocalSearch();
  search.sync([{ id: "a", path, content, tags: ["local"] }], []);
  return search;
}
it("returns actual fuzzy terms, metadata, headings and source locations from the worker model", () => {
  const content =
    "---\ntitle: Platform guide\nstatus: approved\ntags: [operations]\n---\n# Guide\n\n## Setup\n\nConfiguration remains local.";
  const page = index(content).find("configuraton");
  const hit = page.hits[0];
  expect(page.total).toBe(1);
  expect(hit).toMatchObject({
    title: "Platform guide",
    status: "approved",
    fuzzy: true,
    heading: { text: "Setup" },
    location: { line: 10, needle: "Configuration", sourceOnly: false },
  });
  expect(hit.tags).toEqual(["local", "operations"]);
  expect(hit.terms).toContain("configuration");
  expect(
    content.slice(
      hit.location!.offset,
      hit.location!.offset + hit.location!.needle.length,
    ),
  ).toBe("Configuration");
});
it("finds and previews real matches after the first fifty thousand characters", () => {
  const content =
    "# Large\n\n" +
    "Background context. ".repeat(3000) +
    "\n\n## Target\n\nDistantNeedle is here.";
  const hit = index(content).find("DistantNeedle").hits[0];
  expect(hit.location!.offset).toBeGreaterThan(50000);
  expect(hit.excerpt).toContain("DistantNeedle");
  expect(hit.heading?.text).toBe("Target");
  expect(hit.excerpt.length).toBeLessThanOrEqual(222);
});
it("supports literal case matching and Unicode whole-word boundaries", () => {
  const search = new LocalSearch();
  search.sync(
    [
      { id: "a", path: "A.md", content: "# A\n\nCatapult.", tags: [] },
      { id: "b", path: "B.md", content: "# B\n\ncat.", tags: [] },
      { id: "c", path: "C.md", content: "# C\n\nCat.", tags: [] },
    ],
    [],
  );
  expect(
    search
      .find("Cat", { ...literal, caseSensitive: true })
      .hits.map((h) => h.id),
  ).toEqual(["a", "c"]);
  expect(
    search
      .find("Cat", { ...literal, caseSensitive: true, wholeWord: true })
      .hits.map((h) => h.id),
  ).toEqual(["c"]);
  expect(
    search.find("cat", { ...literal, wholeWord: true }).hits.map((h) => h.id),
  ).toEqual(["b", "c"]);
  expect(
    literalMatches("αcatβ cat_thing cat 𐐀cat𐐀", "cat", {
      caseSensitive: false,
      wholeWord: true,
    }),
  ).toHaveLength(1);
});
it("treats regular-expression metacharacters as literal text and preserves Unicode offsets", () => {
  const source = "İ before (a+)+$ and [x].";
  expect(literalMatches(source, "(a+)+$", literal)[0]).toEqual({
    start: source.indexOf("(a+)+$"),
    end: source.indexOf("(a+)+$") + 6,
  });
  expect(literalMatches(source, "[x]", literal)).toHaveLength(1);
  expect(
    highlightRanges("local browser", ["local", "local browser"], literal),
  ).toEqual([{ start: 0, end: 13 }]);
});
it("combines quoted filters and exact phrases without losing titles or source-line offsets", () => {
  const content =
    "---\nstatus: approved\ntags: [operations]\n---\n# Guide\n\n## Install\n\nUse the local browser.";
  const hit = index(content, "Docs/Getting Started/Guide.md").find(
    'tag:operations path:"Docs/Getting Started" heading:"Install" status:approved "local browser"',
  ).hits[0];
  expect(hit.location).toMatchObject({ line: 9, needle: "local browser" });
  expect(hit.heading?.text).toBe("Install");
});
it("marks code, math, raw HTML and frontmatter matches as source locations", () => {
  const content =
    '---\nowner: MetaNeedle\n---\n# Test\n\n```js\nconst CodeNeedle = 1;\n```\n\n$$\nMathNeedle\n$$\n\n<div title="HtmlNeedle">Body</div>';
  const search = index(content);
  for (const query of ["MetaNeedle", "CodeNeedle", "MathNeedle", "HtmlNeedle"])
    expect(
      search.find(query, literal).hits[0].location?.sourceOnly,
      query,
    ).toBe(true);
});
it("paginates all matching documents with an exact count and no repeated IDs", () => {
  const search = new LocalSearch();
  search.sync(
    Array.from({ length: 125 }, (_, n) => ({
      id: String(n),
      path: `Docs/${n}.md`,
      content: `# Document ${n}\n\npageMarker`,
      tags: [],
    })),
    [],
  );
  const pages = [0, 50, 100].map((offset) =>
    search.find("pageMarker", defaultSearchOptions, offset),
  );
  expect(pages.map((p) => p.total)).toEqual([125, 125, 125]);
  expect(pages.map((p) => p.hits.length)).toEqual([50, 50, 25]);
  expect(new Set(pages.flatMap((p) => p.hits.map((h) => h.id))).size).toBe(125);
  expect(search.find("pageMarker", defaultSearchOptions, 99999).offset).toBe(
    100,
  );
});
it("refreshes source locations and totals after document replacement and removal", () => {
  const search = index("# Old\n\nOldNeedle");
  search.sync(
    [
      {
        id: "a",
        path: "Renamed.md",
        content: "# Updated\n\n\nNewNeedle",
        tags: ["new"],
      },
    ],
    [],
  );
  expect(search.find("OldNeedle", literal).total).toBe(0);
  expect(search.find("NewNeedle", literal).hits[0]).toMatchObject({
    path: "Renamed.md",
    location: { line: 4 },
  });
  search.sync([], ["a"]);
  expect(search.find("", literal).total).toBe(0);
});
it("keeps long literal matches highlighted within a bounded excerpt and reports overlong queries", () => {
  const term = "$".repeat(500),
    content = "# Long\n\n" + term;
  const search = index(content);
  const hit = search.find(term, literal).hits[0];
  expect(hit.excerptRanges[0].end - hit.excerptRanges[0].start).toBeGreaterThan(
    100,
  );
  expect(hit.excerpt.length).toBeLessThanOrEqual(222);
  expect(search.find("x".repeat(513), literal).error).toContain("512");
  const excerpt = searchExcerpt("before\r\nNeedle after", 8, 6);
  expect(
    excerpt.excerpt.slice(
      excerpt.excerptRanges[0].start,
      excerpt.excerptRanges[0].end,
    ),
  ).toBe("Needle");
});
it("returns the actual rendered heading for heading-only filters with emoji expansion", () => {
  const hit = index("# Guide\n\n## Launch :rocket:\n\nBody.").find(
    'heading:"Launch 🚀"',
  ).hits[0];
  expect(hit.heading?.text).toBe("Launch 🚀");
  expect(hit.excerpt).toBe("Launch 🚀");
  expect(hit.location).toBeUndefined();
});

it("distinguishes visible prose from inline HTML attributes and math on the same source line", () => {
  const search = index(
    '# Inline\n\nReadable <em title="HtmlAttrNeedle">visible</em> and $MathInlineNeedle$ plus ProseNeedle.',
  );
  expect(search.find("ProseNeedle", literal).hits[0].location?.sourceOnly).toBe(
    false,
  );
  expect(search.find("visible", literal).hits[0].location?.sourceOnly).toBe(
    false,
  );
  expect(
    search.find("HtmlAttrNeedle", literal).hits[0].location?.sourceOnly,
  ).toBe(true);
  expect(
    search.find("MathInlineNeedle", literal).hits[0].location?.sourceOnly,
  ).toBe(true);
});

it("never splits Unicode surrogate pairs at either excerpt boundary", () => {
  const source = "😀".repeat(30) + "xNeedle" + "😀".repeat(120),
    position = source.indexOf("Needle");
  const { excerpt, excerptRanges } = searchExcerpt(source, position, 6);
  expect(excerpt).toBe(excerpt.toWellFormed());
  expect(excerpt.slice(excerptRanges[0].start, excerptRanges[0].end)).toBe(
    "Needle",
  );
});

it("prioritizes relevant tags without inventing a body location for tag-only matches", () => {
  const search = new LocalSearch();
  search.sync(
    [
      {
        id: "a",
        path: "Tagged.md",
        content: "# Plain\n\nContent.",
        tags: [
          ...Array.from({ length: 15 }, (_, n) => `Tag${n}`),
          "LastNeedle",
        ],
      },
    ],
    [],
  );
  const hit = search.find("tag:LastNeedle").hits[0];
  expect(hit.tags[0]).toBe("LastNeedle");
  expect(hit.tags.length).toBe(10);
  expect(hit.location).toBeUndefined();
});

it("rejects changed source text and refreshes the actual line after a same-length newline edit", () => {
  const source = "# Guide\n\nThe Needle.",
    hit = index(source).find("Needle", literal).hits[0];
  expect(refreshSearchHit(hit, source.replace("Needle", "Other!"))).toBeNull();
  expect(
    refreshSearchHit(hit, source.replace("# Guide", "#\nGuide"))?.location
      ?.line,
  ).toBe(4);
});
it("validates heading text as well as IDs and refreshes heading-only locations", () => {
  const source = "# Guide\n\n## Launch :rocket:\n\nBody.",
    hit = index(source).find('heading:"Launch 🚀"').hits[0];
  expect(
    refreshSearchHit(hit, source.replace(":rocket:", ":stop_sign:")),
  ).toBeNull();
  expect(refreshSearchHit(hit, "# Intro\n\n" + source)?.heading?.line).toBe(
    hit.heading!.line + 2,
  );
});

it("does not highlight a whole-word match invented by clipping the beginning of a source word", () => {
  const content = "hotdog" + " ".repeat(37) + "cat dog";
  const position = content.indexOf("cat");
  const { excerptRanges } = searchExcerpt(
    content,
    position,
    3,
    0,
    ["cat", "dog"],
    { ...literal, wholeWord: true },
  );
  expect(
    excerptRanges.some((range) => range.start === 1 && range.end === 4),
  ).toBe(false);
  expect(excerptRanges.some((range) => range.end - range.start === 3)).toBe(
    true,
  );
});
