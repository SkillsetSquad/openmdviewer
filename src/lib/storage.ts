import Dexie, { type EntityTable } from "dexie";
import type { ReaderDocument, ReaderAsset } from "./types";
const db = new Dexie("openmdviewer") as Dexie & {
  documents: EntityTable<ReaderDocument, "id">;
  assets: EntityTable<ReaderAsset, "path">;
};
db.version(1).stores({ documents: "id, path, updatedAt, favorite" });
db.version(2).stores({
  documents: "id, path, updatedAt, favorite",
  assets: "path",
});
export const storage = {
  loadAssets: () => db.assets.toArray(),
  import: (documents: ReaderDocument[], assets: ReaderAsset[]) =>
    db.transaction("rw", db.documents, db.assets, async () => {
      await db.documents.bulkPut(documents);
      await db.assets.bulkPut(assets);
    }),
  load: () => db.documents.toArray(),
  put: (doc: ReaderDocument) => db.documents.put(doc),
  putAll: (docs: ReaderDocument[]) => db.documents.bulkPut(docs),
  scroll: (id: string, scroll: number) => db.documents.update(id, { scroll }),
  remove: (id: string) => db.documents.delete(id),
};
