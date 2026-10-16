"use client";
import { lazy, memo, Suspense, useMemo } from "react";
import {
  remarkDefinitionList,
  defListHastHandlers,
  remarkReaderEmoji,
} from "@/lib/markdown-extensions";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { rehypeRawWhenNeeded } from "@/lib/markdown-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import { rehypeSourceLocations } from "@/lib/source-locations";
import { rehypeMathTools, rehypeMathErrors } from "@/lib/math-tools";
import { MathExpression } from "./math-expression";
import {
  BlockquoteRenderer,
  DetailsRenderer,
  SummaryRenderer,
  useCalloutPrint,
} from "./callout";
import { InteractiveTable } from "./interactive-table";
import { CodeBlock } from "./code-block";
import { frontmatter } from "@/lib/frontmatter";
import {
  markdownSchema,
  remarkReaderExtensions,
  rehypeCalloutLabels,
  rehypeRememberAnchors,
  rehypeRepairAnchors,
  rehypeHeadingAliases,
} from "@/lib/markdown-pipeline";
import { ImageGallery, ImageRenderer } from "./image-gallery";
import { MediaResources, VideoRenderer, AudioRenderer } from "./media-player";
const Diagram = lazy(() => import("./diagram"));

// A stable component type preserves table state when document props update.
const TableRenderer: Components["table"] = ({ children }) => (
  <InteractiveTable>{children}</InteractiveTable>
);

const SpanRenderer: Components["span"] = ({ node, children, ...props }) => {
  if (typeof node?.properties.dataMathSource === "string")
    return (
      <MathExpression
        key={node.properties.dataMathSource}
        source={node.properties.dataMathSource}
        display={!!node.properties.dataMathDisplay}
        limited={!!node.properties.dataMathLimited}
        error={String(node.properties.dataMathError || "")}
      >
        {children}
      </MathExpression>
    );
  return <span {...props}>{children}</span>;
};

const PreRenderer: Components["pre"] = ({ children }) => <>{children}</>;
const CodeRenderer: Components["code"] = ({ className, children, node }) => {
  const language = /language-([\w+-]+)/.exec(className || "")?.[1] || "";
  const code = String(children).replace(/\n$/, "");
  if (language === "mermaid")
    return (
      <Suspense fallback={<p>Loading diagram…</p>}>
        <Diagram source={code} />
      </Suspense>
    );
  if (
    node?.properties.dataCodeBlock ||
    language ||
    String(children).includes("\n")
  )
    return (
      <CodeBlock
        language={language}
        code={code}
        meta={String(node?.properties.dataCodeMeta || "")}
      />
    );
  return <code className={className}>{children}</code>;
};

export const Markdown = memo(function Markdown({
  content,
  onLink,
  assetURLs = {},
  sourcePath = "",
  galleryContent = content,
}: {
  content: string;
  onLink: (href: string) => void;
  assetURLs?: Record<string, string>;
  sourcePath?: string;
  galleryContent?: string;
}) {
  useCalloutPrint();
  const parsed = useMemo(() => frontmatter(content), [content]);
  const components: Components = {
    input: ({ checked, type }) => (
      <input
        type={type}
        checked={checked}
        disabled
        aria-label={checked ? "Completed task" : "Incomplete task"}
      />
    ),
    pre: PreRenderer,
    span: SpanRenderer,
    code: CodeRenderer,
    a: ({ href, id, children }) => (
      <a
        id={id}
        href={href}
        onClick={(e) => {
          if (href && !/^https?:|^mailto:|^tel:|^\/\//i.test(href)) {
            e.preventDefault();
            onLink(href);
          }
        }}
        target={/^(?:https?:|\/\/)/i.test(href || "") ? "_blank" : undefined}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    img: ImageRenderer,
    video: VideoRenderer,
    audio: AudioRenderer,
    source: () => null,
    track: () => null,
    blockquote: BlockquoteRenderer,
    details: DetailsRenderer,
    summary: SummaryRenderer,
    table: TableRenderer,
  };
  return (
    <MediaResources path={sourcePath} assets={assetURLs}>
      <ImageGallery
        content={galleryContent}
        sourcePath={sourcePath}
        assets={assetURLs}
      >
        {parsed.error && (
          <p className="frontmatter-error" role="alert">
            Frontmatter could not be parsed: {parsed.error}
          </p>
        )}
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            remarkMath,
            remarkDefinitionList,
            remarkReaderExtensions,
            remarkReaderEmoji,
          ]}
          remarkRehypeOptions={{ handlers: defListHastHandlers }}
          rehypePlugins={[
            rehypeRawWhenNeeded,
            rehypeRememberAnchors,
            [rehypeSanitize, markdownSchema],
            rehypeCalloutLabels,
            rehypeRepairAnchors,
            [rehypeSlug, { prefix: "user-content-" }],
            rehypeHeadingAliases,
            rehypeMathTools,
            [
              rehypeKatex,
              { strict: "warn", trust: false, maxExpand: 1000, maxSize: 20 },
            ],
            rehypeMathErrors,
            [rehypeSourceLocations, { offset: parsed.lineOffset }],
          ]}
          components={components}
          urlTransform={(url) =>
            /^(?:javascript|vbscript|data):/i.test(url.trim()) ? "" : url
          }
        >
          {parsed.body}
        </ReactMarkdown>
      </ImageGallery>
    </MediaResources>
  );
});
