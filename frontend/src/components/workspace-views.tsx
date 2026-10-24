"use client";

import { useState } from "react";
import { formatFileSize, type LocalDocument } from "@/lib/local-files";
import { templates, type Question } from "@/lib/workspace";
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
        <span className="badge">Browser only</span>
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
              · In this session
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
      {questions.map((question) => (
        <div className="question-row" key={question.id}>
          <span className="question-dot" />
          <button className="question-title" onClick={() => onOpen(question)}>
            <strong>{question.text}</strong>
            <span>
              {question.mode} · {question.source} · Draft
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
      ))}
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

export function SchemaView({
  documents,
  onUpload,
  onOpen,
}: {
  documents: LocalDocument[];
  onUpload: () => void;
  onOpen: (document: LocalDocument) => void;
}) {
  const tables = documents.filter((document) => document.columns.length);
  if (!tables.length)
    return (
      <EmptyState
        icon="layers"
        title="Every answer starts with understanding"
        action="Add a data file"
        onAction={onUpload}
      >
        Add a CSV or JSON file to inspect its fields. Database relationships
        will appear when discovery is connected.
      </EmptyState>
    );
  return (
    <div className="schema-grid">
      {tables.map((document) => (
        <section className="schema-card" key={document.id}>
          <div className="schema-heading">
            <span className="tile-icon lavender">
              <Icon name="table" />
            </span>
            <div>
              <h3>{document.name}</h3>
              <p>{document.rowCount.toLocaleString()} rows · Local file</p>
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
          <button className="text-button" onClick={() => onOpen(document)}>
            Preview data
            <Icon name="arrow" size={15} />
          </button>
        </section>
      ))}
    </div>
  );
}

export function LedgerView({
  documents,
  onUpload,
}: {
  documents: LocalDocument[];
  onUpload: () => void;
}) {
  if (!documents.length)
    return (
      <EmptyState
        icon="shield"
        title="Clarity you can trace back"
        action="Add your first file"
        onAction={onUpload}
      >
        Your evidence belongs here. Start with a file to see its structure and
        missing-value checks. Verified analytical claims will appear once
        analysis is available.
      </EmptyState>
    );
  return (
    <>
      <div className="info-callout">
        <Icon name="shield" />
        <p>
          These are deterministic file checks. They do not verify analytical
          claims or database relationships.
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
