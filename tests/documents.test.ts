import { describe, expect, it } from "vitest";
import {
  analyze,
  headings,
  newDocument,
  resolvePath,
  safePath,
  stats,
  supportedFile,
} from "../src/lib/documents";

describe("local document utilities", () => {
  it("imports supported text formats without treating HTML as executable input", () => {
    expect(supportedFile("README.MD")).toBe(true);
    expect(supportedFile("guide.mdx")).toBe(true);
    expect(supportedFile("payload.html")).toBe(false);
  });
  it("keeps paths inside the exported workspace", () => {
    expect(safePath("../../vault/../Notes.md")).toBe("vault/Notes.md");
    expect(safePath("")).toBe("Untitled.md");
    expect(
      resolvePath("Docs/Setup/Install.md", "../../Notes/My%20Note.md"),
    ).toBe("Notes/My Note.md");
  });
  it("uses stable unique heading slugs and excludes code fences", () => {
    expect(
      headings(
        "# Title\n\n## Hello world\n## Hello world\n```md\n## Not a heading\n```",
      ),
    ).toEqual([
      { id: "user-content-title", text: "Title", depth: 1 },
      { id: "user-content-hello-world", text: "Hello world", depth: 2 },
      { id: "user-content-hello-world-1", text: "Hello world", depth: 2 },
    ]);
  });
  it("counts real content and task completion", () => {
    const result = stats("# Test\n\n- [x] Done\n- [ ] Later");
    expect(result.tasks).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.headings).toBe(1);
    expect(stats("").words).toBe(0);
  });
  it("finds structural errors and broken local links", () => {
    const doc = newDocument(
      "Docs/Test.md",
      "# Test\n#### Skipped\n[Missing](missing.md)\n[Anchor](#absent)\n![](photo.png)",
    );
    const issues = analyze(doc, [doc]);
    expect(issues.some((i) => i.message.includes("Skipped heading"))).toBe(
      true,
    );
    expect(
      issues.some((i) => i.message.includes("Missing local document")),
    ).toBe(true);
    expect(issues.some((i) => i.message.includes("Missing heading"))).toBe(
      true,
    );
    expect(issues.some((i) => i.message.includes("alt text"))).toBe(true);
  });
  it("recognizes valid encoded cross-document links", () => {
    const a = newDocument(
      "Docs/A.md",
      "# A\n[Read](../Notes/My%20Note.md#hello)",
    );
    const b = newDocument("Notes/My Note.md", "# Hello");
    expect(analyze(a, [a, b])).toEqual([]);
  });
});

import { LocalSearch } from "../src/lib/search";
describe("incremental local search", () => {
  it("indexes changes, supports fuzzy text and combined filters, and removes old records", () => {
    const index = new LocalSearch();
    index.sync(
      [
        {
          id: "a",
          path: "Docs/Setup.md",
          content: "Configure a local browser workspace",
          title: "Configuration",
          tags: ["guide"],
          headings: "Local setup",
        },
        {
          id: "b",
          path: "Notes/A.md",
          content: "Reading list",
          title: "Notes",
          tags: [],
          headings: "",
        },
      ],
      [],
    );
    expect(index.search("configuraton")).toContain("a");
    expect(
      index.search('tag:guide path:docs heading:setup "local browser"'),
    ).toEqual(["a"]);
    expect(index.search("tag:missing")).toEqual([]);
    index.sync(
      [
        {
          id: "a",
          path: "Docs/Setup.md",
          content: "Rewritten",
          title: "Changed",
          tags: [],
          headings: "",
        },
      ],
      ["b"],
    );
    expect(index.search("workspace")).toEqual([]);
    expect(index.search("")).toEqual(["a"]);
  });
});

import { isolateImport, readLocalFiles } from "../src/lib/import";
describe("source-preserving imports", () => {
  it("keeps relative links together when isolating a duplicate import batch", () => {
    const doc = newDocument("Docs/Readme.md", "# Image\n![A](photo.png)");
    const assets = [
      { path: "Docs/photo.png", blob: new Blob(["image"]), type: "image/png" },
    ];
    isolateImport([doc], assets, new Set(["Docs/Readme.md"]));
    expect(doc.path).toBe("Imports/Batch 2/Docs/Readme.md");
    expect(assets[0].path).toBe("Imports/Batch 2/Docs/photo.png");
    expect(doc.content).toContain("photo.png");
  });
  it("imports text and media without requiring remote access", async () => {
    const result = await readLocalFiles([
      new File(["# Hello"], "Readme.md"),
      new File(["image"], "photo.png"),
    ]);
    expect(result.documents[0].path).toBe("Imported/Readme.md");
    expect(result.assets[0].type).toBe("image/png");
  });
  it("rejects conflicting paths before writing any documents", async () => {
    await expect(
      readLocalFiles([
        new File(["A"], "Readme.md"),
        new File(["B"], "Readme.md"),
      ]),
    ).rejects.toThrow("conflicting paths");
  });
});

import {
  workspaceMetadata,
  workspaceMetadataPath,
  applyWorkspaceMetadata,
} from "../src/lib/workspace-archive";
describe("portable workspace metadata", () => {
  it("round-trips tags, favorites, and document dates with ZIP imports", async () => {
    const original = {
      ...newDocument("Notes/Test.md", "# Portable"),
      tags: ["guide", "private"],
      favorite: true,
      createdAt: 1000,
      updatedAt: 2000,
    };
    const { zipSync, strToU8 } = await import("fflate");
    const archive = zipSync({
      "Notes/Test.md": strToU8(original.content),
      [workspaceMetadataPath]: strToU8(workspaceMetadata([original])),
    });
    const imported = await readLocalFiles([
      new File([archive as BlobPart], "workspace.zip"),
    ]);
    expect(imported.documents[0]).toMatchObject({
      path: original.path,
      tags: original.tags,
      favorite: true,
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(imported.documents[0].id).not.toBe(original.id);
  });
  it("accepts only known fields from untrusted metadata", () => {
    const doc = newDocument("A.md", "# A");
    applyWorkspaceMetadata(
      [doc],
      JSON.stringify({
        format: "openmdviewer",
        version: 1,
        documents: [
          {
            path: "A.md",
            id: "hijack",
            workspaceId: "other",
            content: "replace",
            tags: ["a", 8],
            favorite: true,
            updatedAt: "bad",
          },
        ],
      }),
    );
    expect(doc.id).not.toBe("hijack");
    expect(doc.content).toBe("# A");
    expect(doc.tags).toEqual(["a"]);
  });
});
