export type LocalDocument = {
  id: string;
  name: string;
  size: number;
  kind: "CSV" | "JSON" | "Text";
  columns: string[];
  rows: string[][];
  text: string;
  rowCount: number;
  emptyCells: number;
  addedAt: number;
};

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_FILES = 10;
const MAX_ROWS = 10000;
const MAX_COLUMNS = 100;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (quoted) {
        quoted = false;
        closedQuote = true;
      } else if (!cell && !closedQuote) quoted = true;
      else
        throw new Error(
          "Invalid CSV quotation. Wrap quoted values in double quotes.",
        );
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(cell);
      if (row.length > MAX_COLUMNS)
        throw new Error("Use a file with 100 columns or fewer.");
      cell = "";
      closedQuote = false;
      if (char !== ",") {
        if (char === "\r" && text[index + 1] === "\n") index++;
        rows.push(row);
        row = [];
        if (rows.length > MAX_ROWS + 1)
          throw new Error("Use a file with 10,000 rows or fewer.");
      }
    } else {
      if (closedQuote)
        throw new Error("Unexpected content after a closing CSV quote.");
      cell += char;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quote.");
  if (cell || row.length || closedQuote) rows.push([...row, cell]);
  return rows.filter((values) => values.length > 1 || values[0] !== "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLocalDocument(
  name: string,
  text: string,
  size: number,
  id: string,
  addedAt: number,
): LocalDocument {
  if (size > MAX_FILE_SIZE)
    throw new Error(`${name}: the maximum file size is 5 MB.`);
  if (!text.trim()) throw new Error(`${name}: this file is empty.`);
  if (text.includes("\0")) throw new Error(`${name}: use a UTF-8 text file.`);
  const extension = name.split(".").pop()?.toLowerCase();
  let columns: string[] = [];
  let rows: string[][] = [];
  let kind: LocalDocument["kind"] = "Text";
  const source = text.replace(/^\uFEFF/, "");
  if (extension === "csv") {
    kind = "CSV";
    const parsed = parseCsv(source);
    columns = parsed.shift()?.map((column) => column.trim()) ?? [];
    if (!columns.length || columns.some((column) => !column))
      throw new Error("Every CSV column needs a name.");
    if (new Set(columns).size !== columns.length)
      throw new Error("CSV column names must be unique.");
    rows = parsed;
    if (rows.some((row) => row.length !== columns.length))
      throw new Error(
        "Each CSV row must have the same number of columns as the header.",
      );
  } else if (extension === "json") {
    kind = "JSON";
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error("This file is not valid JSON.");
    }
    if (!Array.isArray(parsed) || !parsed.every(isRecord))
      throw new Error("Use a JSON array of objects to preview a table.");
    if (parsed.length > MAX_ROWS)
      throw new Error("Use a file with 10,000 rows or fewer.");
    columns = Array.from(new Set(parsed.flatMap((row) => Object.keys(row))));
    if (columns.length > MAX_COLUMNS)
      throw new Error("Use a file with 100 columns or fewer.");
    rows = parsed.map((row) =>
      columns.map((key) =>
        !Object.hasOwn(row, key) || row[key] == null
          ? ""
          : typeof row[key] === "string"
            ? row[key]
            : JSON.stringify(row[key]),
      ),
    );
  } else if (extension !== "txt" && extension !== "md") {
    throw new Error("Choose a CSV, JSON, TXT, or Markdown file.");
  }
  if (columns.length > MAX_COLUMNS)
    throw new Error("Use a file with 100 columns or fewer.");
  if (rows.length > MAX_ROWS)
    throw new Error("Use a file with 10,000 rows or fewer.");
  return {
    id,
    name,
    size,
    kind,
    columns,
    rows: rows.slice(0, 100),
    text: source.slice(0, 20000),
    rowCount: rows.length,
    emptyCells: rows.reduce(
      (sum, row) => sum + row.filter((cell) => !cell.trim()).length,
      0,
    ),
    addedAt,
  };
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}
