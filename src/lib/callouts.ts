import type { Blockquote, Paragraph, PhrasingContent, Text } from "mdast";
import { toString } from "mdast-util-to-string";
import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import type { Root as HtmlRoot } from "hast";

const marker = /^\[!([a-z][a-z0-9_-]{0,39})\]([+-])?(?=[ \t\r\n]|$)[ \t]*/i;
/** Recognize explicit Markdown markers; do not reinterpret escaped/entity-encoded quotations. */
export function prepareCallout(node: Blockquote, source: string) {
  const paragraph = node.children[0];
  const first =
    paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
  if (paragraph?.type !== "paragraph" || first?.type !== "text") return;
  const match = marker.exec(first.value);
  if (!match) return;
  const rawFirst =
    first.position && source
      ? source.slice(first.position.start.offset, first.position.end.offset)
      : first.value;
  const rawMarker = marker.exec(rawFirst);
  if (!rawMarker) return;
  const header: PhrasingContent[] = [],
    body: PhrasingContent[] = [];
  let inHeader = true;
  for (const child of paragraph.children) {
    if (!inHeader) {
      body.push(child);
      continue;
    }
    if (child.type === "break") {
      inHeader = false;
      continue;
    }
    if (child.type !== "text") {
      // A title is one line. Preserve the quotation intact when inline markup crosses that boundary.
      if (
        child.position &&
        first.position &&
        child.position.end.line > first.position.start.line
      )
        return;
      header.push(child);
      continue;
    }
    const lineBreak = /\r\n?|\n/.exec(child.value);
    const newline = lineBreak?.index ?? -1;
    if (newline < 0) {
      header.push({ ...child });
      continue;
    }
    const start = child.position?.start.offset;
    const rawBreak =
      typeof start === "number" && source
        ? /\r\n?|\n/.exec(source.slice(start, child.position?.end.offset))
        : null;
    const end =
      typeof start === "number" && rawBreak ? start + rawBreak.index : -1;
    header.push({
      ...child,
      value: child.value.slice(0, newline),
      position:
        child.position && end >= 0
          ? {
              start: child.position.start,
              end: {
                line: child.position.start.line,
                column: child.position.start.column + end - start!,
                offset: end,
              },
            }
          : child.position,
    });
    if (child.value.slice(newline + (lineBreak?.[0].length || 1)))
      body.push({
        ...child,
        value: child.value.slice(newline + (lineBreak?.[0].length || 1)),
        position:
          child.position && end >= 0
            ? {
                start: {
                  line: child.position.start.line + 1,
                  column: 1,
                  offset: end + (rawBreak?.[0].length || 1),
                },
                end: child.position.end,
              }
            : child.position,
      });
    inHeader = false;
  }
  const headingFirst = header[0] as Text;
  headingFirst.value = headingFirst.value.slice(match[0].length);
  if (headingFirst.position)
    headingFirst.position = {
      ...headingFirst.position,
      start: {
        ...headingFirst.position.start,
        column: headingFirst.position.start.column + rawMarker[0].length,
        offset: (headingFirst.position.start.offset || 0) + rawMarker[0].length,
      },
    };
  const kind = match[1].toLowerCase();
  const fold = match[2];
  const title: Paragraph = {
    ...paragraph,
    children: header.filter(
      (child) => child.type !== "text" || child.value.length,
    ),
    data: {
      ...paragraph.data,
      hName: fold ? "summary" : "p",
      hProperties: {
        className: ["callout-label"],
        ...(fold ? { dataCallout: kind } : {}),
      },
    },
  };
  if (!toString(title, { includeHtml: false }).trim())
    title.children = [
      { type: "text", value: kind.replace(/[-_]/g, " ").toUpperCase() },
    ];
  node.data = {
    ...node.data,
    ...(fold ? { hName: "details" } : {}),
    hProperties: {
      ...node.data?.hProperties,
      dataCallout: kind,
      ...(fold ? { open: fold === "+" } : {}),
    },
  };
  node.children.splice(
    0,
    1,
    title,
    ...(body.length
      ? [
          {
            ...paragraph,
            children: body,
            position:
              paragraph.position && body[0].position
                ? { ...paragraph.position, start: body[0].position.start }
                : paragraph.position,
          } as Paragraph,
        ]
      : []),
  );
}

/** A sanitized-away title must still leave a named, keyboard-operable disclosure. */
export function rehypeCalloutLabels() {
  return (tree: HtmlRoot) => {
    visit(tree, "element", (node) => {
      if (
        !["blockquote", "details"].includes(node.tagName) ||
        typeof node.properties.dataCallout !== "string"
      )
        return;
      const label = node.children.find(
        (child) =>
          child.type === "element" &&
          ["p", "summary"].includes(child.tagName) &&
          Array.isArray(child.properties.className) &&
          child.properties.className.includes("callout-label"),
      );
      if (label?.type === "element" && !toText(label).trim())
        label.children = [
          {
            type: "text",
            value: node.properties.dataCallout
              .slice(0, 40)
              .replace(/[-_]/g, " ")
              .toUpperCase(),
          },
        ];
    });
  };
}
