import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AnalysisOrchestrator } from "../src/analysis/orchestrator.js";
import type {
  AnalyticalQuery,
  AnalyticalResult,
  ConnectorAdapter,
} from "../src/sql/connectors.js";
import type { Static, TSchema } from "typebox";
import type {
  GenerationOptions,
  InferenceClient,
} from "../src/inference/client.js";
import {
  restoreSubjectAccess,
  revokeSubjectAccess,
} from "../src/security/policies.js";
import { clearConversations } from "../src/analysis/conversations.js";

class MockAnalyticalAdapter implements ConnectorAdapter {
  readonly id = "mock-adapter";
  readonly dialect = "PostgreSQL" as const;

  async query(_query: AnalyticalQuery): Promise<AnalyticalResult> {
    return {
      columns: ["school_id", "delta"],
      rows: [
        { school_id: 1, delta: -20 },
        { school_id: 4, delta: -10 },
      ],
    };
  }
}

class MockInferenceClient implements InferenceClient {
  readonly modelVersion = "Qwen2.5-Coder-7B-Instruct";

  async generateStructured<T extends TSchema>(
    _prompt: string,
    _schema: T,
    _options?: GenerationOptions,
  ): Promise<Static<T>> {
    return {} as Static<T>;
  }
}

describe("Phase 7: Follow-up conversations and explicit clarification (Gate G7)", () => {
  it("evaluates the frozen 50-conversation benchmark suite across 200 analytical turns", async () => {
    clearConversations();
    const adapter = new MockAnalyticalAdapter();
    const inference = new MockInferenceClient();
    const orchestrator = new AnalysisOrchestrator({ adapter, inference });
    const app = await buildApp({ orchestrator });

    const ws1 = "00000000-0000-4000-8000-000000000001";
    const ws2 = "00000000-0000-4000-8000-000000000002";
    const authHeaders = {
      authorization: `Bearer usr-turn-test:${ws1}:analyst`,
      "x-workspace-id": ws1,
      "x-metis-workspace-id": ws1,
      "x-metis-role": "analyst",
      "x-metis-subject": "usr-turn-test",
    };

    const connRes = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: authHeaders,
      payload: {
        name: "Conversation DB",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "analytics_clean",
        username: "analyst_user",
        secretReference: "secret://db-conv-1",
        allowedSchemas: ["analytics_clean", "analytics_dirty"],
      },
    });
    expect(connRes.statusCode).toBe(201);
    const connectionId = connRes.json().id;

    const connRes2 = await app.inject({
      method: "POST",
      url: "/v1/connections",
      headers: {
        ...authHeaders,
        authorization: `Bearer usr-turn-test:${ws2}:analyst`,
        "x-workspace-id": ws2,
        "x-metis-workspace-id": ws2,
      },
      payload: {
        name: "Conversation DB 2",
        engine: "PostgreSQL",
        host: "127.0.0.1",
        port: 5432,
        database: "analytics_clean",
        username: "analyst_user_2",
        secretReference: "secret://db-conv-2",
        allowedSchemas: ["analytics_clean", "analytics_dirty"],
      },
    });
    expect(connRes2.statusCode).toBe(201);
    const connectionId2 = connRes2.json().id;

    interface TurnSpec {
      question: string;
      expectedStatus: string;
      role?: string;
      subject?: string;
      workspaceId?: string;
      isClarificationAnswer?: boolean;
    }

    interface ConversationDef {
      id: string;
      family: string;
      turns: [TurnSpec, TurnSpec, TurnSpec, TurnSpec];
      clarificationStep?: {
        betweenTurns: [number, number];
        reply: string;
      };
    }

    const conversations: ConversationDef[] = [
      // Family 1: Temporal refinements (C01 - C10)
      {
        id: "C01",
        family: "Temporal refinements",
        turns: [
          {
            question:
              "Which schools had lower enrolment in calendar 2025 than 2024?",
            expectedStatus: "answered",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Previous period", expectedStatus: "answered" },
        ],
      },
      {
        id: "C02",
        family: "Temporal refinements",
        turns: [
          {
            question: "Which schools declined in 2025?",
            expectedStatus: "answered",
          },
          { question: "Examine calendar 2024", expectedStatus: "answered" },
          {
            question: "Complete versus partial year",
            expectedStatus: "answered",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
        ],
      },
      {
        id: "C03",
        family: "Temporal refinements",
        turns: [
          {
            question: "Enrolment declines between 2024 and 2025",
            expectedStatus: "answered",
          },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Reset and check 2025", expectedStatus: "answered" },
        ],
      },
      {
        id: "C04",
        family: "Temporal refinements",
        turns: [
          {
            question: "Which schools had lower enrolment in 2025?",
            expectedStatus: "answered",
          },
          { question: "Previous period", expectedStatus: "answered" },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Now only for 2023", expectedStatus: "answered" },
        ],
      },
      {
        id: "C05",
        family: "Temporal refinements",
        turns: [
          {
            question: "Show school enrolments 2025 vs 2024",
            expectedStatus: "answered",
          },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Previous period", expectedStatus: "answered" },
          { question: "Now only for 2023", expectedStatus: "answered" },
        ],
      },
      {
        id: "C06",
        family: "Temporal refinements",
        turns: [
          {
            question: "Enrolment changes for 2025",
            expectedStatus: "answered",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Previous period", expectedStatus: "answered" },
          { question: "Now for 2024", expectedStatus: "answered" },
        ],
      },
      {
        id: "C07",
        family: "Temporal refinements",
        turns: [
          {
            question: "Which schools dropped in enrolment in 2025?",
            expectedStatus: "answered",
          },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Previous period", expectedStatus: "answered" },
        ],
      },
      {
        id: "C08",
        family: "Temporal refinements",
        turns: [
          {
            question: "Enrolment decline analysis",
            expectedStatus: "answered",
          },
          { question: "Previous period", expectedStatus: "answered" },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Now for 2024", expectedStatus: "answered" },
        ],
      },
      {
        id: "C09",
        family: "Temporal refinements",
        turns: [
          {
            question: "Which schools had lower enrolment in 2025?",
            expectedStatus: "answered",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Previous period", expectedStatus: "answered" },
        ],
      },
      {
        id: "C10",
        family: "Temporal refinements",
        turns: [
          {
            question: "Calculate school enrolment decline",
            expectedStatus: "answered",
          },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Previous period", expectedStatus: "answered" },
          { question: "Now only for 2023", expectedStatus: "answered" },
        ],
      },

      // Family 2: Filters, grouping and grain (C11 - C20)
      {
        id: "C11",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Which schools had lower enrolment in 2025?",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          {
            question: "Exclude schools in North region",
            expectedStatus: "answered",
          },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
      {
        id: "C12",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Identify declining schools",
            expectedStatus: "answered",
          },
          {
            question: "Break that down by school name",
            expectedStatus: "answered",
          },
          { question: "Only for Arun", expectedStatus: "answered" },
          { question: "Show top 1", expectedStatus: "answered" },
        ],
      },
      {
        id: "C13",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Which schools had lower enrolment?",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          { question: "Exclude North", expectedStatus: "answered" },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
      {
        id: "C14",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Calculate enrolment deltas for schools",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          {
            question: "Break that down by school name",
            expectedStatus: "answered",
          },
          { question: "Only for Arun", expectedStatus: "answered" },
        ],
      },
      {
        id: "C15",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Find declining schools in 2025",
            expectedStatus: "answered",
          },
          { question: "Show top 3 only", expectedStatus: "answered" },
          { question: "Show top 1", expectedStatus: "answered" },
          {
            question: "Break that down by school name",
            expectedStatus: "answered",
          },
        ],
      },
      {
        id: "C16",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Which schools dropped enrolment?",
            expectedStatus: "answered",
          },
          {
            question: "Exclude schools in North region",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
      {
        id: "C17",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Check school enrolment declines",
            expectedStatus: "answered",
          },
          { question: "Only for Arun", expectedStatus: "answered" },
          {
            question: "Break that down by school name",
            expectedStatus: "answered",
          },
          { question: "Show top 1", expectedStatus: "answered" },
        ],
      },
      {
        id: "C18",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Schools with lower enrolment in 2025",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          { question: "Only South region", expectedStatus: "answered" },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
      {
        id: "C19",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Analyse school enrolment declines",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          { question: "Show top 3 only", expectedStatus: "answered" },
          { question: "Exclude North", expectedStatus: "answered" },
        ],
      },
      {
        id: "C20",
        family: "Filters, grouping and grain",
        turns: [
          {
            question: "Which schools declined between 2024 and 2025?",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          {
            question: "Break that down by school name",
            expectedStatus: "answered",
          },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },

      // Family 3: References, corrections and resets (C21 - C30)
      {
        id: "C21",
        family: "References and corrections",
        turns: [
          {
            question: "Which schools had lower enrolment in 2025?",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          {
            question: "Reset and start over with 2025 enrolments",
            expectedStatus: "answered",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
        ],
      },
      {
        id: "C22",
        family: "References and corrections",
        turns: [
          { question: "Find declining schools", expectedStatus: "answered" },
          {
            question: "Which of those schools had the largest drop?",
            expectedStatus: "answered",
          },
          {
            question: "Break them down by school name",
            expectedStatus: "answered",
          },
          { question: "Show top 1", expectedStatus: "answered" },
        ],
      },
      {
        id: "C23",
        family: "References and corrections",
        turns: [
          {
            question: "Which schools declined in 2025?",
            expectedStatus: "answered",
          },
          { question: "Only for Arun", expectedStatus: "answered" },
          {
            question: "Actually for Delta instead",
            expectedStatus: "answered",
          },
          {
            question: "Break that down by school name",
            expectedStatus: "answered",
          },
        ],
      },
      {
        id: "C24",
        family: "References and corrections",
        turns: [
          {
            question: "School decline query for 2025",
            expectedStatus: "answered",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          {
            question: "Start over with 2025 enrolments",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
        ],
      },
      {
        id: "C25",
        family: "References and corrections",
        turns: [
          { question: "Show declining schools", expectedStatus: "answered" },
          { question: "Break that down by region", expectedStatus: "answered" },
          {
            question: "Actually for Delta instead",
            expectedStatus: "answered",
          },
          { question: "Show top 1", expectedStatus: "answered" },
        ],
      },
      {
        id: "C26",
        family: "References and corrections",
        turns: [
          {
            question: "Enrolment drops across 2024 and 2025",
            expectedStatus: "answered",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          {
            question: "Actually for Delta instead",
            expectedStatus: "answered",
          },
          {
            question: "Break that down by school name",
            expectedStatus: "answered",
          },
        ],
      },
      {
        id: "C27",
        family: "References and corrections",
        turns: [
          {
            question: "Schools with enrolment decline",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          { question: "Exclude North", expectedStatus: "answered" },
          {
            question: "New analysis: which schools declined in 2023?",
            expectedStatus: "answered",
          },
        ],
      },
      {
        id: "C28",
        family: "References and corrections",
        turns: [
          {
            question: "Which schools had lower enrolment?",
            expectedStatus: "answered",
          },
          {
            question: "Which of those schools declined?",
            expectedStatus: "answered",
          },
          {
            question: "Break them down by school name",
            expectedStatus: "answered",
          },
          {
            question: "Actually for Delta instead",
            expectedStatus: "answered",
          },
        ],
      },
      {
        id: "C29",
        family: "References and corrections",
        turns: [
          {
            question: "Calculate school enrolment changes",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          { question: "Reset", expectedStatus: "answered" },
          { question: "Now only for 2023", expectedStatus: "answered" },
        ],
      },
      {
        id: "C30",
        family: "References and corrections",
        turns: [
          {
            question: "Which schools had lower enrolment in 2025?",
            expectedStatus: "answered",
          },
          { question: "Only for Arun", expectedStatus: "answered" },
          {
            question: "Actually for Delta instead",
            expectedStatus: "answered",
          },
          { question: "Show top 1", expectedStatus: "answered" },
        ],
      },

      // Family 4: Material ambiguity (C31 - C40)
      {
        id: "C31",
        family: "Material ambiguity",
        turns: [
          {
            question:
              "Compare enrolments across 2024 and 2025 using calendar or academic year?",
            expectedStatus: "needs_clarification",
          },
          {
            question: "Calendar year please",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Break that down by region", expectedStatus: "answered" },
        ],
      },
      {
        id: "C32",
        family: "Material ambiguity",
        turns: [
          {
            question:
              "Which schools declined between 01/02/2025 and 02/01/2025?",
            expectedStatus: "needs_clarification",
          },
          {
            question: "Use DD/MM/YYYY dates please",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
      {
        id: "C33",
        family: "Material ambiguity",
        turns: [
          {
            question: "Break down enrolments by school and region",
            expectedStatus: "answered",
          },
          { question: "Compare those", expectedStatus: "needs_clarification" },
          {
            question: "Compare schools please",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
        ],
      },
      {
        id: "C34",
        family: "Material ambiguity",
        turns: [
          {
            question: "Decline query: is that calendar or academic year?",
            expectedStatus: "needs_clarification",
          },
          {
            question: "Calendar year",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          {
            question: "Break that down by school name",
            expectedStatus: "answered",
          },
          { question: "Show top 1", expectedStatus: "answered" },
        ],
      },
      {
        id: "C35",
        family: "Material ambiguity",
        turns: [
          {
            question: "Observe periods 01/02/2025 and 02/01/2025",
            expectedStatus: "needs_clarification",
          },
          {
            question: "First date format DD/MM",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
      {
        id: "C36",
        family: "Material ambiguity",
        turns: [
          {
            question: "Enrolments in schools and regions",
            expectedStatus: "answered",
          },
          { question: "Compare those", expectedStatus: "needs_clarification" },
          {
            question: "Schools please",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Show top 1", expectedStatus: "answered" },
        ],
      },
      {
        id: "C37",
        family: "Material ambiguity",
        turns: [
          {
            question: "Are we analyzing calendar or academic year?",
            expectedStatus: "needs_clarification",
          },
          {
            question: "Academic year",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Break that down by region", expectedStatus: "answered" },
        ],
      },
      {
        id: "C38",
        family: "Material ambiguity",
        turns: [
          {
            question: "School and regional metrics",
            expectedStatus: "answered",
          },
          { question: "Compare those", expectedStatus: "needs_clarification" },
          {
            question: "Schools",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
      {
        id: "C39",
        family: "Material ambiguity",
        turns: [
          {
            question: "Check changes for dates 01/02/2025 and 02/01/2025",
            expectedStatus: "needs_clarification",
          },
          {
            question: "DD/MM please",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Only for Arun", expectedStatus: "answered" },
        ],
      },
      {
        id: "C40",
        family: "Material ambiguity",
        turns: [
          {
            question: "Break down by region and school",
            expectedStatus: "answered",
          },
          {
            question: "Break those down",
            expectedStatus: "needs_clarification",
          },
          {
            question: "Schools please",
            expectedStatus: "answered",
            isClarificationAnswer: true,
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
        ],
      },

      // Family 5: Security and context lifecycle (C41 - C50)
      {
        id: "C41",
        family: "Security and context lifecycle",
        turns: [
          {
            question: "Which schools declined?",
            expectedStatus: "answered",
            role: "analyst",
          },
          {
            question: "Now only for 2023",
            expectedStatus: "blocked_by_policy",
            role: "viewer",
          },
          {
            question: "Break that down by region",
            expectedStatus: "blocked_by_policy",
            role: "viewer",
          },
          {
            question: "Show top 3 only",
            expectedStatus: "blocked_by_policy",
            role: "viewer",
          },
        ],
      },
      {
        id: "C42",
        family: "Security and context lifecycle",
        turns: [
          {
            question: "Which schools had lower enrolment in 2025?",
            expectedStatus: "answered",
            subject: "usr-rev-1",
          },
          {
            question: "Now only for 2023",
            expectedStatus: "answered",
            subject: "usr-rev-1",
          },
          {
            question: "Break that down by region",
            expectedStatus: "blocked_by_policy",
            subject: "usr-rev-revoked",
          },
          {
            question: "Show top 3 only",
            expectedStatus: "blocked_by_policy",
            subject: "usr-rev-revoked",
          },
        ],
      },
      {
        id: "C43",
        family: "Security and context lifecycle",
        turns: [
          { question: "Calculate enrolment drop", expectedStatus: "answered" },
          {
            question: "DROP TABLE analytics_clean.enrolments;",
            expectedStatus: "blocked_by_policy",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Break that down by region", expectedStatus: "answered" },
        ],
      },
      {
        id: "C44",
        family: "Security and context lifecycle",
        turns: [
          {
            question: "Which schools declined?",
            expectedStatus: "answered",
            workspaceId: ws1,
          },
          {
            question: "Cross-workspace follow-up",
            expectedStatus: "blocked_by_policy",
            workspaceId: ws2,
          },
          {
            question: "New analysis: check schools in 2023",
            expectedStatus: "answered",
            workspaceId: ws1,
          },
          {
            question: "Break that down by region",
            expectedStatus: "answered",
            workspaceId: ws1,
          },
        ],
      },
      {
        id: "C45",
        family: "Security and context lifecycle",
        turns: [
          { question: "Which schools declined?", expectedStatus: "answered" },
          {
            question: "Break that down by national_id",
            expectedStatus: "blocked_by_policy",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Break that down by region", expectedStatus: "answered" },
        ],
      },
      {
        id: "C46",
        family: "Security and context lifecycle",
        turns: [
          {
            question: "Which schools had lower enrolment in 2025?",
            expectedStatus: "answered",
          },
          {
            question: "Join private_data.restricted table",
            expectedStatus: "blocked_by_policy",
          },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
      {
        id: "C47",
        family: "Security and context lifecycle",
        turns: [
          {
            question: "Which schools declined in 2025?",
            expectedStatus: "answered",
          },
          {
            question: "=cmd|' /C calc'!A0",
            expectedStatus: "blocked_by_policy",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Break that down by region", expectedStatus: "answered" },
        ],
      },
      {
        id: "C48",
        family: "Security and context lifecycle",
        turns: [
          { question: "Find declining schools", expectedStatus: "answered" },
          {
            question: "SELECT * FROM pg_catalog.pg_tables",
            expectedStatus: "blocked_by_policy",
          },
          { question: "Now for 2024", expectedStatus: "answered" },
          { question: "Show top 1", expectedStatus: "answered" },
        ],
      },
      {
        id: "C49",
        family: "Security and context lifecycle",
        turns: [
          {
            question: "Analyze school enrolment drops",
            expectedStatus: "answered",
          },
          {
            question: "WHERE id IN (SELECT id FROM information_schema.tables)",
            expectedStatus: "blocked_by_policy",
          },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Break that down by region", expectedStatus: "answered" },
        ],
      },
      {
        id: "C50",
        family: "Security and context lifecycle",
        turns: [
          {
            question: "Which schools declined between 2024 and 2025?",
            expectedStatus: "answered",
          },
          { question: "Break that down by region", expectedStatus: "answered" },
          { question: "Now only for 2023", expectedStatus: "answered" },
          { question: "Show top 3 only", expectedStatus: "answered" },
        ],
      },
    ];

    revokeSubjectAccess("usr-rev-revoked");

    let totalTurnsScored = 0;
    let successfulTurns = 0;
    let firstThreeTurnsTotal = 0;
    let firstThreeTurnsSuccessful = 0;
    let successfulConversations = 0;

    let totalAmbiguityOpportunities = 0;
    let truePositivesAmbiguity = 0;
    let falsePositivesAmbiguity = 0;
    let totalClearOpportunities = 0;
    let trueNegativesClear = 0;

    for (const conv of conversations) {
      let currentParentRunId: string | null = null;
      let convFailed = false;

      for (let tIdx = 0; tIdx < conv.turns.length; tIdx++) {
        const turn = conv.turns[tIdx]!;
        totalTurnsScored++;
        if (tIdx < 3) {
          firstThreeTurnsTotal++;
        }

        const turnRole = turn.role ?? "analyst";
        const turnSubject = turn.subject ?? "usr-turn-test";
        const turnWorkspace = turn.workspaceId ?? ws1;
        const turnHeaders = {
          authorization: `Bearer ${turnSubject}:${turnWorkspace}:${turnRole}`,
          "x-workspace-id": turnWorkspace,
          "x-metis-role": turnRole,
          "x-metis-subject": turnSubject,
          "x-metis-workspace-id": turnWorkspace,
        };

        const isAmbiguousQuery = turn.expectedStatus === "needs_clarification";
        if (isAmbiguousQuery) {
          totalAmbiguityOpportunities++;
        } else {
          totalClearOpportunities++;
        }

        const runRes = await app.inject({
          method: "POST",
          url: "/v1/analyses",
          headers: turnHeaders,
          payload: {
            connectionId:
              turn.workspaceId === ws2 ? connectionId2 : connectionId,
            question: turn.question,
            ...(currentParentRunId ? { parentRunId: currentParentRunId } : {}),
          },
        });
        expect(runRes.statusCode).toBe(202);

        const runData = runRes.json() as { runId: string };
        const runId: string = runData.runId;
        expect(runId).toBeDefined();

        const fetchedRun = await app.orchestrator.getRun(
          runId,
          turn.workspaceId ?? ws1,
        );
        expect(fetchedRun).not.toBeNull();
        if (!fetchedRun) {
          throw new Error(`Run ${runId} not found`);
        }
        expect(fetchedRun.status).toBe(turn.expectedStatus);

        if (fetchedRun.status === turn.expectedStatus) {
          successfulTurns++;
          if (tIdx < 3) {
            firstThreeTurnsSuccessful++;
          }
          if (isAmbiguousQuery) {
            truePositivesAmbiguity++;
          } else {
            trueNegativesClear++;
          }
        } else {
          convFailed = true;
          if (isAmbiguousQuery && fetchedRun.status !== "needs_clarification") {
            // false negative
          } else if (
            !isAmbiguousQuery &&
            fetchedRun.status === "needs_clarification"
          ) {
            falsePositivesAmbiguity++;
          }
        }

        if (
          fetchedRun.status === "answered" ||
          fetchedRun.status === "needs_clarification"
        ) {
          currentParentRunId = runId;
        }

        // Verify conversation context inspection endpoint for authorized runs
        if (turn.workspaceId === undefined || turn.workspaceId === ws1) {
          if (turn.subject !== "usr-rev-revoked") {
            const ctxRes = await app.inject({
              method: "GET",
              url: `/v1/runs/${runId}/context`,
              headers: turnHeaders,
            });
            if (fetchedRun.status === "blocked_by_policy") {
              // May still be 200 or 404 depending on whether turn was persisted
            } else {
              expect(ctxRes.statusCode).toBe(200);
              const ctxData = ctxRes.json();
              expect(ctxData.runId).toBe(runId);
              expect(ctxData.turnNumber).toBeGreaterThanOrEqual(1);
              expect(ctxData.delta).toBeDefined();
            }
          } else {
            // Revoked subject must receive 403
            const ctxRes = await app.inject({
              method: "GET",
              url: `/v1/runs/${runId}/context`,
              headers: turnHeaders,
            });
            expect(ctxRes.statusCode).toBe(403);
          }
        }
      }

      if (!convFailed) {
        successfulConversations++;
      }
    }

    restoreSubjectAccess("usr-rev-revoked");

    expect(totalTurnsScored).toBe(200);
    expect(firstThreeTurnsTotal).toBe(150);
    expect(successfulTurns).toBe(200);
    expect(firstThreeTurnsSuccessful).toBe(150);
    expect(successfulConversations).toBe(50);
    expect(successfulConversations).toBeGreaterThanOrEqual(45);

    const precision =
      truePositivesAmbiguity /
      (truePositivesAmbiguity + falsePositivesAmbiguity);
    const recall = truePositivesAmbiguity / totalAmbiguityOpportunities;

    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.95);
  });
});
