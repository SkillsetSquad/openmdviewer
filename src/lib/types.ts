export interface ReaderDocument {
  workspaceId?: string;
  revision?: number;
  deletedAt?: number;
  id: string;
  path: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  favorite: boolean;
  scroll: number;
}
export type ReadingMode = "read" | "split" | "source";
export type ReaderTheme =
  "dark" | "light" | "sepia" | "oled" | "contrast" | "system";
export interface Preferences {
  theme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  readingWidth: number;
  fontFamily: "sans" | "serif" | "mono";
}
export interface Heading {
  id: string;
  text: string;
  depth: number;
}
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export interface ReaderAsset {
  workspaceId?: string;
  path: string;
  blob: Blob;
  type: string;
}

export interface LocalWorkspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  createdAt: number;
  initialized: boolean;
}
export interface DocumentSnapshot {
  id: string;
  documentId: string;
  workspaceId: string;
  document: ReaderDocument;
  createdAt: number;
  reason: "edit" | "restore" | "trash";
}

export interface SourceReference {
  href: string;
  text: string;
  line: number;
  image: boolean;
  alt?: string;
}
