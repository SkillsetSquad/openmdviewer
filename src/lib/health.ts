import { markdownModel, type MarkdownModel } from "./markdown-model";
import { metadataString } from "./frontmatter";
import {
  referenceIndex,
  resolveDocumentLink,
  workspaceNavigation,
  type WorkspaceNavigation,
} from "./references";
import { resolvePath, fileName } from "./paths";
import type { ReaderDocument } from "./types";
export const healthRules = [
  {
    id: "metadata_invalid",
    label: "Invalid frontmatter",
    penalty: 10,
    severity: "warning",
  },
  {
    id: "missing_title",
    label: "Missing level-one title",
    penalty: 5,
    severity: "warning",
  },
  {
    id: "multiple_titles",
    label: "Multiple level-one titles",
    penalty: 4,
    severity: "warning",
  },
  {
    id: "heading_gap",
    label: "Skipped heading level",
    penalty: 4,
    severity: "warning",
  },
  {
    id: "duplicate_heading",
    label: "Repeated heading text",
    penalty: 3,
    severity: "info",
  },
  { id: "empty_section", label: "Empty section", penalty: 2, severity: "info" },
  {
    id: "deep_heading",
    label: "Heading deeper than level four",
    penalty: 2,
    severity: "info",
  },
  {
    id: "duplicate_anchor",
    label: "Duplicate DOM anchor",
    penalty: 8,
    severity: "warning",
  },
  {
    id: "missing_document",
    label: "Missing local document or attachment",
    penalty: 8,
    severity: "warning",
  },
  {
    id: "missing_anchor",
    label: "Missing destination anchor",
    penalty: 6,
    severity: "warning",
  },
  {
    id: "case_mismatch",
    label: "Link path case mismatch",
    penalty: 4,
    severity: "warning",
  },
  {
    id: "ambiguous_wiki",
    label: "Ambiguous wiki link",
    penalty: 4,
    severity: "warning",
  },
  {
    id: "invalid_link",
    label: "Malformed local link",
    penalty: 4,
    severity: "warning",
  },
  {
    id: "unsafe_link",
    label: "Blocked or unsupported URL scheme",
    penalty: 8,
    severity: "warning",
  },
  {
    id: "missing_image",
    label: "Missing local image",
    penalty: 5,
    severity: "warning",
  },
  {
    id: "image_alt",
    label: "Missing image description",
    penalty: 5,
    severity: "warning",
  },
  {
    id: "long_paragraph",
    label: "Paragraph longer than 200 words",
    penalty: 2,
    severity: "info",
  },
  {
    id: "missing_owner",
    label: "No frontmatter owner",
    penalty: 2,
    severity: "info",
  },
  {
    id: "missing_review",
    label: "No declared last-review date",
    penalty: 2,
    severity: "info",
  },
  {
    id: "invalid_review",
    label: "Invalid or future review date",
    penalty: 2,
    severity: "warning",
  },
  {
    id: "stale_review",
    label: "Review overdue, or older than 180 days without a next-review date",
    penalty: 4,
    severity: "warning",
  },
  {
    id: "duplicate_content",
    label: "Duplicate body after whitespace normalization",
    penalty: 3,
    severity: "info",
  },
] as const;
export type HealthRuleId = (typeof healthRules)[number]["id"];
export interface HealthIssue {
  id: string;
  documentId: string;
  path: string;
  line: number;
  rule: HealthRuleId;
  severity: "warning" | "info";
  penalty: number;
  message: string;
}
export interface DocumentHealth {
  id: string;
  path: string;
  title: string;
  score: number;
  issues: HealthIssue[];
  statistics: MarkdownModel["statistics"];
  owner: string;
  status: string;
  lastReviewed: string;
  nextReview: string;
  stale: boolean;
  updatedAt: number;
}
export interface WorkspaceHealth {
  version: 1;
  scope: "workspace" | "document";
  checkedAt: number;
  documents: DocumentHealth[];
  navigation: WorkspaceNavigation;
  summary: {
    documents: number;
    words: number;
    folders: number;
    issues: number;
    brokenLinks: number;
    missingMetadata: number;
    staleDocuments: number;
    unlinkedDocuments: number | null;
    score: number | null;
  };
}
const lastReviewKeys = [
  "last_reviewed",
  "last-reviewed",
  "lastReviewed",
  "last_reviewed_at",
  "lastReviewedAt",
];
const nextReviewKeys = [
  "next_review",
  "next-review",
  "nextReview",
  "next_review_date",
  "nextReviewDate",
];
function reviewDay(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return;
  const first = value.slice(0, 10);
  const day = Date.parse(first + "T00:00:00Z");
  if (
    !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== first
  )
    return;
  return day;
}
function fieldLine(doc: ReaderDocument, model: MarkdownModel, keys: string[]) {
  const lines = doc.content.split("\n").slice(0, model.frontmatter.lineOffset);
  const index = lines.findIndex((line) =>
    keys.some((key) => new RegExp(`^\\s*["']?${key}["']?\\s*[:=]`).test(line)),
  );
  return index < 0 ? 1 : index + 1;
}
export function analyzeWorkspace(
  documents: ReaderDocument[],
  assetPaths: string[] = [],
  now = Date.now(),
  options: {
    documentId?: string;
    progress?: (phase: string, done: number, total: number) => void;
  } = {},
): WorkspaceHealth {
  const selected = options.documentId
    ? documents.filter((d) => d.id === options.documentId)
    : documents;
  if (selected.reduce((n, d) => n + d.content.length, 0) > 25000000)
    throw new Error(
      "Analysis is limited to 25 million Markdown characters at a time. Analyze individual documents or split this workspace.",
    );
  const models = new Map<string, MarkdownModel>();
  selected.forEach((doc, i) => {
    models.set(doc.id, markdownModel(doc.content));
    if (i % 25 === 0 || i === selected.length - 1)
      options.progress?.("Parsing", i + 1, selected.length);
  });
  const lookup = referenceIndex(documents, models);
  const assets = new Set(assetPaths);
  const date = new Date(now);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const duplicates = new Map<string, ReaderDocument[]>();
  if (!options.documentId)
    for (const doc of selected) {
      const body = models
        .get(doc.id)!
        .frontmatter.body.trim()
        .replace(/\s+/g, " ");
      if (body.length >= 50)
        duplicates.set(body, [...(duplicates.get(body) || []), doc]);
    }
  const reports = selected.map((doc, i): DocumentHealth => {
    const model = models.get(doc.id)!;
    const metadata = model.frontmatter.metadata;
    const issues: HealthIssue[] = [];
    const add = (rule: HealthRuleId, message: string, line = 1) => {
      const definition = healthRules.find((r) => r.id === rule)!;
      issues.push({
        id: `${doc.id}:${rule}:${line}:${issues.length}`,
        documentId: doc.id,
        path: doc.path,
        line,
        rule,
        severity: definition.severity,
        penalty: definition.penalty,
        message,
      });
    };
    if (model.frontmatter.error)
      add("metadata_invalid", model.frontmatter.error);
    const titles = model.headings.filter((h) => h.depth === 1);
    if (!titles.length) add("missing_title", "Add a level-one document title.");
    if (titles.length > 1)
      for (const title of titles.slice(1))
        add(
          "multiple_titles",
          "Use a single level-one document title.",
          title.line,
        );
    const seen = new Set<string>();
    const lines = doc.content.split("\n");
    model.headings.forEach((heading, index) => {
      if (index && heading.depth > model.headings[index - 1].depth + 1)
        add(
          "heading_gap",
          `Skipped a heading level before “${heading.text}”.`,
          heading.line,
        );
      if (seen.has(heading.text.toLowerCase()))
        add(
          "duplicate_heading",
          `Repeated heading: ${heading.text}`,
          heading.line,
        );
      seen.add(heading.text.toLowerCase());
      if (heading.depth > 4)
        add(
          "deep_heading",
          `Consider a shallower structure for “${heading.text}”.`,
          heading.line,
        );
      const next = model.headings[index + 1];
      if (
        (!next || next.depth <= heading.depth) &&
        !lines
          .slice(heading.line, next ? next.line - 1 : undefined)
          .join("\n")
          .replace(/<!--[\s\S]*?-->/g, "")
          .trim()
      )
        add(
          "empty_section",
          `No content under “${heading.text}”.`,
          heading.line,
        );
    });
    const anchors = new Set<string>();
    for (const anchor of model.anchorLocations) {
      if (anchors.has(anchor.id))
        add(
          "duplicate_anchor",
          `More than one element uses anchor ${anchor.id}.`,
          anchor.line,
        );
      anchors.add(anchor.id);
    }
    for (const paragraph of model.paragraphs)
      if (paragraph.text.trim().split(/\s+/u).length > 200)
        add(
          "long_paragraph",
          "Split this paragraph into smaller passages.",
          paragraph.line,
        );
    for (const raw of model.rawLinks) {
      const normalized = raw.href.trim().replace(/[\u0000-\u0020]/g, "");
      const scheme = /^([a-z][a-z\d+.-]*):/i
        .exec(normalized)?.[1]
        .toLowerCase();
      if (
        scheme &&
        !(
          raw.image
            ? ["http", "https", "asset", "blob"]
            : ["http", "https", "mailto", "tel", "wiki"]
        ).includes(scheme)
      )
        add(
          "unsafe_link",
          `The renderer blocks or does not support this URL scheme: ${scheme}.`,
          raw.line,
        );
      if (raw.image && !raw.alt?.trim())
        add("image_alt", "Add descriptive alt text to this image.", raw.line);
    }
    for (const link of model.links) {
      if (link.image) {
        if (
          /^(https?:|blob:|\/\/)/i.test(link.href) ||
          link.href === "asset:alpine-lake"
        )
          continue;
        try {
          const path = resolvePath(doc.path, link.href.split("#")[0]);
          if (!assets.has(path))
            add("missing_image", `Image not imported: ${path}`, link.line);
        } catch {
          add(
            "invalid_link",
            "This image path contains invalid URL encoding.",
            link.line,
          );
        }
        continue;
      }
      const target = resolveDocumentLink(doc, link.href, documents, lookup);
      if (target.external || (!target.target && assets.has(target.path)))
        continue;
      if (target.error === "unsupported") continue;
      if (target.error === "ambiguous")
        add(
          "ambiguous_wiki",
          `Several documents match wiki name ${target.path}. Include a folder path.`,
          link.line,
        );
      else if (target.error === "invalid")
        add("invalid_link", `Invalid URL encoding in ${link.href}`, link.line);
      else if (!target.target) {
        if (target.caseMatch)
          add(
            "case_mismatch",
            `Use the exact path case: ${target.caseMatch.path}`,
            link.line,
          );
        else
          add(
            "missing_document",
            `Missing local document or attachment: ${target.path}`,
            link.line,
          );
      } else if (
        target.anchor &&
        !(
          models.get(target.target.id) || markdownModel(target.target.content)
        ).anchors.includes(target.actualAnchor)
      )
        add(
          "missing_anchor",
          `No anchor “${target.anchor}” in ${target.target.path}.`,
          link.line,
        );
    }
    const owner = metadataString(metadata, "owner");
    if (!owner)
      add("missing_owner", "No document owner is declared in frontmatter.");
    const lastReviewed = metadataString(metadata, ...lastReviewKeys);
    const nextReview = metadataString(metadata, ...nextReviewKeys);
    const last = reviewDay(lastReviewed),
      next = reviewDay(nextReview);
    let stale = false;
    if (!lastReviewed)
      add(
        "missing_review",
        "No last_reviewed date is declared in frontmatter.",
      );
    else if (last === undefined || last > today)
      add(
        "invalid_review",
        last === undefined
          ? "Use an ISO date for last_reviewed."
          : "The declared last-review date is in the future.",
        fieldLine(doc, model, lastReviewKeys),
      );
    if (nextReview && next === undefined)
      add(
        "invalid_review",
        "Use an ISO date for next_review.",
        fieldLine(doc, model, nextReviewKeys),
      );
    if (
      (next !== undefined && next < today) ||
      (next === undefined &&
        last !== undefined &&
        today - last > 180 * 86400000)
    ) {
      stale = true;
      add(
        "stale_review",
        next !== undefined
          ? "The declared next-review date is overdue."
          : "The last declared review is more than 180 days old.",
        fieldLine(
          doc,
          model,
          next !== undefined ? nextReviewKeys : lastReviewKeys,
        ),
      );
    }
    const equivalent = duplicates.get(
      model.frontmatter.body.trim().replace(/\s+/g, " "),
    );
    if (equivalent && equivalent.length > 1)
      add(
        "duplicate_content",
        `Same body after whitespace normalization as ${equivalent.find((d) => d.id !== doc.id)!.path}.`,
        model.frontmatter.lineOffset + 1,
      );
    if (i % 25 === 0 || i === selected.length - 1)
      options.progress?.("Checking", i + 1, selected.length);
    return {
      id: doc.id,
      path: doc.path,
      title:
        metadataString(metadata, "title") ||
        model.headings.find((h) => h.depth === 1)?.text ||
        fileName(doc.path),
      score: Math.max(
        0,
        100 - issues.reduce((sum, issue) => sum + issue.penalty, 0),
      ),
      issues,
      statistics: model.statistics,
      owner,
      status: metadataString(metadata, "status"),
      lastReviewed,
      nextReview,
      stale,
      updatedAt: doc.updatedAt,
    };
  });
  const navigation = options.documentId
    ? { edges: [], summaries: [] }
    : workspaceNavigation(documents, models);
  const connected = new Set(
    navigation.edges.flatMap((edge) => [edge.from, edge.to]),
  );
  const folders = new Set<string>();
  for (const doc of selected) {
    const parts = doc.path.split("/");
    for (let i = 1; i < parts.length; i++)
      folders.add(parts.slice(0, i).join("/"));
  }
  const all = reports.flatMap((report) => report.issues);
  const broken = new Set<HealthRuleId>([
    "missing_document",
    "missing_anchor",
    "case_mismatch",
    "ambiguous_wiki",
    "invalid_link",
    "unsafe_link",
    "missing_image",
  ]);
  return {
    version: 1,
    scope: options.documentId ? "document" : "workspace",
    checkedAt: now,
    documents: reports,
    navigation,
    summary: {
      documents: reports.length,
      words: reports.reduce((n, d) => n + d.statistics.words, 0),
      folders: folders.size,
      issues: all.length,
      brokenLinks: all.filter((i) => broken.has(i.rule)).length,
      missingMetadata: reports.filter((d) => !d.owner || !d.lastReviewed)
        .length,
      staleDocuments: reports.filter((d) => d.stale).length,
      unlinkedDocuments: options.documentId
        ? null
        : documents.filter((d) => !connected.has(d.id)).length,
      score: reports.length
        ? Math.round(reports.reduce((n, d) => n + d.score, 0) / reports.length)
        : null,
    },
  };
}
