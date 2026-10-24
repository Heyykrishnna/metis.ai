import type { ConnectorAdapter } from "../../src/sql/connectors.js";
export function fixtureAdapter(): ConnectorAdapter {
  return {
    id: "default-analytical",
    dialect: "PostgreSQL" as const,
    async query(input) {
      if (input.sql.includes("information_schema.tables")) {
        return {
          columns: ["schema", "name"],
          rows: [
            { schema: "analytics_clean", name: "schools" },
            { schema: "analytics_clean", name: "enrolments" },
          ],
        };
      }
      if (input.sql.includes("information_schema.columns")) {
        return {
          columns: ["schema", "table_name", "name", "type", "nullable"],
          rows: [
            {
              schema: "analytics_clean",
              table_name: "schools",
              name: "id",
              type: "integer",
              nullable: false,
            },
            {
              schema: "analytics_clean",
              table_name: "schools",
              name: "name",
              type: "text",
              nullable: false,
            },
            {
              schema: "analytics_clean",
              table_name: "enrolments",
              name: "school_id",
              type: "integer",
              nullable: false,
            },
            {
              schema: "analytics_clean",
              table_name: "enrolments",
              name: "year",
              type: "integer",
              nullable: false,
            },
            {
              schema: "analytics_clean",
              table_name: "enrolments",
              name: "enrolled",
              type: "integer",
              nullable: true,
            },
          ],
        };
      }
      if (input.sql.includes("count(*)")) {
        return { columns: ["cnt"], rows: [{ cnt: 6 }] };
      }
      return {
        columns: ["school_id", "delta"],
        rows: [
          { school_id: 1, delta: -20 },
          { school_id: 4, delta: -10 },
        ],
      };
    },
  };
}
