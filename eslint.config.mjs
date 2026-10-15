import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
    "public/search-worker.js",
    "public/regex-worker.js",
    "public/repository-diff-worker.js",
    "public/conversion-worker.js",
    "public/site-worker.js",
    "public/docx-export-worker.js",
    "public/pdf-worker.js",
    "public/pdf-assets/**",
    "public/analysis-worker.js",
    "public/graph-worker.js",
  ]),
]);

export default eslintConfig;
