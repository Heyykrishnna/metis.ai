export type SqlToken = {
  text: string;
  kind: "plain" | "keyword" | "literal" | "comment" | "number";
};
const keywords = new Set(
  "SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER FULL CROSS ON AS AND OR NOT NULL IS IN EXISTS BETWEEN LIKE ILIKE GROUP BY ORDER ASC DESC HAVING LIMIT OFFSET DISTINCT WITH UNION ALL CASE WHEN THEN ELSE END COUNT SUM AVG MIN MAX COALESCE NULLIF OVER PARTITION TRUE FALSE CAST FILTER".split(
    " ",
  ),
);

export function tokenizeSql(code: string): SqlToken[] {
  return code
    .split(
      /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b[A-Za-z_][A-Za-z_0-9]*\b|\b\d+(?:\.\d+)?\b)/g,
    )
    .filter(Boolean)
    .map((text) => ({
      text,
      kind:
        text.startsWith("--") || text.startsWith("/*")
          ? "comment"
          : text.startsWith("'") || text.startsWith('"')
            ? "literal"
            : keywords.has(text.toUpperCase())
              ? "keyword"
              : /^\d+(?:\.\d+)?$/.test(text)
                ? "number"
                : "plain",
    }));
}
