"use client";

import { useState } from "react";
import type { LocalDocument } from "@/lib/local-files";
import { templates, type Question } from "@/lib/workspace";
import {
  testConnection,
  createConnection,
  revokeConnection,
  type Connection,
  type ConnectionInput,
  type ConnectionTest,
} from "@/lib/api-client";
import { Dialog } from "./dialog";
import { Icon } from "./icon";
import { EmptyState } from "./workspace-views";
import { FileDropzone } from "./ui/file-dropzone";
import { navigation, type View } from "./workspace-navigation";

export function FileDialog({
  documents,
  selectedId,
  onSelect,
  addFiles,
  reading,
  fileErrors,
  onClose,
  onConnection,
}: {
  documents: LocalDocument[];
  selectedId: string;
  onSelect: (id: string) => void;
  addFiles: (files: File[]) => void;
  reading: boolean;
  fileErrors: string[];
  onClose: () => void;
  onConnection: () => void;
}) {
  return (
    <Dialog
      title="Bring your data"
      subtitle="A little context for your next discovery."
      onClose={onClose}
    >
      <FileDropzone onFiles={addFiles} busy={reading} />
      {fileErrors.length > 0 && (
        <div className="error-box" role="alert">
          {fileErrors.map((error, index) => (
            <p key={index}>{error}</p>
          ))}
        </div>
      )}
      {documents.length > 0 && (
        <>
          <h3 className="dialog-section-title">
            Choose a source for your question
          </h3>
          <div className="source-options">
            {documents.map((document) => (
              <button
                key={document.id}
                className={selectedId === document.id ? "chosen" : ""}
                onClick={() => {
                  onSelect(document.id);
                }}
              >
                <Icon name={document.columns.length ? "table" : "file"} />
                <span>{document.name}</span>
                {selectedId === document.id ? (
                  <Icon name="check" size={16} />
                ) : (
                  <Icon name="arrow" size={16} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="fine-print">
        <Icon name="shield" size={13} /> Nothing is uploaded. Files leave the
        workspace when you refresh.
      </p>
      <button className="text-button" onClick={onConnection}>
        <Icon name="database" size={16} />
        Looking for a database connection?
        <Icon name="arrow" size={15} />
      </button>
    </Dialog>
  );
}

export function ConnectionDialog({
  connections,
  activeConnectionId,
  onSelectConnection,
  onConnectionCreated,
  onConnectionRevoked,
  onClose,
  onFiles,
}: {
  connections: Connection[];
  activeConnectionId: string | null;
  onSelectConnection: (id: string) => void;
  onConnectionCreated: (conn: Connection) => void;
  onConnectionRevoked: (id: string) => void;
  onClose: () => void;
  onFiles: () => void;
}) {
  const [tab, setTab] = useState<"list" | "new">(
    connections.length > 0 ? "list" : "new",
  );
  const [name, setName] = useState("analytics_production");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("metis_analytics_fixture");
  const [username, setUsername] = useState("metis_fixture_reader");
  const [secretReference, setSecretReference] = useState(
    "secret://fixture/reader",
  );
  const [allowedSchemas, setAllowedSchemas] = useState(
    "public, analytics_clean",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<ConnectionTest | null>(null);

  async function handleTest() {
    setError("");
    setTestResult(null);
    setBusy(true);
    try {
      const schemas = allowedSchemas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const input: ConnectionInput = {
        name: name.trim(),
        engine: "PostgreSQL",
        host: host.trim(),
        port: Number(port) || 5432,
        database: database.trim(),
        username: username.trim(),
        secretReference: secretReference.trim(),
        allowedSchemas: schemas.length ? schemas : ["public"],
      };
      const res = await testConnection(input);
      setTestResult(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Database connection test failed. Check host and credentials.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister() {
    setError("");
    setBusy(true);
    try {
      const schemas = allowedSchemas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const input: ConnectionInput = {
        name: name.trim(),
        engine: "PostgreSQL",
        host: host.trim(),
        port: Number(port) || 5432,
        database: database.trim(),
        username: username.trim(),
        secretReference: secretReference.trim(),
        allowedSchemas: schemas.length ? schemas : ["public"],
      };
      const created = await createConnection(input);
      onConnectionCreated(created);
      onSelectConnection(created.id);
      setTab("list");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not register database connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    setBusy(true);
    try {
      await revokeConnection(id);
      onConnectionRevoked(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to revoke connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Database Connections"
      subtitle="Read-only PostgreSQL access with strict AST boundaries."
      onClose={onClose}
    >
      <div className="filter-tabs" style={{ marginBottom: 14 }}>
        <button
          className={tab === "list" ? "active" : ""}
          onClick={() => setTab("list")}
        >
          Configured Connections ({connections.length})
        </button>
        <button
          className={tab === "new" ? "active" : ""}
          onClick={() => setTab("new")}
        >
          Add New Source
        </button>
      </div>

      {tab === "list" && (
        <div>
          {connections.length ? (
            <div style={{ display: "grid", gap: 10, margin: "14px 0" }}>
              {connections.map((c) => {
                const isActive = activeConnectionId === c.id;
                return (
                  <div
                    key={c.id}
                    className="claim-card"
                    style={{
                      borderColor: isActive ? "#759781" : "#e1e8d4",
                      background: isActive ? "#f8faf5" : "#ffffff",
                    }}
                  >
                    <div className="claim-header-row">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <span className="tile-icon mint">
                          <Icon name="database" size={18} />
                        </span>
                        <div>
                          <strong>{c.name}</strong>
                          <p style={{ fontSize: 11, color: "#667a5d" }}>
                            {c.engine} · Schemas: {c.allowedSchemas.join(", ")}
                          </p>
                        </div>
                      </div>
                      <span className="badge">Read-only enforced</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 12,
                        paddingTop: 8,
                        borderTop: "1px solid #edf2e6",
                      }}
                    >
                      {isActive ? (
                        <span
                          className="status-dot connected"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            color: "#375034",
                          }}
                        >
                          Active analysis target
                        </span>
                      ) : (
                        <button
                          className="button"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                          onClick={() => onSelectConnection(c.id)}
                        >
                          Set as active
                        </button>
                      )}
                      <button
                        className="text-button"
                        style={{ color: "#a14831", fontSize: 11 }}
                        disabled={busy}
                        onClick={() => handleRevoke(c.id)}
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <p style={{ color: "#687a5f", fontSize: 13, marginBottom: 14 }}>
                No database connections configured yet.
              </p>
              <button
                className="button button-dark"
                onClick={() => setTab("new")}
              >
                <Icon name="plus" size={15} />
                Connect PostgreSQL Source
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "new" && (
        <div>
          <div className="connection-form-grid">
            <label className="full-col">
              Connection Display Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="analytics_production"
              />
            </label>
            <label>
              Host
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="127.0.0.1 or ep-royal-bird.neon.tech"
              />
            </label>
            <label>
              Port
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="5432"
              />
            </label>
            <label>
              Database
              <input
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                placeholder="analytics_db"
              />
            </label>
            <label>
              Username (Read-Only)
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="reader_role"
              />
            </label>
            <label className="full-col">
              Secret Reference URI (AES-256-GCM Vault)
              <input
                value={secretReference}
                onChange={(e) => setSecretReference(e.target.value)}
                placeholder="secret://fixture/reader"
              />
            </label>
            <label className="full-col">
              Allowed Schemas (Comma Separated)
              <input
                value={allowedSchemas}
                onChange={(e) => setAllowedSchemas(e.target.value)}
                placeholder="public, analytics_clean"
              />
            </label>
          </div>

          {error && (
            <div className="error-box" style={{ marginTop: 12 }}>
              <p>{error}</p>
            </div>
          )}

          {testResult && (
            <div
              className="remediation-box"
              style={{
                marginTop: 12,
                borderLeftColor: "#486653",
                background: "#f0f6ec",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#355132",
                }}
              >
                <Icon name="check" size={16} />
                <strong>Connection verified:</strong> Status is ready &
                read-only policy enforced.
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 18,
            }}
          >
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={handleTest}
            >
              {busy ? "Testing…" : "Test Connection"}
            </button>
            <button
              className="button button-dark"
              type="button"
              disabled={busy}
              onClick={handleRegister}
            >
              <Icon name="link" size={15} />
              Register Connection
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          paddingTop: 14,
          borderTop: "1px solid #edf2e6",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p className="fine-print" style={{ margin: 0 }}>
          <Icon name="shield" size={13} /> Least-privilege role required. AST
          guarantees zero writes.
        </p>
        <button className="text-button" onClick={onFiles}>
          <Icon name="upload" size={14} />
          Explore a local file instead
        </button>
      </div>
    </Dialog>
  );
}

export function SearchDialog({
  questions,
  documents,
  navigate,
  openQuestion,
  onPreview,
  applyTemplate,
  onClose,
}: {
  questions: Question[];
  documents: LocalDocument[];
  navigate: (view: View) => void;
  openQuestion: (question: Question) => void;
  onPreview: (document: LocalDocument) => void;
  applyTemplate: (text: string, category: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const searchTerm = search.trim().toLowerCase();
  return (
    <Dialog
      title="A little less searching."
      subtitle="Find a page, question, template, or file."
      onClose={onClose}
    >
      <label className="command-search">
        <Icon name="search" />
        <input
          data-autofocus
          aria-label="Search workspace"
          placeholder="Where would you like to go?"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <kbd>Esc</kbd>
      </label>
      <div className="search-results">
        {navigation
          .filter((item) => item.label.toLowerCase().includes(searchTerm))
          .map((item) => (
            <button
              key={item.label}
              onClick={() => {
                navigate(item.label);
                onClose();
              }}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              <small>Page</small>
              <Icon name="arrow" size={14} />
            </button>
          ))}
        {questions
          .filter((item) => item.text.toLowerCase().includes(searchTerm))
          .slice(0, 6)
          .map((item) => (
            <button key={item.id} onClick={() => openQuestion(item)}>
              <Icon name="chat" />
              <span>{item.text}</span>
              <small>Question</small>
            </button>
          ))}
        {documents
          .filter((item) => item.name.toLowerCase().includes(searchTerm))
          .map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onClose();
                onPreview(item);
              }}
            >
              <Icon name="file" />
              <span>{item.name}</span>
              <small>File</small>
            </button>
          ))}
        {templates
          .filter((item) => item.title.toLowerCase().includes(searchTerm))
          .map((item) => (
            <button
              key={item.title}
              onClick={() => {
                onClose();
                applyTemplate(item.question, item.category);
              }}
            >
              <Icon name={item.icon} />
              <span>{item.title}</span>
              <small>Template</small>
            </button>
          ))}
        {searchTerm &&
          !navigation.some((item) =>
            item.label.toLowerCase().includes(searchTerm),
          ) &&
          !questions.some((item) =>
            item.text.toLowerCase().includes(searchTerm),
          ) &&
          !documents.some((item) =>
            item.name.toLowerCase().includes(searchTerm),
          ) &&
          !templates.some((item) =>
            item.title.toLowerCase().includes(searchTerm),
          ) && (
            <EmptyState icon="search" title="Nothing here just yet">
              Try another word, or start a new question from Home.
            </EmptyState>
          )}
      </div>
    </Dialog>
  );
}

export function ActivityDialog({
  apiStatus,
  documents,
  questions,
  activeConnectionName,
  onClose,
}: {
  apiStatus: "online" | "offline" | "checking";
  documents: LocalDocument[];
  questions: Question[];
  activeConnectionName?: string;
  onClose: () => void;
}) {
  const executedCount = questions.filter(
    (q) => q.status === "completed" || q.status === "answered",
  ).length;

  return (
    <Dialog
      title="Workspace activity"
      subtitle="A quiet place to keep track."
      onClose={onClose}
    >
      <div className="activity-line">
        <span
          className={`status-dot ${apiStatus === "online" ? "connected" : ""}`}
        />
        <div>
          <strong>
            {apiStatus === "online"
              ? "Backend analytical services online"
              : apiStatus === "checking"
                ? "Checking the backend…"
                : "Backend is currently offline"}
          </strong>
          <p>
            {activeConnectionName
              ? `Connected to database: ${activeConnectionName}`
              : "Local files and question drafts available."}
          </p>
        </div>
      </div>
      <div className="activity-line">
        <Icon name="database" />
        <div>
          <strong>{documents.length} files in this session</strong>
          <p>File contents stay in your browser’s memory.</p>
        </div>
      </div>
      <div className="activity-line">
        <Icon name="chat" />
        <div>
          <strong>
            {questions.length} total questions ({executedCount} executed)
          </strong>
          <p>
            Truth Ledger, Dirty Radar, and Cost Passports attached to completed
            analyses.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
