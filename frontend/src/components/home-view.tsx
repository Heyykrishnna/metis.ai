"use client";
import Link from "next/link";
import type { LocalDocument } from "@/lib/local-files";
import { templates, type Question } from "@/lib/workspace";
import { Icon } from "./icon";
import { AIInput } from "./ui/ai-input";
import { EmptyState, FileList, QuestionList } from "./workspace-views";
import type { View } from "./workspace-navigation";

type HomeProps = {
  overview: boolean;
  setOverview: (value: boolean) => void;
  documents: LocalDocument[];
  questions: Question[];
  prompt: string;
  setPrompt: (value: string) => void;
  mode: string;
  setMode: (value: string) => void;
  source: string;
  sourceCount: number;
  syncing: boolean;
  submitQuestion: () => void;
  navigate: (view: View) => void;
  applyTemplate: (text: string, category: string) => void;
  onUpload: () => void;
  openQuestion: (question: Question) => void;
  toggleSaved: (id: string) => void;
  removeQuestion: (id: string) => void;
  setPreview: (document: LocalDocument) => void;
  removeFile: (id: string) => void;
};
export function HomeView({
  overview,
  setOverview,
  documents,
  questions,
  prompt,
  setPrompt,
  mode,
  setMode,
  source,
  sourceCount,
  syncing,
  submitQuestion,
  navigate,
  applyTemplate,
  onUpload,
  openQuestion,
  toggleSaved,
  removeQuestion,
  setPreview,
  removeFile,
}: HomeProps) {
  return (
    <>
      <div className="home-topline">
        <div className="segmented">
          <button
            className={!overview ? "active" : ""}
            aria-pressed={!overview}
            onClick={() => setOverview(false)}
          >
            <Icon name="chat" size={14} />
            Ask Metis
          </button>
          <button
            className={overview ? "active" : ""}
            aria-pressed={overview}
            onClick={() => setOverview(true)}
          >
            Overview
          </button>
        </div>
        <button
          className="source-status"
          onClick={() => navigate("Data sources")}
        >
          <span className={`status-dot ${sourceCount ? "connected" : ""}`} />
          {syncing ? "Syncing sources…" : sourceCount
            ? `${sourceCount} ${sourceCount === 1 ? "source" : "sources"} connected`
            : "Ready for your first source"}
          <Icon name="down" size={12} />
        </button>
      </div>
      {!overview ? (
        <div className="home-inner">
          <div className="hero">
            <span className="eyebrow">YOUR DATA, A LITTLE CLEARER</span>
            <h1>What will you discover today?</h1>
            <p>Your questions. Your data. Answers you can trace.</p>
          </div>
          <AIInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={submitQuestion}
            onAttach={onUpload}
            onSelectSource={() => navigate("Data sources")}
            source={source}
            mode={mode}
            onModeChange={setMode}
            sourceCount={sourceCount}
            syncing={syncing}
          />
          <div className="suggestion-grid">
            {templates.slice(0, 3).map((template) => (
              <button
                key={template.title}
                className="suggestion-card"
                onClick={() =>
                  applyTemplate(template.question, template.category)
                }
              >
                <span className={`tile-icon ${template.color}`}>
                  <Icon name={template.icon} size={17} />
                </span>
                <strong>{template.title}</strong>
                <p>{template.description}</p>
                <span className="suggestion-link">
                  Let’s explore
                  <Icon name="arrow" size={15} />
                </span>
              </button>
            ))}
          </div>
          <section className="recent-section">
            <div className="section-heading">
              <h2>
                <Icon name="clock" size={18} />
                Recent questions
              </h2>
              <button
                className="text-button"
                onClick={() => navigate("All analyses")}
              >
                View all
                <Icon name="arrow" size={14} />
              </button>
            </div>
            {questions.length ? (
              <QuestionList
                questions={questions.slice(0, 3)}
                onOpen={openQuestion}
                onSave={toggleSaved}
                onRemove={removeQuestion}
              />
            ) : (
              <div className="recent-empty">
                <span className="recent-empty-icon">
                  <Icon name="chat" size={21} />
                </span>
                <div>
                  <strong>A fresh start for your next big question</strong>
                  <p>
                    Your questions will find a home here. Start with a template
                    above.
                  </p>
                </div>
              </div>
            )}
          </section>
          <div className="home-footer">
            <span className="footer-wordmark">
              Thoughtful analysis, by Metis.
            </span>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Link
                href="/privacy"
                style={{ color: "#6b707a", textDecoration: "none" }}
              >
                Privacy Policy
              </Link>
              <span style={{ color: "#d0d3da" }}>·</span>
              <Link
                href="/terms"
                style={{ color: "#6b707a", textDecoration: "none" }}
              >
                Terms of Service
              </Link>
              <span style={{ color: "#d0d3da" }}>·</span>
              <button onClick={() => navigate("Help & getting started")}>
                A quick tour
                <Icon name="arrow" size={13} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="page-body overview-body">
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR WORKSPACE AT A GLANCE</span>
              <h1>A little more perspective.</h1>
              <p>Everything you’ve brought together, in one place.</p>
            </div>
            <button className="button button-dark" onClick={onUpload}>
              <Icon name="plus" size={16} />
              Add data
            </button>
          </div>
          <div className="stat-grid">
            {[
              {
                label: "Stored files",
                value: documents.length,
                icon: "database",
              },
              {
                label: "Analyses",
                value: questions.length,
                icon: "chat",
              },
              {
                label: "Saved questions",
                value: questions.filter((item) => item.saved).length,
                icon: "bookmark",
              },
            ].map((stat) => (
              <div className="stat-card" key={stat.label}>
                <Icon
                  name={
                    stat.icon === "database"
                      ? "database"
                      : stat.icon === "chat"
                        ? "chat"
                        : "bookmark"
                  }
                />
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          <div className="overview-insights">
            <section className="panel activity-summary">
              <div className="section-heading">
                <h2>Answer activity</h2>
                <span className="muted">Recent history</span>
              </div>
              <p className="muted">A clear view of your workspace questions.</p>
              {[
                {
                  label: "Answered",
                  count: questions.filter((item) => item.status === "answered")
                    .length,
                },
                {
                  label: "Needs attention",
                  count: questions.filter((item) =>
                    [
                      "needs_clarification",
                      "abstained",
                      "execution_failed",
                      "blocked_by_policy",
                    ].includes(item.status ?? ""),
                  ).length,
                },
                {
                  label: "Drafts & in progress",
                  count: questions.filter(
                    (item) =>
                      !item.status ||
                      ["planning", "executing", "queued"].includes(item.status),
                  ).length,
                },
              ].map((item) => (
                <div className="activity-summary-row" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                  <progress
                    max={Math.max(1, questions.length)}
                    value={item.count}
                    aria-label={item.label}
                  />
                </div>
              ))}
              {!questions.length && (
                <p className="fine-print">
                  Activity appears after your first question.
                </p>
              )}
            </section>
            <section className="panel overview-recent">
              <div className="section-heading">
                <h2>Recent questions</h2>
                <button
                  className="text-button"
                  onClick={() => navigate("All analyses")}
                >
                  View all <Icon name="arrow" size={13} />
                </button>
              </div>
              {questions.length ? (
                <QuestionList
                  questions={questions.slice(0, 3)}
                  onOpen={openQuestion}
                  onSave={toggleSaved}
                  onRemove={removeQuestion}
                />
              ) : (
                <p className="muted">
                  Your saved question history will appear here.
                </p>
              )}
            </section>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>Your data, at a glance</h2>
              <button
                className="text-button"
                onClick={() => navigate("Data sources")}
              >
                Manage sources
                <Icon name="arrow" size={15} />
              </button>
            </div>
            {documents.length ? (
              <FileList
                documents={documents}
                onOpen={setPreview}
                onRemove={removeFile}
              />
            ) : (
              <EmptyState
                icon="database"
                title="Your next insight needs a starting point"
                action="Add a file"
                onAction={onUpload}
              >
                Bring a CSV, JSON, or text document into your workspace.
              </EmptyState>
            )}
          </section>
        </div>
      )}
    </>
  );
}
