import { describe, expect, it } from "vitest";
import { sanitizeCsvCell, serializeToSafeCsv } from "../src/security/csv.js";

describe("Safe CSV serialization and formula injection defense (CWE-1236)", () => {
  it("prefixes cells starting with formula trigger characters with a single quote", () => {
    expect(sanitizeCsvCell("=1+1")).toBe('"\'=1+1"');
    expect(sanitizeCsvCell("=SUM(A1:B10)")).toBe('"\'=SUM(A1:B10)"');
    expect(sanitizeCsvCell("@SUM(A1:B10)")).toBe('"\'@SUM(A1:B10)"');
    expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe(
      "\"'+cmd|' /C calc'!A0\"",
    );
    expect(sanitizeCsvCell("-2+3+cmd|' /C calc'!A0")).toBe(
      "\"'-2+3+cmd|' /C calc'!A0\"",
    );
    expect(sanitizeCsvCell("\tmalicious")).toBe('"\'\tmalicious"');
    expect(sanitizeCsvCell("\rmalicious")).toBe('"\'\rmalicious"');
  });

  it("preserves legitimate numeric values without formula escaping", () => {
    expect(sanitizeCsvCell(-20)).toBe("-20");
    expect(sanitizeCsvCell(42)).toBe("42");
    expect(sanitizeCsvCell(0)).toBe("0");
    expect(sanitizeCsvCell("-3.1415")).toBe("-3.1415");
    expect(sanitizeCsvCell("+100")).toBe("+100");
  });

  it("properly escapes double quotes, commas, and line breaks", () => {
    expect(sanitizeCsvCell('He said "hello"')).toBe('"He said ""hello"""');
    expect(sanitizeCsvCell("school, district")).toBe('"school, district"');
    expect(sanitizeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("handles null and undefined as empty strings", () => {
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");
  });

  it("serializes full tabular dataset with RFC 4180 CRLF line endings", () => {
    const columns = ["school_id", "delta", "notes"];
    const rows = [
      { school_id: "SCH-001", delta: -20, notes: "Normal" },
      { school_id: "SCH-004", delta: -10, notes: "=SUM(danger)" },
      {
        school_id: "SCH-007",
        delta: null,
        notes: 'Quoted "value", with comma',
      },
    ];

    const csv = serializeToSafeCsv(columns, rows);
    expect(csv).toBe(
      'school_id,delta,notes\r\nSCH-001,-20,Normal\r\nSCH-004,-10,"\'=SUM(danger)"\r\nSCH-007,,"Quoted ""value"", with comma"\r\n',
    );
  });
});
