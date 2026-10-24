export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  let str = typeof value === "string" ? value : String(value);

  const isPureNumber = /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(str);
  const needsFormulaPrefix = !isPureNumber && /^[=+\-@\t\r]/.test(str);

  if (needsFormulaPrefix) {
    str = `'${str}`;
  }

  const needsQuotes =
    needsFormulaPrefix ||
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");

  if (needsQuotes) {
    return `"${str.replaceAll('"', '""')}"`;
  }

  return str;
}

export function serializeToSafeCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const headerLine = columns.map(sanitizeCsvCell).join(",");
  const rowLines = rows.map((row) =>
    columns.map((col) => sanitizeCsvCell(row[col])).join(","),
  );

  return [headerLine, ...rowLines].join("\r\n") + "\r\n";
}
