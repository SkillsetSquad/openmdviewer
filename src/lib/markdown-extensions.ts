declare module "mdast" {
  interface TextData {
    readerRawText?: string;
  }
}
import remarkGemoji from "remark-gemoji";
import { decodeString } from "micromark-util-decode-string";
import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import type { VFile } from "vfile";
export {
  remarkDefinitionList,
  defListHastHandlers,
} from "remark-definition-list";
const expand = remarkGemoji();
const punctuation = /^[!-/:-@[-`{-~]$/;
/** Map escaped colons through CommonMark escape/entity decoding and container prefixes. */
export function escapedEmojiPositions(
  raw: string,
  value: string,
): Set<number> | null {
  const escaped = new Set<number>();
  let decoded = "";
  const input = raw.replace(/\r\n?/g, "\n");
  for (let index = 0; index < input.length;) {
    if (input[index] === "\\" && punctuation.test(input[index + 1] || "")) {
      if (input[index + 1] === ":") escaped.add(decoded.length);
      decoded += input[index + 1];
      index += 2;
    } else {
      const entity =
        input[index] === "&"
          ? /^&(?:#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/i.exec(
              input.slice(index),
            )?.[0]
          : undefined;
      if (entity) {
        decoded += decodeString(entity);
        index += entity.length;
      } else decoded += input[index++];
    }
  }
  const rawLines = decoded.split("\n"),
    lines = value.split("\n");
  if (rawLines.length < lines.length) return null;
  const skipped = rawLines.length - lines.length;
  const result = new Set<number>();
  let rawOffset = rawLines
      .slice(0, skipped)
      .reduce((sum, line) => sum + line.length + 1, 0),
    offset = 0;
  for (let index = 0; index < lines.length; index++) {
    if (!rawLines[index + skipped].endsWith(lines[index])) return null;
    const prefix = rawLines[index + skipped].length - lines[index].length;
    for (let char = 0; char < lines[index].length; char++)
      if (escaped.has(rawOffset + prefix + char)) result.add(offset + char);
    rawOffset += rawLines[index + skipped].length + 1;
    offset += lines[index].length + 1;
  }
  return result;
}
function expandedText(value: string) {
  const tree: Root = {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value }] }],
  };
  expand(tree);
  return (tree.children[0] as { children: Text[] }).children;
}
export function remarkReaderEmoji() {
  return (tree: Root, file: VFile) => {
    const source = String(file.value || "");
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || typeof index !== "number" || !node.value.includes(":"))
        return;
      // Autolink display text remains a faithful URL; explicit prose labels can contain emoji.
      if (
        parent.type === "link" &&
        (parent.url === node.value ||
          /^(?:[a-z][\w+.-]*:\/\/|www\.|mailto:)/i.test(node.value))
      )
        return;
      const raw =
        typeof node.data?.readerRawText === "string"
          ? node.data.readerRawText
          : node.position && source
            ? source.slice(node.position.start.offset, node.position.end.offset)
            : "";
      const protectedColons = raw.includes("\\:")
        ? escapedEmojiPositions(raw, node.value)
        : new Set<number>();
      if (!protectedColons) return; // Preserve text when original source cannot be aligned exactly.
      const replacements: Text[] = [];
      let start = 0;
      for (const match of node.value.matchAll(/:(\+1|[-\w]+):/g)) {
        if (
          !protectedColons.has(match.index) &&
          !protectedColons.has(match.index + match[0].length - 1)
        )
          continue;
        if (start < match.index)
          replacements.push(
            ...expandedText(node.value.slice(start, match.index)),
          );
        replacements.push({ type: "text", value: match[0] });
        start = match.index + match[0].length;
      }
      replacements.push(...expandedText(node.value.slice(start)));
      for (const replacement of replacements)
        replacement.position = node.position;
      parent.children.splice(index, 1, ...replacements);
      return index + replacements.length;
    });
  };
}
