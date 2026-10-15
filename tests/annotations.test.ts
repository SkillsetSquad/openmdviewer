import { expect, it } from "vitest";
import {
  annotationExport,
  createAnnotation,
  matchQuote,
  parseAnnotations,
  quoteAt,
} from "../src/lib/annotations";
import { newDocument } from "../src/lib/documents";
import { readLocalFiles, isolateImport } from "../src/lib/import";
import {
  workspaceMetadata,
  workspaceMetadataPath,
} from "../src/lib/workspace-archive";
it("relocates exact passages after preceding edits and uses surrounding text to distinguish repeated quotes", () => {
  const original =
    "First paragraph. A unique passage to highlight. Last paragraph.";
  const start = original.indexOf("A unique");
  const quote = quoteAt(original, start, start + "A unique passage".length);
  expect(matchQuote("Added introduction. " + original, quote)).toEqual({
    status: "found",
    start: start + 20,
    end: start + 20 + quote.exact.length,
  });
  expect(
    matchQuote(original.replace(quote.exact, "Different passage"), quote)
      .status,
  ).toBe("missing");
  const repeated =
    "A".repeat(70) +
    "same words" +
    "B".repeat(70) +
    "same words" +
    "C".repeat(70);
  const target = repeated.lastIndexOf("same words");
  expect(
    matchQuote(repeated, quoteAt(repeated, target, target + 10)),
  ).toMatchObject({ status: "found", start: target });
  const identical = ("X".repeat(70) + "same words" + "X".repeat(70)).repeat(2);
  expect(matchQuote(identical, quoteAt(identical, 70, 80)).status).toBe(
    "ambiguous",
  );
});
it("validates imported reading data and keeps only known fields", () => {
  const item = createAnnotation({
    kind: "highlight",
    title: "A",
    note: "<img src=x onerror=alert(1)>",
    quote: quoteAt("Selected text", 0, 8),
  });
  expect(
    parseAnnotations([
      {
        ...item,
        workspaceId: "hijack",
        content: "replace",
        arbitrary: "unknown",
      },
    ]),
  ).toEqual([item]);
  for (const invalid of [
    null,
    {},
    [...Array(501)].map(() => item),
    [item, item],
    [{ ...item, kind: ["note"] }],
    [{ ...item, quote: undefined }],
    [{ ...item, quote: { ...item.quote, exact: "" } }],
    [{ ...item, note: "x".repeat(10001) }],
    [{ ...item, createdAt: -1 }],
    [{ ...item, id: "" }],
  ])
    expect(() => parseAnnotations(invalid)).toThrow();
  expect(parseAnnotations(undefined)).toEqual([]);
  const exported = JSON.parse(
    annotationExport([{ path: "Docs/A.md", annotations: [item] }]),
  );
  expect(exported.documents[0]).toEqual({
    path: "Docs/A.md",
    annotations: [JSON.parse(JSON.stringify(item))],
  });
  expect(exported.documents[0].content).toBeUndefined();
});
it("round-trips bookmarks, notes, and highlights through workspace ZIP metadata without changing Markdown", async () => {
  const doc = newDocument("Docs/A.md", "# Original\n\nSelected prose.");
  doc.annotations = [
    createAnnotation({
      kind: "bookmark",
      title: "Original",
      note: "Return here",
      heading: "user-content-original",
    }),
    createAnnotation({
      kind: "highlight",
      title: "Prose",
      note: "My comment",
      quote: quoteAt("Original\nSelected prose.", 9, 23),
    }),
    createAnnotation({ kind: "note", title: "Note", note: "Private thoughts" }),
  ];
  const { zipSync, strToU8 } = await import("fflate");
  const archive = zipSync({
    [doc.path]: strToU8(doc.content),
    [workspaceMetadataPath]: strToU8(workspaceMetadata([doc])),
  });
  const imported = await readLocalFiles([
    new File([archive as BlobPart], "workspace.zip"),
  ]);
  expect(imported.documents[0].content).toBe(doc.content);
  expect(imported.documents[0].annotations).toEqual(doc.annotations);
  isolateImport(imported.documents, [], new Set([doc.path]));
  expect(imported.documents[0].path).toBe("Imports/Batch 2/Docs/A.md");
  expect(imported.documents[0].annotations).toEqual(doc.annotations);
});
