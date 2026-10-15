import { diffLines } from "diff";
export interface RepositoryDiffRow {
  kind: "added" | "removed" | "unchanged";
  before: number | null;
  after: number | null;
  text: string;
}
export function repositoryDiff(before: string, after: string) {
  for (const value of [before, after]) {
    if (value.length > 100000 || value.split("\n").length > 4000)
      throw new Error(
        "Comparison supports up to 100,000 characters and 4,000 lines per file. Download the sources for larger comparisons.",
      );
  }
  const changes = diffLines(before, after, {
    timeout: 150,
    maxEditLength: 2000,
  });
  if (!changes)
    throw new Error(
      "This comparison exceeds the local diff complexity limit. Download the sources to compare them externally.",
    );
  const rows: RepositoryDiffRow[] = [];
  let oldLine = 1,
    newLine = 1,
    added = 0,
    removed = 0;
  for (const change of changes) {
    const lines = change.value.split("\n");
    if (lines.at(-1) === "") lines.pop();
    for (const line of lines) {
      rows.push({
        kind: change.added ? "added" : change.removed ? "removed" : "unchanged",
        before: change.added ? null : oldLine++,
        after: change.removed ? null : newLine++,
        text: line,
      });
      if (change.added) added++;
      if (change.removed) removed++;
    }
  }
  return { rows, added, removed, identical: before === after };
}
