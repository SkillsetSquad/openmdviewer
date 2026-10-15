import { expect, it } from "vitest";
import { commandMatches, commands } from "../src/lib/commands";
it("finds commands by labels, prefixes, fuzzy typos, and multi-word aliases", () => {
  expect(commandMatches("grph", true).some((c) => c.id === "graph")).toBe(true);
  expect(commandMatches("settngs", true).some((c) => c.id === "settings")).toBe(
    true,
  );
  expect(commandMatches("export pdf", true).map((c) => c.id)).toContain(
    "exportPdf",
  );
  expect(commandMatches("clipboard", true).map((c) => c.id)).toContain("copy");
  expect(commandMatches("> incoming", true).map((c) => c.id)).toContain(
    "backlinks",
  );
});
it("reserves document filters and phrases, supports command-only discovery, and hides unavailable document actions", () => {
  expect(commandMatches("status:approved tag:operations", true)).toEqual([]);
  expect(commandMatches('"Markdown"', true)).toEqual([]);
  expect(commandMatches(">", true)).toHaveLength(commands.length);
  expect(commandMatches(">", false).every((c) => !("document" in c))).toBe(
    true,
  );
  expect(commandMatches("copy markdown", false)).toEqual([]);
  expect(commandMatches("", true).every((c) => "quick" in c)).toBe(true);
  expect(commandMatches("unmatchablexyz9876", true)).toEqual([]);
});
