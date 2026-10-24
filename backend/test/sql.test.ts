import { describe, expect, it } from "vitest";
import { parseSql, printSql } from "../src/sql/ast.js";
import {
  getConnector,
  registerConnector,
  type ConnectorAdapter,
} from "../src/sql/connectors.js";

describe("SQL AST parser", () => {
  it("parses and reprints a select", () => {
    const ast = parseSql("SELECT id FROM events");
    const sql = printSql(ast);

    expect(sql.toLowerCase()).toContain("select");
    expect(sql.toLowerCase()).toContain("events");
  });
});

describe("connector adapters", () => {
  it("registers and resolves an adapter", async () => {
    const adapter: ConnectorAdapter = {
      id: "test-memory",
      dialect: "PostgreSQL",
      async query() {
        return { columns: ["n"], rows: [{ n: 1 }] };
      },
    };

    registerConnector(adapter);

    const result = await getConnector("test-memory").query({ sql: "SELECT 1" });
    expect(result).toEqual({ columns: ["n"], rows: [{ n: 1 }] });
  });
});
