"use client";
import {
  Children,
  isValidElement,
  useMemo,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Download,
  Search,
} from "lucide-react";
import { download } from "@/lib/documents";
type Child = ReactElement<{ children?: ReactNode }>;
const elements = (children: ReactNode) =>
  Children.toArray(children).filter(isValidElement) as Child[];
const text = (node: ReactNode): string =>
  Children.toArray(node)
    .map((n) =>
      isValidElement<{ children?: ReactNode }>(n)
        ? text(n.props.children)
        : String(n),
    )
    .join("");
const csvCell = (value: string) =>
  `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
export function InteractiveTable({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{
    column: number;
    direction: 1 | -1;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const sections = elements(children);
  const header = sections.find((s) => s.type === "thead");
  const body = sections.find((s) => s.type === "tbody");
  const headerRow = elements(header?.props.children)[0];
  const cells = elements(headerRow?.props.children);
  const rows = elements(body?.props.children);
  const displayed = useMemo(() => {
    const list = rows.filter(
      (r) =>
        !filter ||
        text(r.props.children).toLowerCase().includes(filter.toLowerCase()),
    );
    if (sort)
      list.sort(
        (a, b) =>
          text(
            elements(a.props.children)[sort.column]?.props.children,
          ).localeCompare(
            text(elements(b.props.children)[sort.column]?.props.children),
            undefined,
            { numeric: true },
          ) * sort.direction,
      );
    return list;
  }, [rows, filter, sort]);
  const csv = () =>
    [
      cells.map((c) => csvCell(text(c.props.children))).join(","),
      ...displayed.map((r) =>
        elements(r.props.children)
          .map((c) => csvCell(text(c.props.children)))
          .join(","),
      ),
    ].join("\r\n");
  return (
    <div className="interactive-table">
      <div className="table-tools">
        <label>
          <Search size={12} />
          <input
            aria-label="Filter table rows"
            placeholder="Filter table…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <span>{displayed.length} rows</span>
        <button
          aria-label="Copy table as CSV"
          title="Copy table as CSV"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(csv());
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              download("table.csv", csv(), "text/csv;charset=utf-8");
            }
          }}
        >
          {copied ? "Copied" : <Copy size={12} />}
        </button>
        <button
          aria-label="Export table as CSV"
          title="Export table as CSV"
          onClick={() => download("table.csv", csv(), "text/csv;charset=utf-8")}
        >
          <Download size={12} />
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {cells.map((cell, i) => (
                <th
                  key={i}
                  aria-sort={
                    sort?.column === i
                      ? sort.direction === 1
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() =>
                      setSort({
                        column: i,
                        direction:
                          sort?.column === i && sort.direction === 1 ? -1 : 1,
                      })
                    }
                  >
                    {cell.props.children}
                    {sort?.column === i ? (
                      sort.direction === 1 ? (
                        <ArrowUp size={11} />
                      ) : (
                        <ArrowDown size={11} />
                      )
                    ) : (
                      <ArrowUpDown size={11} />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{displayed}</tbody>
        </table>
      </div>
      {!displayed.length && <p className="empty-panel">No matching rows.</p>}
    </div>
  );
}
