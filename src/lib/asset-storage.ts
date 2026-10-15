import type { ReaderAsset } from "./types";
// Older records contain Blobs. Some WebKit environments cannot prepare native
// Blob backing files for IndexedDB, but can persist the same bytes directly.
export type StoredAsset = Omit<ReaderAsset, "blob"> & {
  blob: Blob | ArrayBuffer;
};
export async function assetBytes(
  assets: StoredAsset[],
): Promise<StoredAsset[]> {
  const records: StoredAsset[] = [];
  for (const asset of assets) {
    if (asset.blob instanceof ArrayBuffer) records.push(asset);
    else if (asset.blob instanceof Blob)
      records.push({ ...asset, blob: await asset.blob.arrayBuffer() });
    else
      throw new Error(
        "A stored asset has an unsupported binary format. Its record has been preserved.",
      );
  }
  return records;
}
export function restoredAsset(asset: StoredAsset): ReaderAsset {
  if (asset.blob instanceof Blob) return asset as ReaderAsset;
  if (!(asset.blob instanceof ArrayBuffer))
    throw new Error(
      "A stored asset has an unsupported binary format. Its record has been preserved.",
    );
  return { ...asset, blob: new Blob([asset.blob], { type: asset.type }) };
}
export function blobPreparationFailed(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes(
      "Error preparing Blob/File data to be stored in object store",
    )
  );
}
