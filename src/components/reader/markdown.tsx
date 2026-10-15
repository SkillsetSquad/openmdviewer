"use client";
import { lazy, memo, Suspense, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import { Info, Lightbulb, ShieldAlert } from "lucide-react";
import { InteractiveTable } from "./interactive-table";
import { CodeBlock } from "./code-block";
import { frontmatter } from "@/lib/frontmatter";
import {
  markdownSchema,
  remarkReaderExtensions,
  rehypeRememberAnchors,
  rehypeRepairAnchors,
  rehypeHeadingAliases,
} from "@/lib/markdown-pipeline";
import { ImageGallery, ImageRenderer } from "./image-gallery";
const Diagram = lazy(() => import("./diagram"));

// A stable component type preserves table state when document props update.
const TableRenderer: Components["table"] = ({ children }) => (
  <InteractiveTable>{children}</InteractiveTable>
);

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
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children }) => {
      const language = /language-([\w+-]+)/.exec(className || "")?.[1] || "";
      const code = String(children).replace(/\n$/, "");
      if (language === "mermaid")
        return (
          <Suspense fallback={<p>Loading diagram…</p>}>
            <Diagram source={code} />
          </Suspense>
        );
      if (language || String(children).includes("\n"))
        return <CodeBlock language={language} code={code} />;
      return <code className={className}>{children}</code>;
    },
    a: ({ href, children }) => (
      <a
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
    blockquote: ({ children, node }) => {
      const type = String(node?.properties.dataCallout || "");
      const tip = ["tip", "success"].includes(type);
      const warning = ["warning", "caution", "error"].includes(type);
      const Icon = tip ? Lightbulb : warning ? ShieldAlert : Info;
      return (
        <blockquote
          className={
            type
              ? `callout ${tip ? "tip" : warning ? "warning" : "note"}`
              : "quote"
          }
        >
          {type && <Icon className="callout-icon" size={20} />}
          <div>
            {type && <p className="callout-label">{type.toUpperCase()}</p>}
            {children}
          </div>
        </blockquote>
      );
    },
    table: TableRenderer,
  };
  return (
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
        remarkPlugins={[remarkGfm, remarkMath, remarkReaderExtensions]}
        rehypePlugins={[
          rehypeRaw,
          rehypeRememberAnchors,
          [rehypeSanitize, markdownSchema],
          rehypeRepairAnchors,
          [rehypeSlug, { prefix: "user-content-" }],
          rehypeHeadingAliases,
          [rehypeKatex, { strict: "warn", trust: false }],
        ]}
        components={components}
        urlTransform={(url) =>
          /^(?:javascript|vbscript|data):/i.test(url.trim()) ? "" : url
        }
      >
        {parsed.body}
      </ReactMarkdown>
    </ImageGallery>
  );
});
