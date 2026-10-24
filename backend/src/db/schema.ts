import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  runStatuses,
  type AnalyticalPlan,
  type AnswerEnvelope,
  type QuestionIntent,
} from "../contracts/analysis.js";

export const runStatus = pgEnum("run_status", runStatuses);
export const workspaces = pgTable("workspaces", {
  id: uuid().defaultRandom().primaryKey(),
  ownerSubject: text().notNull(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    subject: text().notNull(),
    role: text({ enum: ["owner", "analyst", "viewer"] }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.subject] }),
    check(
      "membership_role",
      sql`${table.role} IN ('owner', 'analyst', 'viewer')`,
    ),
  ],
);
export const connections = pgTable(
  "connections",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    engine: text().notNull().default("PostgreSQL"),
    hostReference: text().notNull(),
    allowedSchemas: text().array().notNull(),
    secretReference: text().notNull(),
    status: text({ enum: ["registered", "ready", "revoked"] })
      .notNull()
      .default("registered"),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.id, table.workspaceId),
    check("connection_engine", sql`${table.engine} = 'PostgreSQL'`),
    check(
      "connection_status",
      sql`${table.status} IN ('registered', 'ready', 'revoked')`,
    ),
    check(
      "connection_secret_reference",
      sql`${table.secretReference} ~ '^secret://[a-zA-Z0-9/_-]+$'`,
    ),
    check(
      "connection_allowed_schemas",
      sql`cardinality(${table.allowedSchemas}) BETWEEN 1 AND 20`,
    ),
  ],
);
export const schemaSnapshots = pgTable(
  "schema_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid().notNull(),
    schemaHash: text().notNull(),
    profileSummary: jsonb().$type<Record<string, unknown>>().notNull(),
    capturedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    unique().on(table.id, table.workspaceId, table.connectionId),
    foreignKey({
      columns: [table.connectionId, table.workspaceId],
      foreignColumns: [connections.id, connections.workspaceId],
    }).onDelete("cascade"),
    check("snapshot_expiry", sql`${table.expiresAt} > ${table.capturedAt}`),
  ],
);
export const analysisRuns = pgTable(
  "analysis_runs",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid().notNull(),
    snapshotId: uuid(),
    parentRunId: uuid(),
    question: text().notNull(),
    status: runStatus().notNull().default("queued"),
    sequence: integer().notNull().default(0),
    modelVersion: text().notNull(),
    plan: jsonb().$type<AnalyticalPlan>(),
    answer: jsonb().$type<AnswerEnvelope>(),
    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    unique().on(table.id, table.workspaceId),
    foreignKey({
      columns: [table.connectionId, table.workspaceId],
      foreignColumns: [connections.id, connections.workspaceId],
    }),
    foreignKey({
      columns: [table.snapshotId, table.workspaceId, table.connectionId],
      foreignColumns: [
        schemaSnapshots.id,
        schemaSnapshots.workspaceId,
        schemaSnapshots.connectionId,
      ],
    }),
    foreignKey({
      columns: [table.parentRunId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
    }),
    check(
      "run_question",
      sql`length(trim(${table.question})) BETWEEN 1 AND 4096`,
    ),
    check("run_sequence", sql`${table.sequence} >= 0`),
    check(
      "run_timestamps",
      sql`${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.startedAt}`,
    ),
    check("run_expiry", sql`${table.expiresAt} > ${table.startedAt}`),
  ],
);
export const questionIntents = pgTable(
  "question_intents",
  {
    runId: uuid().primaryKey(),
    workspaceId: uuid().notNull(),
    intent: jsonb().$type<QuestionIntent>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [analysisRuns.id, analysisRuns.workspaceId],
    }).onDelete("cascade"),
  ],
);
export const queryCandidates = pgTable(
  "query_candidates",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid().notNull(),
    workspaceId: uuid().notNull(),
    sqlText: text().notNull(),
    sqlHash: text().notNull(),
    dialect: text().notNull().default("PostgreSQL"),
    policyStatus: text({ enum: ["pending", "allowed", "denied"] })
      .notNull()
      .default("pending"),
  },
  (table) => [
    unique().on(table.id, table.runId, table.workspaceId),
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [analysisRuns.id, analysisRuns.workspaceId],
    }).onDelete("cascade"),
    check(
      "candidate_policy_status",
      sql`${table.policyStatus} IN ('pending', 'allowed', 'denied')`,
    ),
  ],
);
export const executionRecords = pgTable(
  "execution_records",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid().notNull(),
    workspaceId: uuid().notNull(),
    candidateId: uuid().notNull(),
    durationMs: integer().notNull(),
    rowCount: integer().notNull(),
    status: text({
      enum: ["succeeded", "failed", "timed_out", "cancelled"],
    }).notNull(),
    safeErrorCode: text(),
    resourceUsage: jsonb().$type<Record<string, number>>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.candidateId, table.runId, table.workspaceId],
      foreignColumns: [
        queryCandidates.id,
        queryCandidates.runId,
        queryCandidates.workspaceId,
      ],
    }).onDelete("cascade"),
    check(
      "execution_counts",
      sql`${table.durationMs} >= 0 AND ${table.rowCount} BETWEEN 0 AND 1000`,
    ),
    check(
      "execution_status",
      sql`${table.status} IN ('succeeded', 'failed', 'timed_out', 'cancelled')`,
    ),
  ],
);
export const verificationReports = pgTable(
  "verification_reports",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid().notNull(),
    workspaceId: uuid().notNull(),
    report: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [analysisRuns.id, analysisRuns.workspaceId],
    }).onDelete("cascade"),
  ],
);
export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid().notNull(),
    workspaceId: uuid().notNull(),
    sourceObject: text().notNull(),
    claimReference: text().notNull(),
    provenance: jsonb().$type<Record<string, unknown>>().notNull(),
    visibilityClass: text({ enum: ["workspace", "restricted"] }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [analysisRuns.id, analysisRuns.workspaceId],
    }).onDelete("cascade"),
    check(
      "evidence_visibility",
      sql`${table.visibilityClass} IN ('workspace', 'restricted')`,
    ),
  ],
);
export const metricDefinitions = pgTable(
  "metric_definitions",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text().notNull(),
    ownerSubject: text().notNull(),
    version: integer().notNull(),
    definition: jsonb().$type<Record<string, unknown>>().notNull(),
    approvalStatus: text({ enum: ["draft", "approved", "revoked"] })
      .notNull()
      .default("draft"),
  },
  (table) => [
    unique().on(table.workspaceId, table.name, table.version),
    check("metric_version", sql`${table.version} > 0`),
    check(
      "metric_approval",
      sql`${table.approvalStatus} IN ('draft', 'approved', 'revoked')`,
    ),
  ],
);
export const feedback = pgTable(
  "feedback",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid().notNull(),
    workspaceId: uuid().notNull(),
    actorSubject: text().notNull(),
    rating: integer().notNull(),
    category: text({ enum: ["correctness", "usefulness", "other"] }).notNull(),
    comment: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [analysisRuns.id, analysisRuns.workspaceId],
    }).onDelete("cascade"),
    check("feedback_rating", sql`${table.rating} BETWEEN 1 AND 5`),
    check(
      "feedback_category",
      sql`${table.category} IN ('correctness', 'usefulness', 'other')`,
    ),
    check(
      "feedback_comment_length",
      sql`${table.comment} IS NULL OR length(${table.comment}) <= 2000`,
    ),
  ],
);
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorSubject: text().notNull(),
    action: text().notNull(),
    resourceId: text().notNull(),
    requestId: text().notNull(),
    runId: uuid(),
    occurredAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    check("audit_expiry", sql`${table.expiresAt} > ${table.occurredAt}`),
  ],
);
