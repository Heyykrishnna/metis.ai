import { expect, it } from "vitest";
import { tokenizeSql } from "../src/lib/sql-display";

it("preserves the exact executed query including whitespace and quoted content", () => {
  const sql =
    "SELECT \"order value\", 'O''Brien' AS customer\nFROM sales.orders\nWHERE revenue >= 0.10;";
  expect(
    tokenizeSql(sql)
      .map((token) => token.text)
      .join(""),
  ).toBe(sql);
  expect(tokenizeSql(sql)).toContainEqual({ text: "SELECT", kind: "keyword" });
  expect(tokenizeSql(sql)).toContainEqual({
    text: "'O''Brien'",
    kind: "literal",
  });
});

it("does not highlight keywords inside SQL literals or comments as statements", () => {
  const tokens = tokenizeSql(
    "SELECT 'DROP TABLE', 12 -- FROM private\n/* WHERE secret */",
  );
  expect(tokens).toContainEqual({ text: "'DROP TABLE'", kind: "literal" });
  expect(tokens).toContainEqual({ text: "-- FROM private", kind: "comment" });
  expect(tokens).toContainEqual({
    text: "/* WHERE secret */",
    kind: "comment",
  });
  expect(tokens).toContainEqual({ text: "12", kind: "number" });
});
