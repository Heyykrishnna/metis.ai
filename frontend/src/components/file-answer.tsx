"use client";

import type { FileAnalysis } from "@/lib/file-client";
import {
  fileCoverage,
  operationLabel,
  readFilePlan,
} from "@/lib/file-presentation";
import { formatFileSize, type LocalDocument } from "@/lib/local-files";
import { Icon } from "./icon";
import { ResultsTable } from "./workspace-views";

const fileColumnLabels: Record<string, string> = {
  field: "Field",
  observed_type: "Observed type",
  nullable: "Empty values observed",
  nonempty_rows: "Nonempty rows",
  empty_rows: "Empty rows",
  numeric_rows: "Numeric rows",
  included_rows: "Rows used",
  excluded_empty_rows: "Empty rows excluded",
  value: "Value",
};

function Coverage({ analysis }: { analysis: FileAnalysis }) {
  const coverage = fileCoverage(analysis);
  return (
    <div className="evidence-coverage">
      <div>
        <span>Data coverage</span>
        <strong>
          {coverage.percent === null ? "Not measured" : `${coverage.percent}%`}
        </strong>
      </div>
      <progress
        aria-label={
          coverage.percent === null
            ? "Data coverage not measured"
            : "Data coverage"
        }
        max={100}
        value={coverage.percent ?? 0}
      />
      <p>
        {coverage.percent === null
          ? coverage.unit
          : `${coverage.included.toLocaleString()} nonempty of ${(coverage.included + coverage.excluded).toLocaleString()} ${coverage.unit}. ${coverage.excluded.toLocaleString()} empty.`}
      </p>
      <small>
        Coverage describes available data, not a probability that the answer is
        correct.
      </small>
    </div>
  );
}

function Definition({ analysis }: { analysis: FileAnalysis }) {
  const answer = analysis.result.answer;
  if (answer.status !== "answered") return null;
  const plan = readFilePlan(answer.definition);
  if (!plan)
    return <p className="answer-definition-text">{answer.definition}</p>;
  return (
    <dl className="answer-definition">
      <div>
        <dt>Calculation</dt>
        <dd>{operationLabel(plan.operation)}</dd>
      </div>
      {plan.column && (
        <div>
          <dt>Field</dt>
          <dd>{plan.column}</dd>
        </div>
      )}
      <div>
        <dt>Grouping</dt>
        <dd>{plan.groupBy ?? "Not grouped"}</dd>
      </div>
      <div>
        <dt>Filters</dt>
        <dd>
          {plan.filters.length
            ? plan.filters
                .map(
                  (filter) =>
                    `${filter.column} ${filter.operator} ${filter.value}`,
                )
                .join("; ")
            : "All records"}
        </dd>
      </div>
    </dl>
  );
}

export function FileAnswer({
  analysis,
  document,
  onEvidence,
  onResults,
  onSchema,
}: {
  analysis: FileAnalysis;
  document?: LocalDocument;
  onEvidence: () => void;
  onResults: () => void;
  onSchema: () => void;
}) {
  const answer = analysis.result.answer;
  if (answer.status === "needs_clarification") return null;
  if (answer.status !== "answered")
    return (
      <section className="file-answer-card">
        <span className="status-chip amber">
          {answer.status === "execution_failed"
            ? "Analysis could not finish"
            : "More evidence needed"}
        </span>
        <h2>A confirmed answer is not available yet</h2>
        <p className="answer-prose">{answer.reason}</p>
        <p className="muted">{answer.nextAction}</p>
      </section>
    );
  return (
    <div className="file-answer-stack">
      <section className="file-answer-card">
        <div className="file-answer-heading">
          <div>
            <span className="eyebrow">FILE-GROUNDED RESULT</span>
            <h2>
              {analysis.method === "extractive"
                ? "From your document"
                : "Your answer"}
            </h2>
          </div>
          <span className="status-chip blue">
            <Icon name="check" size={13} />
            {analysis.method === "extractive"
              ? "Source excerpts"
              : "Computed result"}
          </span>
        </div>
        <div className="answer-source">
          <Icon name="file" size={14} />
          <span>{document?.name ?? "Stored source file"}</span>
          <button type="button" onClick={onSchema}>
            View schema <Icon name="arrow" size={12} />
          </button>
        </div>
        <p className="answer-prose">{answer.answerText}</p>
        <Definition analysis={analysis} />
        <Coverage analysis={analysis} />
      </section>
      {analysis.result.rows.length > 0 && (
        <section className="file-answer-card answer-preview">
          <div className="section-heading">
            <h2>
              {readFilePlan(answer.definition)?.operation === "schema"
                ? "Observed schema"
                : "Supporting results"}
            </h2>
            <button className="text-button" onClick={onResults}>
              View all results <Icon name="arrow" size={13} />
            </button>
          </div>
          <ResultsTable
            columnLabels={fileColumnLabels}
            result={{
              ...analysis.result,
              rows: analysis.result.rows.slice(0, 6),
            }}
          />
          <p className="fine-print">
            Showing {Math.min(6, analysis.result.rows.length)} of{" "}
            {analysis.result.rows.length} returned results.
          </p>
        </section>
      )}
      {answer.limitations.length > 0 && (
        <section className="answer-notes">
          <span className="soft-icon lavender">
            <Icon name="help" size={16} />
          </span>
          <div>
            <h3>Keep in mind</h3>
            <ul>
              {answer.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <button className="text-button" onClick={onEvidence}>
        Inspect source & evidence <Icon name="arrow" size={14} />
      </button>
    </div>
  );
}

export function FileEvidence({
  analysis,
  document,
}: {
  analysis: FileAnalysis;
  document?: LocalDocument;
}) {
  const answer = analysis.result.answer;
  const matches = document?.sha256 === analysis.sourceHash;
  return (
    <div className="file-answer-stack">
      <section className="file-answer-card">
        <div className="file-answer-heading">
          <div>
            <span className="eyebrow">TRACE THE ANSWER</span>
            <h2>Stored-file evidence</h2>
          </div>
          <span className={`status-chip ${matches ? "blue" : "lavender"}`}>
            {matches ? "Source version matched" : "Source hash recorded"}
          </span>
        </div>
        <p className="muted">
          The source, computation and limits behind this result.
        </p>
        <div className="evidence-summary">
          <div>
            <span>Source</span>
            <strong>{document?.name ?? "Stored file"}</strong>
          </div>
          <div>
            <span>Method</span>
            <strong>
              {analysis.method === "extractive"
                ? "Verified document excerpts"
                : analysis.method === "deterministic"
                  ? "Deterministic calculation"
                  : "Model plan + server calculation"}
            </strong>
          </div>
          {document && (
            <div>
              <span>Storage</span>
              <strong>Brotli · {formatFileSize(document.size)} original</strong>
            </div>
          )}
          <div>
            <span>Created</span>
            <strong>{new Date(analysis.createdAt).toLocaleString()}</strong>
          </div>
        </div>
        <Coverage analysis={analysis} />
      </section>
      <section className="file-answer-card">
        <h2>How this answer was produced</h2>
        <Definition analysis={analysis} />
        {answer.status !== "answered" && (
          <p className="answer-prose">{answer.reason}</p>
        )}
        <ul className="evidence-checks">
          <li>
            <Icon name="shield" size={15} />
            <div>
              <strong>Source integrity</strong>
              <p>
                Original bytes are checked against SHA-256 before analysis.{" "}
                {matches
                  ? "The current file matches this result’s recorded source hash."
                  : "The source hash for this run is recorded below."}
              </p>
            </div>
          </li>
          <li>
            <Icon name="table" size={15} />
            <div>
              <strong>
                {analysis.method === "extractive"
                  ? "Verified excerpts"
                  : answer.status === "answered"
                    ? "Complete validated file"
                    : "No confirmed computation"}
              </strong>
              <p>
                {analysis.method === "extractive"
                  ? "Returned excerpts must exist in the source. Search context is bounded."
                  : answer.status === "answered"
                    ? "The calculation uses all matching validated records. The visible result preview is limited separately."
                    : "Resolve the outstanding question or service error before relying on a result."}
              </p>
            </div>
          </li>
        </ul>
        {answer.assumptions.length > 0 && (
          <div className="evidence-note-group">
            <h3>Assumptions & rules</h3>
            <ul>
              {answer.assumptions.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
        )}
        {answer.limitations.length > 0 && (
          <div className="evidence-note-group">
            <h3>Limitations</h3>
            <ul>
              {answer.limitations.map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
        )}
        <details className="evidence-technical">
          <summary>Technical record</summary>
          <dl>
            <dt>Source SHA-256</dt>
            <dd>
              <code>{analysis.sourceHash}</code>
            </dd>
            <dt>Analysis ID</dt>
            <dd>
              <code>{analysis.id}</code>
            </dd>
            <dt>Planner</dt>
            <dd>{analysis.modelVersion}</dd>
          </dl>
          {answer.status === "answered" && <pre>{answer.definition}</pre>}
        </details>
      </section>
    </div>
  );
}

export function FileSchema({
  document,
  analysis,
  onAnalyze,
}: {
  document?: LocalDocument;
  analysis?: FileAnalysis;
  onAnalyze: () => void;
}) {
  const full =
    analysis?.result.answer.status === "answered" &&
    readFilePlan(analysis.result.answer.definition)?.operation === "schema";
  return (
    <section className="file-answer-card">
      <div className="file-answer-heading">
        <div>
          <span className="eyebrow">UNDERSTAND THE SOURCE</span>
          <h2>File schema</h2>
        </div>
        <span className="status-chip lavender">
          {full ? "Full-file observations" : "Source fields"}
        </span>
      </div>
      <p className="muted">
        {document?.name ?? "Stored source"} · {document?.columns.length ?? 0}{" "}
        fields. Types describe observed values; database constraints and
        relationships are not inferred.
      </p>
      {full && analysis ? (
        <ResultsTable
          result={analysis.result}
          columnLabels={fileColumnLabels}
        />
      ) : document?.columns.length ? (
        <>
          <div className="schema-field-list">
            {document.columns.map((field, index) => (
              <div key={field}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon name="table" size={13} />
                <strong>{field}</strong>
                <small>Type not profiled yet</small>
              </div>
            ))}
          </div>
          <div className="schema-action">
            <p className="muted">
              Analyze every validated record to get observed types, empty counts
              and nullability.
            </p>
            <button className="button" onClick={onAnalyze}>
              Analyze full-file schema <Icon name="arrow" size={14} />
            </button>
          </div>
        </>
      ) : (
        <p className="answer-prose">
          This is a text document, so it has no tabular field schema.
        </p>
      )}
    </section>
  );
}
