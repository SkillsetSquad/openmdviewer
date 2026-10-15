"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
  type CSSProperties,
  type AriaAttributes,
} from "react";
import { flushSync } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChartNoAxesColumn,
  Copy,
  Download,
  FileJson,
  Filter,
  Maximize2,
  RotateCcw,
  Search,
} from "lucide-react";
import { download } from "@/lib/documents";
import {
  tableRows,
  tableCSV,
  tableJSON,
  tableNumbers,
  type TableSort,
} from "@/lib/table-data";
import { Modal } from "./modal";
type Child = ReactElement<{
  children?: ReactNode;
  style?: CSSProperties;
  colSpan?: number;
  rowSpan?: number;
  alt?: string;
  checked?: boolean;
  scope?: string;
  "data-column"?: number;
  "aria-sort"?: AriaAttributes["aria-sort"];
}>;
const elements = (children: ReactNode) =>
  Children.toArray(children).filter(isValidElement) as Child[];
const text = (node: ReactNode): string =>
  Children.toArray(node)
    .map((value) => {
      if (!isValidElement<Child["props"]>(value)) return String(value);
      if (typeof value.props.alt === "string") return value.props.alt;
      if (value.type === "br") return "\n";
      if (value.type === "input") return value.props.checked ? "[x]" : "[ ]";
      return text(value.props.children);
    })
    .join("");
function readTable(children: ReactNode) {
  const sections = elements(children),
    header = sections.find((s) => s.type === "thead"),
    body = sections.find((s) => s.type === "tbody");
  const headerRows = elements(header?.props.children),
    cells = elements(headerRows[0]?.props.children),
    rows = elements(body?.props.children);
  const supported =
    !!body &&
    sections.filter((section) => section.type === "thead").length === 1 &&
    sections.filter((section) => section.type === "tbody").length === 1 &&
    headerRows.length === 1 &&
    cells.length > 0 &&
    !sections.some((s) => s.type !== "thead" && s.type !== "tbody") &&
    cells.every(
      (cell) =>
        cell.type === "th" &&
        (cell.props.colSpan === undefined || cell.props.colSpan === 1) &&
        (cell.props.rowSpan === undefined || cell.props.rowSpan === 1),
    ) &&
    rows.every(
      (row) =>
        row.type === "tr" &&
        elements(row.props.children).length === cells.length &&
        elements(row.props.children).every(
          (cell) =>
            cell.type === "td" &&
            (cell.props.colSpan === undefined || cell.props.colSpan === 1) &&
            (cell.props.rowSpan === undefined || cell.props.rowSpan === 1),
        ),
    );
  return {
    cells,
    rows,
    supported,
    headers: cells.map((cell) => text(cell.props.children)),
    values: rows.map((row) =>
      elements(row.props.children).map((cell) => text(cell.props.children)),
    ),
  };
}
const pageSize = 50;
const format = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat(undefined, { maximumSignificantDigits: 8 }).format(
        value,
      );
export function InteractiveTable({ children }: { children: ReactNode }) {
  const model = useMemo(() => readTable(children), [children]);
  const [filter, setFilter] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [sort, setSort] = useState<TableSort | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [copyTools, setCopyTools] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const [status, setStatus] = useState("");
  const [printing, setPrinting] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const drag = useRef<{
    column: number;
    start: number;
    widths: number[];
  } | null>(null);
  const displayed = useMemo(
    () => tableRows(model.values, filter, columns, sort),
    [model.values, filter, columns, sort],
  );
  const summaries = useMemo(
    () =>
      showStats
        ? model.headers.map((_, column) =>
            tableNumbers(displayed.map((row) => row.values[column] || "")),
          )
        : [],
    [showStats, model.headers, displayed],
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(displayed.length / pageSize) - 1),
  );
  const visible = displayed.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(message);
    } catch {
      setStatus(
        "Clipboard unavailable. Export CSV or JSON to keep a local copy.",
      );
    }
  }
  const measured = () =>
    Array.from(
      tableRef.current?.querySelectorAll<HTMLTableCellElement>(
        "thead tr:first-child th[data-column]",
      ) || [],
    ).map((cell) =>
      Math.max(
        80,
        Math.min(640, Math.round(cell.getBoundingClientRect().width)),
      ),
    );
  const resize = (column: number, value: number, base = measured()) => {
    if (base.length !== model.cells.length) return;
    const next = [...base];
    next[column] = Math.max(80, Math.min(640, Math.round(value)));
    setWidths(next);
  };
  const reset = () => {
    setFilter("");
    setColumns([]);
    setSort(null);
    setWidths([]);
    setPage(0);
    setStatus("Table view reset. Source Markdown unchanged.");
  };
  const toolbar = (dialog = false) => (
    <div className="table-tools">
      {model.supported ? (
        <>
          <label>
            <Search size={13} aria-hidden="true" />
            <input
              aria-label="Filter table rows"
              placeholder="Filter table…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <span>
            {displayed.length} of {model.rows.length} rows ·{" "}
            {model.cells.length} columns
          </span>
          <button
            aria-label="Column filters"
            title="Column filters"
            aria-pressed={showFilters}
            onClick={() => {
              setShowFilters(!showFilters);
              if (showFilters) {
                setColumns([]);
                setPage(0);
              }
            }}
          >
            <Filter size={14} />
          </button>
          <button
            aria-label="Cell and row copy controls"
            title="Cell and row copy controls"
            aria-pressed={copyTools}
            onClick={() => setCopyTools(!copyTools)}
          >
            <Copy size={14} />
          </button>
          <button
            aria-label="Table statistics"
            title="Table statistics"
            aria-pressed={showStats}
            onClick={() => setShowStats(!showStats)}
          >
            <ChartNoAxesColumn size={14} />
          </button>
          <button
            aria-label="Copy table as CSV"
            title="Copy filtered table as CSV"
            onClick={() =>
              void copy(
                tableCSV([model.headers, ...displayed.map((r) => r.values)]),
                "Table copied as CSV.",
              )
            }
          >
            <Copy size={14} />
            <span className="sr-only">CSV</span>
          </button>
          <button
            aria-label="Export table as CSV"
            title="Export filtered table as CSV"
            onClick={() =>
              download(
                "table.csv",
                tableCSV([model.headers, ...displayed.map((r) => r.values)]),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={14} />
          </button>
          <button
            aria-label="Export table as JSON"
            title="Export filtered table as JSON"
            onClick={() =>
              download(
                "table.json",
                tableJSON(
                  model.headers,
                  displayed.map((r) => r.values),
                ),
                "application/json",
              )
            }
          >
            <FileJson size={14} />
          </button>
          <button
            aria-label="Reset table view"
            title="Reset filters, sorting, and widths"
            onClick={reset}
          >
            <RotateCcw size={14} />
          </button>
        </>
      ) : (
        <span>Merged or irregular table · original layout</span>
      )}
      {!dialog && (
        <button
          aria-label="Expand table"
          title="Fullscreen table view"
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
        >
          <Maximize2 size={14} />
        </button>
      )}
    </div>
  );
  const content = (
    <>
      {showStats && model.supported && (
        <section className="table-statistics" aria-label="Table statistics">
          <p>
            Approximate numeric summaries for all {displayed.length} matching
            rows. Only plain finite numbers are included; currency and formatted
            text are excluded. — means unavailable.
          </p>
          <div>
            {model.headers.map((header, column) => (
              <dl key={column}>
                <dt>{header || `Column ${column + 1}`}</dt>
                <dd>{summaries[column].count} numeric values</dd>
                <dd>
                  Sum {format(summaries[column].sum)} · Mean{" "}
                  {format(summaries[column].mean)}
                </dd>
                <dd>
                  Min {format(summaries[column].min)} · Max{" "}
                  {format(summaries[column].max)}
                </dd>
              </dl>
            ))}
          </div>
        </section>
      )}
      <div className="table-scroll">
        {!model.supported || printing ? (
          <table>{children}</table>
        ) : (
          <table
            ref={tableRef}
            style={
              widths.length
                ? {
                    tableLayout: "fixed",
                    width:
                      widths.reduce((sum, width) => sum + width, 0) +
                      (copyTools ? 44 : 0),
                  }
                : undefined
            }
          >
            {!!widths.length && (
              <colgroup>
                {widths.map((width, column) => (
                  <col key={column} style={{ width }} />
                ))}
                {copyTools && <col style={{ width: 44 }} />}
              </colgroup>
            )}
            <thead>
              <tr>
                {model.cells.map((cell, column) =>
                  cloneElement(cell, {
                    key: column,
                    scope: "col",
                    "data-column": column,
                    "aria-sort":
                      sort?.column === column
                        ? sort.direction === 1
                          ? "ascending"
                          : "descending"
                        : "none",
                    children: (
                      <>
                        <div className="table-heading-content">
                          <div className="table-heading-label">
                            {cell.props.children}
                          </div>
                          <button
                            aria-label={`Sort by ${model.headers[column] || `Column ${column + 1}`}`}
                            title={`Sort by ${model.headers[column] || `Column ${column + 1}`}`}
                            onClick={() => {
                              setSort(
                                sort?.column === column
                                  ? sort.direction === 1
                                    ? { column, direction: -1 }
                                    : null
                                  : { column, direction: 1 },
                              );
                              setPage(0);
                            }}
                          >
                            {sort?.column === column ? (
                              sort.direction === 1 ? (
                                <ArrowUp size={11} />
                              ) : (
                                <ArrowDown size={11} />
                              )
                            ) : (
                              <ArrowUpDown size={11} />
                            )}
                          </button>
                        </div>
                        <div
                          role="separator"
                          tabIndex={0}
                          aria-label={`Resize column ${column + 1}${model.headers[column] ? ` (${model.headers[column]})` : ""}`}
                          aria-orientation="vertical"
                          aria-valuemin={0}
                          aria-valuemax={640}
                          aria-valuenow={widths[column] || 0}
                          aria-valuetext={
                            widths[column]
                              ? `${widths[column]} pixels`
                              : "Automatic width"
                          }
                          className="table-column-resize"
                          onPointerDown={(event) => {
                            const base = measured();
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                            drag.current = {
                              column,
                              start: event.clientX,
                              widths: base,
                            };
                            event.preventDefault();
                          }}
                          onPointerMove={(event) => {
                            if (drag.current?.column === column)
                              resize(
                                column,
                                drag.current.widths[column] +
                                  event.clientX -
                                  drag.current.start,
                                drag.current.widths,
                              );
                          }}
                          onPointerUp={() => {
                            drag.current = null;
                          }}
                          onPointerCancel={() => {
                            drag.current = null;
                          }}
                          onKeyDown={(event) => {
                            if (
                              ![
                                "ArrowLeft",
                                "ArrowRight",
                                "Home",
                                "End",
                              ].includes(event.key)
                            )
                              return;
                            event.preventDefault();
                            const base = measured();
                            resize(
                              column,
                              event.key === "Home"
                                ? 80
                                : event.key === "End"
                                  ? 640
                                  : (base[column] || 180) +
                                    (event.key === "ArrowLeft" ? -16 : 16),
                              base,
                            );
                          }}
                        />
                      </>
                    ),
                  }),
                )}
                {copyTools && (
                  <th className="table-row-tools" scope="col">
                    <span className="sr-only">Row actions</span>
                  </th>
                )}
              </tr>
              {showFilters && (
                <tr className="table-column-filters">
                  {model.headers.map((header, column) => (
                    <th key={column}>
                      <input
                        aria-label={`Filter column ${column + 1}${header ? ` (${header})` : ""}`}
                        placeholder={header || `Column ${column + 1}`}
                        value={columns[column] || ""}
                        onChange={(event) => {
                          const next = [...columns];
                          next[column] = event.target.value;
                          setColumns(next);
                          setPage(0);
                        }}
                      />
                    </th>
                  ))}
                  {copyTools && (
                    <th className="table-row-tools">
                      <span className="sr-only">Row actions</span>
                    </th>
                  )}
                </tr>
              )}
            </thead>
            <tbody>
              {visible.map((row) =>
                cloneElement(model.rows[row.index], {
                  key: row.index,
                  children: (
                    <>
                      {elements(model.rows[row.index].props.children).map(
                        (cell, column) =>
                          cloneElement(cell, {
                            key: column,
                            children: (
                              <>
                                {cell.props.children}
                                {copyTools && (
                                  <button
                                    className="table-copy-cell"
                                    aria-label={`Copy cell row ${row.index + 1}, column ${column + 1}`}
                                    title="Copy cell text"
                                    onClick={() =>
                                      void copy(
                                        row.values[column] || "",
                                        "Cell text copied.",
                                      )
                                    }
                                  >
                                    <Copy size={12} />
                                  </button>
                                )}
                              </>
                            ),
                          }),
                      )}
                      {copyTools && (
                        <td className="table-row-tools">
                          <button
                            aria-label={`Copy row ${row.index + 1} as CSV`}
                            title="Copy row as CSV"
                            onClick={() =>
                              void copy(
                                tableCSV([row.values]),
                                "Row copied as CSV.",
                              )
                            }
                          >
                            <Copy size={13} />
                          </button>
                        </td>
                      )}
                    </>
                  ),
                }),
              )}
            </tbody>
          </table>
        )}
      </div>
      {!printing && model.supported && !displayed.length && (
        <p className="empty-panel">No matching rows.</p>
      )}
      {!printing && model.supported && displayed.length > pageSize && (
        <div className="table-pagination">
          <button
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous rows
          </button>
          <span>
            Rows {currentPage * pageSize + 1}–
            {Math.min((currentPage + 1) * pageSize, displayed.length)} of{" "}
            {displayed.length}
          </span>
          <button
            disabled={(currentPage + 1) * pageSize >= displayed.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next rows
          </button>
        </div>
      )}
      <p className="table-status" role="status" aria-live="polite">
        {status}
      </p>
    </>
  );
  return (
    <div
      className={`interactive-table ${copyTools ? "table-copy-enabled" : ""}`}
    >
      {toolbar()}
      {expanded && !printing ? (
        <p className="table-expanded-placeholder">
          Table open in expanded view.
        </p>
      ) : (
        content
      )}
      {expanded && (
        <Modal
          title="Expanded table"
          wide
          className={`expanded-table-dialog ${copyTools ? "table-copy-enabled" : ""}`}
          onClose={() => setExpanded(false)}
        >
          {toolbar(true)}
          {!printing && content}
        </Modal>
      )}
    </div>
  );
}
