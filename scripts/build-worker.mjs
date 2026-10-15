import { build } from "esbuild";
await build({
  entryPoints: {
    "search-worker": "src/workers/search.worker.ts",
    "analysis-worker": "src/workers/analysis.worker.ts",
    "graph-worker": "src/workers/graph.worker.ts",
  },
  outdir: "public",
  bundle: true,
  minify: true,
  platform: "browser",
  conditions: ["worker"],
  target: "es2020",
  format: "iife",
});
console.log("Bundled local search, analysis, and graph workers.");
