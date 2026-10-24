import { FileInputError } from "./errors.js";
import { parse } from "csv-parse/sync";

export type ParsedFile = {
  kind: "CSV" | "JSON" | "Text";
  columns: string[];
  rows: string[][];
  text: string;
  emptyCells: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFile(name: string, bytes: Buffer): ParsedFile {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new FileInputError(
      "Use a UTF-8 encoded CSV, JSON, TXT, or Markdown file.",
    );
  }
  if (!text.trim() || text.includes("\0"))
    throw new FileInputError("The file is empty or contains binary data.");
  const extension = name.split(".").pop()?.toLowerCase();
  let kind: ParsedFile["kind"] = "Text";
  let columns: string[] = [];
  let rows: string[][] = [];
  if (extension === "csv") {
    kind = "CSV";
    let parsed: unknown;
    try {
      parsed = parse(text, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 1048576,
      });
    } catch {
      throw new FileInputError(
        "Invalid CSV: check quotes and use the same number of columns in each row.",
      );
    }
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (row): row is string[] =>
          Array.isArray(row) && row.every((value) => typeof value === "string"),
      )
    )
      throw new FileInputError("Could not read the CSV table.");
    columns = parsed.shift()?.map((value) => value.trim()) ?? [];
    rows = parsed;
    if (
      !columns.length ||
      columns.some((value) => !value) ||
      new Set(columns).size !== columns.length
    )
      throw new FileInputError("Use unique, nonempty column names.");
  } else if (extension === "json") {
    kind = "JSON";
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        text,
        (_key: string, value: unknown, context?: { source?: string }) => {
          if (typeof value !== "number") return value;
          if (context?.source === undefined)
            throw new Error("Numeric source unavailable");
          return context.source;
        },
      );
    } catch {
      throw new FileInputError("This file is not valid JSON.");
    }
    if (!Array.isArray(parsed) || !parsed.every(isRecord))
      throw new FileInputError("JSON data must be an array of objects.");
    if (parsed.length > 10000)
      throw new FileInputError("Use 10,000 rows or fewer.");
    columns = Array.from(new Set(parsed.flatMap((row) => Object.keys(row))));
    if (!columns.length || columns.some((column) => !column.trim()))
      throw new FileInputError(
        "JSON tables need nonempty column names and at least one object with fields.",
      );
    if (columns.length > 100)
      throw new FileInputError("Use 100 columns or fewer.");
    rows = parsed.map((row) =>
      columns.map((key) =>
        !Object.hasOwn(row, key) || row[key] === null
          ? ""
          : typeof row[key] === "string"
            ? row[key]
            : (JSON.stringify(row[key]) ?? ""),
      ),
    );
  } else if (extension !== "txt" && extension !== "md")
    throw new FileInputError("Supported files: CSV, JSON, TXT, and Markdown.");
  if (rows.length > 10000 || columns.length > 100)
    throw new FileInputError("Use up to 10,000 rows and 100 columns per file.");
  if (columns.some((column) => column.length > 255))
    throw new FileInputError("Column names must be 255 characters or fewer.");
  if (rows.some((row) => row.some((cell) => cell.length > 16384)))
    throw new FileInputError("Table cells must be 16,384 characters or fewer.");
  return {
    kind,
    columns,
    rows,
    text,
    emptyCells: rows.reduce(
      (total, row) => total + row.filter((cell) => !cell.trim()).length,
      0,
    ),
  };
}
