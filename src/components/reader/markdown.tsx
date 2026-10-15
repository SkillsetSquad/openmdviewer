/* eslint-disable @next/next/no-img-element -- Local and explicitly consented media use native elements without a proxy. */
"use client";
import { lazy, Suspense, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import { Info, Lightbulb, ShieldAlert, X } from "lucide-react";
import { InteractiveTable } from "./interactive-table";
import { CodeBlock } from "./code-block";
import { basePath } from "@/lib/types";
const Diagram = lazy(() => import("./diagram"));

function SafeImage({ src, alt }: { src?: string; alt?: string }) {
  const [allowed, setAllowed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [failed, setFailed] = useState(false);
  const local = src === "asset:alpine-lake";
  const safe =
    src && (/^https?:\/\//i.test(src) || local || /^blob:/.test(src));
  if (!safe)
    return (
      <span className="blocked-media">
        Local image unavailable: {alt || src}. Import media support is tracked
        in the roadmap.
      </span>
    );
  if (!local && !allowed)
    return (
      <span className="blocked-media">
        <span>Remote image blocked · {alt || "Image"}</span>
        <button onClick={() => setAllowed(true)}>Load this image</button>
      </span>
    );
  const url = local ? `${basePath}/images/alpine-lake.jpg` : src;
  if (failed)
    return (
      <span className="blocked-media">Image unavailable: {alt || src}</span>
    );
  // Imported media is intentionally rendered with native elements; no image proxy or external optimizer.
  return (
    <>
      <img
        className="document-image"
        src={url}
        alt={alt || ""}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        onClick={() => setZoom(true)}
        tabIndex={0}
        role="button"
        aria-label={`Enlarge image: ${alt || "image"}`}
        onKeyDown={(e) => {
          if (e.key === "Enter") setZoom(true);
        }}
      />
      {zoom && (
        <div
          className="image-overlay"
          role="dialog"
          aria-label="Image preview"
          aria-modal="true"
          onClick={() => setZoom(false)}
        >
          <button
            autoFocus
            aria-label="Close image preview"
            onKeyDown={(e) => {
              if (e.key === "Escape") setZoom(false);
            }}
          >
            <X />
          </button>
          <img src={url} alt={alt || ""} />
        </div>
      )}
    </>
  );
}

export function Markdown({
  content,
  onLink,
}: {
  content: string;
  onLink: (href: string) => void;
}) {
  const normalized = useMemo(
    () =>
      content
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
        .replace(
          /> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|ERROR)\]\n/gi,
          "> **$1**\n>\n",
        ),
    [content],
  );
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
          if (href && !/^https?:|^mailto:/i.test(href)) {
            e.preventDefault();
            onLink(href);
          }
        }}
        target={/^https?:/i.test(href || "") ? "_blank" : undefined}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    img: ({ src, alt }) => (
      <SafeImage src={typeof src === "string" ? src : undefined} alt={alt} />
    ),
    blockquote: ({ children }) => {
      const text = JSON.stringify(children);
      const tip = text.includes("TIP") || text.includes("SUCCESS");
      const warning =
        text.includes("WARNING") ||
        text.includes("CAUTION") ||
        text.includes("ERROR");
      const note =
        text.includes("NOTE") ||
        text.includes("IMPORTANT") ||
        text.includes("INFO");
      const Icon = tip ? Lightbulb : warning ? ShieldAlert : Info;
      return (
        <blockquote
          className={
            tip
              ? "callout tip"
              : warning
                ? "callout warning"
                : note
                  ? "callout note"
                  : "quote"
          }
        >
          {(tip || note || warning) && (
            <Icon className="callout-icon" size={20} />
          )}
          <div>{children}</div>
        </blockquote>
      );
    },
    table: ({ children }) => <InteractiveTable>{children}</InteractiveTable>,
  };
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        [
          rehypeSanitize,
          {
            /* default schema, plus a harmless local asset protocol */ protocols:
              {
                href: ["http", "https", "mailto"],
                src: ["http", "https", "asset", "blob"],
              },
          },
        ],
        rehypeSlug,
        [rehypeKatex, { strict: "warn", trust: false }],
      ]}
      components={components}
      urlTransform={(url) =>
        /^(?:javascript|vbscript|data):/i.test(url.trim()) ? "" : url
      }
    >
      {normalized}
    </ReactMarkdown>
  );
}
