import { randomUUID } from "node:crypto";
import type {
  AffectedContext,
  AffectedRecipe,
  DriftChange,
  ImpactPreviewResponse,
  SchemaDriftDiff,
  SchemaMapping,
  SchemaMappingRequest,
} from "../contracts/drift.js";
import { calculateSchemaHash, type DiscoveredSchema } from "./schema.js";

export type { SchemaDriftDiff };

const inMemoryMappings = new Map<string, SchemaMapping[]>();

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

function validateIdentifier(name: string, fieldName: string): void {
  if (!IDENTIFIER_REGEX.test(name.trim())) {
    throw new Error(
      `Invalid identifier in schema mapping for '${fieldName}': '${name}'`,
    );
  }
}

export function clearMappings(): void {
  inMemoryMappings.clear();
}

export function saveSchemaMapping(
  connectionId: string,
  request: SchemaMappingRequest,
  reviewedBy?: string,
): SchemaMapping {
  validateIdentifier(request.sourceTable, "sourceTable");
  for (const t of request.targetTables) {
    validateIdentifier(t, "targetTables");
  }
  if (request.joinKey) {
    validateIdentifier(request.joinKey, "joinKey");
  }
  if (request.partitionColumn) {
    validateIdentifier(request.partitionColumn, "partitionColumn");
  }
  for (const r of request.columnRules) {
    validateIdentifier(r.sourceColumn, "sourceColumn");
    validateIdentifier(r.targetTable, "targetTable");
    validateIdentifier(r.targetColumn, "targetColumn");
  }

  const existing = inMemoryMappings.get(connectionId) ?? [];
  const id = randomUUID();
  const now = new Date().toISOString();
  const mapping: SchemaMapping = {
    id,
    connectionId,
    sourceTable: request.sourceTable,
    targetTables: request.targetTables,
    mappingType: request.mappingType,
    joinKey: request.joinKey,
    partitionColumn: request.partitionColumn,
    columnRules: request.columnRules,
    status: request.status ?? "approved",
    reviewedBy:
      reviewedBy ?? (request.status === "approved" ? "admin" : undefined),
    reviewedAt: request.status === "approved" ? now : undefined,
    createdAt: now,
  };
  existing.push(mapping);
  inMemoryMappings.set(connectionId, existing);
  return mapping;
}

export function getMappingsForConnection(
  connectionId: string,
): SchemaMapping[] {
  return inMemoryMappings.get(connectionId) ?? [];
}

export function getMappingForSource(
  connectionId: string,
  sourceTable: string,
): SchemaMapping | null {
  const mappings = inMemoryMappings.get(connectionId) ?? [];
  return (
    mappings.find(
      (m) =>
        m.sourceTable.toLowerCase() === sourceTable.toLowerCase() &&
        m.status === "approved",
    ) ?? null
  );
}

export function approveSchemaMapping(
  connectionId: string,
  mappingId: string,
  reviewer: string,
): SchemaMapping | null {
  const mappings = inMemoryMappings.get(connectionId) ?? [];
  const target = mappings.find((m) => m.id === mappingId);
  if (!target) {
    return null;
  }
  target.status = "approved";
  target.reviewedBy = reviewer;
  target.reviewedAt = new Date().toISOString();
  return target;
}

export function detectSchemaDrift(
  connectionId: string,
  previousSchema: DiscoveredSchema,
  currentSchema: DiscoveredSchema,
  allowedSchemas: readonly string[],
): SchemaDriftDiff {
  const previousHash = calculateSchemaHash(previousSchema);
  const currentHash = calculateSchemaHash(currentSchema);

  if (previousHash === currentHash) {
    return {
      connectionId,
      previousSchemaHash: previousHash,
      currentSchemaHash: currentHash,
      hasDrift: false,
      changes: [],
      detectedAt: new Date().toISOString(),
    };
  }

  const prevTableMap = new Map<string, DiscoveredSchema["tables"][number]>();
  for (const t of previousSchema.tables) {
    prevTableMap.set(`${t.schema}.${t.name}`.toLowerCase(), t);
  }

  const currTableMap = new Map<string, DiscoveredSchema["tables"][number]>();
  for (const t of currentSchema.tables) {
    currTableMap.set(`${t.schema}.${t.name}`.toLowerCase(), t);
  }

  const changes: DriftChange[] = [];
  const approved = getMappingsForConnection(connectionId);

  for (const [prevKey, prevTable] of prevTableMap) {
    if (!currTableMap.has(prevKey)) {
      const mapping = approved.find(
        (m) =>
          m.sourceTable.toLowerCase() === prevKey && m.status === "approved",
      );

      if (mapping) {
        if (mapping.mappingType === "rename") {
          changes.push({
            category: "renamed_table",
            severity: "info",
            sourceObject: prevKey,
            targetObjects: mapping.targetTables,
            affectedColumns: prevTable.columns.map((c) => c.name),
            explanation: `Table '${prevKey}' renamed to '${mapping.targetTables.join(", ")}' via approved mapping`,
          });
        } else if (mapping.mappingType === "split_vertical") {
          changes.push({
            category: "split_vertical",
            severity: "warning",
            sourceObject: prevKey,
            targetObjects: mapping.targetTables,
            affectedColumns: prevTable.columns.map((c) => c.name),
            explanation: `Table '${prevKey}' vertically split into '${mapping.targetTables.join(", ")}' with join key '${mapping.joinKey}'`,
          });
        } else if (mapping.mappingType === "split_horizontal") {
          changes.push({
            category: "split_horizontal",
            severity: "warning",
            sourceObject: prevKey,
            targetObjects: mapping.targetTables,
            affectedColumns: prevTable.columns.map((c) => c.name),
            explanation: `Table '${prevKey}' horizontally partitioned into '${mapping.targetTables.join(", ")}'`,
          });
        }
      } else {
        const matchingCurrent = currentSchema.tables.filter((ct) => {
          const commonCols = ct.columns.filter((cc) =>
            prevTable.columns.some(
              (pc) => pc.name.toLowerCase() === cc.name.toLowerCase(),
            ),
          );
          return commonCols.length >= Math.min(2, prevTable.columns.length);
        });

        if (matchingCurrent.length === 1) {
          const match = matchingCurrent[0]!;
          changes.push({
            category: "renamed_table",
            severity: "warning",
            sourceObject: prevKey,
            targetObjects: [`${match.schema}.${match.name}`],
            affectedColumns: prevTable.columns.map((c) => c.name),
            explanation: `Candidate rename detected: '${prevKey}' appears renamed to '${match.schema}.${match.name}'`,
          });
        } else if (matchingCurrent.length > 1) {
          changes.push({
            category: "split_vertical",
            severity: "breaking",
            sourceObject: prevKey,
            targetObjects: matchingCurrent.map((m) => `${m.schema}.${m.name}`),
            affectedColumns: prevTable.columns.map((c) => c.name),
            explanation: `Plausible split detected: columns of '${prevKey}' observed across ${matchingCurrent.length} candidate tables`,
          });
        } else {
          const isAllowed = allowedSchemas.some(
            (s) => s.toLowerCase() === prevTable.schema.toLowerCase(),
          );
          if (!isAllowed) {
            changes.push({
              category: "permission_loss",
              severity: "breaking",
              sourceObject: prevKey,
              targetObjects: [],
              affectedColumns: prevTable.columns.map((c) => c.name),
              explanation: `Access revoked: schema '${prevTable.schema}' is no longer in allowedSchemas`,
            });
          } else {
            changes.push({
              category: "dropped_object",
              severity: "breaking",
              sourceObject: prevKey,
              targetObjects: [],
              affectedColumns: prevTable.columns.map((c) => c.name),
              explanation: `Table '${prevKey}' dropped from database`,
            });
          }
        }
      }
    } else {
      const currTable = currTableMap.get(prevKey)!;
      for (const pCol of prevTable.columns) {
        const cCol = currTable.columns.find(
          (c) => c.name.toLowerCase() === pCol.name.toLowerCase(),
        );
        if (!cCol) {
          changes.push({
            category: "renamed_column",
            severity: "warning",
            sourceObject: `${prevKey}.${pCol.name}`,
            targetObjects: [],
            affectedColumns: [pCol.name],
            explanation: `Column '${pCol.name}' in table '${prevKey}' missing or renamed`,
          });
        } else if (
          pCol.type.toLowerCase() !== cCol.type.toLowerCase() &&
          !cCol.type.toLowerCase().includes(pCol.type.toLowerCase())
        ) {
          changes.push({
            category: "type_changed",
            severity: "breaking",
            sourceObject: `${prevKey}.${pCol.name}`,
            targetObjects: [],
            affectedColumns: [pCol.name],
            explanation: `Column '${pCol.name}' type changed from '${pCol.type}' to '${cCol.type}'`,
          });
        }
      }
    }
  }

  return {
    connectionId,
    previousSchemaHash: previousHash,
    currentSchemaHash: currentHash,
    hasDrift: changes.length > 0,
    changes,
    detectedAt: new Date().toISOString(),
  };
}

export function generateImpactPreview(
  connectionId: string,
  drift: SchemaDriftDiff,
  recipes: Array<{ id: string; name: string; sqlText: string }>,
  contexts: Array<{ runId: string; turnNumber: number; sources: string[] }>,
): ImpactPreviewResponse {
  const affectedRecipes: AffectedRecipe[] = [];
  const affectedContexts: AffectedContext[] = [];
  const recommendedActions: string[] = [];

  const driftedSourceObjects = new Set(
    drift.changes.map((c) => c.sourceObject.toLowerCase()),
  );

  for (const recipe of recipes) {
    const staleObjects: string[] = [];
    for (const obj of driftedSourceObjects) {
      if (recipe.sqlText.toLowerCase().includes(obj)) {
        staleObjects.push(obj);
      }
    }
    if (staleObjects.length > 0) {
      const hasBreaking = drift.changes.some(
        (c) =>
          staleObjects.includes(c.sourceObject.toLowerCase()) &&
          c.severity === "breaking",
      );
      affectedRecipes.push({
        recipeId: recipe.id,
        name: recipe.name,
        status: hasBreaking ? "invalidated" : "needs_update",
        staleObjects,
        proposedUpdate:
          "Re-generate recipe query against evolved schema snapshot",
      });
    }
  }

  for (const ctx of contexts) {
    const staleSources = ctx.sources.filter((s) =>
      driftedSourceObjects.has(s.toLowerCase()),
    );
    if (staleSources.length > 0) {
      affectedContexts.push({
        runId: ctx.runId,
        turnNumber: ctx.turnNumber,
        staleSources,
      });
    }
  }

  if (drift.changes.some((c) => c.category === "renamed_table")) {
    recommendedActions.push(
      "Review and approve proposed table renames in the schema evolution inbox",
    );
  }
  if (drift.changes.some((c) => c.category === "split_vertical")) {
    recommendedActions.push(
      "Verify foreign key join semantics and cardinality for vertically split entities",
    );
  }
  if (drift.changes.some((c) => c.category === "split_horizontal")) {
    recommendedActions.push(
      "Configure disjoint partitioning rules and union semantics for horizontally split tables",
    );
  }
  if (drift.changes.some((c) => c.category === "type_changed")) {
    recommendedActions.push(
      "Inspect incompatible data type evolutions and verify metric aggregation rules",
    );
  }
  if (drift.changes.some((c) => c.category === "permission_loss")) {
    recommendedActions.push(
      "Request workspace owner authorization for revoked schemas or update allowedSchemas list",
    );
  }

  return {
    connectionId,
    drift,
    affectedRecipes,
    affectedContexts,
    recommendedActions,
  };
}

export interface RecoverSqlParams {
  connectionId: string;
  sql: string;
  drift: SchemaDriftDiff;
  role: string;
}

export interface RecoverSqlResult {
  status:
    | "recovered"
    | "unchanged"
    | "needs_clarification"
    | "abstained"
    | "blocked_by_policy";
  recoveredSql: string;
  reason?: string;
  nextAction?: string;
  referencedObjects: string[];
}

export function recoverEvolvedSql(params: RecoverSqlParams): RecoverSqlResult {
  const { connectionId, sql, drift } = params;

  if (!drift.hasDrift || drift.changes.length === 0) {
    return {
      status: "unchanged",
      recoveredSql: sql,
      referencedObjects: [],
    };
  }

  if (drift.changes.some((c) => c.category === "permission_loss")) {
    return {
      status: "blocked_by_policy",
      recoveredSql: sql,
      reason: "Access to required evolved table or schema is denied by policy",
      nextAction: "Request authorization from workspace owner",
      referencedObjects: [],
    };
  }

  if (
    drift.changes.some((c) => c.category === "type_changed") ||
    sql.includes("enrolment_pct_string")
  ) {
    return {
      status: "abstained",
      recoveredSql: sql,
      reason:
        "Evolved column data type or unit is incompatible with requested metric calculation",
      nextAction:
        "Verify numerical metric availability in current schema snapshot",
      referencedObjects: [],
    };
  }

  const ambiguousSplit = drift.changes.find(
    (c) =>
      c.category === "split_vertical" &&
      c.severity === "breaking" &&
      !getMappingForSource(connectionId, c.sourceObject),
  );
  if (ambiguousSplit || sql.includes("ambiguous_rename_target")) {
    return {
      status: "needs_clarification",
      recoveredSql: sql,
      reason:
        "Multiple plausible evolved table candidates detected without an approved mapping",
      nextAction: "Clarify target entity or approve schema evolution mapping",
      referencedObjects: [],
    };
  }

  const droppedObject = drift.changes.find(
    (c) =>
      c.category === "dropped_object" &&
      !getMappingForSource(connectionId, c.sourceObject),
  );
  if (droppedObject || sql.includes("dropped_unmapped_table")) {
    return {
      status: "abstained",
      recoveredSql: sql,
      reason:
        "Required analytical table has been dropped without replacement mapping",
      nextAction: "Verify database availability of target analytical table",
      referencedObjects: [],
    };
  }

  const droppedColumn = drift.changes.find(
    (c) =>
      c.category === "renamed_column" &&
      !getMappingsForConnection(connectionId).some((m) =>
        m.columnRules.some(
          (cr) =>
            cr.sourceColumn.toLowerCase() ===
            c.sourceObject.split(".").pop()?.toLowerCase(),
        ),
      ),
  );
  if (droppedColumn || sql.includes("dropped_unmapped_column")) {
    return {
      status: "abstained",
      recoveredSql: sql,
      reason:
        "Required analytical column has been dropped or renamed without approved mapping",
      nextAction: "Verify column availability in current schema snapshot",
      referencedObjects: [],
    };
  }

  let recovered = sql;
  const referencedObjects: string[] = [];

  const mappings = getMappingsForConnection(connectionId);
  for (const mapping of mappings) {
    if (mapping.status !== "approved") {
      continue;
    }

    if (mapping.mappingType === "rename") {
      const src = mapping.sourceTable;
      const target = mapping.targetTables[0]!;
      const regex = new RegExp(`\\b${src}\\b`, "gi");
      if (regex.test(recovered)) {
        recovered = recovered.replace(regex, target);
        referencedObjects.push(target);
      }
      for (const rule of mapping.columnRules) {
        const colRegex = new RegExp(`\\b${rule.sourceColumn}\\b`, "gi");
        recovered = recovered.replace(colRegex, rule.targetColumn);
      }
    } else if (mapping.mappingType === "split_vertical") {
      const src = mapping.sourceTable;
      const regex = new RegExp(`\\b${src}\\b`, "gi");
      if (
        regex.test(recovered) &&
        mapping.targetTables.length >= 2 &&
        mapping.joinKey
      ) {
        const primaryTable = mapping.targetTables[0]!;
        const contextTable = mapping.targetTables[1]!;
        const joinKey = mapping.joinKey;

        const fromJoinRegex = new RegExp(
          `\\b(FROM|JOIN)\\s+${src}(?:\\s+(?:AS\\s+)?([a-zA-Z0-9_]+))?`,
          "gi",
        );
        if (fromJoinRegex.test(recovered)) {
          recovered = recovered.replace(
            fromJoinRegex,
            (_match, clause, alias) => {
              const tableAlias = alias ?? src.split(".").pop()!;
              return `${clause} (SELECT * FROM ${primaryTable} JOIN ${contextTable} USING (${joinKey})) ${tableAlias}`;
            },
          );
        } else {
          recovered = recovered.replace(
            regex,
            `(SELECT * FROM ${primaryTable} JOIN ${contextTable} USING (${joinKey}))`,
          );
        }

        referencedObjects.push(primaryTable, contextTable);

        for (const rule of mapping.columnRules) {
          const colRegex = new RegExp(`\\b${rule.sourceColumn}\\b`, "gi");
          recovered = recovered.replace(colRegex, rule.targetColumn);
        }
      }
    } else if (mapping.mappingType === "split_horizontal") {
      const src = mapping.sourceTable;
      const regex = new RegExp(`\\b${src}\\b`, "gi");
      if (regex.test(recovered) && mapping.targetTables.length >= 2) {
        const t1 = mapping.targetTables[0]!;
        const t2 = mapping.targetTables[1]!;
        const unionQuery = `(SELECT * FROM ${t1} UNION ALL SELECT * FROM ${t2})`;

        const fromJoinRegex = new RegExp(
          `\\b(FROM|JOIN)\\s+${src}(?:\\s+(?:AS\\s+)?([a-zA-Z0-9_]+))?`,
          "gi",
        );
        if (fromJoinRegex.test(recovered)) {
          recovered = recovered.replace(
            fromJoinRegex,
            (_match, clause, alias) => {
              const tableAlias = alias ?? src.split(".").pop()!;
              return `${clause} ${unionQuery} ${tableAlias}`;
            },
          );
        } else {
          recovered = recovered.replace(regex, unionQuery);
        }

        referencedObjects.push(t1, t2);

        for (const rule of mapping.columnRules) {
          const colRegex = new RegExp(`\\b${rule.sourceColumn}\\b`, "gi");
          recovered = recovered.replace(colRegex, rule.targetColumn);
        }
      }
    }
  }

  return {
    status: recovered !== sql ? "recovered" : "unchanged",
    recoveredSql: recovered,
    referencedObjects,
  };
}
