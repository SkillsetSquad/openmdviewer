import Dexie, { type EntityTable } from "dexie";
import type { ReaderDocument } from "./types";
const db = new Dexie("openmdviewer") as Dexie & {
  documents: EntityTable<ReaderDocument, "id">;
};
db.version(1).stores({ documents: "id, path, updatedAt, favorite" });
export const storage = {
  load: () => db.documents.toArray(),
  put: (doc: ReaderDocument) => db.documents.put(doc),
  putAll: (docs: ReaderDocument[]) => db.documents.bulkPut(docs),
  scroll: (id: string, scroll: number) => db.documents.update(id, { scroll }),
  remove: (id: string) => db.documents.delete(id),
};
