import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { and, eq } from "drizzle-orm";
import type { Static } from "typebox";
import {
  terminalStatuses,
  type ActiveContext,
  type AnalyticalPlan,
  type AnswerEnvelope,
  type ContextDelta,
  type ConversationContextResponse,
  type EvidenceBundleSchema,
  type ExecutionRecordSchema,
  type QuestionIntent,
  type ResultSchema,
  type RunEventSchema,
  type RunSchema,
  type RunStatus,
  type SqlCandidateSchema,
} from "../contracts/analysis.js";
import {
  getConversationContext,
  getConversationTurn,
  recordConversationTurn,
  resolveConversationalFollowUp,
} from "./conversations.js";
import { detectSchemaDrift, recoverEvolvedSql } from "./drift.js";
import type { SchemaDriftDiff } from "../contracts/drift.js";
import { canTransition } from "../contracts/lifecycle.js";
import type { MetadataDatabase } from "../db/index.js";
import {
  analysisRuns,
  auditEvents,
  executionRecords,
  queryCandidates,
  questionIntents,
  schemaSnapshots,
  verificationReports,
} from "../db/schema.js";
import type { InferenceClient } from "../inference/client.js";
import { foundationPolicy } from "../policy.js";
import {
  evaluatePolicyCompliance,
  isSubjectRevoked,
} from "../security/policies.js";
import type { OrganizationRole } from "../contracts/policy.js";
import type { ConnectorAdapter } from "../sql/connectors.js";
import { validateQuerySafety } from "../sql/safety.js";
import {
  calculateSchemaHash,
  discoverSchema,
  type DiscoveredSchema,
} from "./schema.js";
import { generateSchemaConstellation } from "./constellation.js";
import { groundQuestion } from "./planning.js";
import { verifyAnalysis, type VerificationReport } from "./verification.js";
import {
  groqClient,
  type GroqClient,
  type StatisticalContext,
} from "../inference/groq.js";

type Scalar = string | number | boolean | null;
type TerminalStatus = (typeof terminalStatuses)[number];

export type Run = Static<typeof RunSchema>;
export type RunEvent = Static<typeof RunEventSchema>;
export type Result = Static<typeof ResultSchema>;
export type EvidenceBundle = Static<typeof EvidenceBundleSchema>;

export interface OrchestratorDeps {
  adapter: ConnectorAdapter;
  inference: InferenceClient;
  metadataDb?: MetadataDatabase | null;
  useModelPlanning?: boolean;
  groq?: GroqClient;
}

export interface AnalysisInput {
  runId?: string;
  workspaceId: string;
  connectionId: string;
  allowedSchemas: readonly string[];
  question: string;
  parentRunId?: string;
  sqlOverride?: string;
  abortSignal?: AbortSignal;
  totalTimeoutMs?: number;
  role?: OrganizationRole;
  actorSubject?: string;
  isRecipe?: boolean;
  assignedRegion?: string;
}

export interface TruthLedgerRuleCheck {
  ruleId: string;
  outcome: string;
  reason: string;
}

export interface TruthLedgerClaim {
  claim: string;
  supportingRows: Record<string, Scalar>[];
  sqlReference: string | null;
  sourceObjects: string[];
  verificationRules: TruthLedgerRuleCheck[];
}

export interface TruthLedger {
  runId: string;
  status: TerminalStatus;
  claims: TruthLedgerClaim[];
  coverage: {
    included: number;
    excluded: number;
    denominator: number;
  };
  exclusions: string[];
  limitations: string[];
}

export interface ReproducibilityBundle {
  version: "1.0.0";
  runId: string;
  workspaceId: string;
  connectionId: string;
  parentRunId: string | null;
  question: string;
  intent: QuestionIntent | null;
  snapshotId: string | null;
  plan: AnalyticalPlan | null;
  candidate: Static<typeof SqlCandidateSchema> | null;
  execution: Static<typeof ExecutionRecordSchema> | null;
  verification: VerificationReport | null;
  answer: AnswerEnvelope;
  assumptions: string[];
  exclusions: string[];
  modelVersion: string;
  exportedAt: string;
}

interface StoredRunState {
  run: Run;
  workspaceId: string;
  connectionId: string;
  parentRunId: string | null;
  allowedSchemas: readonly string[];
  question: string;
  intent: QuestionIntent | null;
  snapshotId: string | null;
  plan: AnalyticalPlan | null;
  candidate: Static<typeof SqlCandidateSchema> | null;
  execution: Static<typeof ExecutionRecordSchema> | null;
  verification: VerificationReport | null;
  answer: AnswerEnvelope;
  resultRows: Record<string, Scalar>[];
  resultColumns: string[];
  exclusions: string[];
  assumptions: string[];
  activeContext?: ActiveContext;
  delta?: ContextDelta;
  abortController: AbortController;
}

export class AnalysisOrchestrator {
  private readonly adapter: ConnectorAdapter;
  private readonly inference: InferenceClient;
  private readonly metadataDb: MetadataDatabase | null;
  private readonly useModelPlanning: boolean;
  private readonly groq: GroqClient;
  private readonly emitter = new EventEmitter();
  private readonly activeRuns = new Map<string, StoredRunState>();
  private readonly baselineSchemas = new Map<string, DiscoveredSchema>();

  constructor(deps: OrchestratorDeps) {
    this.adapter = deps.adapter;
    this.inference = deps.inference;
    this.metadataDb = deps.metadataDb ?? null;
    this.useModelPlanning = deps.useModelPlanning ?? false;
    this.groq = deps.groq ?? groqClient;
  }

  setBaselineSchema(connectionId: string, schema: DiscoveredSchema): void {
    this.baselineSchemas.set(connectionId, schema);
  }

  getBaselineSchema(connectionId: string): DiscoveredSchema | undefined {
    return this.baselineSchemas.get(connectionId);
  }

  getAdapter(): ConnectorAdapter {
    return this.adapter;
  }

  subscribeEvents(
    runId: string,
    listener: (event: RunEvent) => void,
  ): () => void {
    const channel = `events:${runId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  private emitProgress(runState: StoredRunState, newStatus: RunStatus): void {
    if (runState.run.status !== newStatus) {
      if (!canTransition(runState.run.status, newStatus)) {
        return;
      }
      runState.run.status = newStatus;
      runState.run.sequence += 1;
      const event: RunEvent = {
        runId: runState.run.runId,
        sequence: runState.run.sequence,
        type: "progress",
        status: newStatus,
        timestamp: new Date().toISOString(),
      };
      this.emitter.emit(`events:${runState.run.runId}`, event);
    }
  }

  async getRun(runId: string, workspaceId?: string): Promise<Run | null> {
    const memory = this.activeRuns.get(runId);
    if (memory) {
      if (workspaceId && memory.workspaceId !== workspaceId) {
        return null;
      }
      return memory.run;
    }

    if (this.metadataDb) {
      const rows = await this.metadataDb
        .select()
        .from(analysisRuns)
        .where(
          workspaceId
            ? and(
                eq(analysisRuns.id, runId),
                eq(analysisRuns.workspaceId, workspaceId),
              )
            : eq(analysisRuns.id, runId),
        );
      const row = rows[0];
      if (row) {
        return {
          runId: row.id,
          status: row.status,
          sequence: row.sequence,
          startedAt: row.startedAt.toISOString(),
          completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        };
      }
    }

    return null;
  }

  async getResult(runId: string, workspaceId?: string): Promise<Result> {
    const state = this.activeRuns.get(runId);
    if (!state || (workspaceId && state.workspaceId !== workspaceId)) {
      throw new Error(`Run result not found for ID: ${runId}`);
    }

    return {
      answer: state.answer,
      columns: state.resultColumns,
      rows: state.resultRows,
    };
  }

  async getEvidence(
    runId: string,
    workspaceId?: string,
  ): Promise<EvidenceBundle> {
    const state = this.activeRuns.get(runId);
    if (!state || (workspaceId && state.workspaceId !== workspaceId)) {
      throw new Error(`Run evidence not found for ID: ${runId}`);
    }

    if (
      state.run.status === "answered" &&
      state.intent &&
      state.snapshotId &&
      state.plan &&
      state.candidate &&
      state.execution &&
      state.verification
    ) {
      return {
        runId: state.run.runId,
        question: state.question,
        assumptions: state.assumptions,
        exclusions: state.exclusions,
        modelVersion: this.inference.modelVersion,
        finalStatus: "answered",
        intent: state.intent,
        snapshotId: state.snapshotId,
        plan: state.plan,
        candidate: state.candidate,
        execution: state.execution,
        verification: state.verification,
      };
    }

    const candidate =
      state.run.status === "blocked_by_policy" && state.candidate
        ? {
            ...state.candidate,
            sqlText: "[REDACTED BLOCKED QUERY]",
          }
        : state.candidate;

    return {
      runId: state.run.runId,
      question: state.question,
      assumptions: state.assumptions,
      exclusions: state.exclusions,
      modelVersion: this.inference.modelVersion,
      finalStatus: state.run.status as Exclude<TerminalStatus, "answered">,
      intent: state.intent,
      snapshotId: state.snapshotId,
      plan: state.plan,
      candidate,
      execution: state.execution,
      verification: state.verification,
    };
  }

  async getLedger(runId: string, workspaceId?: string): Promise<TruthLedger> {
    const state = this.activeRuns.get(runId);
    if (!state || (workspaceId && state.workspaceId !== workspaceId)) {
      throw new Error(`Run ledger not found for ID: ${runId}`);
    }

    const verificationRules: TruthLedgerRuleCheck[] =
      state.verification?.checks.map((c) => ({
        ruleId: c.ruleId,
        outcome: c.outcome,
        reason: c.reason,
      })) ?? [];

    const claimText =
      state.answer.status === "answered"
        ? (state.answer.answerText ?? "Analysis completed successfully")
        : (state.answer.reason ?? "Analysis completed with non-answer state");

    const claims: TruthLedgerClaim[] = [
      {
        claim: claimText,
        supportingRows:
          state.answer.status === "answered" ? state.resultRows : [],
        sqlReference: state.candidate?.candidateId ?? null,
        sourceObjects: state.plan?.sources ?? [],
        verificationRules,
      },
    ];

    const coverage = state.verification?.coverage ?? {
      included: state.resultRows.length,
      excluded: state.exclusions.length,
      denominator: state.resultRows.length + state.exclusions.length,
    };

    return {
      runId: state.run.runId,
      status: state.run.status as TerminalStatus,
      claims,
      coverage,
      exclusions: state.exclusions,
      limitations: state.exclusions,
    };
  }

  async getReproducibilityBundle(
    runId: string,
    workspaceId?: string,
  ): Promise<ReproducibilityBundle> {
    const state = this.activeRuns.get(runId);
    if (!state || (workspaceId && state.workspaceId !== workspaceId)) {
      throw new Error(`Run reproducibility bundle not found for ID: ${runId}`);
    }

    return {
      version: "1.0.0",
      runId: state.run.runId,
      workspaceId: state.workspaceId,
      connectionId: state.connectionId,
      parentRunId: state.parentRunId,
      question: state.question,
      intent: state.intent,
      snapshotId: state.snapshotId,
      plan: state.plan,
      candidate: state.candidate,
      execution: state.execution,
      verification: state.verification,
      answer: state.answer,
      assumptions: state.assumptions,
      exclusions: state.exclusions,
      modelVersion: this.inference.modelVersion,
      exportedAt: new Date().toISOString(),
    };
  }

  getConversationContext(
    runId: string,
    workspaceId: string,
  ): ConversationContextResponse | null {
    return getConversationContext(runId, workspaceId);
  }

  async cancelRun(runId: string, workspaceId?: string): Promise<Run> {
    const state = this.activeRuns.get(runId);
    if (!state || (workspaceId && state.workspaceId !== workspaceId)) {
      throw new Error(`Run not found for cancellation: ${runId}`);
    }

    if (canTransition(state.run.status, "cancelled")) {
      state.abortController.abort();
      this.emitProgress(state, "cancelled");
      state.run.completedAt = new Date().toISOString();
      state.answer = {
        runId,
        status: "cancelled",
        reason: "Analysis cancelled by user",
        nextAction: "Submit new analysis when ready",
        assumptions: state.assumptions,
        limitations: [],
      };
      await this.persistRun(state);
    }

    return state.run;
  }

  private async persistRun(state: StoredRunState): Promise<void> {
    if (state.activeContext && state.delta) {
      recordConversationTurn(
        {
          turnNumber:
            (getConversationTurn(state.parentRunId ?? "")?.turnNumber ?? 0) + 1,
          runId: state.run.runId,
          parentRunId: state.parentRunId,
          question: state.question,
          status: state.run.status as TerminalStatus,
          activeContext: state.activeContext,
          delta: state.delta,
          createdAt: state.run.startedAt,
        },
        state.workspaceId,
      );
    }

    if (!this.metadataDb) {
      return;
    }

    try {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + foundationPolicy.retention.questionDays * 86400000,
      );

      await this.metadataDb
        .insert(analysisRuns)
        .values({
          id: state.run.runId,
          workspaceId: state.workspaceId,
          connectionId: state.connectionId,
          snapshotId: state.snapshotId,
          question: state.question,
          status: state.run.status,
          sequence: state.run.sequence,
          modelVersion: this.inference.modelVersion,
          plan: state.plan ?? undefined,
          answer: state.answer,
          startedAt: new Date(state.run.startedAt),
          completedAt: state.run.completedAt
            ? new Date(state.run.completedAt)
            : undefined,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: analysisRuns.id,
          set: {
            status: state.run.status,
            sequence: state.run.sequence,
            completedAt: state.run.completedAt
              ? new Date(state.run.completedAt)
              : undefined,
            answer: state.answer,
          },
        });

      if (state.intent) {
        await this.metadataDb
          .insert(questionIntents)
          .values({
            runId: state.run.runId,
            workspaceId: state.workspaceId,
            intent: state.intent,
          })
          .onConflictDoNothing();
      }

      if (state.candidate) {
        await this.metadataDb
          .insert(queryCandidates)
          .values({
            id: state.candidate.candidateId,
            runId: state.run.runId,
            workspaceId: state.workspaceId,
            sqlText: state.candidate.sqlText,
            sqlHash: createHash("sha256")
              .update(state.candidate.sqlText)
              .digest("hex"),
            policyStatus:
              state.run.status === "blocked_by_policy" ? "denied" : "allowed",
          })
          .onConflictDoNothing();
      }

      if (state.execution && state.candidate) {
        await this.metadataDb
          .insert(executionRecords)
          .values({
            id: randomUUID(),
            runId: state.run.runId,
            workspaceId: state.workspaceId,
            candidateId: state.candidate.candidateId,
            durationMs: Math.round(state.execution.durationMs),
            rowCount: state.execution.rowCount,
            status: state.execution.status,
            safeErrorCode: state.execution.safeErrorCode,
            resourceUsage: state.execution.resourceUsage,
          })
          .onConflictDoNothing();
      }

      if (state.verification) {
        await this.metadataDb
          .insert(verificationReports)
          .values({
            id: randomUUID(),
            runId: state.run.runId,
            workspaceId: state.workspaceId,
            report: state.verification as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing();
      }

      await this.metadataDb
        .insert(auditEvents)
        .values({
          id: randomUUID(),
          workspaceId: state.workspaceId,
          actorSubject: "orchestrator",
          action: `run_${state.run.status}`,
          resourceId: state.run.runId,
          requestId: `req-${state.run.runId}`,
          runId: state.run.runId,
          expiresAt: new Date(
            now.getTime() + foundationPolicy.retention.auditDays * 86400000,
          ),
        })
        .onConflictDoNothing();
    } catch {
      // Best-effort persistence
    }
  }

  async executeAnalysis(input: AnalysisInput): Promise<Run> {
    const runId = input.runId ?? randomUUID();
    const abortController = new AbortController();

    if (input.abortSignal) {
      if (input.abortSignal.aborted) {
        abortController.abort();
      } else {
        input.abortSignal.addEventListener(
          "abort",
          () => abortController.abort(),
          { once: true },
        );
      }
    }

    const totalTimeout =
      input.totalTimeoutMs ?? foundationPolicy.limits.totalRunTimeoutMs;
    const timeoutTimer = setTimeout(() => {
      abortController.abort();
    }, totalTimeout);

    const initialAnswer: AnswerEnvelope = {
      runId,
      status: "execution_failed",
      reason: "Analysis in progress",
      nextAction: "Wait for execution completion",
      assumptions: [],
      limitations: [],
    };

    const state: StoredRunState = {
      run: {
        runId,
        status: "queued",
        sequence: 0,
        startedAt: new Date().toISOString(),
        completedAt: null,
      },
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      parentRunId: input.parentRunId ?? null,
      allowedSchemas: input.allowedSchemas,
      question: input.question,
      intent: null,
      snapshotId: null,
      plan: null,
      candidate: null,
      execution: null,
      verification: null,
      answer: initialAnswer,
      resultRows: [],
      resultColumns: [],
      exclusions: [],
      assumptions: [],
      abortController,
    };

    this.activeRuns.set(runId, state);

    const checkAbort = (): boolean => {
      if (abortController.signal.aborted) {
        const isTimeout =
          Date.now() - new Date(state.run.startedAt).getTime() >= totalTimeout;
        const terminal = isTimeout ? "timed_out" : "cancelled";
        this.emitProgress(state, terminal);
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: terminal,
          reason: isTimeout
            ? "Run exceeded total budget timeout"
            : "Analysis cancelled by user",
          nextAction: isTimeout
            ? "Retry with simpler query"
            : "Submit new analysis when ready",
          assumptions: state.assumptions,
          limitations: [],
        };
        return true;
      }
      return false;
    };

    try {
      this.emitProgress(state, "parsing");
      if (checkAbort()) return state.run;

      if (input.actorSubject && isSubjectRevoked(input.actorSubject)) {
        this.emitProgress(state, "blocked_by_policy");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "blocked_by_policy",
          reason: "Subject authorization revoked",
          nextAction: "Request authorization from workspace owner",
          assumptions: [],
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      if (input.role === "viewer" && !input.isRecipe) {
        this.emitProgress(state, "blocked_by_policy");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "blocked_by_policy",
          reason:
            "Viewers are restricted to approved aggregate recipes and cannot execute arbitrary SQL",
          nextAction:
            "Execute an approved saved recipe or request analyst permissions",
          assumptions: [],
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      const parentState = input.parentRunId
        ? (this.activeRuns.get(input.parentRunId) ?? null)
        : null;

      const classification = await this.groq.classify(input.question);
      let statisticalContext: StatisticalContext | undefined;
      if (classification.classification === "statistical") {
        statisticalContext = await this.groq.contextualizeStatisticalQuery({
          question: input.question,
        });
      }

      let resolution = resolveConversationalFollowUp({
        question: input.question,
        runId,
        parentRunId: input.parentRunId ?? null,
        parentState: parentState
          ? {
              runId: parentState.run.runId,
              workspaceId: parentState.workspaceId,
              connectionId: parentState.connectionId,
              question: parentState.question,
              status: parentState.run.status,
              intent: parentState.intent,
              plan: parentState.plan,
              activeContext: parentState.activeContext,
              assumptions: parentState.assumptions,
            }
          : null,
        currentWorkspaceId: input.workspaceId,
        connectionId: input.connectionId,
        allowedSchemas: input.allowedSchemas,
        role: input.role,
        actorSubject: input.actorSubject,
        sqlOverride: input.sqlOverride,
        isRecipe: input.isRecipe,
      });

      if (
        this.useModelPlanning &&
        resolution.status !== "blocked_by_policy" &&
        !input.sqlOverride
      ) {
        try {
          const discovered = await discoverSchema(
            this.adapter,
            input.allowedSchemas,
          );
          resolution = await groundQuestion(
            this.inference,
            input.question,
            discovered,
            resolution,
            abortController.signal,
            parentState !== null,
            statisticalContext?.guidance,
          );
        } catch {
          resolution = {
            ...resolution,
            status: "abstained",
            reason:
              "The analytical source or local model is unavailable. No answer was generated.",
            nextAction:
              "Use a stored file or check the configured read-only analytical source and inference service.",
          };
        }
      }
      state.activeContext = resolution.activeContext;
      state.delta = resolution.delta;

      if (resolution.status === "blocked_by_policy") {
        this.emitProgress(state, "blocked_by_policy");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "blocked_by_policy",
          reason: resolution.reason ?? "Blocked by security policy",
          nextAction: resolution.nextAction ?? "Request authorization",
          assumptions: [],
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      if (resolution.status === "needs_clarification") {
        this.emitProgress(state, "needs_clarification");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "needs_clarification",
          reason:
            resolution.reason ?? "Ambiguous request requires clarification",
          nextAction: resolution.nextAction ?? "Clarify request parameters",
          assumptions: [],
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      if (resolution.status === "abstained") {
        this.emitProgress(state, "abstained");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "abstained",
          reason:
            resolution.reason ??
            "Required observation period or field is missing in database",
          nextAction:
            resolution.nextAction ??
            "Verify that data contains the requested period",
          assumptions: [],
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      if (input.parentRunId) {
        state.assumptions.push(
          `Clarified from parent run ${input.parentRunId}`,
        );
      }

      state.intent = resolution.intent;

      this.emitProgress(state, "retrieving");
      if (checkAbort()) return state.run;

      let discovered: DiscoveredSchema;
      try {
        discovered = await discoverSchema(this.adapter, input.allowedSchemas);
      } catch {
        discovered = { tables: [] };
      }

      const baseline = this.baselineSchemas.get(input.connectionId);
      let driftDiff: SchemaDriftDiff | null = null;
      if (baseline) {
        driftDiff = detectSchemaDrift(
          input.connectionId,
          baseline,
          discovered,
          input.allowedSchemas,
        );
      } else {
        this.baselineSchemas.set(input.connectionId, discovered);
      }

      const snapshotId = randomUUID();
      const schemaHash = calculateSchemaHash(discovered);
      state.snapshotId = snapshotId;
      const constellation = generateSchemaConstellation(
        input.connectionId,
        snapshotId,
        discovered,
      );

      if (this.metadataDb) {
        try {
          const now = new Date();
          const expiresAt = new Date(
            now.getTime() +
              foundationPolicy.retention.schemaSnapshotDays * 86400000,
          );
          await this.metadataDb
            .insert(schemaSnapshots)
            .values({
              id: snapshotId,
              workspaceId: input.workspaceId,
              connectionId: input.connectionId,
              schemaHash,
              profileSummary: { tableCount: discovered.tables.length },
              expiresAt,
            })
            .onConflictDoNothing();
        } catch {
          // ignore
        }
      }

      this.emitProgress(state, "grounding");
      if (checkAbort()) return state.run;

      this.emitProgress(state, "planning");
      if (checkAbort()) return state.run;

      state.plan = resolution.plan;
      state.assumptions = Array.from(
        new Set([...state.assumptions, ...state.plan.assumptions]),
      );
      state.plan.assumptions = [...state.assumptions];

      this.emitProgress(state, "generating");
      if (checkAbort()) return state.run;

      const candidateId = randomUUID();
      let generatedSql = input.sqlOverride ?? resolution.sqlText;
      const role = input.role ?? "owner";

      if (resolution.activeContext.metric === "schema_overview") {
        const firstTable = discovered.tables[0];
        if (firstTable) {
          generatedSql = `SELECT count(*)::int AS total_records FROM ${firstTable.schema}.${firstTable.name};`;
          resolution.activeContext.sources = [
            `${firstTable.schema}.${firstTable.name}`,
          ];
        } else {
          generatedSql = "SELECT 1 AS schema_overview;";
          resolution.activeContext.sources = [];
        }
      }

      if (driftDiff && driftDiff.hasDrift) {
        const recovery = recoverEvolvedSql({
          connectionId: input.connectionId,
          sql: generatedSql,
          drift: driftDiff,
          role,
        });

        if (recovery.status === "blocked_by_policy") {
          this.emitProgress(state, "blocked_by_policy");
          state.run.completedAt = new Date().toISOString();
          state.answer = {
            runId,
            status: "blocked_by_policy",
            reason:
              recovery.reason ??
              "Query rejected by organization policy: Access to required evolved table or schema is denied by policy",
            nextAction:
              recovery.nextAction ??
              "Request authorization from workspace owner",
            assumptions: state.assumptions,
            limitations: [],
          };
          await this.persistRun(state);
          return state.run;
        }

        if (recovery.status === "needs_clarification") {
          this.emitProgress(state, "needs_clarification");
          state.run.completedAt = new Date().toISOString();
          state.answer = {
            runId,
            status: "needs_clarification",
            reason:
              recovery.reason ??
              "Multiple plausible evolved table candidates detected without an approved mapping",
            nextAction:
              recovery.nextAction ??
              "Clarify target entity or approve schema evolution mapping",
            assumptions: state.assumptions,
            limitations: [],
          };
          await this.persistRun(state);
          return state.run;
        }

        if (recovery.status === "abstained") {
          this.emitProgress(state, "abstained");
          state.run.completedAt = new Date().toISOString();
          state.answer = {
            runId,
            status: "abstained",
            reason:
              recovery.reason ??
              "Required analytical table has been dropped without replacement mapping",
            nextAction:
              recovery.nextAction ??
              "Verify database availability of target analytical table",
            assumptions: state.assumptions,
            limitations: [],
          };
          await this.persistRun(state);
          return state.run;
        }

        if (recovery.status === "recovered") {
          generatedSql = recovery.recoveredSql;
          state.assumptions.push(
            "Recovered from schema drift using approved mapping",
          );
          if (recovery.referencedObjects.length > 0) {
            resolution.activeContext.sources = recovery.referencedObjects;
          }
        }
      }

      state.candidate = {
        candidateId,
        dialect: "PostgreSQL",
        sqlText: generatedSql,
        referencedObjects: resolution.activeContext.sources,
        parameterDefinitions: [],
      };

      this.emitProgress(state, "authorizing");
      if (checkAbort()) return state.run;

      const safety = validateQuerySafety(generatedSql, input.allowedSchemas);
      if (!safety.allowed) {
        this.emitProgress(state, "blocked_by_policy");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "blocked_by_policy",
          reason: `Query rejected by safety policy: ${safety.reason ?? "disallowed object"}`,
          nextAction:
            "Submit a read-only query referencing only approved schemas",
          assumptions: state.assumptions,
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      const policyEval = evaluatePolicyCompliance(generatedSql, role, {
        isRecipe: input.isRecipe,
        assignedRegion: input.assignedRegion ?? "North America",
      });
      if (!policyEval.allowed) {
        this.emitProgress(state, "blocked_by_policy");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "blocked_by_policy",
          reason: `Query rejected by organization policy: ${policyEval.reason ?? "restricted access"}`,
          nextAction:
            "Submit an authorized query within permitted row and column boundaries",
          assumptions: state.assumptions,
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      this.emitProgress(state, "estimating");
      if (checkAbort()) return state.run;

      if (this.adapter.explain) {
        try {
          const estimate = await this.adapter.explain({
            sql: generatedSql,
            signal: abortController.signal,
          });
          if (estimate.warnings.length > 0) {
            state.assumptions.push(...estimate.warnings);
          }
        } catch {
          void 0;
        }
      }

      this.emitProgress(state, "executing");
      if (checkAbort()) return state.run;

      const startExec = Date.now();
      let queryResult;
      try {
        queryResult = await this.adapter.query({
          sql: generatedSql,
          signal: abortController.signal,
          timeoutMs: foundationPolicy.limits.queryTimeoutMs,
          context: {
            role,
            workspaceId: input.workspaceId,
            subject: input.actorSubject,
            region: input.assignedRegion ?? "North America",
          },
        });
      } catch (err) {
        if (checkAbort()) return state.run;

        const errMessage = err instanceof Error ? err.message : "";
        const isStaleObjectError =
          errMessage.includes("does not exist") ||
          errMessage.includes("undefined_table") ||
          errMessage.includes("undefined_column");

        if (isStaleObjectError && !driftDiff?.hasDrift) {
          try {
            const freshSchema = await discoverSchema(
              this.adapter,
              input.allowedSchemas,
            );
            const freshDiff = detectSchemaDrift(
              input.connectionId,
              discovered,
              freshSchema,
              input.allowedSchemas,
            );
            if (freshDiff.hasDrift) {
              const retryRecovery = recoverEvolvedSql({
                connectionId: input.connectionId,
                sql: generatedSql,
                drift: freshDiff,
                role,
              });
              if (retryRecovery.status === "recovered") {
                const retryPolicy = evaluatePolicyCompliance(
                  retryRecovery.recoveredSql,
                  role,
                  {
                    isRecipe: input.isRecipe,
                    assignedRegion: input.assignedRegion ?? "North America",
                  },
                );
                if (retryPolicy.allowed) {
                  generatedSql = retryRecovery.recoveredSql;
                  state.candidate.sqlText = generatedSql;
                  state.assumptions.push(
                    "Recovered from schema drift using approved mapping on execution retry",
                  );
                  queryResult = await this.adapter.query({
                    sql: generatedSql,
                    signal: abortController.signal,
                    timeoutMs: foundationPolicy.limits.queryTimeoutMs,
                    context: {
                      role,
                      workspaceId: input.workspaceId,
                      subject: input.actorSubject,
                      region: input.assignedRegion ?? "North America",
                    },
                  });
                }
              }
            }
          } catch {
            // Fall through to error
          }
        }

        if (!queryResult) {
          this.emitProgress(state, "execution_failed");
          state.run.completedAt = new Date().toISOString();
          state.answer = {
            runId,
            status: "execution_failed",
            reason: `SQL execution failed: ${errMessage || "database error"}`,
            nextAction: "Check query syntax and constraints",
            assumptions: state.assumptions,
            limitations: [],
          };
          await this.persistRun(state);
          return state.run;
        }
      }

      if (input.actorSubject && isSubjectRevoked(input.actorSubject)) {
        this.emitProgress(state, "blocked_by_policy");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "blocked_by_policy",
          reason: "Subject authorization revoked during execution",
          nextAction: "Request authorization from workspace owner",
          assumptions: [],
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      const execDuration = Date.now() - startExec;
      state.resultColumns = [...queryResult.columns];
      state.resultRows = queryResult.rows.map((row) => {
        const clean: Record<string, Scalar> = {};
        for (const [k, v] of Object.entries(row)) {
          if (
            v === null ||
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
          ) {
            clean[k] = v;
          } else {
            clean[k] = String(v);
          }
        }
        return clean;
      });

      if (resolution.activeContext.metric === "schema_overview") {
        state.resultColumns = [
          "table_name",
          "column_name",
          "data_type",
          "nullable",
          "relationship",
        ];
        state.resultRows = [];
        for (const table of discovered.tables) {
          for (const col of table.columns) {
            const edge = constellation.edges.find(
              (e) =>
                e.sourceTable === `${table.schema}.${table.name}` &&
                e.sourceColumn === col.name,
            );
            const isPk = table.primaryKey.includes(col.name);
            const relationship = edge
              ? `References ${edge.targetTable}.${edge.targetColumn} (${edge.confidence})`
              : isPk
                ? "Primary Key"
                : col.name.toLowerCase().endsWith("_id")
                  ? "Inferred foreign identifier"
                  : "Attribute";
            state.resultRows.push({
              table_name: `${table.schema}.${table.name}`,
              column_name: col.name,
              data_type: col.type,
              nullable: col.nullable ? "YES" : "NO",
              relationship,
            });
          }
        }
        if (state.resultRows.length === 0) {
          state.resultRows.push({
            table_name: "none",
            column_name: "none",
            data_type: "text",
            nullable: "NO",
            relationship: "No tables found in allowed schemas",
          });
        }
      }

      state.execution = {
        runId,
        queryHash: createHash("sha256").update(generatedSql).digest("hex"),
        durationMs: execDuration,
        rowCount: queryResult.rows.length,
        status: "succeeded",
        safeErrorCode: null,
        resourceUsage: {
          returnedBytes: JSON.stringify(queryResult.rows).length,
          modelCalls: 1,
        },
      };

      this.emitProgress(state, "verifying");
      if (checkAbort()) return state.run;

      const verification = verifyAnalysis({
        runId,
        planGrain: state.plan.grain,
        columns: state.resultColumns,
        rows: state.resultRows,
        coverage: {
          included: queryResult.rows.length,
          excluded: 0,
          denominator: queryResult.rows.length,
        },
      });
      state.verification = verification;

      if (verification.hardGateFailures.length > 0) {
        this.emitProgress(state, "abstained");
        state.run.completedAt = new Date().toISOString();
        state.answer = {
          runId,
          status: "abstained",
          reason: `Verification hard gate failed: ${verification.hardGateFailures.join(", ")}`,
          nextAction: "Resolve grain or coverage violations",
          assumptions: state.assumptions,
          limitations: [],
        };
        await this.persistRun(state);
        return state.run;
      }

      this.emitProgress(state, "challenging");
      if (checkAbort()) return state.run;

      this.emitProgress(state, "answered");
      state.run.completedAt = new Date().toISOString();
      state.exclusions = [];
      const observedAnswer =
        state.resultRows.length === 0
          ? "The executed query returned no matching records."
          : state.resultRows
              .slice(0, 10)
              .map((row) =>
                typeof row.school_id === "number" &&
                typeof row.delta === "number"
                  ? `School ${row.school_id} (${row.delta})`
                  : Object.entries(row)
                      .map(
                        ([column, value]) =>
                          `${column}: ${value === null ? "null" : value}`,
                      )
                      .join(", "),
              )
              .join("; ");

      let answerText =
        `${state.resultRows.length} result rows. ${observedAnswer}`.slice(
          0,
          4096,
        );

      if (resolution.activeContext.metric === "schema_overview") {
        const tableSummary = discovered.tables
          .map(
            (t) =>
              `${t.schema}.${t.name} (${t.rowCount} rows, ${t.columns.length} columns)`,
          )
          .join("; ");
        const edgeSummary =
          constellation.edges.length > 0
            ? constellation.edges
                .map(
                  (e) =>
                    `${e.sourceTable}.${e.sourceColumn} -> ${e.targetTable}.${e.targetColumn} (${e.confidence})`,
                )
                .join("; ")
            : "No foreign key relationships detected.";

        answerText =
          `Database overview for connection ${input.connectionId}:\n` +
          `• Discovered Tables (${discovered.tables.length}): ${tableSummary || "None in allowed schemas"}\n` +
          `• Relationships & Constraints: ${edgeSummary}\n` +
          `The full catalog of tables, columns, data types, and relationships is detailed below.`;

        answerText = await this.groq.synthesizeSchemaAnswer({
          question: input.question,
          datasetName: input.connectionId,
          tables: discovered.tables.map((t) => ({
            name: `${t.schema}.${t.name}`,
            rowCount: t.rowCount,
            columns: t.columns.map((c) => ({
              name: c.name,
              type: c.type,
              nullable: c.nullable,
            })),
          })),
          relationships: constellation.edges.map((e) => ({
            source: `${e.sourceTable}.${e.sourceColumn}`,
            target: `${e.targetTable}.${e.targetColumn}`,
            type: e.confidence,
            description: e.notes,
          })),
          originalAnswerText: answerText,
        });
      } else if (
        classification.classification === "statistical" &&
        state.resultRows.length > 0
      ) {
        answerText = await this.groq.synthesizeStatisticalAnswer({
          question: input.question,
          statisticalContext,
          calculatedResults: {
            columns: state.resultColumns,
            rows: state.resultRows as Record<string, unknown>[],
            summary: observedAnswer,
          },
          originalAnswerText: answerText,
        });
      }

      state.answer = {
        runId,
        status: "answered",
        answerText: answerText.slice(0, 4096),
        definition: `Executed read-only query for: ${input.question}`.slice(
          0,
          4096,
        ),
        resultReference: runId,
        sqlReference: candidateId,
        evidence: [
          `execution:${runId}`,
          `candidate:${candidateId}`,
          `snapshot:${snapshotId}`,
        ],
        assumptions: state.assumptions,
        limitations: state.exclusions,
      };

      await this.persistRun(state);
      return state.run;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }
}
