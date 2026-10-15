export interface TableRow {
  index: number;
  values: string[];
}
export interface TableSort {
  column: number;
  direction: 1 | -1;
}
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
export function tableNumber(value: string): number | undefined {
  const text = value.trim();
  const number = numeric.test(text) ? Number(text) : NaN;
  return Number.isFinite(number) ? number : undefined;
}
export function tableRows(
  values: string[][],
  search: string,
  filters: string[],
  sort: TableSort | null,
): TableRow[] {
  const query = search.trim().toLocaleLowerCase();
  const columns = filters.map((filter) => filter.trim().toLocaleLowerCase());
  const rows = values
    .map((values, index) => ({ index, values }))
    .filter(
      (row) =>
        (!query || row.values.join(" ").toLocaleLowerCase().includes(query)) &&
        columns.every(
          (filter, column) =>
            !filter ||
            (row.values[column] || "").toLocaleLowerCase().includes(filter),
        ),
    );
  if (sort)
    rows.sort((a, b) => {
      const left = a.values[sort.column] || "",
        right = b.values[sort.column] || "";
      const x = tableNumber(left),
        y = tableNumber(right);
      const order =
        x !== undefined && y !== undefined
          ? x < y
            ? -1
            : x > y
              ? 1
              : 0
          : collator.compare(left, right);
      return order * sort.direction || a.index - b.index;
    });
  return rows;
}
export function csvCell(value: string) {
  // Quote every value and neutralize spreadsheet formulas, including leading whitespace.
  const safe =
    /^[\t\r\n]/.test(value) || /^\s*[=+\-@]/.test(value) ? "'" + value : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export const tableCSV = (rows: string[][]) =>
  rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
export const tableJSON = (columns: string[], rows: string[][]) =>
  JSON.stringify({ columns, rows }, null, 2);
export function tableNumbers(values: string[]) {
  let count = 0,
    sum = 0,
    mean = 0,
    min = Infinity,
    max = -Infinity;
  for (const value of values) {
    const number = tableNumber(value);
    if (number === undefined) continue;
    count++;
    sum += number;
    // Weighted terms avoid overflowing the difference between two finite values.
    mean = mean * ((count - 1) / count) + number / count;
    min = Math.min(min, number);
    max = Math.max(max, number);
  }
  return {
    count,
    sum: count && Number.isFinite(sum) ? sum : null,
    mean: count && Number.isFinite(mean) ? mean : null,
    min: count ? min : null,
    max: count ? max : null,
  };
}
