import type { LocalFileHandle } from "./local-file-types";
import type { LocalWorkspace, ReaderAsset, ReaderDocument } from "./types";
export type LocalDirectoryHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterableIterator<
    FileSystemFileHandle | LocalDirectoryHandle
  >;
  queryPermission: LocalFileHandle["queryPermission"];
  requestPermission: LocalFileHandle["requestPermission"];
};
export interface DirectoryEntry {
  path: string;
  hash: string;
  documentId?: string;
}
export interface LocalDirectorySource {
  workspaceId: string;
  token: string;
  name: string;
  handle: LocalDirectoryHandle;
  entries: DirectoryEntry[];
  checkedAt: number;
}
export interface DirectoryImport {
  workspace: LocalWorkspace;
  source: LocalDirectorySource;
  documents: ReaderDocument[];
  assets: ReaderAsset[];
  files: import("./local-file-types").LocalFileSource[];
}
