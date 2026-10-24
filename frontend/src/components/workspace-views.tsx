"use client";

import { useState } from "react";
import { formatFileSize, type LocalDocument } from "@/lib/local-files";
import { templates, type Question } from "@/lib/workspace";
import type {
  SchemaConstellation,
  TruthLedger,
  Result,
  DirtyRadarReport,
  CounterfactualReport,
  QueryCostPassport,
  Recipe,
} from "@/lib/api-client";
import { Icon, type IconName } from "./icon";

export function EmptyState({
  icon,
  title,
  children,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action && (
        <button className="button" onClick={onAction}>
          {action}
          <Icon name="arrow" size={16} />
        </button>
      )}
    </div>
  );
}

export function DocumentPreview({ document }: { document: LocalDocument }) {
  return (
    <>
      <div className="document-meta">
        <span
          className={`type-tag ${document.kind === "CSV" ? "mint" : "lavender"}`}
        >
          {document.kind}
        </span>
        <span>{formatFileSize(document.size)}</span>
        <span>
          {document.columns.length
            ? `${document.rowCount.toLocaleString()} rows · ${document.columns.length} columns`
            : "Text document"}
        </span>
        <span className="badge">Neon · Brotli</span>
      </div>
      {document.columns.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  {document.columns.map((column) => (
                    <th scope="col" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {document.rows.map((row, index) => (
                  <tr key={index}>
                    <td className="row-index">{index + 1}</td>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>
                        {cell || <span className="null-value">empty</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine-print">
            Showing {document.rows.length} of{" "}
            {document.rowCount.toLocaleString()} rows. Previews are limited to
            100 rows.
          </p>
        </>
      ) : (
        <pre className="text-preview">{document.text}</pre>
      )}
    </>
  );
}

export function FileList({
  documents,
  onOpen,
  onRemove,
}: {
  documents: LocalDocument[];
  onOpen: (document: LocalDocument) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="file-list">
      {documents.map((document) => (
        <div className="file-row" key={document.id}>
          <span
            className={`file-type-icon ${document.kind === "CSV" ? "mint" : "lavender"}`}
          >
            <Icon name={document.columns.length ? "table" : "file"} size={20} />
          </span>
          <button className="file-name" onClick={() => onOpen(document)}>
            <strong>{document.name}</strong>
            <span>
              {formatFileSize(document.size)} ·{" "}
              {document.columns.length
                ? `${document.rowCount.toLocaleString()} rows`
                : "Text document"}{" "}
              · Stored in Neon
            </span>
          </button>
          <span className="file-state">
            <Icon name="check" size={13} /> Ready to preview
          </span>
          <button
            className="icon-button"
            aria-label={`Remove ${document.name}`}
            onClick={() => onRemove(document.id)}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function QuestionList({
  questions,
  onOpen,
  onSave,
  onRemove,
}: {
  questions: Question[];
  onOpen: (question: Question) => void;
  onSave: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="question-list">
      {questions.map((question) => {
        const isAnswered =
          question.status === "completed" || question.status === "answered";
        const isRunning =
          question.status === "running" ||
          question.status === "planning" ||
          question.status === "executing";
        const needsClarification = question.status === "needs_clarification";
        const dotColor = isAnswered
          ? "#486653"
          : isRunning
            ? "#d97706"
            : needsClarification
              ? "#b45309"
              : "#a3a89e";
        const statusLabel = question.status
          ? question.status.replace(/_/g, " ")
          : "Draft";

        return (
          <div className="question-row" key={question.id}>
            <span
              className="question-dot"
              style={{ background: dotColor }}
              title={statusLabel}
            />
            <button className="question-title" onClick={() => onOpen(question)}>
              <strong>{question.text}</strong>
              <span>
                {question.mode} · {question.source} · {statusLabel}
              </span>
            </button>
            <time dateTime={new Date(question.createdAt).toISOString()}>
              {new Date(question.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
            <button
              aria-label={`${question.saved ? "Unsave" : "Save"} question`}
              aria-pressed={question.saved}
              className={`icon-button ${question.saved ? "bookmarked" : ""}`}
              onClick={() => onSave(question.id)}
            >
              <Icon name="bookmark" size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Delete question: ${question.text}`}
              onClick={() => onRemove(question.id)}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function TemplatesView({
  onUse,
}: {
  onUse: (question: string, category: string) => void;
}) {
  const [category, setCategory] = useState("All templates");
  return (
    <>
      <div className="filter-tabs">
        {["All templates", "Discover", "Explore", "Verify"].map((item) => (
          <button
            key={item}
            aria-pressed={item === category}
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {templates
          .filter(
            (item) =>
              category === "All templates" || category === item.category,
          )
          .map((template) => (
            <button
              key={template.title}
              className="template-card"
              onClick={() => onUse(template.question, template.category)}
            >
              <span className={`tile-icon ${template.color}`}>
                <Icon name={template.icon} size={23} />
              </span>
              <span className="eyebrow">{template.category}</span>
              <h3>{template.title}</h3>
              <p>{template.description}</p>
              <span className="card-link">
                Use template <Icon name="arrow" size={16} />
              </span>
            </button>
          ))}
      </div>
    </>
  );
}

export function ResultsTable({ result }: { result: Result }) {
  const answerText =
    result.answer.status === "answered"
      ? result.answer.answerText
      : result.answer.reason;

  if (!result.columns.length && !result.rows.length) {
    return (
      <EmptyState icon="chart" title="No tabular rows returned">
        {answerText || "This query executed without tabular records."}
      </EmptyState>
    );
  }

  return (
    <div className="results-table-container">
      <div className="results-table-header">
        <span>
          <strong>{result.rows.length.toLocaleString()}</strong> rows returned
        </span>
        <span>{result.columns.length} columns</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              {result.columns.map((column) => (
                <th scope="col" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => (
              <tr key={index}>
                <td className="row-index">{index + 1}</td>
                {result.columns.map((colName) => {
                  const cell = row[colName];
                  return (
                    <td key={colName}>
                      {cell === null || cell === undefined || cell === "" ? (
                        <span className="null-value">empty</span>
                      ) : typeof cell === "boolean" ? (
                        cell ? (
                          "true"
                        ) : (
                          "false"
                        )
                      ) : (
                        String(cell)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DirtyRadarView({
  radar,
  onReviewAnomaly,
}: {
  radar: DirtyRadarReport;
  onReviewAnomaly?: (anomalyId: string, state: "accepted" | "rejected") => void;
}) {
  if (!radar.anomalies.length) {
    return (
      <EmptyState icon="check" title="Clean radar signals">
        No dirty-value anomalies or unexpected null spikes observed across{" "}
        {radar.totalScannedRows.toLocaleString()} scanned records.
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="results-table-header" style={{ borderRadius: 10 }}>
        <span>
          <strong>{radar.anomalies.length}</strong> anomalous patterns detected
        </span>
        <span>{radar.totalScannedRows.toLocaleString()} rows audited</span>
      </div>
      <div className="radar-grid">
        {radar.anomalies.map((item) => {
          const isHigh = item.estimatedPrevalence > 0.05;
          const isMed =
            item.estimatedPrevalence > 0.01 && item.estimatedPrevalence <= 0.05;
          const severityClass = isHigh
            ? "severity-pill-high"
            : isMed
              ? "severity-pill-med"
              : "severity-pill-low";
          const severityLabel = isHigh ? "High" : isMed ? "Medium" : "Low";

          return (
            <div className="radar-card" key={item.id}>
              <div>
                <div className="radar-card-top">
                  <div>
                    <strong style={{ fontSize: 13, color: "#2d3c26" }}>
                      {item.sourceObject}.{item.field}
                    </strong>
                    <p style={{ fontSize: 11, color: "#64755a" }}>
                      Rule: {item.ruleId}
                    </p>
                  </div>
                  <span className={severityClass}>{severityLabel}</span>
                </div>
                <p style={{ fontSize: 12, color: "#41513a", margin: "8px 0" }}>
                  Observed: <em>{item.observedPattern}</em> (
                  {item.sampleCount.toLocaleString()} samples, ~
                  {(item.estimatedPrevalence * 100).toFixed(1)}% prevalence)
                </p>
                <div className="remediation-box">
                  <strong>Proposed Mapping:</strong> {item.proposedMapping}
                </div>
              </div>
              <div>
                <div className="radar-actions-row">
                  <span
                    className="badge"
                    style={{ textTransform: "capitalize", marginRight: "auto" }}
                  >
                    {item.reviewState}
                  </span>
                  {onReviewAnomaly && item.reviewState === "unreviewed" && (
                    <>
                      <button
                        className="button"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => onReviewAnomaly(item.id, "accepted")}
                      >
                        Accept
                      </button>
                      <button
                        className="button"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => onReviewAnomaly(item.id, "rejected")}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CounterfactualView({
  counterfactuals,
}: {
  counterfactuals: CounterfactualReport;
}) {
  return (
    <div className="counterfactual-box">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, color: "#32432a" }}>
            Counterfactual Sensitivity Analysis
          </h3>
          <p style={{ fontSize: 12, color: "#647559" }}>
            {counterfactuals.recommendation}
          </p>
        </div>
        <span
          className={
            counterfactuals.isMaterialDifference
              ? "severity-pill-high"
              : "severity-pill-low"
          }
        >
          {counterfactuals.isMaterialDifference
            ? "Material divergence"
            : "Stable across assumptions"}
        </span>
      </div>

      <h4 style={{ fontSize: 13, color: "#485b3f", margin: "14px 0 8px" }}>
        Evaluated Variants
      </h4>
      {counterfactuals.variants.map((v) => (
        <div className="cf-variant-card" key={v.id}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <strong>{v.name}</strong>
            <span className="badge">
              {v.coverage.included.toLocaleString()} of{" "}
              {v.coverage.denominator.toLocaleString()} rows included
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#44553c", margin: "6px 0" }}>
            {v.definition} · {v.periodSemantics}
          </p>
          <div className="remediation-box" style={{ margin: "6px 0 0" }}>
            <strong>Delta:</strong> {v.deltaSummary}
          </div>
        </div>
      ))}

      {counterfactuals.differences.length > 0 && (
        <div className="diff-table-scroll">
          <table style={{ width: "100%", fontSize: 12, textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8d6" }}>
                <th style={{ padding: "6px 10px" }}>Dimension</th>
                <th style={{ padding: "6px 10px" }}>Primary Value</th>
                <th style={{ padding: "6px 10px" }}>Counterfactual Value</th>
                <th style={{ padding: "6px 10px" }}>Material?</th>
              </tr>
            </thead>
            <tbody>
              {counterfactuals.differences.map((d, index) => (
                <tr key={index} style={{ borderBottom: "1px solid #edf2e4" }}>
                  <td style={{ padding: "6px 10px" }}>{d.dimension}</td>
                  <td style={{ padding: "6px 10px" }}>{d.primaryValue}</td>
                  <td style={{ padding: "6px 10px" }}>
                    {d.counterfactualValue}
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    {d.isMaterial ? (
                      <span className="severity-pill-high">Yes</span>
                    ) : (
                      "No"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PassportView({ passport }: { passport: QueryCostPassport }) {
  return (
    <div>
      <div className="passport-metrics-grid">
        <div className="passport-card">
          <span className="passport-metric-label">Execution Duration</span>
          <div className="passport-metric-value">
            {passport.measured.durationMs} ms
          </div>
          <small style={{ color: "#74866c" }}>
            Budget: {passport.limits.timeoutMs} ms
          </small>
        </div>
        <div className="passport-card">
          <span className="passport-metric-label">Rows Scanned</span>
          <div className="passport-metric-value">
            {passport.measured.rowCount.toLocaleString()}
          </div>
          <small style={{ color: "#74866c" }}>
            Limit: {passport.limits.maxRows.toLocaleString()}
          </small>
        </div>
        <div className="passport-card">
          <span className="passport-metric-label">Data Returned</span>
          <div className="passport-metric-value">
            {formatFileSize(passport.measured.returnedBytes)}
          </div>
          <small style={{ color: "#74866c" }}>Wire transmission</small>
        </div>
        <div className="passport-card">
          <span className="passport-metric-label">Model Calls</span>
          <div className="passport-metric-value">
            {passport.measured.modelCalls} / {passport.limits.modelCallsLimit}
          </div>
          <small style={{ color: "#74866c" }}>Inference budget</small>
        </div>
      </div>

      <div className="remediation-box" style={{ marginTop: 16 }}>
        <strong>Safety & Policy Enforcement:</strong> {passport.safetySummary}
      </div>

      {passport.advisoryEstimate.warnings.length > 0 && (
        <div className="error-box" style={{ marginTop: 12 }}>
          {passport.advisoryEstimate.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecipesView({
  recipes,
  onExecute,
  executingId,
}: {
  recipes: Recipe[];
  onExecute: (recipe: Recipe) => void;
  executingId?: string | null;
}) {
  if (!recipes.length) {
    return (
      <EmptyState icon="bookmark" title="No saved analysis recipes">
        Verified queries and repeatable metrics can be codified into
        production-grade recipes for automated execution.
      </EmptyState>
    );
  }

  return (
    <div className="template-grid">
      {recipes.map((r) => (
        <div className="template-card" key={r.id} style={{ cursor: "default" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            <span className="tile-icon mint">
              <Icon name="bookmark" size={20} />
            </span>
            <span className="badge">{r.approvalStatus}</span>
          </div>
          <span className="eyebrow">{r.metricName}</span>
          <h3>{r.name}</h3>
          <p style={{ fontSize: 12, color: "#4f6245" }}>{r.question}</p>
          <div
            className="sql-viewer-box"
            style={{ margin: "8px 0", padding: 10 }}
          >
            <code>{r.sqlText}</code>
          </div>
          <button
            className="button button-dark full-width"
            disabled={executingId === r.id}
            onClick={() => onExecute(r)}
            style={{ marginTop: 8 }}
          >
            <Icon name="play" size={14} />
            {executingId === r.id ? "Executing…" : "Run Recipe"}
          </button>
        </div>
      ))}
    </div>
  );
}

export function SchemaView({
  documents,
  constellation,
  onUpload,
  onOpen,
  onRefreshConstellation,
}: {
  documents: LocalDocument[];
  constellation?: SchemaConstellation | null;
  onUpload: () => void;
  onOpen: (document: LocalDocument) => void;
  onRefreshConstellation?: () => void;
}) {
  const [tab, setTab] = useState<"database" | "files">(
    constellation && constellation.nodes.length > 0 ? "database" : "files",
  );

  const localTables = documents.filter((doc) => doc.columns.length);

  return (
    <div>
      <div className="filter-tabs" style={{ marginBottom: 20 }}>
        {constellation && constellation.nodes.length > 0 && (
          <button
            className={tab === "database" ? "active" : ""}
            onClick={() => setTab("database")}
          >
            Database Schema Constellation ({constellation.nodes.length} tables)
          </button>
        )}
        <button
          className={tab === "files" ? "active" : ""}
          onClick={() => setTab("files")}
        >
          Local Files ({localTables.length})
        </button>
      </div>

      {tab === "database" &&
        constellation &&
        constellation.nodes.length > 0 && (
          <div className="constellation-container">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, color: "#374b30" }}>
                  Connected Schema Constellation
                </h3>
                <p style={{ fontSize: 11, color: "#697b5e" }}>
                  Snapshot: {constellation.snapshotId.slice(0, 8)} · Hash:{" "}
                  {constellation.schemaHash.slice(0, 10)}
                </p>
              </div>
              {onRefreshConstellation && (
                <button className="button" onClick={onRefreshConstellation}>
                  <Icon name="refresh" size={14} />
                  Refresh Constellation
                </button>
              )}
            </div>

            <div className="schema-grid">
              {constellation.nodes.map((node) => (
                <section className="constellation-table-card" key={node.id}>
                  <div className="constellation-table-header">
                    <div>
                      <strong style={{ fontSize: 14, color: "#2d3f27" }}>
                        {node.name}
                      </strong>
                      <p style={{ fontSize: 11, color: "#677a5e" }}>
                        {node.rowCount.toLocaleString()} rows · {node.schema}
                      </p>
                    </div>
                    <span className="badge">{node.columns.length} cols</span>
                  </div>
                  <ul className="constellation-column-list">
                    {node.columns.map((col) => {
                      const isPk = node.primaryKey.includes(col.name);
                      return (
                        <li className="constellation-column-row" key={col.name}>
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Icon name="code" size={12} />
                            <strong>{col.name}</strong>
                            {isPk && (
                              <span
                                className="badge"
                                style={{ padding: "1px 4px", fontSize: 9 }}
                              >
                                PK
                              </span>
                            )}
                          </span>
                          <span style={{ color: "#77896e", fontSize: 11 }}>
                            {col.type} {col.nullable ? "" : "not null"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            {constellation.edges.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h4
                  style={{ fontSize: 13, color: "#394d32", marginBottom: 10 }}
                >
                  Schema Graph Relationships ({constellation.edges.length})
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {constellation.edges.map((e) => (
                    <span className="constellation-edge-pill" key={e.id}>
                      <Icon name="link" size={13} />
                      <strong>
                        {e.sourceTable}.{e.sourceColumn}
                      </strong>{" "}
                      →{" "}
                      <strong>
                        {e.targetTable}.{e.targetColumn}
                      </strong>
                      <span
                        className="badge"
                        style={{
                          padding: "1px 5px",
                          fontSize: 9,
                          background:
                            e.confidence === "declared" ? "#d8edd5" : "#edf2e4",
                        }}
                      >
                        {e.confidence}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      {(tab === "files" || (!constellation && tab === "database")) && (
        <>
          {!localTables.length ? (
            <EmptyState
              icon="layers"
              title="Every answer starts with understanding"
              action="Add a data file"
              onAction={onUpload}
            >
              Add a CSV or JSON file to inspect its fields. Database
              relationships appear when connected to PostgreSQL.
            </EmptyState>
          ) : (
            <div className="schema-grid">
              {localTables.map((document) => (
                <section className="schema-card" key={document.id}>
                  <div className="schema-heading">
                    <span className="tile-icon lavender">
                      <Icon name="table" />
                    </span>
                    <div>
                      <h3>{document.name}</h3>
                      <p>
                        {document.rowCount.toLocaleString()} rows · Local file
                      </p>
                    </div>
                  </div>
                  <ul>
                    {document.columns.map((column, index) => (
                      <li key={column}>
                        <Icon name="code" size={14} />
                        <span>{column}</span>
                        <span className="field-type">
                          {document.rows.some((row) => row[index] !== "")
                            ? "text"
                            : "empty"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="text-button"
                    onClick={() => onOpen(document)}
                  >
                    Preview data
                    <Icon name="arrow" size={15} />
                  </button>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function LedgerView({
  documents,
  ledger,
  onUpload,
}: {
  documents: LocalDocument[];
  ledger?: TruthLedger | null;
  onUpload: () => void;
}) {
  if (ledger && ledger.claims.length > 0) {
    return (
      <div>
        <div
          className="results-table-header"
          style={{ borderRadius: 10, marginBottom: 14 }}
        >
          <span>
            <strong>{ledger.claims.length}</strong> verified analytical claims
          </span>
          <span className="badge" style={{ textTransform: "capitalize" }}>
            Status: {ledger.status.replace(/_/g, " ")}
          </span>
        </div>
        <div className="ledger-list">
          {ledger.claims.map((claim, index) => (
            <section className="claim-card" key={index}>
              <div className="claim-header-row">
                <div
                  style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <span
                    className="tile-icon mint"
                    style={{ width: 32, height: 32 }}
                  >
                    <Icon name="check" size={18} />
                  </span>
                  <div>
                    <h3 className="claim-title-text">{claim.claim}</h3>
                    {claim.sqlReference && (
                      <code
                        style={{
                          fontSize: 11,
                          color: "#46593e",
                          background: "#f0f5ea",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {claim.sqlReference}
                      </code>
                    )}
                  </div>
                </div>
                <span className="badge">
                  {claim.supportingRows.length} supporting rows
                </span>
              </div>
              <div className="claim-source-tags">
                {claim.sourceObjects.map((src) => (
                  <span className="claim-source-tag" key={src}>
                    <Icon name="database" size={11} /> {src}
                  </span>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (!documents.length) {
    return (
      <EmptyState
        icon="shield"
        title="Clarity you can trace back"
        action="Add your first file"
        onAction={onUpload}
      >
        Your evidence belongs here. Start with a file to see its structure and
        missing-value checks, or run an analysis to generate an audited Truth
        Ledger.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="info-callout">
        <Icon name="shield" />
        <p>
          These are deterministic file checks. Run an analysis against a
          database to produce grounded Truth Ledger claims.
        </p>
      </div>
      <div className="ledger-list">
        {documents.map((document) => (
          <section className="ledger-card" key={document.id}>
            <div className="ledger-title">
              <span className="tile-icon mint">
                <Icon name="shield" />
              </span>
              <div>
                <h3>{document.name}</h3>
                <p>Checked locally · Original file unchanged</p>
              </div>
              <span className="badge">File evidence</span>
            </div>
            <div className="check-row">
              <Icon name="check" size={16} />
              <span>Readable {document.kind} format</span>
              <span>Passed</span>
            </div>
            {document.columns.length > 0 && (
              <>
                <div className="check-row">
                  <Icon name="check" size={16} />
                  <span>
                    {document.columns.length} named fields ·{" "}
                    {document.rowCount.toLocaleString()} records
                  </span>
                  <span>Observed</span>
                </div>
                <div
                  className={`check-row ${document.emptyCells ? "has-warning" : ""}`}
                >
                  <Icon
                    name={document.emptyCells ? "warning" : "check"}
                    size={16}
                  />
                  <span>
                    {document.emptyCells.toLocaleString()} empty values across
                    all records
                  </span>
                  <span>{document.emptyCells ? "Review" : "Passed"}</span>
                </div>
              </>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
