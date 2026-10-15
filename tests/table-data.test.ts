import { expect, it } from "vitest";
import {
  tableRows,
  tableCSV,
  tableJSON,
  tableNumbers,
} from "../src/lib/table-data";
it("combines table and column filters, sorts numeric cells, and restores stable source order without mutation", () => {
  const values = [
    ["Zebra", "12", "open"],
    ["Alpha", "2", "closed"],
    ["Alpine", "-10", "open"],
    ["Alpha", "2", "open"],
  ];
  const source = structuredClone(values);
  expect(
    tableRows(values, "al", ["", "", "open"], { column: 1, direction: 1 }).map(
      (row) => row.index,
    ),
  ).toEqual([2, 3]);
  expect(
    tableRows(values, "", [], { column: 1, direction: 1 }).map(
      (row) => row.index,
    ),
  ).toEqual([2, 1, 3, 0]);
  expect(tableRows(values, "", [], null).map((row) => row.index)).toEqual([
    0, 1, 2, 3,
  ]);
  expect(values).toEqual(source);
});
it("quotes CSV and neutralizes spreadsheet formulas even behind whitespace while leaving JSON values and duplicate headings intact", () => {
  const columns = ["Name", "Name", ""];
  const rows = [
    ['say "yes"', "  =FORMULA()", "line\nbreak"],
    ["\tdata", "-12", "@command"],
  ];
  expect(tableCSV([columns, ...rows])).toContain('"say ""yes"""');
  expect(tableCSV(rows)).toContain('"\'  =FORMULA()"');
  expect(tableCSV(rows)).toContain('"\'\tdata"');
  expect(tableCSV(rows)).toContain('"\'-12"');
  expect(JSON.parse(tableJSON(columns, rows))).toEqual({ columns, rows });
});
it("reports finite numeric summaries explicitly and leaves empty or overflowing aggregates unavailable", () => {
  const normal = tableNumbers(["2", "-10", "12", "", "$20", "NaN", "1,000"]);
  expect(normal).toMatchObject({ count: 3, sum: 4, min: -10, max: 12 });
  expect(normal.mean).toBeCloseTo(4 / 3, 12);
  expect(tableNumbers(["", "not numeric"])).toEqual({
    count: 0,
    sum: null,
    mean: null,
    min: null,
    max: null,
  });
  expect(tableNumbers(["1e308", "1e308"])).toEqual({
    count: 2,
    sum: null,
    mean: 1e308,
    min: 1e308,
    max: 1e308,
  });
});
