import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE, parseLocalDocument } from "../src/lib/local-files";

function parse(name: string, text: string) {
  return parseLocalDocument(
    name,
    text,
    new TextEncoder().encode(text).length,
    "file-1",
    1000,
  );
}

describe("local data files", () => {
  it("parses quoted commas, escaped quotes, embedded newlines, CRLF, and a BOM", () => {
    const result = parse(
      "data.csv",
      '\uFEFFname,note\r\n"Lee, Jo","Said ""hello"""\r\nAna,"two\nlines"\r\n',
    );
    expect(result.columns).toEqual(["name", "note"]);
    expect(result.rows).toEqual([
      ["Lee, Jo", 'Said "hello"'],
      ["Ana", "two\nlines"],
    ]);
    expect(result.rowCount).toBe(2);
  });

  it("counts empty cells including completely empty records without counting blank lines", () => {
    const result = parse("data.csv", "name,value\nLee,\n,\n\nAna,12\n");
    expect(result.rowCount).toBe(3);
    expect(result.emptyCells).toBe(3);
  });

  it("keeps the whole-file record count and checks while bounding the preview", () => {
    const result = parse(
      "data.csv",
      `name,value\n${Array.from({ length: 150 }, (_, index) => `record${index},`).join("\n")}`,
    );
    expect(result.rows).toHaveLength(100);
    expect(result.rowCount).toBe(150);
    expect(result.emptyCells).toBe(150);
  });

  it.each([
    ["name,name\na,b", "unique"],
    ["name,\na,b", "needs a name"],
    ["name,value\na,b,c", "same number"],
    ['name,value\n"unclosed,b', "unclosed quote"],
    ['name,value\na"b,c', "quotation"],
    ['name,value\n"a"junk,b', "Unexpected content"],
  ])("rejects malformed CSV %s", (source, message) => {
    expect(() => parse("data.csv", source)).toThrow(message);
  });

  it("unifies JSON fields and represents missing values without guessing data types", () => {
    const result = parse(
      "data.json",
      '[{"name":"Lee","count":3},{"name":"Ana","active":false}]',
    );
    expect(result.columns).toEqual(["name", "count", "active"]);
    expect(result.rows).toEqual([
      ["Lee", "3", ""],
      ["Ana", "", "false"],
    ]);
    expect(result.emptyCells).toBe(2);
  });

  it("does not mistake inherited object properties for JSON field values", () => {
    const result = parse(
      "data.json",
      '[{"constructor":"one","__proto__":"two"},{}]',
    );
    expect(result.rows).toEqual([
      ["one", "two"],
      ["", ""],
    ]);
    expect(result.emptyCells).toBe(2);
  });

  it.each(['{"name":"Lee"}', "[1,2]", "[null]", "not-json"])(
    "rejects JSON without an array of objects: %s",
    (source) => {
      expect(() => parse("data.json", source)).toThrow();
    },
  );

  it("preserves markup as literal text and bounds long context previews", () => {
    const result = parse(
      "context.md",
      "<script>alert('hello')</script>" + "x".repeat(21000),
    );
    expect(result.text).toHaveLength(20000);
    expect(result.text).toContain("<script>");
    expect(result.kind).toBe("Text");
  });

  it("rejects empty, binary, unsupported, and oversized files", () => {
    expect(() => parse("empty.csv", " ")).toThrow("empty");
    expect(() => parse("binary.txt", "a\0b")).toThrow("UTF-8");
    expect(() => parse("report.pdf", "PDF")).toThrow("Choose a CSV");
    expect(() =>
      parseLocalDocument("large.csv", "a", MAX_FILE_SIZE + 1, "id", 1),
    ).toThrow("5 MB");
  });

  it("bounds rows and columns", () => {
    expect(() =>
      parse(
        "wide.csv",
        Array.from({ length: 101 }, (_, index) => `col${index}`).join(","),
      ),
    ).toThrow("100 columns");
    expect(() =>
      parse(
        "large.json",
        JSON.stringify(Array.from({ length: 10001 }, () => ({ a: 1 }))),
      ),
    ).toThrow("10,000 rows");
  });
});
