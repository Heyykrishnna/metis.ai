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
          <span
            className={`status-dot ${documents.length ? "connected" : ""}`}
          />
          {documents.length
            ? `${documents.length} local ${documents.length === 1 ? "source" : "sources"}`
            : "Ready for your first source"}
          <Icon name="down" size={12} />
        </button>
      </div>
      {!overview ? (
        <div className="home-inner">
          <div className="hero">
            <span className="hero-emblem">
              <Icon name="sparkles" size={32} />
              <span className="emblem-star">✦</span>
            </span>
            <span className="eyebrow">
              A LITTLE CURIOSITY. A LOT OF CLARITY.
            </span>
            <h1>What will you discover today?</h1>
            <p>Your questions. Your data. Answers you can trace.</p>
          </div>
          <AIInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={submitQuestion}
            onAttach={onUpload}
            source={source}
            mode={mode}
            onModeChange={setMode}
            sourceCount={documents.length}
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
                  <Icon name={template.icon} size={21} />
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
                <span className="tiny-star" aria-hidden="true">
                  ✧
                </span>
              </div>
            )}
          </section>
          <div className="home-footer">
            <span className="footer-wordmark">
              <Icon name="sparkles" size={13} /> Thoughtful analysis, by Metis.
            </span>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Link
                href="/privacy"
                style={{ color: "#6c765e", textDecoration: "none" }}
              >
                Privacy Policy
              </Link>
              <span style={{ color: "#c1c8ba" }}>·</span>
              <Link
                href="/terms"
                style={{ color: "#6c765e", textDecoration: "none" }}
              >
                Terms of Service
              </Link>
              <span style={{ color: "#c1c8ba" }}>·</span>
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
                label: "Question drafts",
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
