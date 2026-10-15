import { build } from "esbuild";
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
const result = await build({
  entryPoints: {
    "docx-export-worker": "src/workers/docx-export.worker.ts",
    "site-worker": "src/workers/site.worker.ts",
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
  "Bundled local search, regex, conversion, Word/website export, analysis, and graph workers.",
);

await cp(
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  "public/pdf-worker.js",
);
const resources = Object.create(null);
for (const folder of ["cmaps", "standard_fonts"]) {
  for (const filename of (
    await readdir(`node_modules/pdfjs-dist/${folder}`)
  ).sort()) {
    resources[`${folder}/${filename}`] = new Uint8Array(
      await readFile(`node_modules/pdfjs-dist/${folder}/${filename}`),
    );
  }
}
await writeFile(
  "public/pdf-resources.zip",
  zipSync(resources, { level: 6, mtime: new Date(1980, 0, 1, 0, 0, 0) }),
);
await cp("node_modules/pdfjs-dist/LICENSE", "public/pdf-LICENSE.txt");
// This app-owned directory existed only in the initial development build; do not publish stale resources.
await rm("public/pdf-assets", { recursive: true, force: true });
