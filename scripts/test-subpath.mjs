import { mkdtemp, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const base = "/openmdviewer";
if (!(await readFile("out/index.html", "utf8")).includes(`${base}/_next/`))
  throw new Error(
    "Build with NEXT_PUBLIC_BASE_PATH=/openmdviewer before running subpath tests.",
  );
const stage = await mkdtemp(join(tmpdir(), "openmdviewer-subpath-"));
try {
  await cp("out", join(stage, "openmdviewer"), { recursive: true });
  const result = spawnSync(
    "npx",
    ["playwright", "test", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, STATIC_TEST_DIR: stage, TEST_BASE_PATH: base },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await rm(stage, { recursive: true, force: true });
}
