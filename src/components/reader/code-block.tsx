"use client";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, Download } from "lucide-react";
import { download } from "@/lib/documents";

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [html, setHtml] = useState("");
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    let canceled = false;
    import("shiki/bundle/web")
      .then(async ({ codeToHtml, bundledLanguages }) => {
        const lang = language in bundledLanguages ? language : "text";
        const result = await codeToHtml(code, {
          lang,
          themes: { light: "github-light", dark: "github-dark-high-contrast" },
          defaultColor: false,
        });
        if (!canceled) setHtml(result);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [code, language]);
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
        >
          <ChevronDown size={13} className={collapsed ? "-rotate-90" : ""} />
          {language || "text"}
        </button>
        <div>
          <button
            title="Download code"
            aria-label="Download code"
            onClick={() =>
              download(`snippet.${language || "txt"}`, code, "text/plain")
            }
          >
            <Download size={13} />
          </button>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {!collapsed &&
        (html ? (
          <div
            className="highlighted"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre>
            <code>{code}</code>
          </pre>
        ))}
    </div>
  );
}
