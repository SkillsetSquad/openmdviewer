import { build } from "esbuild";
const result = await build({
  entryPoints: {
    "conversion-worker": "src/workers/conversion.worker.ts",
    "regex-worker": "src/workers/regex.worker.ts",
    "search-worker": "src/workers/search.worker.ts",
    "analysis-worker": "src/workers/analysis.worker.ts",
    "graph-worker": "src/workers/graph.worker.ts",
  },
  outdir: "public",
  bundle: true,
  minify: true,
  platform: "browser",
  conditions: ["worker"],
  metafile: true,
  target: "es2020",
  format: "iife",
});
if (
  Object.keys(result.metafile.inputs).some((path) =>
    /node_modules\/(argparse|sprintf-js)\//.test(path),
  )
)
  throw new Error("CLI-only dependencies must not enter browser workers.");
console.log(
  "Bundled local search, regex, conversion, analysis, and graph workers.",
);
