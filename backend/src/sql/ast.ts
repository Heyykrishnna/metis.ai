import { createRequire } from "node:module";
import type { AST, Option } from "node-sql-parser";

interface SqlParser {
  astify(sql: string, opt?: Option): AST | AST[];
  sqlify(ast: AST | AST[], opt?: Option): string;
}

const { Parser } = createRequire(import.meta.url)("node-sql-parser") as {
  Parser: new () => SqlParser;
};

const parser = new Parser();

export type SqlAst = AST | AST[];
export type SqlDialect = NonNullable<Option["database"]>;

export function parseSql(
  sql: string,
  dialect: SqlDialect = "PostgreSQL",
): SqlAst {
  return parser.astify(sql, { database: dialect });
}

export function printSql(
  ast: SqlAst,
  dialect: SqlDialect = "PostgreSQL",
): string {
  return parser.sqlify(ast, { database: dialect });
}
