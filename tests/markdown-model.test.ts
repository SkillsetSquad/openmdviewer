import { describe, expect, it } from "vitest";
import { frontmatter, metadataTags } from "../src/lib/frontmatter";
import { markdownModel } from "../src/lib/markdown-model";
import { documentTitle, newDocument, stats } from "../src/lib/documents";
import { documentBacklinks, resolveDocumentLink } from "../src/lib/references";
describe("source-preserving frontmatter", () => {
  it("parses YAML, TOML, and JSON metadata without changing document source", () => {
    for (const source of [
      "---\ntitle: A guide\ntags: [api, guide]\n---\n# Body",
      '+++\ntitle = "A guide"\ntags = ["api", "guide"]\n+++\n# Body',
      '---json\n{"title":"A guide","tags":["api","guide"]}\n---\n# Body',
    ]) {
      const doc = newDocument("A.md", source);
      expect(documentTitle(doc)).toBe("A guide");
      expect(metadataTags(frontmatter(source).metadata)).toEqual([
        "api",
        "guide",
      ]);
      expect(frontmatter(source).body).toBe("# Body");
      expect(doc.content).toBe(source);
    }
  });
  it("reports malformed, oversized, and cyclic data without executing tags or changing global prototypes", () => {
    expect(frontmatter("---\ntitle: [bad\n---\n# Body").error).toBeTruthy();
    expect(
      frontmatter("---\n" + "x".repeat(140000) + "\n---\n# Body").error,
    ).toBeTruthy();
    const parsed = frontmatter(
      '---json\n{"__proto__":{"polluted":true},"title":"Safe"}\n---\n# Body',
    );
    expect(Object.keys(parsed.metadata)).toEqual(["title"]);
    expect("polluted" in {}).toBe(false);
    expect(
      frontmatter("---\nvalue: &a [*a]\n---\n# Body").metadata.value,
    ).toBeTruthy();
  });
  it("tracks CRLF frontmatter line offsets and excludes metadata from reading statistics", () => {
    const model = markdownModel(
      "---\r\ntitle: Hidden words\r\n---\r\n# Visible",
    );
    expect(model.headings[0].line).toBe(4);
    expect(model.statistics.words).toBe(1);
  });
});
describe("shared Markdown semantics", () => {
  it("uses sanitized heading text, setext headings, and unique safe IDs", () => {
    const m = markdownModel(
      "# Hello *world*\n\nSetext `code`\n---\n\n# Hello world",
    );
    expect(m.headings.map((h) => [h.id, h.text])).toEqual([
      ["user-content-hello-world", "Hello world"],
      ["user-content-setext-code", "Setext code"],
      ["user-content-hello-world-1", "Hello world"],
    ]);
    expect(markdownModel("# location").anchors).toContain(
      "user-content-location",
    );
  });
  it("counts actual fenced code and nested tasks without treating examples as live content", () => {
    const result = stats(
      "# Tasks\n- [x] Done\n  - [ ] Later\n\n~~~md\n- [ ] Example only\n# Not a heading\n~~~",
    );
    expect(result.tasks).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.codeBlocks).toBe(1);
    expect(result.headings).toBe(1);
  });
  it("repairs sanitized footnote links and custom HTML anchors", () => {
    const m = markdownModel(
      '# Note\nText.[^one]\n\n[^one]: Footnote.\n\n<a id="old"></a> [Old](#old)',
    );
    expect(m.anchors).toContain(m.anchorAliases.old);
    expect(m.links.find((l) => l.text === "Old")?.href).toBe(
      "#user-content-old",
    );
    expect(m.anchors.some((id) => id.includes("fn-one"))).toBe(true);
  });
  it("resolves reference links, root paths, wiki links, and encoded anchors consistently", () => {
    const a = newDocument(
      "Docs/A.md",
      "# A\n\n[Ref][b]\n\n[b]: ../Notes/B.md#hello-world\n\n[[B#hello-world|B note]]",
    );
    const b = newDocument("Notes/B.md", "# Hello *world*");
    expect(
      resolveDocumentLink(a, "/Notes/B.md#hello-world", [a, b]).actualAnchor,
    ).toBe("user-content-hello-world");
    expect(documentBacklinks(b, [a, b])).toEqual([a]);
    expect(
      markdownModel(a.content).links.some((l) => l.href.startsWith("wiki:")),
    ).toBe(true);
    expect(
      resolveDocumentLink(a, "wiki:" + encodeURIComponent("B#hello-world"), [
        a,
        b,
      ]).target?.id,
    ).toBe(b.id);
    expect(resolveDocumentLink(a, "bad%ZZ.md", [a, b]).error).toBe("invalid");
  });
  it("does not infer a target for ambiguous wiki names", () => {
    const a = newDocument("A.md", "# A");
    expect(
      resolveDocumentLink(a, "wiki:B", [
        a,
        newDocument("X/B.md", "# B"),
        newDocument("Y/B.md", "# B"),
      ]).error,
    ).toBe("ambiguous");
  });
});

it("keeps rejected source URLs available for health checks while removing executable links from rendered content", () => {
  const model = markdownModel(
    '# Security\n\n[unsafe](javascript:alert)\n\n<img src="javascript:alert(1)" onerror="alert(1)">',
  );
  expect(model.rawLinks.some((l) => l.href.startsWith("javascript:"))).toBe(
    true,
  );
  expect(model.links.some((l) => l.href.startsWith("javascript:"))).toBe(false);
});

import { LocalSearch } from "../src/lib/search";
it("indexes frontmatter fields and status/type filters without mutating local tags", () => {
  const source = {
    id: "meta",
    path: "Docs/Operations.md",
    content:
      "---\ntitle: Operations manual\nstatus: approved\nowner: Morgan\ntags: [operations]\n---\n# Body",
    tags: [],
  };
  const search = new LocalSearch();
  search.sync([source], []);
  expect(
    search.search("status:approved tag:operations Morgan type:markdown"),
  ).toEqual(["meta"]);
  expect(source.tags).toEqual([]);
});

it("builds deduplicated cross-document edges and updates them incrementally", () => {
  const search = new LocalSearch();
  search.sync(
    [
      { id: "a", path: "A.md", content: "# A\n[B](B.md)\n[[B]]", tags: [] },
      { id: "b", path: "B.md", content: "# B", tags: [] },
    ],
    [],
  );
  expect(search.navigation().edges).toEqual([
    { from: "a", to: "b", count: 2, line: 2 },
  ]);
  search.sync(
    [{ id: "a", path: "A.md", content: "# A\nNo links.", tags: [] }],
    [],
  );
  expect(search.navigation().edges).toEqual([]);
});

it("keeps wiki source lines accurate and leaves escaped wiki brackets literal", () => {
  const model = markdownModel(
    "# A\n\nPrefix line\n[[Missing]]\n\n\\[[Literal]]",
  );
  expect(
    model.rawLinks.find((link) => link.href.startsWith("wiki:"))?.line,
  ).toBe(4);
  expect(model.links.some((link) => link.href.includes("Literal"))).toBe(false);
});
