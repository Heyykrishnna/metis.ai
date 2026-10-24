import { randomUUID } from "node:crypto";
import type {
  ConstellationEdgeSchema,
  ConstellationNodeSchema,
  SchemaConstellation,
} from "../contracts/features.js";
import type { Static } from "typebox";
import {
  calculateSchemaHash,
  type DiscoveredForeignKey,
  type DiscoveredSchema,
  type DiscoveredTable,
} from "./schema.js";

type ConstellationNode = Static<typeof ConstellationNodeSchema>;
type ConstellationEdge = Static<typeof ConstellationEdgeSchema>;

export function generateSchemaConstellation(
  connectionId: string,
  snapshotId: string,
  schema: DiscoveredSchema,
): SchemaConstellation {
  const schemaHash = calculateSchemaHash(schema);
  const boundedTables = schema.tables.slice(0, 50);

  const nodes: ConstellationNode[] = boundedTables.map(
    (t: DiscoveredTable) => ({
      id: `${t.schema}.${t.name}`,
      name: t.name,
      schema: t.schema,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable,
      })),
      primaryKey: [...t.primaryKey],
      rowCount: t.rowCount,
    }),
  );

  const edges: ConstellationEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const table of boundedTables) {
    for (const fk of table.foreignKeys as DiscoveredForeignKey[]) {
      const edgeKey = `${table.schema}.${table.name}.${fk.column}->${fk.referencedSchema}.${fk.referencedTable}.${fk.referencedColumn}`;
      if (!edgeKeys.has(edgeKey)) {
        edgeKeys.add(edgeKey);
        edges.push({
          id: `edge-${randomUUID()}`,
          sourceTable: `${table.schema}.${table.name}`,
          sourceColumn: fk.column,
          targetTable: `${fk.referencedSchema}.${fk.referencedTable}`,
          targetColumn: fk.referencedColumn,
          confidence: "declared",
          isAuthoritative: true,
          notes: "Foreign key constraint declared in database schema",
        });
      }
    }
  }

  for (const source of boundedTables) {
    if (edges.length >= 100) break;
    for (const target of boundedTables) {
      if (edges.length >= 100) break;
      if (source === target) continue;

      for (const col of source.columns) {
        const colLower = col.name.toLowerCase();
        const targetSingular = target.name.replace(/s$/, "").toLowerCase();

        const isExactMatch =
          target.columns.some((tc) => tc.name.toLowerCase() === colLower) &&
          colLower !== "id" &&
          colLower.includes("_id");

        const isNameReference =
          colLower === `${targetSingular}_id` ||
          (colLower === "id" &&
            target.columns.some(
              (tc) =>
                tc.name.toLowerCase() === `${source.name.replace(/s$/, "")}_id`,
            ));

        if (isExactMatch || isNameReference) {
          const edgeKey = `${source.schema}.${source.name}.${col.name}->${target.schema}.${target.name}`;
          if (!edgeKeys.has(edgeKey)) {
            edgeKeys.add(edgeKey);
            edges.push({
              id: `edge-${randomUUID()}`,
              sourceTable: `${source.schema}.${source.name}`,
              sourceColumn: col.name,
              targetTable: `${target.schema}.${target.name}`,
              targetColumn:
                isNameReference && colLower !== "id" ? "id" : col.name,
              confidence: "inferred_name",
              isAuthoritative: false,
              notes:
                "Inferred join candidate from column name relationship; candidate join, not authoritative proof",
            });
          }
        }
      }
    }
  }

  return {
    connectionId,
    snapshotId,
    schemaHash,
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
  };
}
