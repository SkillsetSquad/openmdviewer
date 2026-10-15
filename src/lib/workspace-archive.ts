import type { LocalWorkspace, ReaderDocument } from "./types";
export const workspaceMetadataPath = ".openmdviewer/workspace.json";
export function workspaceMetadata(
  documents: ReaderDocument[],
  workspace?: LocalWorkspace,
) {
  return JSON.stringify(
    {
      format: "openmdviewer",
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: workspace
        ? {
            name: workspace.name,
            description: workspace.description,
            icon: workspace.icon,
          }
        : undefined,
      documents: documents.map((d) => ({
        path: d.path,
        tags: d.tags,
        favorite: d.favorite,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    },
    null,
    2,
  );
}
export function applyWorkspaceMetadata(
  documents: ReaderDocument[],
  source: string,
) {
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== "object")
    throw new Error("Workspace metadata must be an object.");
  const data = value as {
    format?: unknown;
    version?: unknown;
    documents?: unknown;
  };
  if (
    data.format !== "openmdviewer" ||
    data.version !== 1 ||
    !Array.isArray(data.documents) ||
    data.documents.length > 10000
  )
    throw new Error("Unsupported workspace metadata format.");
  const map = new Map(documents.map((d) => [d.path, d]));
  for (const record of data.documents) {
    if (
      !record ||
      typeof record !== "object" ||
      typeof record.path !== "string"
    )
      continue;
    const doc = map.get(record.path);
    if (!doc) continue;
    if (Array.isArray(record.tags))
      doc.tags = [
        ...new Set<string>(
          (record.tags as unknown[])
            .filter((t: unknown): t is string => typeof t === "string")
            .slice(0, 100)
            .map((t: string) => t.slice(0, 80)),
        ),
      ];
    if (typeof record.favorite === "boolean") doc.favorite = record.favorite;
    for (const field of ["createdAt", "updatedAt"] as const)
      if (
        Number.isFinite(record[field]) &&
        record[field] >= 0 &&
        record[field] < 1e13
      )
        doc[field] = record[field];
  }
}
