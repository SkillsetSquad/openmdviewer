import { expect, it } from "vitest";
import {
  codeFileName,
  codeLanguage,
  diffLineKind,
  findCodeMatches,
  parseCodeMeta,
} from "../src/lib/code-tools";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import {
  markdownSchema,
  remarkReaderExtensions,
} from "../src/lib/markdown-pipeline";
it("parses bounded filename, numbering and line-emphasis metadata without interpreting arbitrary directives", () => {
  expect(
    parseCodeMeta('title="src/main.ts" {2,4-6} startLine=10 lineNumbers=false'),
  ).toEqual({
    filename: "src/main.ts",
    startLine: 10,
    lineNumbers: false,
    ranges: [
      { from: 2, to: 2 },
      { from: 4, to: 6 },
    ],
  });
  expect(
    parseCodeMeta(
      "filename='unsafe<>.js' {0,7-3,999999999-999999999} startLine=9999999",
    ),
  ).toMatchObject({ filename: "unsafe<>.js", startLine: 1000000, ranges: [] });
  expect(
    parseCodeMeta('startLine=-5 execute="alert(1)" {1-1000000000}'),
  ).toMatchObject({ startLine: 1, ranges: [] });
  expect(codeFileName("typescript", "../../src/main.ts")).toBe("main.ts");
  expect(codeFileName("javascript", "bad<name>.js")).toBe("bad_name_.js");
  expect(codeFileName("diff-python")).toBe("snippet.py");
  expect(codeFileName("constructor")).toBe("snippet.constructor");
  expect(codeLanguage("", "config.yaml")).toBe("yaml");
  expect(codeLanguage("auto", "main.py")).toBe("python");
  expect(codeLanguage("auto", "Dockerfile")).toBe("dockerfile");
  expect(codeLanguage("auto", "config.toml")).toBe("toml");
  expect(codeLanguage("diff-ts", "other.py")).toBe("ts");
  expect(codeLanguage("", "constructor")).toBe("text");
});
it("finds literal punctuation and Unicode with original source offsets and bounded results", () => {
  const code = "😀 Alpha(x)\nalpha(x)\n[.*]";
  expect(findCodeMatches(code, "Alpha(x)").matches).toEqual([
    { start: 3, end: 11, line: 0 },
    { start: 12, end: 20, line: 1 },
  ]);
  expect(findCodeMatches(code, "Alpha(x)", true).matches).toHaveLength(1);
  expect(findCodeMatches(code, "[.*]").matches).toEqual([
    { start: 21, end: 25, line: 2 },
  ]);
  expect(findCodeMatches(code, "(a+)+$").matches).toHaveLength(0);
  expect(findCodeMatches("x".repeat(10001), "x")).toMatchObject({
    truncated: true,
  });
  expect(findCodeMatches("", "").matches).toEqual([]);
});
it("labels only actual diff additions/removals and keeps patch metadata separate", () => {
  expect(diffLineKind("+added", "diff-ts")).toBe("added");
  expect(diffLineKind("-removed", "patch")).toBe("removed");
  for (const text of ["+++ b/main.ts", "--- a/main.ts", "@@ -1 +1 @@"])
    expect(diffLineKind(text, "diff")).toBe("header");
  expect(diffLineKind("+not a diff", "javascript")).toBe("");
});
it("passes safe fenced-code metadata through the shared sanitizer and marks single-line unlabeled blocks", async () => {
  const output = String(
    await unified()
      .use(remarkParse)
      .use(remarkReaderExtensions)
      .use(remarkRehype)
      .use(rehypeSanitize, markdownSchema)
      .use(rehypeStringify)
      .process(
        '```js title="src/<img>.js" {1}\nconst text = "<script>";\n```\n\n```\none line\n```',
      ),
  );
  expect(output).toContain("data-code-block");
  expect(output).toContain(
    'data-code-meta="title=&#x22;src/<img>.js&#x22; {1}"',
  );
  expect(output).not.toContain("<script>");
  expect(output).toContain("one line");
});
