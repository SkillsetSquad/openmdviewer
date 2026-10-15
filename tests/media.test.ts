import { it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { markdownSchema } from "../src/lib/markdown-pipeline";
import { describeResource } from "../src/lib/local-resources";
it("preserves media references and caption metadata while removing executable attributes and protocols", async () => {
  const result = String(
    await unified()
      .use(remarkParse)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSanitize, markdownSchema)
      .use(rehypeStringify)
      .process(
        '<video src="clip.webm" poster="poster.png" autoplay loop muted onplay="alert(1)"><source src="backup.mp4" type="video/mp4"><track src="words.vtt" kind="captions" label="English" srclang="en" default></video>\n\n<audio src="javascript:alert(1)" onerror="alert(2)"></audio><script>alert(3)</script>',
      ),
  );
  expect(result).toContain('src="clip.webm"');
  expect(result).toContain('poster="poster.png"');
  expect(result).toContain('src="backup.mp4"');
  expect(result).toContain('srclang="en"');
  expect(result).toContain("default");
  expect(result).not.toMatch(
    /autoplay|loop|muted|onplay|onerror|javascript:|script|alert/,
  );
});
it("resolves only registered local media blobs and labels remote media for explicit consent", () => {
  const assets = {
    "docs/clip.webm": "blob:trusted",
    "docs/words.vtt": "blob:captions",
  };
  expect(
    describeResource("clip.webm#t=0.2", "docs/A.md", assets),
  ).toMatchObject({ source: "imported", url: "blob:trusted#t=0.2" });
  expect(describeResource("words.vtt", "docs/A.md", assets).url).toBe(
    "blob:captions",
  );
  for (const ref of [
    "blob:untrusted",
    "data:video/mp4,abc",
    "file:///clip.webm",
    "javascript:alert(1)",
    "https://name:secret@example.test/a",
  ])
    expect(describeResource(ref, "docs/A.md", assets).url).toBeUndefined();
  expect(
    describeResource("//media.example.test/clip.webm", "A.md", {}),
  ).toMatchObject({
    source: "remote",
    url: "https://media.example.test/clip.webm",
    host: "media.example.test",
  });
});
