import type { ReaderDocument } from "./types";
import type { SearchOptions } from "./search-results";
import { searchHistoryEntry } from "./search-history";

export const collectionLimit = 100;
export const collectionMemberLimit = 10000;
export type CollectionDraft = { name: string } & (
  | { kind: "manual"; documentIds: string[] }
  | { kind: "tag"; tag: string }
  | { kind: "search"; query: string; options: SearchOptions }
);
export type ReaderCollection = CollectionDraft & {
  id: string;
  workspaceId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
};
export class CollectionConflict extends Error {
  constructor() {
    super(
      "This collection changed in another tab. Reload its saved version before editing again.",
    );
    this.name = "CollectionConflict";
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid collection definition.");
  return value as Record<string, unknown>;
}
function label(value: unknown, field: string, maximum = 80) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error(
      `${field} must contain 1–${maximum} characters without control characters.`,
    );
  return value.trim();
}
export const collectionNameKey = (name: string) =>
  name.normalize("NFKC").toLowerCase();
export function normalizeCollection(value: unknown): CollectionDraft {
  const data = object(value);
  const name = label(data.name, "Collection name");
  if (data.kind === "manual") {
    if (
      !Array.isArray(data.documentIds) ||
      data.documentIds.length > collectionMemberLimit ||
      data.documentIds.some(
        (id) => typeof id !== "string" || !id || id.length > 128,
      )
    )
      throw new Error(
        `Manual collections support up to ${collectionMemberLimit.toLocaleString("en-US")} valid document IDs.`,
      );
    return {
      name,
      kind: "manual",
      documentIds: [...new Set(data.documentIds as string[])],
    };
  }
  if (data.kind === "tag")
    return { name, kind: "tag", tag: label(data.tag, "Tag") };
  if (data.kind === "search") {
    const raw = object(data.options);
    for (const key of ["literal", "caseSensitive", "wholeWord", "regex"])
      if (raw[key] !== undefined && typeof raw[key] !== "boolean")
        throw new Error("Invalid saved-search options.");
    if (typeof data.query !== "string")
      throw new Error("A saved search needs a query.");
    const entry = searchHistoryEntry(data.query, {
      literal: raw.literal === true,
      caseSensitive: raw.caseSensitive === true,
      wholeWord: raw.wholeWord === true,
      ...(raw.regex === true ? { regex: true } : {}),
    });
    if (!entry)
      throw new Error(
        "Saved queries must contain 1–512 characters and cannot be commands.",
      );
    return { name, kind: "search", query: entry.query, options: entry.options };
  }
  throw new Error("Unsupported collection type.");
}

export function collectionArchive(
  collections: ReaderCollection[],
  documents: ReaderDocument[],
) {
  const paths = new Map(
    documents.filter((doc) => !doc.deletedAt).map((doc) => [doc.id, doc.path]),
  );
  return collections.map((collection) => {
    const draft = normalizeCollection(collection);
    if (draft.kind !== "manual") return draft;
    return {
      name: draft.name,
      kind: draft.kind,
      documentPaths: draft.documentIds.flatMap((id) =>
        paths.has(id) ? [paths.get(id)!] : [],
      ),
    };
  });
}
export function collectionsFromArchive(
  value: unknown,
  documents: ReaderDocument[],
): CollectionDraft[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > collectionLimit)
    throw new Error(
      `Workspace metadata supports up to ${collectionLimit} collections.`,
    );
  const ids = new Map(documents.map((doc) => [doc.path, doc.id]));
  return value.map((item) => {
    const data = object(item);
    if (data.kind !== "manual") return normalizeCollection(data);
    if (
      !Array.isArray(data.documentPaths) ||
      data.documentPaths.length > collectionMemberLimit
    )
      throw new Error("Invalid collection document paths.");
    const documentIds = data.documentPaths.map((path) => {
      if (typeof path !== "string" || !ids.has(path))
        throw new Error(
          "A collection references a document missing from this archive.",
        );
      return ids.get(path)!;
    });
    return normalizeCollection({
      name: data.name,
      kind: "manual",
      documentIds,
    });
  });
}
