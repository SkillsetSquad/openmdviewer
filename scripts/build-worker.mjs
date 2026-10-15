import { build } from "esbuild";
await build({
  entryPoints: ["src/workers/search.worker.ts"],
  outfile: "public/search-worker.js",
  bundle: true,
  minify: true,
  platform: "browser",
  target: "es2020",
  format: "iife",
});
console.log("Bundled local search worker.");
