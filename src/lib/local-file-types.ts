export type LocalFileHandle = FileSystemFileHandle & {
  queryPermission: (options: {
    mode: "read" | "readwrite";
  }) => Promise<PermissionState>;
  requestPermission: (options: {
    mode: "read" | "readwrite";
  }) => Promise<PermissionState>;
};
export interface LocalFileSource {
  directoryId?: string;
  documentId: string;
  workspaceId: string;
  token: string;
  name: string;
  handle: LocalFileHandle;
  diskHash: string;
  browserHash: string;
  checkedAt: number;
}
