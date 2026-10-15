import { rm } from "node:fs/promises";
// This is generated static output only. Browser documents live in IndexedDB.
await rm(new URL("../out/", import.meta.url), { recursive: true, force: true });
console.log("Cleared the previous generated static export.");
