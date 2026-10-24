CREATE TYPE "public"."run_status" AS ENUM('queued', 'parsing', 'retrieving', 'grounding', 'planning', 'generating', 'authorizing', 'estimating', 'executing', 'verifying', 'challenging', 'answered', 'needs_clarification', 'abstained', 'blocked_by_policy', 'execution_failed', 'timed_out', 'cancelled');--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"connectionId" uuid NOT NULL,
	"snapshotId" uuid,
	"parentRunId" uuid,
	"question" text NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"modelVersion" text NOT NULL,
	"plan" jsonb,
	"answer" jsonb,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL,
	CONSTRAINT "analysis_runs_id_workspaceId_unique" UNIQUE("id","workspaceId"),
	CONSTRAINT "run_question" CHECK (length(trim("analysis_runs"."question")) BETWEEN 1 AND 4096),
	CONSTRAINT "run_sequence" CHECK ("analysis_runs"."sequence" >= 0),
	CONSTRAINT "run_timestamps" CHECK ("analysis_runs"."completedAt" IS NULL OR "analysis_runs"."completedAt" >= "analysis_runs"."startedAt"),
	CONSTRAINT "run_expiry" CHECK ("analysis_runs"."expiresAt" > "analysis_runs"."startedAt")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"actorSubject" text NOT NULL,
	"action" text NOT NULL,
	"resourceId" text NOT NULL,
	"requestId" text NOT NULL,
	"runId" uuid,
	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_expiry" CHECK ("audit_events"."expiresAt" > "audit_events"."occurredAt")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"engine" text DEFAULT 'PostgreSQL' NOT NULL,
	"hostReference" text NOT NULL,
	"allowedSchemas" text[] NOT NULL,
	"secretReference" text NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_id_workspaceId_unique" UNIQUE("id","workspaceId"),
	CONSTRAINT "connection_engine" CHECK ("connections"."engine" = 'PostgreSQL'),
	CONSTRAINT "connection_status" CHECK ("connections"."status" IN ('registered', 'ready', 'revoked')),
	CONSTRAINT "connection_secret_reference" CHECK ("connections"."secretReference" ~ '^secret://[a-zA-Z0-9/_-]+$'),
	CONSTRAINT "connection_allowed_schemas" CHECK (cardinality("connections"."allowedSchemas") BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runId" uuid NOT NULL,
	"workspaceId" uuid NOT NULL,
	"sourceObject" text NOT NULL,
	"claimReference" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"visibilityClass" text NOT NULL,
	CONSTRAINT "evidence_visibility" CHECK ("evidence_items"."visibilityClass" IN ('workspace', 'restricted'))
);
--> statement-breakpoint
CREATE TABLE "execution_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runId" uuid NOT NULL,
	"workspaceId" uuid NOT NULL,
	"candidateId" uuid NOT NULL,
	"durationMs" integer NOT NULL,
	"rowCount" integer NOT NULL,
	"status" text NOT NULL,
	"safeErrorCode" text,
	"resourceUsage" jsonb NOT NULL,
	CONSTRAINT "execution_counts" CHECK ("execution_records"."durationMs" >= 0 AND "execution_records"."rowCount" BETWEEN 0 AND 1000),
	CONSTRAINT "execution_status" CHECK ("execution_records"."status" IN ('succeeded', 'failed', 'timed_out', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runId" uuid NOT NULL,
	"workspaceId" uuid NOT NULL,
	"actorSubject" text NOT NULL,
	"rating" integer NOT NULL,
	"category" text NOT NULL,
	"comment" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_rating" CHECK ("feedback"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "feedback_category" CHECK ("feedback"."category" IN ('correctness', 'usefulness', 'other')),
	CONSTRAINT "feedback_comment_length" CHECK ("feedback"."comment" IS NULL OR length("feedback"."comment") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"workspaceId" uuid NOT NULL,
	"subject" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "memberships_workspaceId_subject_pk" PRIMARY KEY("workspaceId","subject"),
	CONSTRAINT "membership_role" CHECK ("memberships"."role" IN ('owner', 'analyst', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "metric_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"name" text NOT NULL,
	"ownerSubject" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"approvalStatus" text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "metric_definitions_workspaceId_name_version_unique" UNIQUE("workspaceId","name","version"),
	CONSTRAINT "metric_version" CHECK ("metric_definitions"."version" > 0),
	CONSTRAINT "metric_approval" CHECK ("metric_definitions"."approvalStatus" IN ('draft', 'approved', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "query_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runId" uuid NOT NULL,
	"workspaceId" uuid NOT NULL,
	"sqlText" text NOT NULL,
	"sqlHash" text NOT NULL,
	"dialect" text DEFAULT 'PostgreSQL' NOT NULL,
	"policyStatus" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "query_candidates_id_runId_workspaceId_unique" UNIQUE("id","runId","workspaceId"),
	CONSTRAINT "candidate_policy_status" CHECK ("query_candidates"."policyStatus" IN ('pending', 'allowed', 'denied'))
);
--> statement-breakpoint
CREATE TABLE "question_intents" (
	"runId" uuid PRIMARY KEY NOT NULL,
	"workspaceId" uuid NOT NULL,
	"intent" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspaceId" uuid NOT NULL,
	"connectionId" uuid NOT NULL,
	"schemaHash" text NOT NULL,
	"profileSummary" jsonb NOT NULL,
	"capturedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	CONSTRAINT "schema_snapshots_id_workspaceId_connectionId_unique" UNIQUE("id","workspaceId","connectionId"),
	CONSTRAINT "snapshot_expiry" CHECK ("schema_snapshots"."expiresAt" > "schema_snapshots"."capturedAt")
);
--> statement-breakpoint
CREATE TABLE "verification_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runId" uuid NOT NULL,
	"workspaceId" uuid NOT NULL,
	"report" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownerSubject" text NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_connectionId_workspaceId_connections_id_workspaceId_fk" FOREIGN KEY ("connectionId","workspaceId") REFERENCES "public"."connections"("id","workspaceId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_snapshotId_workspaceId_connectionId_schema_snapshots_id_workspaceId_connectionId_fk" FOREIGN KEY ("snapshotId","workspaceId","connectionId") REFERENCES "public"."schema_snapshots"("id","workspaceId","connectionId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_parentRunId_workspaceId_analysis_runs_id_workspaceId_fk" FOREIGN KEY ("parentRunId","workspaceId") REFERENCES "public"."analysis_runs"("id","workspaceId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_runId_workspaceId_analysis_runs_id_workspaceId_fk" FOREIGN KEY ("runId","workspaceId") REFERENCES "public"."analysis_runs"("id","workspaceId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_records" ADD CONSTRAINT "execution_records_candidateId_runId_workspaceId_query_candidates_id_runId_workspaceId_fk" FOREIGN KEY ("candidateId","runId","workspaceId") REFERENCES "public"."query_candidates"("id","runId","workspaceId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_runId_workspaceId_analysis_runs_id_workspaceId_fk" FOREIGN KEY ("runId","workspaceId") REFERENCES "public"."analysis_runs"("id","workspaceId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_candidates" ADD CONSTRAINT "query_candidates_runId_workspaceId_analysis_runs_id_workspaceId_fk" FOREIGN KEY ("runId","workspaceId") REFERENCES "public"."analysis_runs"("id","workspaceId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_intents" ADD CONSTRAINT "question_intents_runId_workspaceId_analysis_runs_id_workspaceId_fk" FOREIGN KEY ("runId","workspaceId") REFERENCES "public"."analysis_runs"("id","workspaceId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_snapshots" ADD CONSTRAINT "schema_snapshots_workspaceId_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_snapshots" ADD CONSTRAINT "schema_snapshots_connectionId_workspaceId_connections_id_workspaceId_fk" FOREIGN KEY ("connectionId","workspaceId") REFERENCES "public"."connections"("id","workspaceId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_reports" ADD CONSTRAINT "verification_reports_runId_workspaceId_analysis_runs_id_workspaceId_fk" FOREIGN KEY ("runId","workspaceId") REFERENCES "public"."analysis_runs"("id","workspaceId") ON DELETE cascade ON UPDATE no action;