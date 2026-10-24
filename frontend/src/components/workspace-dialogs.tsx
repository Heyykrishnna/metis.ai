"use client";
import { useState } from "react";
import type { LocalDocument } from "@/lib/local-files";
import { templates, type Question } from "@/lib/workspace";
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
  onClose,
  onFiles,
}: {
  onClose: () => void;
  onFiles: () => void;
}) {
  return (
    <Dialog
      title="Your databases, thoughtfully connected"
      subtitle="Read-only access. Clear boundaries."
      onClose={onClose}
    >
      <div className="database-option">
        <span className="connection-logo">
          <Icon name="database" size={28} />
        </span>
        <div>
          <h3>PostgreSQL & Neon</h3>
          <p>Analytics data source</p>
        </div>
        <span className="badge">Service needed</span>
      </div>
      <div className="info-callout">
        <Icon name="help" />
        <p>
          The metadata database is configured on the backend. Analytics
          connections use a separate read-only role and connection API, which is
          not implemented yet.
        </p>
      </div>
      <p className="muted">
        No credentials are requested or stored in this frontend. You can explore
        a local file while the connection service is being built.
      </p>
      <button className="button button-dark full-width" onClick={onFiles}>
        <Icon name="upload" size={16} />
        Explore a local file instead
      </button>
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
  onClose,
}: {
  apiStatus: "online" | "offline" | "checking";
  documents: LocalDocument[];
  questions: Question[];
  onClose: () => void;
}) {
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
              ? "Backend health check passed"
              : apiStatus === "checking"
                ? "Checking the backend…"
                : "Backend is currently offline"}
          </strong>
          <p>Local files and question drafts are available independently.</p>
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
          <strong>{questions.length} question drafts</strong>
          <p>
            No analyses have been executed. Analysis APIs are not available yet.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
