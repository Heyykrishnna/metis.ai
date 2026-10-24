"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_FILES,
  MAX_FILE_SIZE,
  parseLocalDocument,
  type LocalDocument,
} from "@/lib/local-files";
import { downloadText, type Question } from "@/lib/workspace";
import { Dialog } from "./dialog";
import {
  FileDialog,
  ConnectionDialog,
  SearchDialog,
  ActivityDialog,
} from "./workspace-dialogs";
import { Icon } from "./icon";
import { navigation, type View, type Modal } from "./workspace-navigation";
import { HomeView } from "./home-view";
import { SettingsView } from "./settings-view";
import { HelpView } from "./help-view";
import { FileDropzone } from "./ui/file-dropzone";
import { useQuestions } from "./use-questions";
import {
  DocumentPreview,
  EmptyState,
  FileList,
  LedgerView,
  QuestionList,
  SchemaView,
  TemplatesView,
} from "./workspace-views";

const descriptions: Record<View, string> = {
  Home: "A clearer way to understand your data.",
  "All analyses":
    "A home for your questions, from first thought to final answer.",
  "Saved questions": "Good questions deserve a place to come back to.",
  Templates: "A thoughtful starting point for your next discovery.",
  "Data sources": "Bring your data together. Keep control of where it goes.",
  "Schema explorer": "Get familiar with the structure behind your data.",
  "Truth Ledger":
    "Follow the evidence. Understand what has actually been checked.",
  Settings: "Make this little corner of Metis your own.",
  "Help & getting started":
    "From an unfamiliar dataset to a more useful question.",
};

export function Workspace() {
  const [view, setView] = useState<View>("Home");
  const [modal, setModal] = useState<Modal>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("Ask your data");
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<LocalDocument | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionTab, setQuestionTab] = useState("Overview");
  const [reading, setReading] = useState(false);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Personal workspace");
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [statusVersion, setStatusVersion] = useState(0);
  const { questions, updateQuestions } = useQuestions();
  const readingRef = useRef(false);
  const selectedDocument = documents.find(
    (document) => document.id === selectedId,
  );
  const source = selectedDocument?.name ?? "Choose a source";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        setApiStatus(
          response.ok &&
            typeof body === "object" &&
            body !== null &&
            "status" in body &&
            body.status === "online"
            ? "online"
            : "offline",
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiStatus("offline");
      });
    return () => controller.abort();
  }, [statusVersion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setModal((current) => (current === "search" ? null : "search"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);

  function navigate(next: View) {
    setView(next);
    setSidebarOpen(false);
    setQuestion(null);
    setFilter("");
  }

  function applyTemplate(text: string, category: string) {
    navigate("Home");
    setOverview(false);
    setPrompt(text);
    setMode(
      category === "Verify"
        ? "Verify a claim"
        : category === "Explore"
          ? "Explore schema"
          : "Ask your data",
    );
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>("textarea")?.focus(),
    );
  }

  function submitQuestion() {
    if (!prompt.trim()) return;
    const draft: Question = {
      id: crypto.randomUUID(),
      text: prompt.trim(),
      mode,
      source: selectedDocument?.name ?? "No source selected",
      createdAt: Date.now(),
      saved: false,
    };
    const stored = updateQuestions((current) => [draft, ...current]);
    if (!stored)
      setNotice(
        "Browser storage is unavailable. This question will only stay open in this session.",
      );
    setQuestion(draft);
    setQuestionTab("Overview");
    setView("All analyses");
    setPrompt("");
  }

  function removeQuestion(id: string) {
    if (
      updateQuestions((current) => current.filter((item) => item.id !== id))
    ) {
      setQuestion((current) => (current?.id === id ? null : current));
      setNotice("Question removed from this browser.");
    } else
      setNotice(
        "Could not remove this question. Check browser storage permissions.",
      );
  }

  function toggleSaved(id: string) {
    const stored = updateQuestions((current) =>
      current.map((item) =>
        item.id === id ? { ...item, saved: !item.saved } : item,
      ),
    );
    if (!stored)
      setNotice(
        "Could not save your question. Check browser storage permissions.",
      );
    else
      setQuestion((current) =>
        current?.id === id ? { ...current, saved: !current.saved } : current,
      );
  }

  async function addFiles(files: File[]) {
    if (readingRef.current || !files.length) return;
    readingRef.current = true;
    setReading(true);
    const errors: string[] = [];
    const added: LocalDocument[] = [];
    for (const file of files) {
      if (documents.length + added.length >= MAX_FILES) {
        errors.push(
          "Your session can hold 10 files. Remove a file before adding another.",
        );
        break;
      }
      if (
        documents.some(
          (item) => item.name === file.name && item.size === file.size,
        ) ||
        added.some((item) => item.name === file.name && item.size === file.size)
      ) {
        errors.push(`${file.name} is already in your workspace.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: the maximum file size is 5 MB.`);
        continue;
      }
      try {
        added.push(
          parseLocalDocument(
            file.name,
            await file.text(),
            file.size,
            crypto.randomUUID(),
            Date.now(),
          ),
        );
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : `Could not read ${file.name}. Try a UTF-8 file.`,
        );
      }
    }
    setDocuments((current) => [...current, ...added]);
    if (!selectedId && added[0]) setSelectedId(added[0].id);
    setFileErrors(errors);
    setReading(false);
    readingRef.current = false;
    if (added.length)
      setNotice(
        `${added.length} ${added.length === 1 ? "file is" : "files are"} ready to explore. Nothing was uploaded.`,
      );
  }

  function removeFile(id: string) {
    setDocuments((current) => current.filter((document) => document.id !== id));
    if (selectedId === id) setSelectedId("");
    setNotice(
      "File removed from this session. Your original file is unchanged.",
    );
  }

  function openQuestion(item: Question) {
    setQuestion(item);
    setQuestionTab("Overview");
    setView("All analyses");
    setModal(null);
  }

  const matchingQuestions = questions.filter(
    (item) =>
      (view !== "Saved questions" || item.saved) &&
      item.text.toLowerCase().includes(filter.toLowerCase()),
  );
  const filteredDocuments = documents.filter((item) =>
    item.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <div className="brand-row">
          <button
            className="brand"
            aria-label="Metis home"
            onClick={() => navigate("Home")}
          >
            <span className="brand-mark">
              <Icon name="sparkles" size={22} />
            </span>
            <span>
              metis<span className="brand-ai">.ai</span>
            </span>
          </button>
          <button
            className="icon-button sidebar-collapse"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="panel" size={18} />
          </button>
        </div>
        <button className="sidebar-search" onClick={() => setModal("search")}>
          <Icon name="search" size={17} />
          <span>Search anything…</span>
          <kbd>⌘ K</kbd>
        </button>
        <nav>
          {navigation.map((item) => (
            <div key={item.label}>
              {item.group && <p className="nav-section">{item.group}</p>}
              <button
                aria-current={view === item.label ? "page" : undefined}
                className={`nav-item ${view === item.label ? "active" : ""}`}
                onClick={() => navigate(item.label)}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                {item.label === "Saved questions" &&
                  questions.some((item) => item.saved) && (
                    <span className="nav-count">
                      {questions.filter((item) => item.saved).length}
                    </span>
                  )}
                {item.label === "Data sources" && documents.length > 0 && (
                  <span className="nav-count">{documents.length}</span>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <span className="note-spark">
              <Icon name="sparkles" size={16} />
            </span>
            <p>
              Big questions.
              <br />
              <strong>Clearer answers.</strong>
            </p>
            <span className="note-decoration" aria-hidden="true">
              ✧
            </span>
          </div>
          <button
            className={`nav-item ${view === "Help & getting started" ? "active" : ""}`}
            onClick={() => navigate("Help & getting started")}
          >
            <Icon name="help" size={18} />
            Help & getting started
            <Icon name="arrow" size={14} />
          </button>
          <button
            className={`nav-item ${view === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
          >
            <Icon name="settings" size={18} />
            Settings
          </button>
          <button
            className="workspace-profile"
            onClick={() => navigate("Settings")}
          >
            <span className="avatar">Y</span>
            <span>
              <strong>{workspaceName}</strong>
              <small>Local workspace</small>
            </span>
            <Icon name="down" size={15} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <span>{view === "Home" ? "Overview" : view}</span>
          </div>
          <div className="topbar-actions">
            <span className="private-badge">
              <Icon name="shield" size={13} /> Private workspace
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Workspace activity"
              onClick={() => setModal("activity")}
            >
              <Icon name="bell" size={18} />
              <span className="notification-dot" />
            </button>
            <button
              className="topbar-avatar"
              aria-label="Workspace settings"
              onClick={() => navigate("Settings")}
            >
              Y
            </button>
          </div>
        </header>
        <main
          id="main-content"
          className={
            view === "Home" ? "main-content home-content" : "main-content"
          }
        >
          {view === "Home" ? (
            <HomeView
              overview={overview}
              setOverview={setOverview}
              documents={documents}
              questions={questions}
              prompt={prompt}
              setPrompt={setPrompt}
              mode={mode}
              setMode={setMode}
              source={source}
              submitQuestion={submitQuestion}
              navigate={navigate}
              applyTemplate={applyTemplate}
              onUpload={() => {
                setFileErrors([]);
                setModal("files");
              }}
              openQuestion={openQuestion}
              toggleSaved={toggleSaved}
              removeQuestion={removeQuestion}
              setPreview={setPreview}
              removeFile={removeFile}
            />
          ) : (
            <div className="page-body">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {view === "Truth Ledger"
                      ? "EVIDENCE OVER ASSUMPTIONS"
                      : "YOUR METIS WORKSPACE"}
                  </span>
                  <h1>{view}</h1>
                  <p>{descriptions[view]}</p>
                </div>
                {view === "Data sources" ? (
                  <button
                    className="button button-dark"
                    onClick={() => setModal("files")}
                  >
                    <Icon name="plus" size={16} />
                    Add source
                  </button>
                ) : (
                  (view === "All analyses" || view === "Saved questions") && (
                    <button
                      className="button button-dark"
                      onClick={() => {
                        navigate("Home");
                        setOverview(false);
                      }}
                    >
                      <Icon name="plus" size={16} />
                      New question
                    </button>
                  )
                )}
              </div>
              {(view === "All analyses" || view === "Saved questions") &&
                (question ? (
                  <section className="analysis-detail">
                    <button
                      className="text-button"
                      onClick={() => setQuestion(null)}
                    >
                      ← Back to questions
                    </button>
                    <div className="analysis-title">
                      <h2>{question.text}</h2>
                      <button
                        className={`icon-button ${question.saved ? "bookmarked" : ""}`}
                        aria-label={
                          question.saved ? "Unsave question" : "Save question"
                        }
                        onClick={() => toggleSaved(question.id)}
                      >
                        <Icon name="bookmark" />
                      </button>
                    </div>
                    <div className="document-meta">
                      <span className="badge">Draft · Not executed</span>
                      <span>{question.mode}</span>
                      <span>{question.source}</span>
                    </div>
                    <div className="filter-tabs">
                      {["Overview", "SQL", "Results", "Evidence"].map((tab) => (
                        <button
                          key={tab}
                          className={questionTab === tab ? "active" : ""}
                          aria-pressed={questionTab === tab}
                          onClick={() => setQuestionTab(tab)}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                    <EmptyState
                      icon={
                        questionTab === "SQL"
                          ? "code"
                          : questionTab === "Evidence"
                            ? "shield"
                            : questionTab === "Results"
                              ? "chart"
                              : "sparkles"
                      }
                      title={
                        questionTab === "Overview"
                          ? "Your question is ready. The analysis service isn’t yet."
                          : `No ${questionTab.toLowerCase()} generated yet`
                      }
                    >
                      The backend currently supports health checks. Running
                      questions, generating SQL, and verifying answers require
                      the analysis API. Your question is kept as a draft; no
                      query has been executed.
                    </EmptyState>
                    <div className="analysis-actions">
                      <button
                        className="button"
                        onClick={() => {
                          setQuestion(null);
                          applyTemplate(
                            question.text,
                            question.mode === "Verify a claim"
                              ? "Verify"
                              : question.mode === "Explore schema"
                                ? "Explore"
                                : "Discover",
                          );
                        }}
                      >
                        Refine question
                        <Icon name="arrow" size={15} />
                      </button>
                      <button
                        className="button"
                        onClick={() =>
                          downloadText(
                            "metis-question.txt",
                            `${question.text}\n\nMode: ${question.mode}\nSource: ${question.source}\nStatus: Draft, not executed\n`,
                          )
                        }
                      >
                        <Icon name="download" size={15} />
                        Export question
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="panel">
                    <div className="section-heading">
                      <h2>
                        {view === "Saved questions"
                          ? "Your collection"
                          : "Question history"}
                        <span className="count-pill">
                          {matchingQuestions.length}
                        </span>
                      </h2>
                      <label className="inline-search">
                        <Icon name="search" size={16} />
                        <input
                          aria-label="Filter questions"
                          placeholder="Find a question…"
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                        />
                      </label>
                    </div>
                    {matchingQuestions.length ? (
                      <QuestionList
                        questions={matchingQuestions}
                        onOpen={openQuestion}
                        onSave={toggleSaved}
                        onRemove={removeQuestion}
                      />
                    ) : (
                      <EmptyState
                        icon={view === "Saved questions" ? "bookmark" : "chat"}
                        title={
                          filter
                            ? "No matching questions"
                            : view === "Saved questions"
                              ? "Keep your best questions close"
                              : "Curiosity looks good here"
                        }
                      >
                        {filter
                          ? "Try a different word or clear the search."
                          : view === "Saved questions"
                            ? "Use the bookmark next to any question to add it to your collection."
                            : "Ask a question from Home to create your first draft. Questions stay in this browser."}
                      </EmptyState>
                    )}
                  </section>
                ))}
              {view === "Templates" && <TemplatesView onUse={applyTemplate} />}
              {view === "Data sources" && (
                <>
                  <div className="connection-card">
                    <span className="connection-logo">
                      <Icon name="database" size={27} />
                    </span>
                    <div>
                      <h3>Connect the bigger picture.</h3>
                      <p>
                        Explore files now. Bring a read-only PostgreSQL source
                        when the connection service is ready.
                      </p>
                    </div>
                    <button
                      className="button"
                      onClick={() => setModal("connection")}
                    >
                      <Icon name="link" size={16} />
                      Database connections
                    </button>
                  </div>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>
                        Local files{" "}
                        <span className="count-pill">{documents.length}</span>
                      </h2>
                      <label className="inline-search">
                        <Icon name="search" size={16} />
                        <input
                          aria-label="Filter files"
                          placeholder="Find a file…"
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                        />
                      </label>
                    </div>
                    {documents.length ? (
                      <>
                        {filteredDocuments.length ? (
                          <FileList
                            documents={filteredDocuments}
                            onOpen={setPreview}
                            onRemove={removeFile}
                          />
                        ) : (
                          <EmptyState icon="search" title="No matching files">
                            Try a different filename.
                          </EmptyState>
                        )}
                        <p className="fine-print">
                          Files stay in memory for this session. Refreshing the
                          page removes them.
                        </p>
                      </>
                    ) : (
                      <FileDropzone onFiles={addFiles} busy={reading} />
                    )}
                    {fileErrors.length > 0 && (
                      <div role="alert" className="error-box">
                        {fileErrors.map((error, index) => (
                          <p key={index}>{error}</p>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
              {view === "Schema explorer" && (
                <SchemaView
                  documents={documents}
                  onUpload={() => setModal("files")}
                  onOpen={setPreview}
                />
              )}
              {view === "Truth Ledger" && (
                <LedgerView
                  documents={documents}
                  onUpload={() => setModal("files")}
                />
              )}
              {view === "Settings" && (
                <SettingsView
                  workspaceName={workspaceName}
                  apiStatus={apiStatus}
                  hasQuestions={questions.length > 0}
                  onRename={(name) => {
                    setWorkspaceName(name);
                    setNotice("Workspace name updated for this session.");
                  }}
                  onCheck={() => {
                    setApiStatus("checking");
                    setStatusVersion((value) => value + 1);
                  }}
                  onClear={() => {
                    if (updateQuestions(() => [])) {
                      setQuestion(null);
                      setNotice("Question history cleared from this browser.");
                    } else setNotice("Could not clear browser storage.");
                  }}
                />
              )}
              {view === "Help & getting started" && (
                <HelpView
                  onUpload={() => setModal("files")}
                  navigate={navigate}
                />
              )}
            </div>
          )}
        </main>
      </div>
      {modal === "files" && (
        <FileDialog
          documents={documents}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setModal(null);
          }}
          addFiles={addFiles}
          reading={reading}
          fileErrors={fileErrors}
          onClose={() => setModal(null)}
          onConnection={() => setModal("connection")}
        />
      )}
      {modal === "connection" && (
        <ConnectionDialog
          onClose={() => setModal(null)}
          onFiles={() => setModal("files")}
        />
      )}
      {modal === "search" && (
        <SearchDialog
          questions={questions}
          documents={documents}
          navigate={navigate}
          openQuestion={openQuestion}
          onPreview={setPreview}
          applyTemplate={applyTemplate}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "activity" && (
        <ActivityDialog
          apiStatus={apiStatus}
          documents={documents}
          questions={questions}
          onClose={() => setModal(null)}
        />
      )}
      {preview && (
        <Dialog
          title={preview.name}
          subtitle="A closer look at your original data."
          wide
          onClose={() => setPreview(null)}
        >
          <DocumentPreview document={preview} />
        </Dialog>
      )}
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
